import { describe, expect, test } from "bun:test";
import type { CanonicalShadowResult } from "../canonical-shadow.ts";
import {
  buildCanonicalShadowPersistenceRecord,
  CANONICAL_SHADOW_PERSISTENCE_SCHEMA_VERSION,
  persistCanonicalShadowBestEffort,
  type CanonicalShadowPersistenceLogger,
  type CanonicalShadowPersistenceRecord,
} from "../canonical-shadow-persistence.ts";

const relation = (sourceEntityId: string, targetEntityId: string, kind = "uses-source") => ({
  sourceEntityId,
  targetEntityId,
  kind,
});

const success = (overrides: Partial<CanonicalShadowResult> = {}): CanonicalShadowResult => ({
  relations: [relation("c1", "s1")],
  claimCount: 1,
  relationCount: 1,
  skippedCount: 0,
  durationMs: 2,
  ...overrides,
});

const build = (result: CanonicalShadowResult | undefined) =>
  buildCanonicalShadowPersistenceRecord({
    analysisRunId: "run-1",
    analysisVersion: 3,
    result,
    shadowEnabled: true,
  });

describe("buildCanonicalShadowPersistenceRecord", () => {
  test("disabled runs return undefined without inspecting the result", () => {
    const input = new Proxy({ shadowEnabled: false } as any, {
      get(target, key) {
        if (key === "result") throw new Error("result inspected");
        return target[key];
      },
    });
    expect(buildCanonicalShadowPersistenceRecord(input)).toBeUndefined();
  });

  test("an enabled missing result maps to the fixed projection failure shape", () => {
    expect(build(undefined)).toEqual({
      analysis_run_id: "run-1",
      analysis_version: 3,
      status: "projection_failed",
      schema_version: CANONICAL_SHADOW_PERSISTENCE_SCHEMA_VERSION,
      claim_count: null,
      relation_count: null,
      unique_relation_count: null,
      skipped_count: null,
      duration_ms: null,
      relations: null,
      error_code: "projection_failed",
    });
  });

  test("preserves the relation reference, order, duplicates, and extra properties", () => {
    const relations = Object.freeze([
      Object.freeze({ ...relation("c1", "s2"), extra: "retained" }),
      Object.freeze(relation("c1", "s1")),
      Object.freeze(relation("c1", "s2")),
    ]);
    const result = Object.freeze(
      success({
        relations,
        claimCount: 3,
        relationCount: 3,
      }),
    );
    const record = build(result)!;

    expect(record.status).toBe("succeeded");
    expect(record.relations).toBe(relations);
    expect(record.relations).toEqual(relations);
    expect(record.unique_relation_count).toBe(2);
    expect((record.relations![0] as any).extra).toBe("retained");
    expect(result.relations).toHaveLength(3);
  });

  test("exact tuple uniqueness keeps case and whitespace significant", () => {
    const relations = [
      relation("c", "source"),
      relation("C", "source"),
      relation("c ", "source"),
      relation("c", "source"),
    ];
    expect(
      build(success({ relations, claimCount: 4, relationCount: 4 }))!.unique_relation_count,
    ).toBe(3);
  });

  test.each(["sourceEntityId", "targetEntityId", "kind"])(
    "maps a throwing relation %s getter to projection_failed without throwing",
    (field) => {
      const malformedRelation = {
        sourceEntityId: "c1",
        targetEntityId: "s1",
        kind: "uses-source",
      };
      Object.defineProperty(malformedRelation, field, {
        get: () => {
          throw new Error(`${field} inspected`);
        },
      });
      const result = success({ relations: [malformedRelation], relationCount: 1 });

      expect(() => build(result)).not.toThrow();
      expect(build(result)!.status).toBe("projection_failed");
    },
  );

  test("maps a relations array that throws during iteration to projection_failed", () => {
    const relations = new Proxy([relation("c1", "s1")], {
      get(target, key, receiver) {
        if (key === "every") throw new Error("iteration attempted");
        return Reflect.get(target, key, receiver);
      },
    });
    const result = success({ relations });

    expect(() => build(result)).not.toThrow();
    expect(build(result)!.status).toBe("projection_failed");
  });

  test.each(["claimCount", "relations"])(
    "maps a throwing result %s getter to projection_failed without throwing",
    (field) => {
      const result = success() as CanonicalShadowResult & Record<string, unknown>;
      Object.defineProperty(result, field, {
        get: () => {
          throw new Error(`${field} inspected`);
        },
      });

      expect(() => build(result)).not.toThrow();
      expect(build(result)!.status).toBe("projection_failed");
    },
  );

  test.each([
    ["relation length mismatch", { relationCount: 0 }],
    ["relations exceed claims", { claimCount: 0 }],
    ["negative count", { skippedCount: -1 }],
    ["fractional count", { claimCount: 1.5 }],
    ["NaN count", { relationCount: Number.NaN }],
    ["infinite count", { durationMs: Number.POSITIVE_INFINITY }],
    ["negative duration", { durationMs: -1 }],
    ["invalid relation", { relations: [{}] as any }],
    ["blank relation id", { relations: [relation("", "s1")] as any }],
    ["unsupported relation kind", { relations: [relation("c1", "s1", "SUPPORTS")] as any }],
  ])("maps malformed success data to projection_failed: %s", (_name, overrides) => {
    expect(build(success(overrides as Partial<CanonicalShadowResult>))!.status).toBe(
      "projection_failed",
    );
  });

  test.each(["", 0, -1, 1.5])("rejects an invalid identity/version value: %p", (value) => {
    const record = buildCanonicalShadowPersistenceRecord({
      analysisRunId: typeof value === "string" ? value : "run-1",
      analysisVersion: typeof value === "number" ? value : 1,
      result: success(),
      shadowEnabled: true,
    });
    expect(record!.status).toBe("projection_failed");
  });

  test("persists only the defined record fields, not unrelated shadow metadata", () => {
    const record = build(success())!;
    expect(Object.keys(record).sort()).toEqual([
      "analysis_run_id",
      "analysis_version",
      "claim_count",
      "duration_ms",
      "error_code",
      "relation_count",
      "relations",
      "schema_version",
      "skipped_count",
      "status",
      "unique_relation_count",
    ]);
    expect(record).not.toHaveProperty("supportLevel");
    expect(record).not.toHaveProperty("sourceMetadata");
  });
});

