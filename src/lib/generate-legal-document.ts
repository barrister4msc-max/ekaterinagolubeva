import { supabase } from "@/integrations/supabase/client";

/**
 * Architecture layer for the upcoming `generate-legal-document` edge function.
 *
 * Goal: keep all payload shaping in one place so that when the edge function
 * lands, the client just swaps the local `prepareDraft` call for a real
 * `supabase.functions.invoke("generate-legal-document", { body: payload })`.
 *
 * Three modes are reserved up front:
 *  - "standalone"     — pure intake answers
 *  - "matter_based"   — use existing matter documents only
 *  - "hybrid"         — intake answers + matter documents
 *
 * No AI calls happen here. This module ONLY builds and validates the request.
 */

import type {
  DocumentIntakeSchema,
  IntakeState,
  GenerationMode,
  IntakeAnswers,
  IntakeAttachment,
} from "./document-intake-schemas";
import type { DocumentTemplate } from "./document-templates";

export type GenerateLegalDocumentRequest = {
  template_code: string;
  template: {
    code: string;
    title: string;
    category: string;
    practice_area: string | null;
    complexity: DocumentTemplate["complexity"];
  };
  jurisdiction: string;
  language: string;
  generation_mode: GenerationMode;
  intake: IntakeAnswers;
  attachments: IntakeAttachment[];
  special_instructions: string;
  schema: {
    title: string;
    required_fields: string[];
    warnings: string[];
  } | null;
};

export function buildGenerateRequest(
  template: DocumentTemplate,
  state: IntakeState,
  schema: DocumentIntakeSchema | null,
): GenerateLegalDocumentRequest {
  return {
    template_code: template.code,
    template: {
      code: template.code,
      title: template.title,
      category: template.category,
      practice_area: template.practice_area ?? null,
      complexity: template.complexity,
    },
    jurisdiction: state.jurisdiction,
    language: state.language,
    generation_mode: state.generationMode,
    intake: state.answers,
    attachments: state.attachments,
    special_instructions: state.specialInstructions,
    schema: schema
      ? {
          title: schema.title,
          required_fields: schema.required_fields ?? [],
          warnings: schema.schema_json?.warnings ?? [],
        }
      : null,
  };
}

export type GeneratedDocumentResult = {
  generated_document_id: string;
  document: {
    id: string;
    title: string;
    content: string;
    category: string | null;
    status: string | null;
    template_key: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  };
  generated: {
    content: string;
    title: string;
    document_type?: string;
    language?: string;
    is_preliminary?: boolean;
    requires_local_lawyer_review?: boolean;
    missing_inputs?: string[];
    quality_notes?: string[];
    warnings?: string[];
  };
};

/**
 * Calls the deployed `generate-legal-document-v2` edge function.
 * Edge function code is NOT modified — we only invoke it from the client.
 */
export async function invokeGenerateLegalDocument(
  payload: GenerateLegalDocumentRequest,
): Promise<GeneratedDocumentResult> {
  const { data, error } = await supabase.functions.invoke<GeneratedDocumentResult & { success?: boolean; error?: string }>(
    "generate-legal-document-v2",
    { body: payload },
  );
  if (error) throw error;
  if (!data || data.success === false) {
    throw new Error(data?.error ?? "Не удалось сгенерировать документ");
  }
  return data;
}
