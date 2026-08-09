import {
  CANONICAL_CONSUMER_OBSERVER_VERSION,
  CANONICAL_SHADOW_SCHEMA_VERSION,
} from "../_shared/legal-analysis/canonical-relations/index.ts";

export const CANONICAL_READINESS_MIN_NON_EMPTY_UNIQUE_RUNS = 100;

export interface CanonicalReadinessObservation {
  readonly analysis_run_id?: unknown;
  readonly schema_version?: unknown;
  readonly observer_version?: unknown;
  readonly outcome?: unknown;
  readonly fallback_reason?: unknown;
  readonly mismatch_reasons?: unknown;
  readonly claim_count?: unknown;
  readonly relation_count?: unknown;
  readonly ordered_equality?: unknown;
  readonly duplicate_equality?: unknown;
  readonly coverage_equality?: unknown;
  readonly identity_equality?: unknown;
  readonly per_conclusion_equality?: unknown;
  readonly reverse_index_equality?: unknown;
}

const equalityKeys = [
  "ordered_equality",
  "duplicate_equality",
  "coverage_equality",
  "identity_equality",
  "per_conclusion_equality",
  "reverse_index_equality",
] as const;

const nonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const nonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function increment(target: Record<string, number>, reason: string): void {
  target[reason] = (target[reason] ?? 0) + 1;
}

export function buildCanonicalReadinessReport(
  observations: readonly CanonicalReadinessObservation[],
) {
  const reasonCodeDistribution: Record<string, number> = {};
  const aggregateEquality = Object.fromEntries(equalityKeys.map((key) => [key, true])) as Record<
    (typeof equalityKeys)[number],
    boolean
  >;
  const uniqueRuns = new Set<string>();
  const nonEmptyUniqueRuns = new Set<string>();

  let matchCount = 0;
  let mismatchCount = 0;
  let fallbackCount = 0;
  let invalidCount = 0;
  let nonEmptyObservationCount = 0;

  for (const row of observations) {
    const runId = nonBlankString(row.analysis_run_id) ? row.analysis_run_id : null;
    if (runId) uniqueRuns.add(runId);

    if (row.observer_version !== CANONICAL_CONSUMER_OBSERVER_VERSION) {
      invalidCount += 1;
      increment(reasonCodeDistribution, "observer_version_mismatch");
      continue;
    }

    if (row.outcome === "fallback") {
      fallbackCount += 1;
      increment(
        reasonCodeDistribution,
        nonBlankString(row.fallback_reason) ? row.fallback_reason : "fallback_reason_missing",
      );
      continue;
    }

    if (row.outcome !== "match" && row.outcome !== "mismatch") {
      invalidCount += 1;
      increment(reasonCodeDistribution, "invalid_outcome");
      continue;
    }

    const validParityShape =
      runId !== null &&
      row.schema_version === CANONICAL_SHADOW_SCHEMA_VERSION &&
      nonNegativeInteger(row.claim_count) &&
      nonNegativeInteger(row.relation_count) &&
      equalityKeys.every((key) => typeof row[key] === "boolean");
    if (!validParityShape) {
      invalidCount += 1;
      increment(reasonCodeDistribution, "invalid_parity_observation");
      continue;
    }

    if (row.claim_count > 0 && row.relation_count > 0) {
      nonEmptyObservationCount += 1;
      nonEmptyUniqueRuns.add(runId);
    }

    for (const key of equalityKeys) {
      if (row[key] === false) aggregateEquality[key] = false;
    }

    if (row.outcome === "match") {
      matchCount += 1;
    } else {
      mismatchCount += 1;
      const reasons = Array.isArray(row.mismatch_reasons) ? row.mismatch_reasons : [];
      if (reasons.length === 0) increment(reasonCodeDistribution, "mismatch_reason_missing");
      for (const reason of reasons) {
        if (nonBlankString(reason)) increment(reasonCodeDistribution, reason);
      }
    }
  }

  const attemptCount = observations.length;
  const validParityCount = matchCount + mismatchCount;
  const allEquality = equalityKeys.every((key) => aggregateEquality[key]);
  const ready =
    nonEmptyUniqueRuns.size >= CANONICAL_READINESS_MIN_NON_EMPTY_UNIQUE_RUNS &&
    mismatchCount === 0 &&
    fallbackCount === 0 &&
    invalidCount === 0 &&
    matchCount === attemptCount &&
    allEquality;

  return {
    ready,
    schema_version: CANONICAL_SHADOW_SCHEMA_VERSION,
    observer_version: CANONICAL_CONSUMER_OBSERVER_VERSION,
    required_non_empty_unique_runs: CANONICAL_READINESS_MIN_NON_EMPTY_UNIQUE_RUNS,
    attempt_count: attemptCount,
    valid_parity_count: validParityCount,
    unique_run_count: uniqueRuns.size,
    non_empty_observation_count: nonEmptyObservationCount,
    non_empty_unique_run_count: nonEmptyUniqueRuns.size,
    match_count: matchCount,
    mismatch_count: mismatchCount,
    fallback_count: fallbackCount,
    invalid_count: invalidCount,
    match_rate: attemptCount === 0 ? 0 : matchCount / attemptCount,
    reason_code_distribution: reasonCodeDistribution,
    aggregate_equality: aggregateEquality,
  };
}
