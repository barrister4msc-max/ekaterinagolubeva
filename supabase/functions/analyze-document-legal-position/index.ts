// Legal Research Engine — orchestrator (Stage 2).
// Pipeline:
//   load → classify docs → FactExtraction → Repositories → Ranking → Dedupe
//   → Gemini Pro → MergeWithRegistry + ApplyDocumentUsage → persist.
// Does NOT touch: generate-legal-document-v2, review-generated-legal-document,
// document-intake-ai-fill, DB schema.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { extractFacts, embedQuery, queryToSearchString } from "./fact-extraction.ts";
import { runAllRepositories, gapSearch } from "./repositories.ts";
import {
  attachCanonicalRegistryMetadata,
  carryCanonicalMetadataToTrusted,
} from "./source-metadata-bridge.ts";
import {
  buildExternalResearchRunSnapshot,
  linkExternalResearchToLocalSources,
  normalizeExternalResearchImports,
  parseExternalResearchImportInputs,
} from "./external-research-import.ts";
import { rankSources } from "./ranking.ts";
import { dedupe } from "./dedupe.ts";
import { buildPrompt, callGeminiPro, limitSources, summarizeDocument } from "./prompt.ts";
import { resolveDocumentIntent } from "./document-intent.ts";
import {
  applyDocumentUsage,
  computeMetrics,
  extractJson,
  mergeWithRegistry,
  type DocAuditEntry,
} from "./merge.ts";
import {
  enrichSources,
  buildFactRecords,
  buildConclusionsAndIndex,
  validateConclusions,
  buildEvidenceMatrix,
  evaluateSufficiency,
  computeHashes,
  computeEvidenceIdentity,
  setActuallyUsedInGeneration,
  buildSourceWarnings,
  evaluateExternalSearch,
  decideGeneration,
} from "./enrich.ts";
import { evaluateOfficialExplanationsCoverage } from "./research-coverage.ts";
import { evaluateTemporalApplicability } from "./temporal-applicability.ts";
import { runChallenge } from "./challenge.ts";
import { readCanonicalRelationsFeatureFlags } from "../_shared/legal-analysis/canonical-relations/index.ts";
import { computeCanonicalRelationsShadow } from "./canonical-shadow.ts";
import { getTemplateByCode } from "../_shared/template-registry.ts";
import {
  buildCanonicalShadowPersistenceRecord,
  persistCanonicalShadowBestEffort,
} from "./canonical-shadow-persistence.ts";

import { loadCompanyFactualRuntimeSnapshot } from "./fns-company-factual-runtime.ts";
import { buildCompanyFactualEvidenceMatrix } from "./company-factual-evidence-matrix.ts";
import { buildCompanyTaxDebtEvidenceMatrix } from "./company-tax-debt-evidence-matrix.ts";
import { buildCompanyFinancialStatementEvidenceMatrix } from "./company-financial-statement-evidence-matrix.ts";
import { buildCompanyAverageHeadcountEvidenceMatrix } from "./company-headcount-evidence-matrix.ts";

import { AllModelsFailedError, FatalGeminiError, type ModelAttempt } from "./gemini-fallback.ts";
import { authorizeAnalyzerRequest } from "./auth-boundary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL_NAME = "gemini-2.5-pro";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseFailedResult(message: string, rawResponse: string) {
  return {
    error: "parse_failed",
    message,
    raw_response: rawResponse,
    raw_response_preview: rawResponse.slice(0, 4000),
  };
}

function isParseFailedMessage(message: string) {
  return /parse_failed|JSON|Expected|Unexpected|unterminated|empty model output|invalid JSON/i.test(
    message,
  );
}

