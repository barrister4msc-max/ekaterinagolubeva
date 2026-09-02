import { describe, expect, test } from "bun:test";
import {
  AI_FILL_EVALUATION_TAXONOMY,
  AI_FILL_EVALUATION_VERSION,
  CANONICAL_FIELD_EVALUATION_REGISTRY,
  FLAGSHIP_TEMPLATE_CODES_09A,
  TEMPLATE_BENCHMARK_PROFILES_09A,
  benchmarkRule,
  evaluateCanonicalField,
  type CanonicalFieldGroundTruth,
  type CanonicalFieldObservation,
  type EvaluationEvidence,
} from "./evaluation-baseline.ts";

const REQUEST_EVIDENCE: EvaluationEvidence = {
  document_role: "procedural_request",
  document_ref: "fixture/request-001",
  quote: "Требование № 123 от 15.08.2026",
  provenance_ref: "fixture:request-001:p1",
};

const ACT_EVIDENCE: EvaluationEvidence = {
  document_role: "tax_audit_act",
  document_ref: "fixture/act-001",
  quote: "Доначисление по эпизоду не производилось",
  provenance_ref: "fixture:act-001:p7",
};

function truth(overrides: Partial<CanonicalFieldGroundTruth> = {}): CanonicalFieldGroundTruth {
  return {
    field_id: "tax.request_number",
    expected_value: "123",
    expected_meaning: CANONICAL_FIELD_EVALUATION_REGISTRY["tax.request_number"].meaning,
    evidence: [REQUEST_EVIDENCE],
    negation_present: false,
    conflict_present: false,
    manual_override: {
      applied: false,
      accepted_explicitly: false,
      final_value_unchanged: false,
    },
    ...overrides,
  };
}

function observation(overrides: Partial<CanonicalFieldObservation> = {}): CanonicalFieldObservation {
  return {
    field_id: "tax.request_number",
    observed_value: "123",
    supported_by: [REQUEST_EVIDENCE],
    preserves_negation: true,
    preserves_conflict: true,
    manual_value_preserved: false,
    ...overrides,
  };
}

