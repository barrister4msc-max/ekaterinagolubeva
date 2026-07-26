import type { CanonicalRelationSet } from "./types.ts";

/** A snapshot of the legacy analysis output retained alongside canonical relations. */
export interface LegacyAnalysisSnapshot {
  readonly facts_index: unknown;
  readonly trusted_sources: unknown;
  readonly conclusions: unknown;
  readonly provenance_index: unknown;
  readonly evidence_matrix: unknown;
  readonly source_sufficiency: unknown;
  readonly challenge_result: unknown;
  readonly source_warnings: unknown;
  readonly generation_allowed: unknown;
}

export interface StructuredAnalysisResult {
  readonly schema_version: string;
  readonly analysis_run_id: string;
  readonly session_id: string;
  readonly created_at: string;
  readonly legacy: LegacyAnalysisSnapshot;
  readonly canonical: {
    readonly relations: CanonicalRelationSet;
  };
}

/**
 * Constructs the result contract without generating, validating, or cloning its data.
 */
export function createStructuredAnalysisResult(
  input: StructuredAnalysisResult,
): StructuredAnalysisResult {
  return {
    schema_version: input.schema_version,
    analysis_run_id: input.analysis_run_id,
    session_id: input.session_id,
    created_at: input.created_at,
    legacy: {
      ...input.legacy,
    },
    canonical: {
      relations: input.canonical.relations,
    },
  };
}
