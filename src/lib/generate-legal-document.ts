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
import type { LegalAnalysisResult } from "./legal-analysis";
import {
  tryBuildDocumentContext,
  type DocumentContext,
} from "./document-context-builder";

/**
 * Safe test-mode threshold. DocumentContext is only sent to the generator
 * (and used as the primary source) when its quality score is >= this value.
 * Otherwise the edge function receives `document_context = null` and MUST
 * fall back to the legacy generation path.
 */
export const DOCUMENT_CONTEXT_MIN_QUALITY = 60;

export type StrategySource = "lawyer_override" | "ai_reasoning";

export type WorkingStrategy = {
  strategy_source: StrategySource;
  selected_strategy_id: string | null;
  ai_selected_strategy_id: string | null;
  lawyer_override_reason: string | null;
  strategy_position: Record<string, unknown> | null;
};

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
  intake_session_id?: string | null;
  legal_analysis?: LegalAnalysisResult | null;
  legal_analysis_run_id?: string | null;
  /**
   * Phase B — Matter Snapshot / Matter Knowledge Package.
   * Optional in the wire format for backward compat; populated by
   * prepareAndGenerate() for complex templates.
   */
  matter_snapshot?: import("./matter-snapshot").MatterSnapshot | null;
  /**
   * DocumentContext — populated only when quality >= DOCUMENT_CONTEXT_MIN_QUALITY.
   * Null → legacy generation mode (backwards compatible).
   */
  document_context: DocumentContext | null;
  document_context_quality: number | null;
  document_context_summary: string | null;
  /**
   * Working strategy for the generator. If the lawyer manually overrode the
   * AI-selected strategy in the UI, `strategy_source === "lawyer_override"`
   * and `selected_strategy_id` points to the lawyer's choice — the generator
   * MUST build the document around it. Otherwise falls back to the AI's
   * reasoning_engine.selected_strategy_id.
   */
  working_strategy: WorkingStrategy | null;
  schema: {
    title: string;
    required_fields: string[];
    warnings: string[];
  } | null;
};

function resolveWorkingStrategy(
  analysis: LegalAnalysisResult | null,
): WorkingStrategy | null {
  if (!analysis) return null;
  const re = (analysis as any).reasoning_engine as
    | { selected_strategy_id?: string | null; considered_positions?: Array<Record<string, any>> }
    | undefined;
  const aiSelectedId: string | null = re?.selected_strategy_id ?? null;
  const positions = re?.considered_positions ?? [];
  const override = (analysis as any).lawyer_strategy_override as
    | { strategy_id?: string | null; ai_strategy_id?: string | null; reason?: string | null }
    | null
    | undefined;

  const hasOverride = !!(override && override.strategy_id);
  const effectiveId = hasOverride ? String(override!.strategy_id) : aiSelectedId;
  const position = effectiveId
    ? positions.find((p) => String((p as any).id ?? (p as any).strategy_id) === effectiveId) ?? null
    : null;

  return {
    strategy_source: hasOverride ? "lawyer_override" : "ai_reasoning",
    selected_strategy_id: effectiveId,
    ai_selected_strategy_id: aiSelectedId,
    lawyer_override_reason: hasOverride ? (override!.reason ?? null) : null,
    strategy_position: position,
  };
}