function classifyDocument(d: {
  id: string;
  title: string;
  file_name: string | null;
  ocr_text: string | null;
}): DocAuditEntry {
  const name = (d.file_name || d.title || "").toLowerCase();
  const ocr = (d.ocr_text ?? "").trim();
  const ocrLen = ocr.length;
  const base: DocAuditEntry = {
    id: d.id,
    title: d.title || d.file_name || "Документ",
    ocr_length: ocrLen,
    used: false,
  };
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return { ...base, reason: "archive_zip" };
  if (/\.(exe|dll|bin|iso)$/i.test(name)) return { ...base, reason: "technical_file" };
  if (!ocr) return { ...base, reason: "no_ocr" };
  if (ocrLen <= 50) return { ...base, reason: "text_too_short" };
  return { ...base, used: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const authResult = await authorizeAnalyzerRequest(req, sb);
  if (!authResult.ok) return json({ error: authResult.error }, authResult.status);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const sessionId: string | undefined = body?.session_id;
  if (!sessionId) return json({ error: "session_id required" }, 400);

  const canonicalRelationsEnabled = readCanonicalRelationsFeatureFlags().enabled;

  const { data: runRow, error: runInsertErr } = await sb
    .from("document_intake_ai_runs")
    .insert({
      session_id: sessionId,
      run_type: "legal_analysis",
      status: "running",
      model_name: MODEL_NAME,
    })
    .select("id")
    .single();
  if (runInsertErr) return json({ error: runInsertErr.message }, 500);
  const runId = runRow.id;

  let lastRawResponse = "";
  let lastModel = MODEL_NAME;

  async function saveParseFailed(message: string, rawResponse: string) {
    const aiResult = parseFailedResult(message, rawResponse);
    const { error: updErr } = await sb
      .from("document_intake_ai_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        model_name: lastModel,
        error_message: message,
        ai_result: aiResult as any,
        source_verification_status: "no_sources",
        hallucination_risk: "high",
        legal_accuracy_score: 0,
        needs_lawyer_review: true,
      })
      .eq("id", runId);
    if (updErr) console.error("save_parse_failed_diagnostics:", updErr.message);
    return aiResult;
  }

  try {
    // session
    const { data: session, error: sessErr } = await sb
      .from("document_intake_sessions")
      .select("id, template_code, jurisdiction, language, metadata")
      .eq("id", sessionId)
      .single();
    if (sessErr) throw new Error(`session: ${sessErr.message}`);

    const sessionMetadata = ((session as any).metadata ?? {}) as Record<string, unknown>;
    const externalResearchInputs = [
      ...parseExternalResearchImportInputs(sessionMetadata.external_legal_research_imports),
      ...parseExternalResearchImportInputs(body?.external_research_imports),
    ];
    const externalResearch = normalizeExternalResearchImports(externalResearchInputs);
    const stagedExternalResearchSnapshot = buildExternalResearchRunSnapshot(externalResearch, {
      sources: [],
      linked: 0,
      unresolved: externalResearch.sources.length,
      unresolved_source_ids: externalResearch.sources.map((source) => source.source_id),
    });

    // answers
    const { data: answerRows } = await sb
      .from("document_intake_answers")
      .select("field_name, field_value")
      .eq("session_id", sessionId);
    const answers: Record<string, unknown> = {};
    for (const r of answerRows ?? []) answers[r.field_name as string] = r.field_value;
    // P0-A5: company factual evidence is a separate audited runtime snapshot.
    // It is deliberately not added to research sources or any model input.
    const companyFactualRuntime = await loadCompanyFactualRuntimeSnapshot({
      sb,
      answers,
    });
    // P0-A7: additive factual Evidence Matrix. This is intentionally separate
    // from the canonical FactRecord↔document Evidence Matrix below.
    const companyFactualMatrix = buildCompanyFactualEvidenceMatrix(
      companyFactualRuntime.company_factual_evidence,
    );
    // P0-A12: separate DEBTAM point-in-time factual matrix. It is audit-only
    // and never enters legal/document evidence or model inputs.
    const companyTaxDebtFactualMatrix = buildCompanyTaxDebtEvidenceMatrix(
      companyFactualRuntime.company_tax_debt_evidence,
    );
    // P0-A17: separate REVEXP annual financial-statement factual matrix.
    // Audit-only: never enters legal/document evidence or model inputs.
    const companyFinancialStatementFactualMatrix = buildCompanyFinancialStatementEvidenceMatrix(
      companyFactualRuntime.company_financial_statement_evidence,
    );
    // P0-A22: separate SSHR2019 annual-average-headcount factual matrix.
    // Audit-only: never enters legal/document evidence or model inputs.
    const companyAverageHeadcountFactualMatrix = buildCompanyAverageHeadcountEvidenceMatrix(
      companyFactualRuntime.company_average_headcount_evidence,
    );

    // practice_area + template title (for document-intent fallback)
    let practiceArea: string | null = null;
    let templateTitle: string | null = null;
    if (session.template_code) {
      const templateLookup = await getTemplateByCode(sb, session.template_code);
      if (templateLookup.status === "found") {
        practiceArea = templateLookup.template.practice_area;
        templateTitle = templateLookup.template.title;
      } else if (templateLookup.status === "error") {
        console.warn("template_registry_lookup_failed", {
          code: "template_registry_lookup_failed",
          template_code: session.template_code,
          lookup_status: templateLookup.status,
        });
      }
    }
    // P0-A: deterministic Document Intent (safe fallback for unknown template).
    const documentIntent = resolveDocumentIntent(
      session.template_code as string | null,
      templateTitle,
    );

    // documents + audit (also pulls metadata so we can use redacted_text when accepted)
    const { data: docs } = await sb
      .from("documents")
      .select("id, title, file_name, ocr_text, metadata")
      .filter("metadata->>intake_session_id", "eq", sessionId)
      .filter("metadata->>extraction_status", "eq", "completed")
      .not("ocr_text", "is", null)
      .limit(40);
    const docMetaById = new Map<string, Record<string, unknown>>();
    let redactionUsedAny = false;
    for (const d of docs ?? []) {
      const meta = ((d as any).metadata ?? {}) as Record<string, unknown>;
      docMetaById.set((d as any).id as string, meta);
      if (meta.redaction_status === "accepted" && typeof meta.redacted_text === "string") {
        redactionUsedAny = true;
      }
    }
    const pickText = (d: any): string => {
      const meta = docMetaById.get(d.id as string) ?? {};
      if (meta.redaction_status === "accepted" && typeof meta.redacted_text === "string") {
        return (meta.redacted_text as string).trim();
      }
      return ((d.ocr_text as string | null) ?? "").trim();
    };
    const audited = (docs ?? []).map((d: any) =>
      classifyDocument({
        id: d.id as string,
        title: (d.title as string | null) ?? "",
        file_name: (d.file_name as string | null) ?? null,
        ocr_text: pickText(d),
      }),
    );
    const evidenceIdentityByDocId = new Map<string, string>();
    for (const d of docs ?? []) {
      const identity = await computeEvidenceIdentity(pickText(d));
      if (identity) evidenceIdentityByDocId.set((d as any).id as string, identity);
    }
    const usedDocs = audited.filter((d) => d.used);
    const rejectedDocs = audited.filter((d) => !d.used);

    if (usedDocs.length === 0) {
      const msg = "Для правового анализа необходимо прикрепить документы с извлеченным текстом.";
      await sb
        .from("document_intake_ai_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          ai_result: {
            documents_audit: { used: [], rejected: audited },
            company_factual_evidence: companyFactualRuntime.company_factual_evidence,
            company_factual_diagnostics: companyFactualRuntime.diagnostics,
            company_tax_debt_evidence: companyFactualRuntime.company_tax_debt_evidence,
            company_financial_statement_evidence: companyFactualRuntime.company_financial_statement_evidence,
            company_average_headcount_evidence: companyFactualRuntime.company_average_headcount_evidence,
            company_average_headcount_factual_evidence_matrix: companyAverageHeadcountFactualMatrix.company_average_headcount_evidence_matrix,
            company_average_headcount_factual_matrix_diagnostics: companyAverageHeadcountFactualMatrix.diagnostics,
            company_financial_statement_factual_evidence_matrix: companyFinancialStatementFactualMatrix.company_financial_statement_evidence_matrix,
            company_financial_statement_factual_matrix_diagnostics: companyFinancialStatementFactualMatrix.diagnostics,
            company_factual_dataset_diagnostics: companyFactualRuntime.dataset_diagnostics,
            company_factual_evidence_matrix: companyFactualMatrix.company_factual_evidence_matrix,
            company_factual_matrix_diagnostics: companyFactualMatrix.diagnostics,
            company_tax_debt_factual_evidence_matrix: companyTaxDebtFactualMatrix.company_tax_debt_factual_evidence_matrix,
            company_tax_debt_factual_matrix_diagnostics: companyTaxDebtFactualMatrix.diagnostics,
          } as any,
          problems: ["Нет прикрепленных документов или извлеченного текста"] as any,
          source_verification_status: "no_sources",
          hallucination_risk: "high",
          legal_accuracy_score: 0,
          needs_lawyer_review: true,
          error_message: msg,
          input_snapshot: {
            documents_total: audited.length,
            documents_used: 0,
            documents_rejected: rejectedDocs.length,
            reason: "no_usable_document_text",
            company_factual_evidence: companyFactualRuntime.company_factual_evidence,
            company_factual_diagnostics: companyFactualRuntime.diagnostics,
            company_tax_debt_evidence: companyFactualRuntime.company_tax_debt_evidence,
            company_financial_statement_evidence: companyFactualRuntime.company_financial_statement_evidence,
            company_average_headcount_evidence: companyFactualRuntime.company_average_headcount_evidence,
            company_average_headcount_factual_evidence_matrix: companyAverageHeadcountFactualMatrix.company_average_headcount_evidence_matrix,
            company_average_headcount_factual_matrix_diagnostics: companyAverageHeadcountFactualMatrix.diagnostics,
            company_financial_statement_factual_evidence_matrix: companyFinancialStatementFactualMatrix.company_financial_statement_evidence_matrix,
            company_financial_statement_factual_matrix_diagnostics: companyFinancialStatementFactualMatrix.diagnostics,
            company_factual_dataset_diagnostics: companyFactualRuntime.dataset_diagnostics,
            company_factual_evidence_matrix: companyFactualMatrix.company_factual_evidence_matrix,
            company_factual_matrix_diagnostics: companyFactualMatrix.diagnostics,
            company_tax_debt_factual_evidence_matrix: companyTaxDebtFactualMatrix.company_tax_debt_factual_evidence_matrix,
            company_tax_debt_factual_matrix_diagnostics: companyTaxDebtFactualMatrix.diagnostics,
            external_research: stagedExternalResearchSnapshot,
          } as any,
        })
        .eq("id", runId);
      return json({ success: false, run_id: runId, error: "no_documents", message: msg }, 200);
    }

    // Layer 1: Fact Extraction. External research is deliberately excluded from
    // this input so provider narrative/reference text cannot become case facts.
    const docTextById = new Map<string, string>();
    for (const d of docs ?? []) docTextById.set(d.id as string, pickText(d));
    const docsForExtraction = usedDocs.map((d) => ({
      id: d.id,
      title: d.title,
      text: docTextById.get(d.id) ?? "",
    }));

    const researchQuery = await extractFacts({
      templateCode: session.template_code as string,
      practiceArea,
      answers,
      documents: docsForExtraction,
    });
    const queryEmbedding = await embedQuery(queryToSearchString(researchQuery));

    // Layer 2: Repositories + discovery-only External Legal Research Import.
    const { sources: repositorySources, counts, researchPlan } = await runAllRepositories(
      sb,
      researchQuery,
      practiceArea,
    );
    const canonicalRepositorySources = await attachCanonicalRegistryMetadata(sb, repositorySources);
    const canonicalExternalCandidates = await attachCanonicalRegistryMetadata(sb, externalResearch.sources);
    const externalResearchLink = linkExternalResearchToLocalSources(
      canonicalRepositorySources,
      canonicalExternalCandidates,
    );
    const externalResearchRunSnapshot = buildExternalResearchRunSnapshot(
      externalResearch,
      externalResearchLink,
    );
    const rawSources = externalResearchLink.sources;

    // Persist the sanitized run-specific import snapshot before model calls so
    // failed runs remain auditable. Narrative/excerpts are never included.
    const { error: snapshotErr } = await sb
      .from("document_intake_ai_runs")
      .update({
        input_snapshot: {
          template_code: session.template_code,
          practice_area: practiceArea,
          answers_count: Object.keys(answers).length,
          documents_total: audited.length,
          documents_used: usedDocs.length,
          documents_rejected: rejectedDocs.length,
          company_factual_evidence: companyFactualRuntime.company_factual_evidence,
          company_factual_diagnostics: companyFactualRuntime.diagnostics,
          company_tax_debt_evidence: companyFactualRuntime.company_tax_debt_evidence,
          company_financial_statement_evidence: companyFactualRuntime.company_financial_statement_evidence,
          company_average_headcount_evidence: companyFactualRuntime.company_average_headcount_evidence,
          company_average_headcount_factual_evidence_matrix: companyAverageHeadcountFactualMatrix.company_average_headcount_evidence_matrix,
          company_average_headcount_factual_matrix_diagnostics: companyAverageHeadcountFactualMatrix.diagnostics,
          company_financial_statement_factual_evidence_matrix: companyFinancialStatementFactualMatrix.company_financial_statement_evidence_matrix,
          company_financial_statement_factual_matrix_diagnostics: companyFinancialStatementFactualMatrix.diagnostics,
          company_factual_dataset_diagnostics: companyFactualRuntime.dataset_diagnostics,
          company_factual_evidence_matrix: companyFactualMatrix.company_factual_evidence_matrix,
          company_factual_matrix_diagnostics: companyFactualMatrix.diagnostics,
          company_tax_debt_factual_evidence_matrix: companyTaxDebtFactualMatrix.company_tax_debt_factual_evidence_matrix,
          company_tax_debt_factual_matrix_diagnostics: companyTaxDebtFactualMatrix.diagnostics,
          external_research: externalResearchRunSnapshot,
        } as any,
      })
      .eq("id", runId);
    if (snapshotErr) throw new Error(`update_run_snapshot: ${snapshotErr.message}`);

    // Layer 3: Ranking
    const scored = await rankSources({
      sb,
      sources: rawSources,
      query: researchQuery,
      queryEmbedding,
      practiceArea,
    });

    // Layer 4: Dedupe + per-bucket caps (keeps prompt small).
    const mergedAll = dedupe(scored);
    const merged = limitSources(mergedAll);

    // Compact document summaries (no full OCR in prompt).
    const queryFacts = Array.isArray(researchQuery.facts) ? (researchQuery.facts as string[]) : [];
    const usedSummaries = usedDocs.map((d) =>
      summarizeDocument({
        id: d.id,
        title: d.title,
        fileName: null,
        ocrText: docTextById.get(d.id) ?? "",
        status: "used",
        queryFacts,
      }),
    );
    const rejectedSummaries = rejectedDocs.map((d) =>
      summarizeDocument({
        id: d.id,
        title: d.title,
        fileName: null,
        ocrText: docTextById.get(d.id) ?? "",
        status: "rejected",
        queryFacts,
      }),
    );
    const docSummaries = [...usedSummaries, ...rejectedSummaries];

    // Layer 5: Gemini Pro
    const prompt = buildPrompt({
      templateCode: session.template_code as string,
      jurisdiction: (session.jurisdiction as string) ?? "ru",
      language: (session.language as string) ?? "ru",
      query: researchQuery,
      documents: docSummaries,
      sources: merged,
      intent: documentIntent,
    });
    const {
      text,
      rawResponse,
      model,
      attempts: modelAttempts,
      fallback_used,
    } = await callGeminiPro(prompt);
    lastRawResponse = rawResponse ?? "";
    lastModel = model ?? MODEL_NAME;

    let parsed: any;
    try {
      if (!text) throw new Error("empty model output");
      parsed = extractJson(text);
    } catch (e) {
      const parseMsg = (e as Error).message ?? String(e);
      const diagnostics = await saveParseFailed(parseMsg, lastRawResponse);
      return json(
        {
          success: false,
          run_id: runId,
          error: "parse_failed",
          message: parseMsg,
          raw_response_preview: diagnostics.raw_response_preview,
        },
        200,
      );
    }

    // Layer 6: merge with registry + apply document_usage
    const { combined_sources, source_actuality } = mergeWithRegistry(parsed, merged);
    const updatedAudit = applyDocumentUsage(
      { used: usedDocs, rejected: rejectedDocs },
      parsed.document_usage,
    );

    // Layer 7: ENRICH — stable IDs, trust score, priority/supersede.
    let trusted = enrichSources(merged);
    carryCanonicalMetadataToTrusted(trusted, merged);
    // P0-E4: canonical fact identity built once from parsed.facts, and the
    // model-emitted fact_key → fact_id map is carried into Evidence Matrix.
    const { records: factsRecords, keyToId: factKeyToId } = buildFactRecords(parsed.facts);
    let facts = factsRecords;
    // Normalize parsed.facts to string[] for downstream / frontend adapters
    // that read analysis.facts as text array. Canonical identity lives in
    // parsed.facts_index (fact_id ↔ text) written below.
    parsed.facts = facts.map((f) => f.fact_text);
    let provBuild = buildConclusionsAndIndex(parsed, trusted, facts);
    let validatedConclusions = validateConclusions(provBuild.conclusions, trusted);
    let officialExplanationsCoverage = evaluateOfficialExplanationsCoverage({ plan: researchPlan, trusted });
    let temporalApplicability = evaluateTemporalApplicability({ plan: researchPlan, trusted });
    let sufficiency = evaluateSufficiency({
      trusted,
      conclusions: validatedConclusions,
      researchCoverageGaps: [
        ...officialExplanationsCoverage.gaps,
        ...temporalApplicability.gaps,
      ],
    });

    // Layer 7b: GAP RETRY — one targeted re-search through legal_knowledge_chunks.
    let gapRetryUsed = false;
    if (sufficiency.status !== "sufficient" && sufficiency.gaps.length > 0) {
      const extraRaw = await gapSearch(sb, sufficiency.gaps, practiceArea, researchPlan);
      if (extraRaw.length > 0) {
        gapRetryUsed = true;
        const extraScored = await rankSources({
          sb,
          sources: extraRaw,
          query: researchQuery,
          queryEmbedding,
          practiceArea,
        });
        const mergedExtra = dedupe([...scored, ...extraScored]);
        const mergedLimited = limitSources(mergedExtra);
        trusted = enrichSources(mergedLimited);
        carryCanonicalMetadataToTrusted(trusted, mergedLimited);
        provBuild = buildConclusionsAndIndex(parsed, trusted, facts);
        validatedConclusions = validateConclusions(provBuild.conclusions, trusted);
        officialExplanationsCoverage = evaluateOfficialExplanationsCoverage({ plan: researchPlan, trusted });
        temporalApplicability = evaluateTemporalApplicability({ plan: researchPlan, trusted });
        sufficiency = evaluateSufficiency({
          trusted,
          conclusions: validatedConclusions,
          researchCoverageGaps: [
            ...officialExplanationsCoverage.gaps,
            ...temporalApplicability.gaps,
          ],
        });
      }
    }

    const generationConclusions = validatedConclusions.filter(
      (conclusion) => conclusion.provenance.use_in_generation,
    );
    const blockedConclusions = validatedConclusions.filter(
      (conclusion) => !conclusion.provenance.use_in_generation,
    );

    // Phase B correction: mark actually-used sources BEFORE challenge,
    // so blocking decisions reference the correct flag.
    setActuallyUsedInGeneration(trusted, generationConclusions);

    // Layer 8: AI CHALLENGE / critical review pass (second LLM, cheap flash).
    const challengeResult = await runChallenge({
      parsed,
      trusted,
      conclusions: validatedConclusions,
    });
    for (const c of validatedConclusions) c.provenance.reviewed_by_challenge = true;

    // Phase B correction: warnings + external_search + draft/final decision.
    const sourceWarnings = buildSourceWarnings(trusted, validatedConclusions);
    const externalSearch = evaluateExternalSearch({ sufficiency, trusted });
    const generationAllowed = decideGeneration({
      sufficiency,
      challenge: challengeResult,
      warnings: sourceWarnings,
      conclusions: validatedConclusions,
      trusted,
    });

    // Layer 9: Evidence Matrix.
    const evidenceMatrix = buildEvidenceMatrix({
      facts,
      parsed,
      conclusions: validatedConclusions,
      documents: usedDocs.map((d) => ({
        id: d.id,
        title: d.title,
        ocr_length: d.ocr_length,
        evidence_identity: evidenceIdentityByDocId.get(d.id) ?? null,
      })),
      factKeyToId,
    });

    // Layer 10: Matter Analysis Versioning — hashes + previous run + version.
    const hashes = await computeHashes({
      answers,
      documents: (docs ?? []).map((d: any) => ({
        id: d.id as string,
        ocr_length: (docTextById.get(d.id as string) ?? "").length,
        redaction_status:
          (docMetaById.get(d.id as string)?.redaction_status as string | undefined) ?? null,
      })),
      sources: trusted,
    });
    const { data: prevRuns } = await sb
      .from("document_intake_ai_runs")
      .select("id, ai_result, status, created_at")
      .eq("session_id", sessionId)
      .eq("run_type", "legal_analysis")
      .eq("status", "completed")
      .neq("id", runId)
      .order("created_at", { ascending: false })
      .limit(1);
    const prev = (prevRuns ?? [])[0];
    const prevAi = (prev?.ai_result ?? {}) as Record<string, unknown>;
    const prevVersion = Number((prevAi.analysis_version as number | undefined) ?? 0);
    const previousHashes = (prevAi.hashes ?? null) as Record<string, string> | null;
    let analysisReason: string = "initial";
    if (prev && previousHashes) {
      const reasons: string[] = [];
      if (previousHashes.answers_hash !== hashes.answers_hash) reasons.push("answers_changed");
      if (previousHashes.documents_hash !== hashes.documents_hash)
        reasons.push("documents_changed");
      if (previousHashes.used_sources_hash !== hashes.used_sources_hash)
        reasons.push("sources_changed");
      analysisReason = reasons.length ? reasons.join(",") : "manual_rerun";
    }

    parsed.sources = combined_sources;
    parsed.source_actuality = source_actuality;
    parsed.documents_audit = updatedAudit;
    parsed.research_query = researchQuery;
    parsed.research_summary = {
      documents_total: audited.length,
      documents_used: usedDocs.length,
      documents_rejected: rejectedDocs.length,
      sources_raw: rawSources.length,
      sources_after_ranking: scored.length,
      sources_after_dedupe: mergedAll.length,
      sources_after_caps: merged.length,
      sources_used_by_model: combined_sources.length,
      sources_after_enrich: trusted.length,
      sources_winners: trusted.filter((s) => s.is_winner && s.use_in_generation).length,
      gap_retry_used: gapRetryUsed ? 1 : 0,
      external_research_imports: externalResearch.diagnostics.imports_received,
      external_research_candidates: externalResearch.diagnostics.candidates_normalized,
      external_research_linked: externalResearchLink.linked,
      external_research_unresolved: externalResearchLink.unresolved,
      ...counts,
      semantic_enabled: queryEmbedding ? 1 : 0,
    };
    parsed.diagnostics = {
      ...(parsed.diagnostics ?? {}),
      model_attempts: modelAttempts,
      final_model: model,
      fallback_used,
      external_research_import: externalResearchRunSnapshot,
    };

    // Extended ai_result fields (Phase A core):
    parsed.facts_index = facts;
    parsed.trusted_sources = trusted.filter((source) => source.actually_used_in_generation);
    parsed.conclusions = validatedConclusions;
    parsed.generation_conclusions = generationConclusions;
    parsed.blocked_conclusions = blockedConclusions;
    parsed.provenance_index = provBuild.provenance_index;
    parsed.evidence_matrix = evidenceMatrix;
    // P0-A7 additive factual matrix; does not mutate legal/document Evidence Matrix.
    parsed.company_factual_evidence_matrix = companyFactualMatrix.company_factual_evidence_matrix;
    parsed.company_factual_identity = {
      canonical_company_facts: companyFactualMatrix.canonical_company_facts,
      company_fact_evidence_links: companyFactualMatrix.company_fact_evidence_links,
      diagnostics: companyFactualMatrix.diagnostics,
    };
    // P0-A12: DEBTAM identity/matrix persistence remains a separate factual channel.
    parsed.company_tax_debt_factual_evidence_matrix =
      companyTaxDebtFactualMatrix.company_tax_debt_factual_evidence_matrix;
    parsed.company_tax_debt_factual_identity = {
      canonical_company_tax_debt_facts:
        companyTaxDebtFactualMatrix.canonical_company_tax_debt_facts,
      company_tax_debt_evidence_links:
        companyTaxDebtFactualMatrix.company_tax_debt_evidence_links,
      diagnostics: companyTaxDebtFactualMatrix.diagnostics,
    };
    parsed.source_sufficiency = sufficiency;
    parsed.research_coverage = {
      official_explanations: officialExplanationsCoverage,
      temporal: temporalApplicability,
    };
    parsed.challenge_result = challengeResult;
    parsed.source_warnings = sourceWarnings;
    parsed.external_search_required = externalSearch.required;
    parsed.external_search_reason = externalSearch.reason;
    parsed.generation_allowed = generationAllowed;
    parsed.hashes = hashes;
    parsed.analysis_version = prevVersion + 1;
    parsed.analysis_reason = analysisReason;
    parsed.created_from = "analyze-document-legal-position";
    parsed.previous_analysis_run_id = prev?.id ?? null;
    parsed.redaction_used = redactionUsedAny;
    // P0-A5: persisted factual snapshot only; still excluded from legal/model paths.
    parsed.company_factual_evidence = companyFactualRuntime.company_factual_evidence;
    parsed.company_factual_diagnostics = companyFactualRuntime.diagnostics;
    // P0-A10: DEBTAM remains a separate point-in-time factual channel.
    // It is not passed into the SNR canonical factual matrix or legal/model paths.
    parsed.company_tax_debt_evidence = companyFactualRuntime.company_tax_debt_evidence;
    // P0-A15: REVEXP annual accounting-statement evidence remains audit-only.
    parsed.company_financial_statement_evidence = companyFactualRuntime.company_financial_statement_evidence;
    // P0-A20: SSHR2019 average-headcount evidence remains audit-only.
    parsed.company_average_headcount_evidence = companyFactualRuntime.company_average_headcount_evidence;
    // P0-A22: SSHR2019 identity/matrix persistence remains a separate factual audit channel.
    parsed.company_average_headcount_factual_evidence_matrix =
      companyAverageHeadcountFactualMatrix.company_average_headcount_evidence_matrix;
    parsed.company_average_headcount_factual_identity = {
      canonical_company_average_headcount_facts:
        companyAverageHeadcountFactualMatrix.canonical_company_average_headcount_facts,
      company_headcount_fact_evidence_links:
        companyAverageHeadcountFactualMatrix.company_headcount_fact_evidence_links,
      diagnostics: companyAverageHeadcountFactualMatrix.diagnostics,
    };
    // P0-A17: REVEXP identity/matrix persistence remains a separate factual audit channel.
    parsed.company_financial_statement_factual_evidence_matrix =
      companyFinancialStatementFactualMatrix.company_financial_statement_evidence_matrix;
    parsed.company_financial_statement_factual_identity = {
      canonical_company_financial_statement_facts:
        companyFinancialStatementFactualMatrix.canonical_company_financial_statement_facts,
      company_financial_statement_fact_evidence_links:
        companyFinancialStatementFactualMatrix.company_financial_statement_fact_evidence_links,
      diagnostics: companyFinancialStatementFactualMatrix.diagnostics,
    };
    parsed.company_factual_dataset_diagnostics = companyFactualRuntime.dataset_diagnostics;
    // P0-A: deterministic intent always wins over model output.
    parsed.template_code = session.template_code;
    parsed.target_document = documentIntent.target_document;
    parsed.process_stage = documentIntent.process_stage;
    parsed.document_intent = documentIntent.document_intent;

    const metrics = computeMetrics(combined_sources, parsed);
    // Override hallucination_risk when challenge blocks the run.
    const finalRisk =
      challengeResult.status === "blocked"
        ? "high"
        : challengeResult.status === "needs_revision" && metrics.hallucination_risk === "low"
          ? "medium"
          : metrics.hallucination_risk;
    const finalNeedsLawyer =
      metrics.needs_lawyer_review ||
      challengeResult.status !== "passed" ||
      sufficiency.status !== "sufficient";

    const canonicalShadowResult = computeCanonicalRelationsShadow({
      enabled: canonicalRelationsEnabled,
      conclusions: generationConclusions,
      trustedSources: parsed.trusted_sources,
    });

    const { error: updErr } = await sb
      .from("document_intake_ai_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        model_name: model,
        ai_result: parsed as any,
        used_sources: parsed.trusted_sources as any,
        source_verification_status: metrics.source_verification_status,
        hallucination_risk: finalRisk,
        legal_accuracy_score: metrics.legal_accuracy_score,
        needs_lawyer_review: finalNeedsLawyer,
        required_fixes: (parsed.missing_evidence ?? []) as any,
        recommendations: (parsed.recommendations?.length
          ? parsed.recommendations
          : (parsed.generation_instructions ?? [])) as any,
        problems: (parsed.weak_points ?? []) as any,
        input_snapshot: {
          template_code: session.template_code,
          practice_area: practiceArea,
          answers_count: Object.keys(answers).length,
          company_factual_evidence: companyFactualRuntime.company_factual_evidence,
          company_factual_diagnostics: companyFactualRuntime.diagnostics,
          company_tax_debt_evidence: companyFactualRuntime.company_tax_debt_evidence,
          company_financial_statement_evidence: companyFactualRuntime.company_financial_statement_evidence,
          company_average_headcount_evidence: companyFactualRuntime.company_average_headcount_evidence,
          company_average_headcount_factual_evidence_matrix: companyAverageHeadcountFactualMatrix.company_average_headcount_evidence_matrix,
          company_average_headcount_factual_matrix_diagnostics: companyAverageHeadcountFactualMatrix.diagnostics,
          company_financial_statement_factual_evidence_matrix: companyFinancialStatementFactualMatrix.company_financial_statement_evidence_matrix,
          company_financial_statement_factual_matrix_diagnostics: companyFinancialStatementFactualMatrix.diagnostics,
          company_factual_dataset_diagnostics: companyFactualRuntime.dataset_diagnostics,
          company_factual_evidence_matrix: companyFactualMatrix.company_factual_evidence_matrix,
          company_factual_matrix_diagnostics: companyFactualMatrix.diagnostics,
          company_tax_debt_factual_evidence_matrix: companyTaxDebtFactualMatrix.company_tax_debt_factual_evidence_matrix,
          company_tax_debt_factual_matrix_diagnostics: companyTaxDebtFactualMatrix.diagnostics,
          external_research: externalResearchRunSnapshot,
          ...parsed.research_summary,
        } as any,
      })
      .eq("id", runId);
    if (updErr) throw new Error(`update_run: ${updErr.message}`);

    const canonicalShadowRecord = buildCanonicalShadowPersistenceRecord({
      analysisRunId: runId,
      analysisVersion: parsed.analysis_version,
      result: canonicalShadowResult,
      shadowEnabled: canonicalRelationsEnabled,
    });
    await persistCanonicalShadowBestEffort({
      client: {
        async insertCanonicalShadow(record) {
          const { error } = await sb
            .from("document_intake_canonical_shadow_runs")
            .insert(record as any);
          return { error };
        },
      },
      record: canonicalShadowRecord,
    });

    return json({ success: true, run_id: runId, analysis: parsed, metrics });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);

    if (e instanceof AllModelsFailedError) {
      const aiResult = {
        error: "all_models_failed",
        model_attempts: e.attempts,
        last_error: e.lastError,
      };
      await sb
        .from("document_intake_ai_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          model_name: e.attempts[e.attempts.length - 1]?.model ?? lastModel,
          error_message: "all_models_failed",
          ai_result: aiResult as any,
          source_verification_status: "no_sources",
          hallucination_risk: "high",
          legal_accuracy_score: 0,
          needs_lawyer_review: true,
        })
        .eq("id", runId);
      return json(
        {
          success: false,
          error: "all_models_failed",
          run_id: runId,
          model_attempts: e.attempts,
          last_error: e.lastError,
        },
        200,
      );
    }

    if (e instanceof FatalGeminiError) {
      const aiResult = {
        error: "gemini_fatal",
        http_status: e.httpStatus,
        model_attempts: (e as FatalGeminiError).attempts,
        last_error: msg,
      };
      await sb
        .from("document_intake_ai_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          model_name: (e as FatalGeminiError).attempts[0]?.model ?? lastModel,
          error_message: msg,
          ai_result: aiResult as any,
        })
        .eq("id", runId);
      return json({ success: false, error: msg, run_id: runId }, 500);
    }

    if (isParseFailedMessage(msg) && lastRawResponse) {
      await saveParseFailed(msg.replace(/^parse_failed:\s*/i, ""), lastRawResponse);
    } else {
      await sb
        .from("document_intake_ai_runs")
        .update({
          status: "failed",
          error_message: msg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return json({ success: false, error: msg, run_id: runId }, 500);
  }
});