import { supabase } from "@/integrations/supabase/client";

export type LegalAnalysisLaw = {
  code?: string;
  article?: string;
  title?: string;
  quote?: string;
};

export type LegalAnalysisMapping = {
  fact: string;
  law: string;
  reasoning: string;
  conclusion: string;
};

export type LegalAnalysisRisk = {
  risk: string;
  severity?: string;
  mitigation?: string;
};

export type LegalAnalysisScores = {
  semantic: number;
  keyword: number;
  priority: number;
  relevance: number;
  final: number;
};

export type LegalAnalysisSource = {
  id?: string;
  source_id?: string;
  source_table?: string;
  source_type?: string;
  bucket?: string;
  title: string;
  url?: string;
  official_url?: string | null;
  type?: string;
  cited_for?: string;
  why_selected?: string;
  used_for?: string;
  verification_status?: string;
  actuality_status?: string;
  scores?: LegalAnalysisScores;
  appearances?: number;
  merged_from?: Array<{ source_table: string; source_id: string }>;
};

export type LegalAnalysisActuality = {
  source: string;
  status: "actual" | "outdated" | "unknown" | "needs_check" | "requires_actuality_check";
  note?: string;
};

export type LegalAnalysisDocAudit = {
  id: string;
  title: string;
  ocr_length: number;
  used: boolean;
  used_for?: string[];
  reason?:
    | "no_ocr"
    | "text_too_short"
    | "archive_zip"
    | "technical_file"
    | "duplicate"
    | "irrelevant";
};

export type LegalResearchQuery = {
  practice_area: string | null;
  subcategory: string | null;
  document_type: string | null;
  facts: string[];
  parties: string[];
  amounts: string[];
  dates: string[];
  legal_issues: string[];
  research_topics: string[];
  keywords: string[];
};


export type LegalAnalysisResult = {
  facts: string[];
  legal_qualification: string;
  main_legal_position: string;
  tax_authority_position: string;
  taxpayer_position: string;
  applicable_laws: Array<LegalAnalysisLaw & { source_id?: string; why_selected?: string; used_for?: string; official_url?: string | null }>;
  fact_to_law_mapping: LegalAnalysisMapping[];
  alternative_positions: string[];
  rejected_laws: Array<{ law: string; reason: string }>;
  why_rejected: string[];
  counter_arguments: string[];
  weak_points: string[];
  missing_evidence: string[];
  risks: LegalAnalysisRisk[];
  court_practice: Array<{ case?: string; court?: string; date?: string; conclusion?: string; url?: string; source_id?: string; why_selected?: string; used_for?: string }>;
  rejected_court_practice?: Array<{ case: string; reason: string }>;
  fns_letters: Array<{ number?: string; date?: string; topic?: string; url?: string; source_id?: string; used_for?: string }>;
  minfin_letters: Array<{ number?: string; date?: string; topic?: string; url?: string; source_id?: string; used_for?: string }>;
  ekaterina_practice: Array<{ case?: string; year?: string; outcome?: string; title?: string; source_id?: string; used_for?: string }>;
  manuals?: Array<{ source_id?: string; title?: string; used_for?: string }>;
  sources: LegalAnalysisSource[];
  source_actuality: LegalAnalysisActuality[];
  recommendations?: string[];
  generation_instructions: string[];
  documents_audit?: { used: LegalAnalysisDocAudit[]; rejected: LegalAnalysisDocAudit[] };
  research_summary?: Record<string, number>;
  research_query?: LegalResearchQuery;

  // ---- Phase A extensions (persisted in document_intake_ai_runs.ai_result) ----
  facts_index?: LegalAnalysisFactRecord[];
  trusted_sources?: LegalAnalysisTrustedSource[];
  conclusions?: LegalAnalysisConclusion[];
  provenance_index?: LegalAnalysisProvenanceIndex;
  evidence_matrix?: LegalAnalysisEvidenceMatrix;
  source_sufficiency?: LegalAnalysisSourceSufficiency;
  challenge_result?: LegalAnalysisChallengeResult;
  hashes?: LegalAnalysisHashes;
  analysis_version?: number;
  analysis_reason?: string;
  created_from?: string;
  previous_analysis_run_id?: string | null;
  redaction_used?: boolean;
};

export type LegalAnalysisFactRecord = {
  fact_id: string;
  text: string;
};

