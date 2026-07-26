import { describe, expect, test } from "bun:test";
import {
  computeCanonicalRelationsShadow,
  type CanonicalShadowLogger,
} from "../canonical-shadow.ts";

const source = (source_ref: string, extra = {}) => ({ source_ref, ...extra });
const conclusion = (conclusion_id: string, refs: readonly string[]) => ({
  conclusion_id,
  provenance: { laws_used: refs },
});

function recordingLogger() {
  const info: Array<[string, Record<string, unknown>]> = [];
  const warn: Array<[string, Record<string, unknown>]> = [];
  const logger: CanonicalShadowLogger = {
    info: (message, details) => info.push([message, details]),
    warn: (message, details) => warn.push([message, details]),
  };
  return { logger, info, warn };
}

describe("computeCanonicalRelationsShadow", () => {
  test("disabled mode returns immediately without touching inputs or logging", () => {
    const conclusions = new Proxy([], { get: () => { throw new Error("touched conclusions"); } });
    const trustedSources = new Proxy([], { get: () => { throw new Error("touched sources"); } });
    const log = recordingLogger();

    expect(computeCanonicalRelationsShadow({ enabled: false, conclusions, trustedSources }, log.logger))
      .toBeUndefined();
    expect(log.info).toHaveLength(0);
    expect(log.warn).toHaveLength(0);
  });

  test("projects valid claims with aggregate counts and one safe success log", () => {
    const log = recordingLogger();
    const result = computeCanonicalRelationsShadow({
      enabled: true,
      conclusions: [conclusion("c1", ["s1"])],
      trustedSources: [source("s1")],
    }, log.logger)!;

    expect(result.relations).toEqual([
      { sourceEntityId: "c1", targetEntityId: "s1", kind: "uses-source" },
    ]);
    expect(result.claimCount).toBe(1);
    expect(result.relationCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(log.info).toHaveLength(1);
    expect(log.warn).toHaveLength(0);
    expect(log.info[0][0]).toBe("[canonical-relations-shadow] projected");
    expect(Object.keys(log.info[0][1]).sort()).toEqual([
      "claims", "duration_ms", "relations", "skipped",
    ]);
    expect(JSON.stringify(log.info[0][1])).not.toContain("s1");
    expect(JSON.stringify(log.info[0][1])).not.toContain("c1");
    expect(log.info[0][1]).not.toHaveProperty("relations", result.relations);
  });

  test("preserves relation order and duplicates", () => {
    const result = computeCanonicalRelationsShadow({
      enabled: true,
      conclusions: [conclusion("c1", ["s2", "s1", "s2"])],
      trustedSources: [source("s1"), source("s2")],
    }, recordingLogger().logger)!;

    expect(result.relations.map((relation) => relation.targetEntityId)).toEqual(["s2", "s1", "s2"]);
    expect(result.relationCount).toBe(3);
  });

  test("counts unresolved sources and invalid conclusions as skipped", () => {
    const result = computeCanonicalRelationsShadow({
      enabled: true,
      conclusions: [conclusion("c1", ["missing"]), { provenance: { laws_used: ["s1"] } }],
      trustedSources: [source("s1")],
    }, recordingLogger().logger)!;

    expect(result).toMatchObject({ claimCount: 2, relationCount: 0, skippedCount: 2, relations: [] });
  });

  test("catches a throwing extraction path and emits only a safe warning", () => {
    const throwing = { get provenance(): never { throw new Error("provenance failed"); } };
    const log = recordingLogger();

    expect(() => computeCanonicalRelationsShadow({
      enabled: true,
      conclusions: [throwing],
      trustedSources: [],
    }, log.logger)).not.toThrow();
    expect(log.info).toHaveLength(0);
    expect(log.warn).toEqual([[
      "[canonical-relations-shadow] computation_failed",
      { error: "provenance failed" },
    ]]);
    expect(Object.keys(log.warn[0][1])).toEqual(["error"]);
  });

  test("does not mutate frozen inputs and tolerates additional source fields", () => {
    const conclusions = Object.freeze([Object.freeze(conclusion("c1", ["s1"]))]);
    const trustedSources = Object.freeze([Object.freeze(source("s1", { title: "extra" }))]);
    const before = JSON.stringify({ conclusions, trustedSources });

    const result = computeCanonicalRelationsShadow({ enabled: true, conclusions, trustedSources }, recordingLogger().logger)!;
    expect(result.relationCount).toBe(1);
    expect(JSON.stringify({ conclusions, trustedSources })).toBe(before);
  });

  test("empty conclusions succeed with zero counts", () => {
    const result = computeCanonicalRelationsShadow({ enabled: true, conclusions: [], trustedSources: [] }, recordingLogger().logger)!;
    expect(result).toMatchObject({ relations: [], claimCount: 0, relationCount: 0, skippedCount: 0 });
  });

  test("empty trusted sources skip every extracted claim", () => {
    const result = computeCanonicalRelationsShadow({
      enabled: true,
      conclusions: [conclusion("c1", ["s1", "s2"])],
      trustedSources: [],
    }, recordingLogger().logger)!;
    expect(result).toMatchObject({ relations: [], claimCount: 2, relationCount: 0, skippedCount: 2 });
  });

  test("default console logger does not require injection", () => {
    expect(computeCanonicalRelationsShadow({ enabled: true, conclusions: [], trustedSources: [] }))
      .toBeDefined();
  });

  test("a throwing success logger is isolated and returns undefined", () => {
    const warnings: unknown[] = [];
    const logger: CanonicalShadowLogger = {
      info: () => { throw new Error("logger failed"); },
      warn: (message, details) => warnings.push([message, details]),
    };
    expect(() => computeCanonicalRelationsShadow({
      enabled: true,
      conclusions: [],
      trustedSources: [],
    }, logger)).not.toThrow();
    expect(computeCanonicalRelationsShadow({
      enabled: true,
      conclusions: [],
      trustedSources: [],
    }, logger)).toBeUndefined();
    expect(warnings).toHaveLength(2);
  });

  test("a throwing warning logger is also isolated", () => {
    const logger: CanonicalShadowLogger = {
      info: () => { throw new Error("info failed"); },
      warn: () => { throw new Error("warn failed"); },
    };
    expect(() => computeCanonicalRelationsShadow({ enabled: true, conclusions: [], trustedSources: [] }, logger))
      .not.toThrow();
  });
});
