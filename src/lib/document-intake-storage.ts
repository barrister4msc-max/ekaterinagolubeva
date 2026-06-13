import { supabase } from "@/integrations/supabase/client";
import type { DocumentIntakeSchema, IntakeAnswers, IntakeState } from "@/lib/document-intake-schemas";

export type DocumentIntakeSession = {
  id: string;
  matter_id: string | null;
  client_id: string | null;
  lead_id: string | null;
  document_id: string | null;
  template_code: string;
  jurisdiction: string;
  language: string;
  status: string;
  source_type: string;
  ai_summary: string | null;
  ai_risk_level: string | null;
  ai_recommended_action: string | null;
  created_at: string;
  updated_at: string;
};

export async function createOrLoadIntakeSession(params: {
  matterId?: string | null;
  clientId?: string | null;
  leadId?: string | null;
  documentId?: string | null;
  templateCode: string;
  jurisdiction?: string;
  language?: string;
}) {
  const query = supabase
    .from("document_intake_sessions")
    .select("*")
    .eq("template_code", params.templateCode)
    .maybeSingle();

  if (params.documentId) query.eq("document_id", params.documentId);
  else if (params.matterId) query.eq("matter_id", params.matterId);

  const { data: existing, error: findError } = await query;

  if (findError) throw findError;
  if (existing) return existing as DocumentIntakeSession;

  const { data, error } = await supabase
    .from("document_intake_sessions")
    .insert({
      matter_id: params.matterId ?? null,
      client_id: params.clientId ?? null,
      lead_id: params.leadId ?? null,
      document_id: params.documentId ?? null,
      template_code: params.templateCode,
      jurisdiction: params.jurisdiction ?? "RU",
      language: params.language ?? "ru",
      status: "draft",
      source_type: "lawyer_upload",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as DocumentIntakeSession;
}

export async function loadIntakeAnswers(sessionId: string): Promise<IntakeAnswers> {
  const { data, error } = await supabase
    .from("document_intake_answers")
    .select("field_name, field_value")
    .eq("session_id", sessionId);

  if (error) throw error;

  const answers: IntakeAnswers = {};
  for (const row of data ?? []) {
    answers[row.field_name] = row.field_value;
  }
  return answers;
}

export async function saveIntakeAnswers(params: {
  sessionId: string;
  schema: DocumentIntakeSchema;
  answers: IntakeAnswers;
  valueSource?: "manual" | "ai_extracted";
}) {
  const fields = params.schema.schema_json.steps.flatMap((step) => step.fields);

  const rows = Object.entries(params.answers).map(([fieldName, value]) => {
    const field = fields.find((f) => f.key === fieldName);

    return {
      session_id: params.sessionId,
      field_name: fieldName,
      field_label: field?.label ?? fieldName,
      field_value: value as any,
      value_source: params.valueSource ?? "manual",
      confidence: params.valueSource === "ai_extracted" ? 0.75 : 1,
      needs_review: params.valueSource === "ai_extracted",
      is_verified: params.valueSource !== "ai_extracted",
    };
  });

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("document_intake_answers")
    .upsert(rows, {
      onConflict: "session_id,field_name",
    });

  if (error) throw error;
}

export function intakeStateFromSession(params: {
  baseState: IntakeState;
  answers: IntakeAnswers;
}): IntakeState {
  return {
    ...params.baseState,
    answers: params.answers,
  };
}