export function buildGenerateRequest(
  template: DocumentTemplate,
  state: IntakeState,
  schema: DocumentIntakeSchema | null,
  extras?: {
    intakeSessionId?: string | null;
    legalAnalysis?: LegalAnalysisResult | null;
    legalAnalysisRunId?: string | null;
    matterSnapshot?: import("./matter-snapshot").MatterSnapshot | null;
  },
): GenerateLegalDocumentRequest {

  const analysis = extras?.legalAnalysis ?? null;

  // Safe test-mode gating:
  //  - no analysis → null (legacy mode)
  //  - tryBuildDocumentContext fails → null (legacy mode)
  //  - quality < threshold → null (legacy mode)
  //  - quality >= threshold → DocumentContext promoted as primary source
  let documentContext: DocumentContext | null = null;
  let documentContextQuality: number | null = null;
  let documentContextSummary: string | null = null;

  if (analysis) {
    const built = tryBuildDocumentContext(analysis);
    if (built.ok && built.context.document_context_quality >= DOCUMENT_CONTEXT_MIN_QUALITY) {
      documentContext = built.context;
      documentContextQuality = built.context.document_context_quality;
      documentContextSummary = built.context.document_context_summary;
    }
  }

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
    intake_session_id: extras?.intakeSessionId ?? null,
    legal_analysis: analysis,
    legal_analysis_run_id: extras?.legalAnalysisRunId ?? null,
    matter_snapshot: extras?.matterSnapshot ?? null,
    document_context: documentContext,

    document_context_quality: documentContextQuality,
    document_context_summary: documentContextSummary,
    working_strategy: resolveWorkingStrategy(analysis),
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

// ---------------------------------------------------------------------------
// Phase B — prepareAndGenerate: ensure fresh matter analysis, run gate,
// invoke generator, write provenance back into generated_legal_documents.
// ---------------------------------------------------------------------------

import { ensureMatterAnalysis } from "./matter-analysis";
import { assertMatterGate, isComplexTemplate, MatterGateError } from "./quality-gate";
import type { MatterSnapshot } from "./matter-snapshot";

export type PrepareAndGenerateOptions = {
  template: DocumentTemplate;
  state: IntakeState;
  schema: DocumentIntakeSchema | null;
  sessionId: string | null | undefined;
  /** Force a fresh legal_analysis run regardless of staleness check. */
  forceRerunAnalysis?: boolean;
  /** Caller-provided knowledge: whether the matter requires redaction. */
  redactionRequired?: boolean;
  /** Caller-provided knowledge: OCR completion state. */
  ocrReady?: boolean;
  /** Phase B correction — draft (default) is lenient, final is strict. */
  purpose?: "draft" | "final";
};

export type PrepareAndGenerateResult = GeneratedDocumentResult & {
  matter_snapshot: MatterSnapshot | null;
  legal_analysis_run_id: string | null;
};

export { MatterGateError } from "./quality-gate";

export async function prepareAndGenerate(
  opts: PrepareAndGenerateOptions,
): Promise<PrepareAndGenerateResult> {
  const { template, state, schema, sessionId } = opts;

  // 1. For complex templates require fresh matter analysis.
  let snapshot: MatterSnapshot | null = null;
  let runId: string | null = null;
  let analysis: LegalAnalysisResult | null = null;
  let wasStale = false;
  let staleReasons: string[] = [];

  if (sessionId && isComplexTemplate(template)) {
    const ensured = await ensureMatterAnalysis(sessionId, {
      forceRerun: opts.forceRerunAnalysis,
    });
    snapshot = ensured.snapshot;
    runId = ensured.run.id;
    analysis = ensured.run.analysis;
    wasStale = ensured.was_stale;
    staleReasons = ensured.stale_reasons;
  } else if (sessionId) {
    // simple template: still pass through latest analysis if present
    const { fetchLatestLegalAnalysis } = await import("./legal-analysis");
    const latest = await fetchLatestLegalAnalysis(sessionId).catch(() => null);
    if (latest) {
      runId = latest.id;
      analysis = latest.analysis;
      const { buildMatterSnapshotFromRun } = await import("./matter-snapshot");
      snapshot = buildMatterSnapshotFromRun(sessionId, latest);
    }
  }

  // 2. Gate (only enforced for complex templates inside assertMatterGate).
  assertMatterGate({
    template,
    run: runId && analysis ? ({
      id: runId,
      session_id: sessionId ?? "",
      status: "completed",
      hallucination_risk: null,
      legal_accuracy_score: null,
      source_verification_status: null,
      needs_lawyer_review: false,
      model_name: null,
      error_message: null,
      created_at: snapshot?.legal_analysis_created_at ?? new Date().toISOString(),
      completed_at: null,
      analysis,
    } as any) : null,
    snapshot,
    purpose: opts.purpose ?? "draft",
    wasStale: false, // ensureMatterAnalysis already returned a fresh run; staleness was self-healed
    staleReasons,
    redactionRequired: opts.redactionRequired,
    ocrReady: opts.ocrReady,
  });


  // 3. Build payload (matter_snapshot included).
  const payload: GenerateLegalDocumentRequest & {
    session_id?: string | null;
    intake_session_id?: string | null;
  } = {
    ...buildGenerateRequest(template, state, schema, {
      intakeSessionId: sessionId ?? null,
      legalAnalysis: analysis,
      legalAnalysisRunId: runId,
      matterSnapshot: snapshot,
    }),
    session_id: sessionId ?? null,
    intake_session_id: sessionId ?? null,
  };

  // 4. Invoke generator (existing edge function, unmodified).
  const result = await invokeGenerateLegalDocument(payload);

  // Edge function may return the id under different keys depending on version.
  const generatedDocumentId =
    (result as any)?.generated_document_id ||
    (result as any)?.document_id ||
    (result as any)?.document?.id ||
    (result as any)?.id ||
    null;

  console.log("[GEN RESULT]", {
    generatedDocumentId,
    rawKeys: result ? Object.keys(result as any) : null,
    result,
  });

  if (!generatedDocumentId) {
    throw new Error(
      "prepareAndGenerate: invokeGenerateLegalDocument did not return a document id",
    );
  }

  console.log("[BEFORE PROVENANCE]", {
    generatedDocumentId,
    hasSnapshot: !!snapshot,
    runId,
    snapshotKeys: snapshot ? Object.keys(snapshot) : null,
  });

  // 5. Write provenance into generated_legal_documents.metadata.
  // No longer swallow errors — provenance is a hard requirement of Phase B.
  try {
    await writeGenerationProvenance({
      generatedDocumentId,
      snapshot,
      runId,
      payload,
    });
  } catch (e) {
    console.error("[PROVENANCE ERROR]", {
      generatedDocumentId,
      message: (e as Error).message,
      error: e,
    });
    throw new Error(
      `writeGenerationProvenance failed for ${generatedDocumentId}: ${(e as Error).message}`,
    );
  }

  return {
    ...result,
    generated_document_id: generatedDocumentId,
    matter_snapshot: snapshot,
    legal_analysis_run_id: runId,
  };
}

async function writeGenerationProvenance(input: {
  generatedDocumentId: string;
  snapshot: MatterSnapshot | null;
  runId: string | null;
  payload: GenerateLegalDocumentRequest;
}): Promise<void> {
  const { generatedDocumentId, snapshot, runId, payload } = input;
  if (!generatedDocumentId) {
    throw new Error("writeGenerationProvenance: missing generatedDocumentId");
  }
  if (!snapshot) {
    throw new Error("writeGenerationProvenance: matter snapshot missing");
  }

  // Read existing metadata to merge.
  const { data: row, error: readError } = await supabase
    .from("generated_legal_documents")
    .select("metadata")
    .eq("id", generatedDocumentId)
    .maybeSingle();
  if (readError) {
    throw new Error(
      `writeGenerationProvenance: read failed for id=${generatedDocumentId}: ${readError.message}`,
    );
  }
  if (!row) {
    throw new Error(
      `writeGenerationProvenance: no generated_legal_documents row found for id=${generatedDocumentId}`,
    );
  }
  const existing = ((row?.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;

  const provenance: Record<string, unknown> = {
    generated_from_legal_analysis: Boolean(runId && snapshot),
    legal_analysis_run_id: runId,
    legal_analysis_created_at: snapshot?.legal_analysis_created_at ?? null,
    analysis_version: snapshot?.analysis_version ?? null,
    matter_snapshot: snapshot,
    used_sources_count: (snapshot?.trusted_sources ?? []).filter((s) => s.is_winner && s.use_in_generation).length,
    trusted_sources_count: snapshot?.trusted_sources?.length ?? 0,
    document_context_quality: payload.document_context_quality,
    source_sufficiency_status: snapshot?.source_sufficiency?.status ?? null,
    challenge_status: snapshot?.challenge_result?.status ?? null,
    redaction_used: Boolean(snapshot?.redaction_used),
    provenance_index_present: Boolean(snapshot?.provenance_index),
    evidence_matrix_present: Boolean(snapshot?.evidence_matrix?.length),
  };

  console.log("[PROVENANCE PAYLOAD]", {
    generatedDocumentId,
    runId,
    analysisVersion: snapshot?.analysis_version,
    hasMatterSnapshot: !!snapshot,
    provenance,
  });

  const { data, error } = await supabase
    .from("generated_legal_documents")
    .update({
      metadata: {
        ...existing,
        ...provenance,
      } as any,
    })
    .eq("id", generatedDocumentId)
    .select("id, metadata");

  console.log("[PROVENANCE UPDATE RESULT]", { data, error });

  if (error) {
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error(
      `writeGenerationProvenance: no generated_legal_documents row updated for id=${generatedDocumentId} (likely RLS denied UPDATE)`,
    );
  }

  // Verify metadata actually contains the Phase B keys.
  const { data: verify, error: verifyError } = await supabase
    .from("generated_legal_documents")
    .select("id, metadata")
    .eq("id", generatedDocumentId)
    .single();
  console.log("[PROVENANCE VERIFY]", { verify, verifyError });

  if (verifyError) {
    throw new Error(
      `writeGenerationProvenance: verify read failed for id=${generatedDocumentId}: ${verifyError.message}`,
    );
  }
  const md = (verify?.metadata ?? {}) as Record<string, unknown>;
  const requiredKeys = [
    "generated_from_legal_analysis",
    "legal_analysis_run_id",
    "analysis_version",
    "matter_snapshot",
    "source_sufficiency_status",
    "challenge_status",
    "provenance_index_present",
    "evidence_matrix_present",
    "redaction_used",
  ];
  const missing = requiredKeys.filter((k) => !(k in md));
  if (missing.length > 0) {
    throw new Error(
      `writeGenerationProvenance: metadata missing keys after update for id=${generatedDocumentId}: ${missing.join(", ")}`,
    );
  }
}