describe("Prompt 09A universal AI-fill evaluation baseline", () => {
  test("freezes the required five-label taxonomy and version", () => {
    expect(AI_FILL_EVALUATION_VERSION).toBe("09A-v1");
    expect(AI_FILL_EVALUATION_TAXONOMY).toEqual([
      "correct",
      "incorrect",
      "unsupported",
      "unknown",
      "manual_preserved",
    ]);
  });

  test("contains exactly the five approved flagship template profiles", () => {
    expect(Object.keys(TEMPLATE_BENCHMARK_PROFILES_09A).sort()).toEqual([...FLAGSHIP_TEMPLATE_CODES_09A].sort());
    for (const code of FLAGSHIP_TEMPLATE_CODES_09A) {
      expect(TEMPLATE_BENCHMARK_PROFILES_09A[code].profile_version).toBe("09A-v1");
      expect(TEMPLATE_BENCHMARK_PROFILES_09A[code].template_code).toBe(code);
      expect(TEMPLATE_BENCHMARK_PROFILES_09A[code].fields.length).toBeGreaterThan(0);
    }
  });

  test("uses one canonical meaning across templates; profiles contain only applicability and weight", () => {
    for (const code of FLAGSHIP_TEMPLATE_CODES_09A) {
      for (const rule of TEMPLATE_BENCHMARK_PROFILES_09A[code].fields) {
        const definition = CANONICAL_FIELD_EVALUATION_REGISTRY[rule.field_id];
        expect(definition.id).toBe(rule.field_id);
        expect(definition.meaning.length).toBeGreaterThan(10);
        expect(Object.keys(rule).sort()).toEqual(["applicability", "field_id", "weight"]);
      }
    }

    const positionMeanings = FLAGSHIP_TEMPLATE_CODES_09A
      .map((code) => benchmarkRule(code, "tax.position_summary"))
      .filter(Boolean)
      .map(() => CANONICAL_FIELD_EVALUATION_REGISTRY["tax.position_summary"].meaning);
    expect(new Set(positionMeanings).size).toBe(1);
  });

  test("labels an exact, supported field as correct", () => {
    expect(evaluateCanonicalField(truth(), observation())).toBe("correct");
  });

  test("labels a supported but wrong value as incorrect", () => {
    expect(evaluateCanonicalField(truth(), observation({ observed_value: "999" }))).toBe("incorrect");
  });

  test("labels a value without matching provenance/quote as unsupported", () => {
    expect(evaluateCanonicalField(
      truth(),
      observation({
        supported_by: [{
          document_role: "procedural_request",
          document_ref: "fixture/other",
          quote: "Требование № 123",
          provenance_ref: "fixture:other:p1",
        }],
      }),
    )).toBe("unsupported");
  });

  test("labels a missing observation as unknown when the ground truth has a value", () => {
    expect(evaluateCanonicalField(truth(), observation({ observed_value: null }))).toBe("unknown");
  });

  test("distinguishes unknown ground truth from an invented unsupported value", () => {
    const unknownTruth = truth({ expected_value: null, evidence: [] });
    expect(evaluateCanonicalField(unknownTruth, observation({ observed_value: null, supported_by: [] }))).toBe("unknown");
    expect(evaluateCanonicalField(unknownTruth, observation({ observed_value: "123", supported_by: [] }))).toBe("unsupported");
  });

  test("preserves negation for a field whose canonical semantics require it", () => {
    const negatedTruth: CanonicalFieldGroundTruth = {
      field_id: "tax.contested_amount",
      expected_value: "0",
      expected_meaning: CANONICAL_FIELD_EVALUATION_REGISTRY["tax.contested_amount"].meaning,
      evidence: [ACT_EVIDENCE],
      negation_present: true,
      conflict_present: false,
      manual_override: { applied: false, accepted_explicitly: false, final_value_unchanged: false },
    };
    const base: CanonicalFieldObservation = {
      field_id: "tax.contested_amount",
      observed_value: "0",
      supported_by: [ACT_EVIDENCE],
      preserves_negation: true,
      preserves_conflict: true,
      manual_value_preserved: false,
    };
    expect(evaluateCanonicalField(negatedTruth, base)).toBe("correct");
    expect(evaluateCanonicalField(negatedTruth, { ...base, preserves_negation: false })).toBe("incorrect");
  });

  test("does not collapse a documented conflict into one apparently certain value", () => {
    const conflictTruth = truth({ conflict_present: true });
    expect(evaluateCanonicalField(conflictTruth, observation({ preserves_conflict: false }))).toBe("incorrect");
    expect(evaluateCanonicalField(conflictTruth, observation({ preserves_conflict: true }))).toBe("correct");
  });

  test("labels explicitly accepted unchanged manual value as manual_preserved", () => {
    const manualTruth = truth({
      expected_value: "ручное значение 123",
      evidence: [{
        document_role: "user_manual_input",
        document_ref: "manual/session-1",
        quote: "ручное значение 123",
        provenance_ref: "manual:session-1:field",
      }],
      manual_override: {
        applied: true,
        accepted_explicitly: true,
        final_value_unchanged: true,
      },
    });
    const manualObservation = observation({
      observed_value: "ручное значение 123",
      supported_by: manualTruth.evidence,
      manual_value_preserved: true,
    });
    expect(evaluateCanonicalField(manualTruth, manualObservation)).toBe("manual_preserved");
  });

  test("does not grant manual_preserved without explicit acceptance and unchanged finalization", () => {
    const baseTruth = truth({
      expected_value: "123",
      manual_override: { applied: true, accepted_explicitly: false, final_value_unchanged: true },
    });
    expect(evaluateCanonicalField(baseTruth, observation({ manual_value_preserved: true }))).toBe("correct");

    const changedTruth = truth({
      manual_override: { applied: true, accepted_explicitly: true, final_value_unchanged: false },
    });
    expect(evaluateCanonicalField(changedTruth, observation({ manual_value_preserved: true }))).toBe("correct");
  });

  test("rejects evaluation when truth and observation refer to different canonical fields", () => {
    expect(() => evaluateCanonicalField(
      truth(),
      { ...observation(), field_id: "tax.request_date" },
    )).toThrow("field_id_mismatch");
  });

  test("synthetic fixtures are contract-only and expose no model accuracy claim", async () => {
    const source = await Bun.file(new URL("./evaluation-baseline.ts", import.meta.url)).text();
    expect(source).toContain("not evidence of model accuracy or production non-regression");
    expect(source).not.toContain("accuracy_score");
    expect(source).not.toContain("non_regression_passed");
  });
});
