import { describe, expect, test } from "bun:test";
import {
  createStructuredAnalysisResult,
  type CreateStructuredAnalysisResultInput,
  type StructuredAnalysisLegacySnapshot,
} from "../result.ts";
import { stableJsonStringify } from "../stable-json.ts";

const legacy: StructuredAnalysisLegacySnapshot = {
  facts_index: [{ id: "fact-1" }],
  trusted_sources: [{ id: "source-1" }],
  conclusions: [{ id: "conclusion-1" }],
  provenance_index: { "fact-1": ["source-1"] },
  evidence_matrix: { "conclusion-1": ["fact-1"] },
  source_sufficiency: { sufficient: true },
  challenge_result: { challenged: false },
  source_warnings: ["warning-1"],
  generation_allowed: true,
};

const input: CreateStructuredAnalysisResultInput = {
  analysis_run_id: "analysis-run-1",
  session_id: "session-1",
  created_at: "2026-07-25T00:00:00.000Z",
  legacy,
  canonical: {
    relations: {
      schema_version: "1.0.0",
      relations: [],
    },
  },
};

describe("createStructuredAnalysisResult", () => {
  test("creates a versioned result from the supplied values", () => {
    const result = createStructuredAnalysisResult(input);

    expect(result).not.toBe(input);
    expect(result.schema_version).toBe("1.0.0");
    expect(result.analysis_run_id).toBe("analysis-run-1");
    expect(result.session_id).toBe("session-1");
    expect(result.created_at).toBe("2026-07-25T00:00:00.000Z");
    expect(result.legacy).not.toBe(input.legacy);
    expect(result.legacy).toEqual(input.legacy);

    expect(result.canonical).not.toBe(input.canonical);
    expect(result.canonical).toEqual(input.canonical);

    expect(result.canonical.relations).toBe(input.canonical.relations);
  });

  test("is deterministic and does not supply hidden runtime defaults", () => {
    const first = createStructuredAnalysisResult(input);
    const second = createStructuredAnalysisResult(input);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.analysis_run_id).toBe(input.analysis_run_id);
    expect(first.created_at).toBe(input.created_at);
  });

  test("produces stable-JSON-compatible data", () => {
    const result = createStructuredAnalysisResult(input);

    expect(() => stableJsonStringify(result)).not.toThrow();
    expect(JSON.parse(stableJsonStringify(result))).toEqual(result);
  });

  test("retains exactly the persisted legacy snapshot fields", () => {
    const result = createStructuredAnalysisResult(input);

    expect(Object.keys(result.legacy).sort()).toEqual(
      [
        "facts_index",
        "trusted_sources",
        "conclusions",
        "provenance_index",
        "evidence_matrix",
        "source_sufficiency",
        "challenge_result",
        "source_warnings",
        "generation_allowed",
      ].sort(),
    );
  });
});
