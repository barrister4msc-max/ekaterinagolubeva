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
  template: {
    code: string;
    title: string;
    category: string;
    subcategory: string | null;
    practice_area: string | null;
    complexity: DocumentTemplate["complexity"];
  };
  jurisdiction: string;
  language: string;
  generationMode: GenerationMode;
  answers: IntakeAnswers;
  attachments: IntakeAttachment[];
  specialInstructions: string;
  /** Reserved for matter_based / hybrid modes. Empty for standalone. */
  matterId?: string;
  documentIds?: string[];
  /** Carried along for traceability and prompt hints in the edge function. */
  schemaRef?: { id: string; warnings?: string[] };
};

export function buildGenerateRequest(
  template: DocumentTemplate,
  state: IntakeState,
  schema: DocumentIntakeSchema | null,
  ctx?: { matterId?: string; documentIds?: string[] },
): GenerateLegalDocumentRequest {
  return {
    template: {
      code: template.code,
      title: template.title,
      category: template.category,
      subcategory: template.subcategory ?? null,
      practice_area: template.practice_area ?? null,
      complexity: template.complexity,
    },
    jurisdiction: state.jurisdiction,
    language: state.language,
    generationMode: state.generationMode,
    answers: state.answers,
    attachments: state.attachments,
    specialInstructions: state.specialInstructions,
    matterId: ctx?.matterId,
    documentIds: ctx?.documentIds,
    schemaRef: schema
      ? { id: schema.id, warnings: schema.schema_json?.warnings ?? [] }
      : undefined,
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
