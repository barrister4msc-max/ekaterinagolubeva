import { describe, expect, test } from "bun:test";
import {
  buildCanonicalConsumerFallbackObservation,
  buildCanonicalConsumerParityObservation,
  persistCanonicalConsumerObservationBestEffort,
} from "../canonical-consumer-observation-persistence.ts";
import type { CanonicalShadowParityResult } from "../canonical-shadow-parity.ts";

const parity = (overrides: Partial<CanonicalShadowParityResult> = {}): CanonicalShadowParityResult => ({
  outcome: "match", reasons: [], orderedEquality: true, duplicateEquality: true,
  coverageEquality: true, identityEquality: true, perConclusionEquality: true,
  reverseIndexEquality: true, legacyClaimCount: 4, legacyRelationCount: 3,
  legacyUniqueRelationCount: 2, ...overrides,
});
const parityRecord = (value: unknown = parity()) => buildCanonicalConsumerParityObservation({
  analysisRunId: "run-1", analysisVersion: 3, schemaVersion: 1,
  claimCount: 5, relationCount: 4, uniqueRelationCount: 3,
  parity: value as CanonicalShadowParityResult,
});

describe("canonical consumer observation builders", () => {
  test("fallback maps identifiers, reason, and the required empty shape", () => {
    const record = buildCanonicalConsumerFallbackObservation({ analysisRunId: "run-1", analysisVersion: 3, fallbackReason: "missing" });
    expect(record).toMatchObject({ analysis_run_id: "run-1", analysis_version: 3, schema_version: null, observer_version: 1, outcome: "fallback", fallback_reason: "missing", mismatch_reasons: [] });
    for (const [key, value] of Object.entries(record))
      if (key.endsWith("_count") || key.endsWith("_equality")) expect(value).toBeNull();
  });
  test("fallback sanitizes missing run IDs and invalid versions", () => {
    const record = buildCanonicalConsumerFallbackObservation({ analysisRunId: "", analysisVersion: 0, fallbackReason: "read_failed" });
    expect(record.analysis_run_id).toBeNull(); expect(record.analysis_version).toBeNull();
  });
  test("match maps canonical and legacy counts and every boolean", () => {
    expect(parityRecord()).toMatchObject({ outcome: "match", claim_count: 5, relation_count: 4, unique_relation_count: 3, legacy_claim_count: 4, legacy_relation_count: 3, legacy_unique_relation_count: 2, ordered_equality: true, duplicate_equality: true, coverage_equality: true, identity_equality: true, per_conclusion_equality: true, reverse_index_equality: true });
  });
  test("mismatch preserves reason order and boolean values", () => {
    const record = parityRecord(parity({ outcome: "mismatch", reasons: ["identity_mismatch", "per_conclusion_mismatch"], identityEquality: false, perConclusionEquality: false }));
    expect(record.mismatch_reasons).toEqual(["identity_mismatch", "per_conclusion_mismatch"]);
    expect(record.identity_equality).toBeFalse(); expect(record.per_conclusion_equality).toBeFalse();
  });
  test.each([NaN, -1, 1.5, Infinity])("malformed count %p safely falls back", (claimCount) => {
    expect(() => buildCanonicalConsumerParityObservation({ analysisRunId: "run", analysisVersion: 1, schemaVersion: 1, claimCount, relationCount: 0, uniqueRelationCount: 0, parity: parity() })).not.toThrow();
    expect(buildCanonicalConsumerParityObservation({ analysisRunId: "run", analysisVersion: 1, schemaVersion: 1, claimCount, relationCount: 0, uniqueRelationCount: 0, parity: parity() }).fallback_reason).toBe("observation_mapping_failed");
  });
  test("malformed parity safely maps to mapping failure", () => {
    expect(() => parityRecord(null)).not.toThrow();
    expect(parityRecord({ outcome: "mismatch" }).fallback_reason).toBe("observation_mapping_failed");
  });
  test("records contain no content or identity fields and frozen inputs are unchanged", () => {
    const value = Object.freeze(parity()); const record = parityRecord(value);
    expect(JSON.stringify(record)).not.toMatch(/relations|source_ref|conclusion_id|secret/);
    expect(Object.isFrozen(value)).toBeTrue();
  });
});

describe("best-effort observation persistence", () => {
  test("inserts once, returns persisted, logs only approved fields, and does not mutate", async () => {
    const record = Object.freeze(parityRecord()); let calls = 0; const logs: unknown[] = [];
    const result = await persistCanonicalConsumerObservationBestEffort({ client: { insertCanonicalConsumerObservation: async (received) => { calls++; expect(received).toBe(record); return {}; } }, record, logger: { info: (...args) => logs.push(args), warn: () => {} } });
    expect(result).toBe("persisted"); expect(calls).toBe(1);
    expect(logs).toEqual([["[canonical-relations-consumer] observation_persisted", { analysis_run_id: "run-1", outcome: "match", observer_version: 1 }]]);
  });
  test.each(["returned", "thrown"])("%s insert failure is swallowed without retry or raw error text", async (kind) => {
    let calls = 0; const logs: unknown[] = [];
    const result = await persistCanonicalConsumerObservationBestEffort({ client: { insertCanonicalConsumerObservation: async () => { calls++; if (kind === "thrown") throw new Error("raw secret"); return { error: "raw database secret" }; } }, record: parityRecord(), logger: { info: () => {}, warn: (...args) => logs.push(args) } });
    expect(result).toBe("failed"); expect(calls).toBe(1);
    expect(logs).toEqual([["[canonical-relations-consumer] observation_persistence_failed", { analysis_run_id: "run-1", outcome: "match", observer_version: 1, error_code: "insert_failed" }]]);
    expect(JSON.stringify(logs)).not.toContain("secret");
  });
  test("throwing success and failure loggers are swallowed", async () => {
    const logger = { info: () => { throw new Error("logger"); }, warn: () => { throw new Error("logger"); } };
    expect(await persistCanonicalConsumerObservationBestEffort({ client: { insertCanonicalConsumerObservation: async () => ({}) }, record: parityRecord(), logger })).toBe("persisted");
    expect(await persistCanonicalConsumerObservationBestEffort({ client: { insertCanonicalConsumerObservation: async () => ({ error: true }) }, record: parityRecord(), logger })).toBe("failed");
  });
});
