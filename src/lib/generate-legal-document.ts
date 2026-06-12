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

/**
 * Placeholder invoker. Real implementation will call the
 * `generate-legal-document` Supabase Edge Function in the next stage.
 */
export async function prepareDraft(
  _payload: GenerateLegalDocumentRequest,
): Promise<{ status: "deferred"; message: string }> {
  return {
    status: "deferred",
    message: "Генерация документа будет подключена на следующем этапе.",
  };
}