export type LegalAnalysisTrustedSource = {
  source_id: string;
  source_ref: string;
  source_table: string;
  source_type: string;
  bucket: string;
  title: string;
  official_url: string | null;
  url: string | null;
  citation: string | null;
  trust_score: number;
  trust_reason: string;
  use_in_generation: boolean;
  priority_group: string | null;
  is_winner: boolean;
  superseded_by: string | null;
  lower_priority_reason: string | null;
  verification_status: string;
  actuality_status: string;
  appearances?: number;
};

export type LegalAnalysisConclusionProvenance = {
  facts_used: string[];
  documents_used: string[];
  laws_used: string[];
  court_practice_used: string[];
  letters_used: string[];
  ekaterina_used: string[];
  manuals_used: string[];
  trust_summary: {
    min_trust_score: number;
    weighted_avg: number;
    lowest_source: string | null;
  };
  sufficiency: { status: "sufficient" | "partial" | "insufficient"; reason: string };
  derivation: string;
  confidence: number;
  reviewed_by_challenge: boolean;
  hallucinated_source: boolean;
  provenance_missing: boolean;
};

export type LegalAnalysisConclusion = {
  conclusion_id: string;
  kind: string;
  statement: string;
  provenance: LegalAnalysisConclusionProvenance;
};

export type LegalAnalysisProvenanceIndex = {
  source_to_conclusions: Record<string, string[]>;
  fact_to_conclusions: Record<string, string[]>;
};

export type LegalAnalysisEvidenceMatrix = Array<{
  fact_id: string;
  fact_text: string;
  documents: string[];
  conclusions: string[];
  evidence_status: "proven" | "partial" | "missing";
  evidence_strength: number;
}>;

export type LegalAnalysisSourceSufficiency = {
  status: "sufficient" | "partial" | "insufficient" | "insufficient_critical";
  gaps: string[];
  reason?: string;
};

export type LegalAnalysisChallengeResult = {
  status: "passed" | "needs_revision" | "blocked";
  issues: Array<{
    kind: string;
    description: string;
    affected_conclusions: string[];
    affected_sources: string[];
  }>;
  required_changes: string[];
  adverse_sources: string[];
  unresolved_risks: string[];
  reasoning: string;
};

export type LegalAnalysisHashes = {
  answers_hash: string;
  documents_hash: string;
  used_sources_hash: string;
  redaction_hash?: string;
  ocr_hash?: string;
};


export type LegalAnalysisRun = {
  id: string;
  session_id: string;
  status: string;
  hallucination_risk: string | null;
  legal_accuracy_score: number | null;
  source_verification_status: string | null;
  needs_lawyer_review: boolean;
  model_name: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  analysis: LegalAnalysisResult | null;
};

export async function runLegalAnalysis(sessionId: string): Promise<LegalAnalysisRun> {
  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    error?: string;
    run_id: string;
    analysis: LegalAnalysisResult;
  }>("analyze-document-legal-position", { body: { session_id: sessionId } });
  if (error) throw error;
  if (!data || data.success === false) {
    throw new Error(data?.error ?? "Не удалось выполнить правовой анализ");
  }
  return fetchLatestLegalAnalysis(sessionId) as Promise<LegalAnalysisRun>;
}

export async function fetchLatestLegalAnalysis(
  sessionId: string,
): Promise<LegalAnalysisRun | null> {
  const { data, error } = await supabase
    .from("document_intake_ai_runs")
    .select(
      "id, session_id, status, hallucination_risk, legal_accuracy_score, source_verification_status, needs_lawyer_review, model_name, error_message, created_at, completed_at, ai_result",
    )
    .eq("session_id", sessionId)
    .eq("run_type", "legal_analysis")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    session_id: data.session_id as string,
    status: data.status as string,
    hallucination_risk: (data.hallucination_risk as string | null) ?? null,
    legal_accuracy_score: (data.legal_accuracy_score as number | null) ?? null,
    source_verification_status: (data.source_verification_status as string | null) ?? null,
    needs_lawyer_review: Boolean(data.needs_lawyer_review),
    model_name: (data.model_name as string | null) ?? null,
    error_message: (data.error_message as string | null) ?? null,
    created_at: data.created_at as string,
    completed_at: (data.completed_at as string | null) ?? null,
    analysis: (data.ai_result as unknown as LegalAnalysisResult | null) ?? null,
  };
}

export async function hasSessionDocumentsWithText(sessionId: string): Promise<boolean> {
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, ocr_text")
    .eq("metadata->>intake_session_id", sessionId)
    .limit(20);
  if (error) throw error;
  if (!docs || docs.length === 0) return false;

  for (const d of docs) {
    const text = d.ocr_text as string | null;
    if (text != null && text.length > 50) return true;
  }
  return false;
}
