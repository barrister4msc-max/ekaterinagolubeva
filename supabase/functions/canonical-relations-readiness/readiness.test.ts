import { describe, expect, test } from "bun:test";
import {
  CANONICAL_READINESS_MIN_NON_EMPTY_UNIQUE_RUNS,
  buildCanonicalReadinessReport,
  type CanonicalReadinessObservation,
} from "./readiness.ts";

const match = (index: number): CanonicalReadinessObservation => ({
  analysis_run_id: `run-${index}`,
  schema_version: 2,
  observer_version: 2,
  outcome: "match",
  fallback_reason: null,
  mismatch_reasons: [],
  claim_count: 1,
  relation_count: 1,
  ordered_equality: true,
  duplicate_equality: true,
  coverage_equality: true,
  identity_equality: true,
  per_conclusion_equality: true,
  reverse_index_equality: true,
});

describe("buildCanonicalReadinessReport", () => {
  test("requires 100 non-empty unique runs with only full matches", () => {
    const rows = Array.from({ length: CANONICAL_READINESS_MIN_NON_EMPTY_UNIQUE_RUNS }, (_, index) =>
      match(index),
    );
    expect(buildCanonicalReadinessReport(rows)).toMatchObject({
      ready: true,
      attempt_count: 100,
      non_empty_unique_run_count: 100,
      match_count: 100,
      mismatch_count: 0,
      fallback_count: 0,
      invalid_count: 0,
      match_rate: 1,
    });
  });

  test("does not count repeated runs or empty parity rows toward the threshold", () => {
    const repeated = Array.from({ length: 100 }, () => match(1));
    const empty = { ...match(2), claim_count: 0, relation_count: 0 };
    expect(buildCanonicalReadinessReport([...repeated, empty])).toMatchObject({
      ready: false,
      non_empty_observation_count: 100,
      non_empty_unique_run_count: 1,
    });
  });

  test.each([
    [
      "mismatch",
      {
        ...match(200),
        outcome: "mismatch",
        mismatch_reasons: ["coverage_mismatch"],
        coverage_equality: false,
      },
    ],
    [
      "fallback",
      { ...match(200), schema_version: null, outcome: "fallback", fallback_reason: "missing" },
    ],
    ["invalid", { ...match(200), schema_version: 1 }],
  ])("fails readiness when a %s observation exists", (_label, badRow) => {
    const rows = Array.from({ length: 100 }, (_, index) => match(index));
    const report = buildCanonicalReadinessReport([...rows, badRow]);
    expect(report.ready).toBe(false);
  });

  test("returns aggregate counts only and never returns run identifiers", () => {
    const report = buildCanonicalReadinessReport([match(1)]);
    expect(JSON.stringify(report)).not.toContain("run-1");
  });
});
