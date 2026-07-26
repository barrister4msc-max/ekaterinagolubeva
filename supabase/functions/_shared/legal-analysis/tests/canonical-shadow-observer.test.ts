import { describe, expect, test } from "bun:test";
import {
  observeCanonicalShadowParity,
  type CanonicalShadowObserverLogger,
  type ObserveCanonicalShadowParityInput,
} from "../canonical-shadow-observer.ts";
import type { CanonicalShadowReadClient } from "../canonical-shadow-reader.ts";
import type { CanonicalConsumerObservationRecord } from "../canonical-consumer-observation-persistence.ts";
import type { CanonicalConsumerObservationSupabaseClient } from "../canonical-shadow-observer.ts";

const relation = (targetEntityId = "secret-source") => ({
  sourceEntityId: "secret-conclusion",
  targetEntityId,
  kind: "uses-source",
});
const validRow = () => ({
  analysis_run_id: "run-1",
  analysis_version: 3,
  status: "succeeded",
  schema_version: 1,
  claim_count: 1,
  relation_count: 1,
  unique_relation_count: 1,
  skipped_count: 0,
  relations: [relation()],
});

function readClient(result: { data: unknown; error?: unknown }) {
  let reads = 0;
  const inserts: CanonicalConsumerObservationRecord[] = [];
  let insertError: unknown;
  const client = {
    from: (table: string) => table === "document_intake_canonical_consumer_observations" ? ({
      insert: async (record: CanonicalConsumerObservationRecord) => { inserts.push(record); return { error: insertError }; },
    }) : ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            reads += 1;
            return result;
          },
        }),
      }),
    }),
  } as unknown as CanonicalShadowReadClient & CanonicalConsumerObservationSupabaseClient;
  return { client, reads: () => reads, inserts, failInsert: (error: unknown) => { insertError = error; } };
}

function recordingLogger() {
  const info: Array<[string, Record<string, unknown>]> = [];
  const warn: Array<[string, Record<string, unknown>]> = [];
  const logger: CanonicalShadowObserverLogger = {
    info: (message, details) => info.push([message, details]),
    warn: (message, details) => warn.push([message, details]),
  };
  return { logger, info, warn };
}

function input(
  client: CanonicalShadowReadClient & CanonicalConsumerObservationSupabaseClient,
  logger: CanonicalShadowObserverLogger,
  overrides: Partial<ObserveCanonicalShadowParityInput> = {},
): ObserveCanonicalShadowParityInput {
  return {
    enabled: true,
    client,
    analysisRunId: "run-1",
    expectedAnalysisVersion: 3,
    conclusions: [
      { conclusion_id: "secret-conclusion", provenance: { laws_used: ["secret-source"] } },
    ],
    trustedSources: [{ source_ref: "secret-source", title: "secret-title" }],
    logger,
    ...overrides,
  };
}

