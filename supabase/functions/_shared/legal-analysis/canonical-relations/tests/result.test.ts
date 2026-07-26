import { expect, test } from "bun:test";
import { createStructuredAnalysisResult, type StructuredAnalysisResult } from "../index.ts";

function makeInput(): StructuredAnalysisResult {
  return {
    schema_version: "structured-analysis/v2a",
    analysis_run_id: "analysis-run-123",
    session_id: "session-456",
    created_at: "2026-07-26T12:34:56.789Z",
    legacy: {
      facts_index: [{ id: "fact-1" }],
      trusted_sources: [{ id: "source-1" }],
      conclusions: { primary: "conclusion" },
      provenance_index: new Map([["fact-1", "source-1"]]),
      evidence_matrix: [[{ supports: true }]],
      source_sufficiency: { sufficient: true },
      challenge_result: { passed: true },
      source_warnings: ["warning"],
      generation_allowed: { allowed: true },
    },
    canonical: {
      relations: [
        {
          sourceEntityId: "fact-1",
          targetEntityId: "source-1",
          kind: "supported-by",
        },
      ],
    },
  };
}

test("preserves scalar contract values without generating metadata", () => {
  const input = makeInput();
  const result = createStructuredAnalysisResult(input);

  expect(result.schema_version).toBe(input.schema_version);
  expect(result.analysis_run_id).toBe(input.analysis_run_id);
  expect(result.session_id).toBe(input.session_id);
  expect(result.created_at).toBe(input.created_at);
  expect(result.schema_version).toBe("structured-analysis/v2a");
  expect(result.analysis_run_id).toBe("analysis-run-123");
  expect(result.session_id).toBe("session-456");
  expect(result.created_at).toBe("2026-07-26T12:34:56.789Z");
});

test("creates fresh contract containers without deep cloning nested values", () => {
  const input = makeInput();
  const result = createStructuredAnalysisResult(input);

  expect(result).not.toBe(input);
  expect(result.legacy).not.toBe(input.legacy);
  expect(result.legacy).toEqual(input.legacy);

  expect(result.canonical).not.toBe(input.canonical);
  expect(result.canonical).toEqual(input.canonical);

  expect(result.canonical.relations).toBe(input.canonical.relations);

  for (const key of Object.keys(input.legacy) as (keyof typeof input.legacy)[]) {
    expect(result.legacy[key]).toBe(input.legacy[key]);
  }
});

test("does not mutate the input", () => {
  const input = makeInput();
  const originalLegacy = input.legacy;
  const originalCanonical = input.canonical;
  const originalRelations = input.canonical.relations;
  const originalKeys = Object.keys(input);

  createStructuredAnalysisResult(Object.freeze(input));

  expect(Object.keys(input)).toEqual(originalKeys);
  expect(input.legacy).toBe(originalLegacy);
  expect(input.canonical).toBe(originalCanonical);
  expect(input.canonical.relations).toBe(originalRelations);
});