function recordingLogger() {
  const info: Array<[string, Record<string, unknown>]> = [];
  const warn: Array<[string, Record<string, unknown>]> = [];
  const logger: CanonicalShadowPersistenceLogger = {
    info: (message, details) => info.push([message, details]),
    warn: (message, details) => warn.push([message, details]),
  };
  return { logger, info, warn };
}

describe("persistCanonicalShadowBestEffort", () => {
  test("undefined records skip insertion and logging", async () => {
    let inserts = 0;
    const log = recordingLogger();
    const outcome = await persistCanonicalShadowBestEffort({
      client: {
        insertCanonicalShadow: async () => {
          inserts++;
          return {};
        },
      },
      logger: log.logger,
      record: undefined,
    });
    expect(outcome).toBe("skipped");
    expect(inserts).toBe(0);
    expect(log.info).toHaveLength(0);
    expect(log.warn).toHaveLength(0);
  });

  test("inserts once, does not mutate, and logs exactly the safe success fields", async () => {
    const record = Object.freeze(build(success())!) as CanonicalShadowPersistenceRecord;
    let inserted: CanonicalShadowPersistenceRecord | undefined;
    let inserts = 0;
    const log = recordingLogger();
    const outcome = await persistCanonicalShadowBestEffort({
      client: {
        insertCanonicalShadow: async (value) => {
          inserts++;
          inserted = value;
          return {};
        },
      },
      logger: log.logger,
      record,
    });
    expect(outcome).toBe("persisted");
    expect(inserts).toBe(1);
    expect(inserted).toBe(record);
    expect(log.warn).toHaveLength(0);
    expect(log.info).toEqual([
      [
        "[canonical-relations-shadow] persistence_succeeded",
        { analysis_run_id: "run-1", status: "succeeded", relations: 1 },
      ],
    ]);
  });

  test.each(["returned", "thrown"])(
    "swallows a %s insert failure without retry or leakage",
    async (mode) => {
      let inserts = 0;
      const log = recordingLogger();
      const outcome = await persistCanonicalShadowBestEffort({
        client: {
          insertCanonicalShadow: async () => {
            inserts++;
            if (mode === "thrown") throw new Error("secret exception");
            return { error: { message: "secret database text" } };
          },
        },
        logger: log.logger,
        record: build(success()),
      });
      expect(outcome).toBe("failed");
      expect(inserts).toBe(1);
      expect(log.info).toHaveLength(0);
      expect(log.warn).toEqual([
        [
          "[canonical-relations-shadow] persistence_failed",
          { analysis_run_id: "run-1", status: "succeeded", error_code: "insert_failed" },
        ],
      ]);
      expect(JSON.stringify(log.warn)).not.toContain("secret");
    },
  );

  test("swallows success and failure logger exceptions", async () => {
    const throwingLogger: CanonicalShadowPersistenceLogger = {
      info: () => {
        throw new Error("info failed");
      },
      warn: () => {
        throw new Error("warn failed");
      },
    };
    await expect(
      persistCanonicalShadowBestEffort({
        client: { insertCanonicalShadow: async () => ({}) },
        logger: throwingLogger,
        record: build(success()),
      }),
    ).resolves.toBe("persisted");
    await expect(
      persistCanonicalShadowBestEffort({
        client: {
          insertCanonicalShadow: async () => {
            throw new Error("insert failed");
          },
        },
        logger: throwingLogger,
        record: build(success()),
      }),
    ).resolves.toBe("failed");
  });
});