describe("observeCanonicalShadowParity", () => {
  test("disabled mode does not read, log, or inspect parity inputs", async () => {
    const database = readClient({ data: validRow() });
    const log = recordingLogger();
    const hostile = new Proxy([], {
      get: () => {
        throw new Error("inspected");
      },
    });

    expect(
      await observeCanonicalShadowParity(
        input(database.client, log.logger, {
          enabled: false,
          conclusions: hostile,
          trustedSources: hostile,
        }),
      ),
    ).toBeUndefined();
    expect(database.reads()).toBe(0);
    expect(database.inserts).toHaveLength(0);
    expect(log.info).toHaveLength(0);
    expect(log.warn).toHaveLength(0);
  });

  test.each([
    ["missing row", { data: null }, "missing"],
    [
      "projection_failed",
      { data: { ...validRow(), status: "projection_failed" } },
      "status_not_succeeded",
    ],
    ["read failure", { data: null, error: { code: "failure" } }, "read_failed"],
  ])("%s emits exactly one aggregate fallback", async (_label, result, reason) => {
    const database = readClient(result);
    const log = recordingLogger();
    await observeCanonicalShadowParity(input(database.client, log.logger));
    expect(database.inserts).toHaveLength(1);
    expect(database.inserts[0]).toMatchObject({ outcome: "fallback", fallback_reason: reason });
    expect(log.info).toHaveLength(1);
    expect(log.warn).toContainEqual(
      [
        "[canonical-relations-consumer] fallback",
        {
          analysis_run_id: "run-1",
          analysis_version: 3,
          outcome: "fallback",
          fallback_reason: reason,
        },
      ],
    );
  });

  test("valid parity emits only approved aggregate fields and returns no canonical data", async () => {
    const database = readClient({ data: validRow() });
    const log = recordingLogger();
    const result = await observeCanonicalShadowParity(input(database.client, log.logger));
    expect(result).toBeUndefined();
    expect(log.warn).toHaveLength(0);
    expect(database.inserts).toHaveLength(1);
    expect(database.inserts[0]).toMatchObject({ outcome: "match", identity_equality: true, per_conclusion_equality: true });
    expect(log.info).toHaveLength(2);
    expect(log.info[1]).toEqual([
      "[canonical-relations-consumer] parity",
      {
        analysis_run_id: "run-1",
        analysis_version: 3,
        schema_version: 1,
        outcome: "match",
        claim_count: 1,
        relation_count: 1,
        unique_relation_count: 1,
        ordered_equality: true,
        duplicate_equality: true,
        coverage: true,
        reverse_index_equality: true,
      },
    ]);
    expect(JSON.stringify(log.info)).not.toContain("secret-source");
    expect(JSON.stringify(log.info)).not.toContain("secret-conclusion");
    expect(JSON.stringify(log.info)).not.toContain("secret-title");
  });

  test("a mismatch emits one parity event with mismatch outcome", async () => {
    const database = readClient({ data: { ...validRow(), relations: [relation("other-source")] } });
    const log = recordingLogger();
    await observeCanonicalShadowParity(input(database.client, log.logger));
    expect(database.inserts[0].outcome).toBe("mismatch");
    expect(database.inserts[0].mismatch_reasons.length).toBeGreaterThan(0);
    expect(log.info[1][1].outcome).toBe("mismatch");
  });

  test("persistence failure is subordinate and preserves parity logging", async () => {
    const database = readClient({ data: validRow() }); database.failInsert({ message: "secret db" });
    const log = recordingLogger();
    expect(await observeCanonicalShadowParity(input(database.client, log.logger))).toBeUndefined();
    expect(log.warn[0][0]).toBe("[canonical-relations-consumer] observation_persistence_failed");
    expect(log.info.some(([message]) => message === "[canonical-relations-consumer] parity")).toBeTrue();
    expect(JSON.stringify(log)).not.toContain("secret db");
  });

  test("hostile parity getters and throwing loggers are isolated and never throw", async () => {
    const database = readClient({ data: validRow() });
    const throwingLogger: CanonicalShadowObserverLogger = {
      info: () => {
        throw new Error("logger");
      },
      warn: () => {
        throw new Error("logger");
      },
    };
    const hostile = input(database.client, throwingLogger);
    Object.defineProperty(hostile, "conclusions", {
      get: () => {
        throw new Error("getter");
      },
    });
    expect(await observeCanonicalShadowParity(hostile)).toBeUndefined();
    const missing = readClient({ data: null });
    expect(
      await observeCanonicalShadowParity(input(missing.client, throwingLogger)),
    ).toBeUndefined();
  });

  test("Generator delegates observation without inline canonical workflow", async () => {
    const generator = await Bun.file(
      `${import.meta.dir}/../../../generate-legal-document-v2/index.ts`,
    ).text();
    expect(generator.match(/observeCanonicalShadowParity\(/g)).toHaveLength(1);
    expect(generator).not.toContain("canonical-shadow-reader.ts");
    expect(generator).not.toContain("canonical-shadow-parity.ts");
    expect(generator).not.toContain("readCanonicalShadow");
    expect(generator).not.toContain("compareCanonicalShadowParity");
    expect(generator).not.toContain("[canonical-relations-consumer]");
    expect(generator).not.toContain("document_intake_canonical_consumer_observations");
    expect(generator).not.toContain("buildCanonicalConsumer");
    expect(generator).not.toContain("persistCanonicalConsumerObservation");
  });
});
