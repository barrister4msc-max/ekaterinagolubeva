// Phase B — Matter Snapshot / Matter Knowledge Package.
// Pure projection over the latest completed legal_analysis run in
// document_intake_ai_runs. No new tables, no edge functions.

import { supabase } from "@/integrations/supabase/client";
import {
  fetchLatestLegalAnalysis,
  type LegalAnalysisRun,
  type LegalAnalysisResult,
  type LegalAnalysisTrustedSource,
  type LegalAnalysisConclusion,
  type LegalAnalysisProvenanceIndex,
  type LegalAnalysisEvidenceMatrix,
  type LegalAnalysisSourceSufficiency,
  type LegalAnalysisChallengeResult,
  type LegalAnalysisHashes,
  type LegalAnalysisFactRecord,
  type LegalAnalysisSourceWarning,
  type LegalAnalysisGenerationDecision,
} from "./legal-analysis";

export type QualityGatePreview = {
  ok: boolean;
  reasons: string[];
};

export type MatterSnapshot = {
  session_id: string;
  legal_analysis_run_id: string;
  legal_analysis_created_at: string;
  analysis_version: number;
  analysis_reason: string;
  // raw analysis fields used by the generator
  facts: string[];
  facts_index: LegalAnalysisFactRecord[];
  documents: Array<{ id: string; title: string; used: boolean }>;
  trusted_sources: LegalAnalysisTrustedSource[];
  source_sufficiency: LegalAnalysisSourceSufficiency | null;
  challenge_result: LegalAnalysisChallengeResult | null;
  conclusions: LegalAnalysisConclusion[];
  provenance_index: LegalAnalysisProvenanceIndex | null;
  evidence_matrix: LegalAnalysisEvidenceMatrix;
  risks: LegalAnalysisResult["risks"];
  missing_evidence: string[];
  recommendations: string[];
  generation_instructions: string[];
  hashes: LegalAnalysisHashes | null;
  redaction_used: boolean;
  // Phase B corrections
  source_warnings: LegalAnalysisSourceWarning[];
  external_search_required: boolean;
  external_search_reason: string | null;
    generation_allowed: LegalAnalysisGenerationDecision;
  quality_gate_preview: QualityGatePreview;

  case_intelligence_version?: number;
  facts_total?: number;
  issues_total?: number;
  contradictions_total?: number;
  missing_evidence_total?: number;
  strongest_arguments?: string[];
  weakest_arguments?: string[];
  missing_before_generation?: string[];
};

function defaultGenerationDecision(): LegalAnalysisGenerationDecision {
  return { draft: false, final: false, warnings: [], reasons: ["no_analysis_payload"] };
}

export function previewQualityGate(run: LegalAnalysisRun): QualityGatePreview {
  const a = run.analysis;
  if (!a) return { ok: false, reasons: ["no_analysis_payload"] };
  const decision = a.generation_allowed;
  if (decision) {
    return { ok: decision.draft, reasons: decision.reasons };
  }
  // Legacy fallback for analyses written before Phase B correction.
  const reasons: string[] = [];
  if (run.status !== "completed") reasons.push("analysis_not_completed");
  if (a.challenge_result?.status === "blocked") reasons.push("challenge_blocked");
  if (a.source_sufficiency?.status === "insufficient_critical")
    reasons.push("source_sufficiency_insufficient_critical");
  if ((a.conclusions ?? []).some((c) => c.provenance?.provenance_missing))
    reasons.push("provenance_missing");
  if ((a.conclusions ?? []).some((c) => c.provenance?.hallucinated_source))
    reasons.push("hallucinated_source");
  return { ok: reasons.length === 0, reasons };
}

