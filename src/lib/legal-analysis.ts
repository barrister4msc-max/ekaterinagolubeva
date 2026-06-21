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

export type LegalAnalysisSource = {
  id?: string;
  title: string;
  url?: string;
  type?: string;
  cited_for?: string;
};

export type LegalAnalysisActuality = {
  source: string;
  status: "actual" | "outdated" | "unknown";
  note?: string;
};

export type LegalAnalysisResult = {
  facts: string[];
  legal_qualification: string;
  main_legal_position: string;
  tax_authority_position: string;
  taxpayer_position: string;
  applicable_laws: LegalAnalysisLaw[];
  fact_to_law_mapping: LegalAnalysisMapping[];
  alternative_positions: string[];
  rejected_laws: Array<{ law: string; reason: string }>;
  why_rejected: string[];
  counter_arguments: string[];
  weak_points: string[];
  missing_evidence: string[];
  risks: LegalAnalysisRisk[];
  court_practice: Array<{ case?: string; court?: string; date?: string; conclusion?: string; url?: string }>;
  fns_letters: Array<{ number?: string; date?: string; topic?: string; url?: string }>;
  minfin_letters: Array<{ number?: string; date?: string; topic?: string; url?: string }>;
  ekaterina_practice: Array<{ case?: string; year?: string; outcome?: string }>;
  sources: LegalAnalysisSource[];
  source_actuality: LegalAnalysisActuality[];
  generation_instructions: string[];
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
    .select("id, ocr_text, metadata")
    .eq("metadata->>intake_session_id", sessionId)
    .limit(20);
  if (error) throw error;
  if (!docs || docs.length === 0) return false;

  for (const d of docs) {
    const md = (d.metadata ?? {}) as Record<string, any>;
    const text = (
      (d.ocr_text as string | null) ??
      (typeof md.extracted_text === "string" ? md.extracted_text : null) ??
      (typeof md.content === "string" ? md.content : null) ??
      ""
    ).trim();
    if (text.length > 50) return true;
  }
  return false;
}
