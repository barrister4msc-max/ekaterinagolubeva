import type { CanonicalShadowParityResult } from "./canonical-shadow-parity.ts";
import { CANONICAL_CONSUMER_OBSERVER_VERSION } from "./canonical-relations/index.ts";

export { CANONICAL_CONSUMER_OBSERVER_VERSION };

export type CanonicalConsumerObservationOutcome = "match" | "mismatch" | "fallback";

export interface CanonicalConsumerObservationRecord {
  readonly analysis_run_id: string | null;
  readonly analysis_version: number | null;
  readonly schema_version: number | null;
  readonly observer_version: number;
  readonly outcome: CanonicalConsumerObservationOutcome;
  readonly fallback_reason: string | null;
  readonly mismatch_reasons: readonly string[];
  readonly claim_count: number | null;
  readonly relation_count: number | null;
  readonly unique_relation_count: number | null;
  readonly legacy_claim_count: number | null;
  readonly legacy_relation_count: number | null;
  readonly legacy_unique_relation_count: number | null;
  readonly ordered_equality: boolean | null;
  readonly duplicate_equality: boolean | null;
  readonly coverage_equality: boolean | null;
  readonly identity_equality: boolean | null;
  readonly per_conclusion_equality: boolean | null;
  readonly reverse_index_equality: boolean | null;
}

const runId = (value: unknown) => typeof value === "string" && value.length > 0 ? value : null;
const positiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0
    ? value
    : null;
const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
    ? value
    : null;

export function buildCanonicalConsumerFallbackObservation(input: {
  readonly analysisRunId: unknown;
  readonly analysisVersion: unknown;
  readonly fallbackReason: string;
}): CanonicalConsumerObservationRecord {
  return {
    analysis_run_id: runId(input.analysisRunId),
    analysis_version: positiveInteger(input.analysisVersion),
    schema_version: null,
    observer_version: CANONICAL_CONSUMER_OBSERVER_VERSION,
    outcome: "fallback",
    fallback_reason: input.fallbackReason,
    mismatch_reasons: [],
    claim_count: null, relation_count: null, unique_relation_count: null,
    legacy_claim_count: null, legacy_relation_count: null, legacy_unique_relation_count: null,
    ordered_equality: null, duplicate_equality: null, coverage_equality: null,
    identity_equality: null, per_conclusion_equality: null, reverse_index_equality: null,
  };
}

export function buildCanonicalConsumerParityObservation(input: {
  readonly analysisRunId: unknown;
  readonly analysisVersion: unknown;
  readonly schemaVersion: unknown;
  readonly claimCount: unknown;
  readonly relationCount: unknown;
  readonly uniqueRelationCount: unknown;
  readonly parity: CanonicalShadowParityResult;
}): CanonicalConsumerObservationRecord {
  const fallback = () => buildCanonicalConsumerFallbackObservation({
    analysisRunId: input?.analysisRunId,
    analysisVersion: input?.analysisVersion,
    fallbackReason: "observation_mapping_failed",
  });
  try {
    const parity = input.parity as unknown as Record<string, unknown>;
    const canonicalCounts = [input.claimCount, input.relationCount, input.uniqueRelationCount].map(count);
    const legacyCounts = [parity.legacyClaimCount, parity.legacyRelationCount, parity.legacyUniqueRelationCount].map(count);
    const booleans = ["orderedEquality", "duplicateEquality", "coverageEquality", "identityEquality", "perConclusionEquality", "reverseIndexEquality"] as const;
    if (!parity || (parity.outcome !== "match" && parity.outcome !== "mismatch") ||
      !Array.isArray(parity.reasons) || !parity.reasons.every((reason) => typeof reason === "string") ||
      canonicalCounts.includes(null) || legacyCounts.includes(null) ||
      booleans.some((key) => typeof parity[key] !== "boolean") ||
      positiveInteger(input.analysisVersion) === null || positiveInteger(input.schemaVersion) === null ||
      (parity.outcome === "match" && (parity.reasons.length !== 0 || booleans.some((key) => parity[key] !== true))) ||
      (parity.outcome === "mismatch" && parity.reasons.length === 0)) return fallback();
    return {
      analysis_run_id: runId(input.analysisRunId),
      analysis_version: positiveInteger(input.analysisVersion),
      schema_version: positiveInteger(input.schemaVersion),
      observer_version: CANONICAL_CONSUMER_OBSERVER_VERSION,
      outcome: parity.outcome,
      fallback_reason: null,
      mismatch_reasons: [...parity.reasons as string[]],
      claim_count: canonicalCounts[0], relation_count: canonicalCounts[1], unique_relation_count: canonicalCounts[2],
      legacy_claim_count: legacyCounts[0], legacy_relation_count: legacyCounts[1], legacy_unique_relation_count: legacyCounts[2],
      ordered_equality: parity.orderedEquality as boolean,
      duplicate_equality: parity.duplicateEquality as boolean,
      coverage_equality: parity.coverageEquality as boolean,
      identity_equality: parity.identityEquality as boolean,
      per_conclusion_equality: parity.perConclusionEquality as boolean,
      reverse_index_equality: parity.reverseIndexEquality as boolean,
    };
  } catch { return fallback(); }
}

export interface CanonicalConsumerObservationInsertResult { readonly error?: unknown; }
export interface CanonicalConsumerObservationInsertClient {
  insertCanonicalConsumerObservation(record: CanonicalConsumerObservationRecord): Promise<CanonicalConsumerObservationInsertResult>;
}
export interface CanonicalConsumerObservationPersistenceLogger {
  info(message: string, details: Record<string, unknown>): void;
  warn(message: string, details: Record<string, unknown>): void;
}

export async function persistCanonicalConsumerObservationBestEffort(input: {
  readonly client: CanonicalConsumerObservationInsertClient;
  readonly record: CanonicalConsumerObservationRecord;
  readonly logger?: CanonicalConsumerObservationPersistenceLogger;
}): Promise<"persisted" | "failed"> {
  let failed = false;
  try { failed = Boolean((await input.client.insertCanonicalConsumerObservation(input.record)).error); }
  catch { failed = true; }
  const details: Record<string, unknown> = {
    analysis_run_id: input.record.analysis_run_id,
    outcome: input.record.outcome,
    observer_version: input.record.observer_version,
  };
  if (failed) details.error_code = "insert_failed";
  try {
    input.logger?.[failed ? "warn" : "info"](
      failed ? "[canonical-relations-consumer] observation_persistence_failed" : "[canonical-relations-consumer] observation_persisted",
      details,
    );
  } catch { /* Telemetry is best-effort too. */ }
  return failed ? "failed" : "persisted";
}