export function buildMatterSnapshotFromRun(
  sessionId: string,
  run: LegalAnalysisRun,
): MatterSnapshot {
  const a: LegalAnalysisResult | null = run.analysis;
  const matrix =
  (run as any)?.metadata?.case_intelligence_matrix ??
  (a as any)?.case_intelligence_matrix ??
  null;
  const audit = a?.documents_audit;
  const docs: Array<{ id: string; title: string; used: boolean }> = [];
  for (const d of audit?.used ?? []) docs.push({ id: d.id, title: d.title, used: true });
  for (const d of audit?.rejected ?? []) docs.push({ id: d.id, title: d.title, used: false });
  return {
    session_id: sessionId,
    legal_analysis_run_id: run.id,
    legal_analysis_created_at: run.created_at,
    analysis_version: a?.analysis_version ?? 1,
    analysis_reason: a?.analysis_reason ?? "initial",
    facts: a?.facts ?? [],
    facts_index: a?.facts_index ?? [],
    documents: docs,
    trusted_sources: a?.trusted_sources ?? [],
    source_sufficiency: a?.source_sufficiency ?? null,
    challenge_result: a?.challenge_result ?? null,
    conclusions: a?.conclusions ?? [],
    provenance_index: a?.provenance_index ?? null,
    evidence_matrix: a?.evidence_matrix ?? [],
    risks: a?.risks ?? [],
    missing_evidence: a?.missing_evidence ?? [],
    recommendations: a?.recommendations ?? [],
    generation_instructions: a?.generation_instructions ?? [],
    hashes: a?.hashes ?? null,
    redaction_used: Boolean(a?.redaction_used),
    source_warnings: a?.source_warnings ?? [],
    external_search_required: Boolean(a?.external_search_required),
    external_search_reason: a?.external_search_reason ?? null,
    generation_allowed: a?.generation_allowed ?? defaultGenerationDecision(),
    quality_gate_preview: previewQualityGate(run),
  };
}


export async function buildMatterSnapshot(
  sessionId: string,
): Promise<MatterSnapshot | null> {
  const run = await fetchLatestLegalAnalysis(sessionId);
  if (!run) return null;
  return buildMatterSnapshotFromRun(sessionId, run);
}

// ---------------- session signal hashing for staleness check ----------------

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type SessionSignals = {
  answers_hash: string;
  documents_hash: string;
  redaction_hash: string;
  ocr_hash: string;
};

export async function computeSessionSignals(sessionId: string): Promise<SessionSignals> {
  const [{ data: answerRows }, { data: docRows }] = await Promise.all([
    supabase
      .from("document_intake_answers")
      .select("field_name, field_value")
      .eq("session_id", sessionId),
    supabase
      .from("documents")
      .select("id, ocr_text, metadata, ocr_status")
      .filter("metadata->>intake_session_id", "eq", sessionId)
      .filter("metadata->>extraction_status", "eq", "completed")
      .not("ocr_text", "is", null)
      .limit(200),
  ]);

  const sortedAnswers = (answerRows ?? [])
    .slice()
    .sort((a: any, b: any) => String(a.field_name).localeCompare(String(b.field_name)))
    .map((r: any) => [r.field_name, r.field_value]);

  const docsSorted = (docRows ?? [])
    .slice()
    .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));

  const docsSig = docsSorted.map((d: any) => {
    const meta = (d.metadata ?? {}) as Record<string, unknown>;
    const ocr = (d.ocr_text as string | null) ?? "";
    return [d.id, ocr.length, meta.redaction_status ?? null];
  });
  const redactionSig = docsSorted.map((d: any) => {
    const meta = (d.metadata ?? {}) as Record<string, unknown>;
    return [d.id, meta.redaction_status ?? null, typeof meta.redacted_text === "string" ? (meta.redacted_text as string).length : 0];
  });
  const ocrSig = docsSorted.map((d: any) => [d.id, (d.ocr_status as string | null) ?? null, ((d.ocr_text as string | null) ?? "").length]);

  const [answers_hash, documents_hash, redaction_hash, ocr_hash] = await Promise.all([
    sha256(JSON.stringify(sortedAnswers)),
    sha256(JSON.stringify(docsSig)),
    sha256(JSON.stringify(redactionSig)),
    sha256(JSON.stringify(ocrSig)),
  ]);

  return { answers_hash, documents_hash, redaction_hash, ocr_hash };
}
