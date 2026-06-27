// Legal Research Engine — orchestrator (Stage 2).
// Pipeline:
//   load → classify docs → FactExtraction → Repositories → Ranking → Dedupe
//   → Gemini Pro → MergeWithRegistry + ApplyDocumentUsage → persist.
// Does NOT touch: generate-legal-document-v2, review-generated-legal-document,
// document-intake-ai-fill, DB schema.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { extractFacts, embedQuery, queryToSearchString } from "./fact-extraction.ts";
import { runAllRepositories, gapSearch } from "./repositories.ts";
import { rankSources } from "./ranking.ts";
import { dedupe } from "./dedupe.ts";
import { buildPrompt, callGeminiPro, limitSources, summarizeDocument } from "./prompt.ts";
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
  buildEvidenceMatrix,
  evaluateSufficiency,
  computeHashes,
} from "./enrich.ts";
import { runChallenge } from "./challenge.ts";
import { AllModelsFailedError, FatalGeminiError, type ModelAttempt } from "./gemini-fallback.ts";

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
  return /parse_failed|JSON|Expected|Unexpected|unterminated|empty model output|invalid JSON/i.test(message);
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

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const sessionId: string | undefined = body?.session_id;
  if (!sessionId) return json({ error: "session_id required" }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

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
      .select("id, template_code, jurisdiction, language")
      .eq("id", sessionId)
      .single();
    if (sessErr) throw new Error(`session: ${sessErr.message}`);

    // answers
    const { data: answerRows } = await sb
      .from("document_intake_answers")
      .select("field_name, field_value")
      .eq("session_id", sessionId);
    const answers: Record<string, unknown> = {};
    for (const r of answerRows ?? []) answers[r.field_name as string] = r.field_value;

    // practice_area
    let practiceArea: string | null = null;
    if (session.template_code) {
      const { data: tpl } = await sb
        .from("document_templates")
        .select("practice_area")
        .eq("code", session.template_code)
        .maybeSingle();
      practiceArea = (tpl?.practice_area as string | null) ?? null;
    }

    // documents + audit (also pulls metadata so we can use redacted_text when accepted)
    const { data: docs } = await sb
      .from("documents")
      .select("id, title, file_name, ocr_text, metadata")
      .filter("metadata->>intake_session_id", "eq", sessionId)
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
          } as any,
        })
        .eq("id", runId);
      return json({ success: false, run_id: runId, error: "no_documents", message: msg }, 200);
    }

    // Layer 1: Fact Extraction
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

    // Layer 2: Repositories
    const { sources: rawSources, counts } = await runAllRepositories(sb, researchQuery, practiceArea);

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
    });
    const { text, rawResponse, model, attempts: modelAttempts, fallback_used } = await callGeminiPro(prompt);
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
      ...counts,
      semantic_enabled: queryEmbedding ? 1 : 0,
    };
    parsed.diagnostics = {
      ...(parsed.diagnostics ?? {}),
      model_attempts: modelAttempts,
      final_model: model,
      fallback_used,
    };

    const metrics = computeMetrics(combined_sources, parsed);

    const { error: updErr } = await sb
      .from("document_intake_ai_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        model_name: model,
        ai_result: parsed as any,
        used_sources: combined_sources as any,
        source_verification_status: metrics.source_verification_status,
        hallucination_risk: metrics.hallucination_risk,
        legal_accuracy_score: metrics.legal_accuracy_score,
        needs_lawyer_review: metrics.needs_lawyer_review,
        required_fixes: (parsed.missing_evidence ?? []) as any,
        recommendations: (parsed.recommendations?.length ? parsed.recommendations : parsed.generation_instructions ?? []) as any,
        problems: (parsed.weak_points ?? []) as any,
        input_snapshot: {
          template_code: session.template_code,
          practice_area: practiceArea,
          answers_count: Object.keys(answers).length,
          ...parsed.research_summary,
        } as any,
      })
      .eq("id", runId);
    if (updErr) throw new Error(`update_run: ${updErr.message}`);

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
      return json({ success: false, error: "all_models_failed", run_id: runId, model_attempts: e.attempts, last_error: e.lastError }, 200);
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
