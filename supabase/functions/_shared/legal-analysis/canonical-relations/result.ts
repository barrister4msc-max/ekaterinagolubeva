import type { CanonicalRelationSet, JsonValue } from "./types.ts";

export const STRUCTURED_ANALYSIS_RESULT_SCHEMA_VERSION = "1.0.0" as const;

export type StructuredAnalysisResultSchemaVersion =
  typeof STRUCTURED_ANALYSIS_RESULT_SCHEMA_VERSION;

export interface StructuredAnalysisLegacySnapshot {
  readonly facts_index: readonly JsonValue[];
  readonly trusted_sources: readonly JsonValue[];
  readonly conclusions: readonly JsonValue[];
  readonly provenance_index: JsonValue;
  readonly evidence_matrix: JsonValue;
  readonly source_sufficiency: JsonValue;
  readonly challenge_result: JsonValue;
  readonly source_warnings: readonly JsonValue[];
  readonly generation_allowed: boolean;
}

export interface StructuredAnalysisCanonicalPayload {
  readonly relations: CanonicalRelationSet;
}

export interface StructuredAnalysisResult {
  readonly schema_version: StructuredAnalysisResultSchemaVersion;
  readonly analysis_run_id: string;
  readonly session_id: string;
  readonly created_at: string;
  readonly legacy: StructuredAnalysisLegacySnapshot;
  readonly canonical: StructuredAnalysisCanonicalPayload;
}

export interface CreateStructuredAnalysisResultInput {
  readonly analysis_run_id: string;
  readonly session_id: string;
  readonly created_at: string;
  readonly legacy: StructuredAnalysisLegacySnapshot;
  readonly canonical: StructuredAnalysisCanonicalPayload;
}

export function createStructuredAnalysisResult(
  input: CreateStructuredAnalysisResultInput,
): StructuredAnalysisResult {
  return {
    schema_version: STRUCTURED_ANALYSIS_RESULT_SCHEMA_VERSION,
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
