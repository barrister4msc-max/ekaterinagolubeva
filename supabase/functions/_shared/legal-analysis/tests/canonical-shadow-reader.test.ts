import { describe, expect, test } from "bun:test";
import {
  canonicalConsumerObservationEnabled,
  readCanonicalShadow,
  type CanonicalShadowReadClient,
} from "../canonical-shadow-reader.ts";

const relation = (kind = "uses-source") => ({ sourceEntityId: "c1", targetEntityId: "s1", kind });
const row = (overrides: Record<string, unknown> = {}) => ({
  analysis_run_id: "run-1",
  analysis_version: 3,
  status: "succeeded",
  schema_version: 2,
  claim_count: 1,
  relation_count: 1,
  unique_relation_count: 1,
  skipped_count: 0,
  relations: [relation()],
  ...overrides,
});
const client = (result: unknown, throws = false): CanonicalShadowReadClient => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (throws) throw new Error("read failed");
          return result as { data: unknown; error?: unknown };
        },
      }),
    }),
  }),
});
const read = (result: unknown) =>
  readCanonicalShadow({
    client: client(result),
    analysisRunId: "run-1",
    expectedAnalysisVersion: 3,
    eligibleConclusionIds: new Set(["c1"]),
    trustedSourceRefs: new Set(["s1"]),
  });

describe("readCanonicalShadow", () => {
  test("is disabled unless the new flag is explicitly true", () => {
    expect(canonicalConsumerObservationEnabled(() => undefined)).toBe(false);
    expect(canonicalConsumerObservationEnabled(() => " true ")).toBe(true);
  });
  test("does not query without a run id", async () => {
    const hostile = new Proxy({} as CanonicalShadowReadClient, {
      get: () => {
        throw new Error("queried");
      },
    });
    expect(
      await readCanonicalShadow({
        client: hostile,
        analysisRunId: null,
        expectedAnalysisVersion: 3,
        eligibleConclusionIds: new Set(),
        trustedSourceRefs: new Set(),
      }),
    ).toEqual({ usable: false, authority: "legacy", reason: "run_id_missing" });
  });
  test("falls back for a missing row", async () =>
    expect(await read({ data: null })).toMatchObject({ reason: "missing" }));
  test("falls back for projection_failed", async () =>
    expect(await read({ data: row({ status: "projection_failed" }) })).toMatchObject({
      reason: "status_not_succeeded",
    }));
  test("falls back for unsupported schema", async () =>
    expect(await read({ data: row({ schema_version: 1 }) })).toMatchObject({
      reason: "unsupported_schema",
    }));
  test("falls back for analysis mismatch", async () =>
    expect(await read({ data: row({ analysis_version: 2 }) })).toMatchObject({
      reason: "analysis_version_mismatch",
    }));
  test("falls back for invalid relation", async () =>
    expect(await read({ data: row({ relations: [{}] }) })).toMatchObject({
      reason: "invalid_relations",
    }));
  test("falls back for kind mismatch", async () =>
    expect(await read({ data: row({ relations: [relation("supports")] }) })).toMatchObject({
      reason: "invalid_relations",
    }));
  test("falls back for invalid counts", async () =>
    expect(await read({ data: row({ skipped_count: 1 }) })).toMatchObject({
      reason: "invalid_counts",
    }));
  test("falls back for read errors (including impossible duplicate maybeSingle rows)", async () =>
    expect(await read({ data: null, error: { code: "PGRST116" } })).toMatchObject({
      reason: "read_failed",
    }));
  test("never throws when the client throws", async () =>
    expect(
      await readCanonicalShadow({
        client: client(null, true),
        analysisRunId: "run-1",
        expectedAnalysisVersion: 3,
        eligibleConclusionIds: new Set(["c1"]),
        trustedSourceRefs: new Set(["s1"]),
      }),
    ).toMatchObject({ reason: "read_failed" }));
  test("returns a validated observational row", async () =>
    expect(await read({ data: row() })).toEqual({
      usable: true,
      authority: "observational",
      row: row(),
    }));

  test.each([
    { sourceEntityId: "unknown", targetEntityId: "s1", kind: "uses-source" },
    { sourceEntityId: "c1", targetEntityId: "unknown", kind: "uses-source" },
  ])("falls back when a relation endpoint is outside the generator scope", async (value) =>
    expect(await read({ data: row({ relations: [value] }) })).toMatchObject({
      reason: "invalid_relations",
    }),
  );
});
