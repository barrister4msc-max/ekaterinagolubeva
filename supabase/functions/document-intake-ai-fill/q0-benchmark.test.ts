import { describe, expect, test } from "bun:test";
import {
  AI_FILL_EVALUATION_VERSION,
  CANONICAL_FIELD_EVALUATION_REGISTRY,
  FLAGSHIP_TEMPLATE_CODES_09A,
  type CanonicalFieldGroundTruth,
} from "./evaluation-baseline.ts";
import {
  Q0_BENCHMARK_MANIFEST_09B,
  Q0_BENCHMARK_VERSION,
  deriveQ0Status,
  validateQ0BenchmarkCase,
  type Q0BenchmarkCase,
  type RecordedAiFillOutput,
} from "./q0-benchmark.ts";

const SHA = "a".repeat(64);

function baseCase(): Q0BenchmarkCase {
  return {
    case_id: "q0-response_to_tax_request-test",
    case_version: Q0_BENCHMARK_VERSION,
    evaluation_version: AI_FILL_EVALUATION_VERSION,
    template_code: "response_to_tax_request",
    template_revision: "template-r1",
    schema_revision: "schema-r1",
    documents: [{
      document_ref: "fixture://doc-1",
      sha256: SHA,
      provenance_ref: "fixture:doc-1:p1",
      anonymized: true,
      approval_ref: "fixture:approval:1",
    }],
    expected_field_ids: ["company.name", "tax.position_summary"],
    recorded_output: null,
    lawyer_ground_truth: null,
    status: "recorded_output_pending",
    synthetic_contract_only: true,
  };
}

function recorded(): RecordedAiFillOutput {
  return {
    output_ref: "fixture://recorded-output-1",
    output_sha256: SHA,
    provenance_ref: "fixture:recorded:1",
    captured_at: "2026-08-01T12:00:00Z",
    provider: "fixture-provider",
    model: "fixture-model",
    model_version: "fixture-v1",
    prompt_version: "fixture-prompt-v1",
    fields: { "company.name": "ООО Тест" },
  };
}

const groundTruth: CanonicalFieldGroundTruth = {
  field_id: "company.name",
  expected_value: "ООО Тест",
  expected_meaning: CANONICAL_FIELD_EVALUATION_REGISTRY["company.name"].meaning,
  evidence: [{
    document_role: "party_identity",
    document_ref: "fixture://doc-1",
    quote: "ООО Тест",
    provenance_ref: "fixture:doc-1:p1",
  }],
  negation_present: false,
  conflict_present: false,
  manual_override: {
    applied: false,
    accepted_explicitly: false,
    final_value_unchanged: false,
  },
};

describe("Prompt 09B Q0 benchmark foundation", () => {
  test("freezes 09B version and reuses 09A evaluation version", () => {
    expect(Q0_BENCHMARK_VERSION).toBe("09B-v1");
    for (const item of Q0_BENCHMARK_MANIFEST_09B) {
      expect(item.evaluation_version).toBe(AI_FILL_EVALUATION_VERSION);
    }
  });

  test("contains exactly one pending contract fixture for each approved flagship", () => {
    expect(Q0_BENCHMARK_MANIFEST_09B.map((x) => x.template_code).sort())
      .toEqual([...FLAGSHIP_TEMPLATE_CODES_09A].sort());
    expect(Q0_BENCHMARK_MANIFEST_09B).toHaveLength(5);
    for (const item of Q0_BENCHMARK_MANIFEST_09B) {
      expect(item.recorded_output).toBeNull();
      expect(item.lawyer_ground_truth).toBeNull();
      expect(item.status).toBe("recorded_output_pending");
      expect(item.synthetic_contract_only).toBe(true);
      expect(validateQ0BenchmarkCase(item)).toEqual([]);
    }
  });

  test("derives lifecycle without pretending missing artifacts exist", () => {
    expect(deriveQ0Status(null, null)).toBe("recorded_output_pending");
    expect(deriveQ0Status(recorded(), null)).toBe("lawyer_review_pending");
    expect(deriveQ0Status(recorded(), {
      review_ref: "fixture:lawyer:review-1",
      reviewed_at: "2026-08-02T12:00:00Z",
      reviewer_role: "lawyer",
      fields: [groundTruth],
    })).toBe("ready_for_evaluation");
  });

  test("fails closed on non-anonymized or unapproved documents", () => {
    const bad = baseCase();
    const mutated = {
      ...bad,
      documents: [{ ...bad.documents[0], anonymized: false as true, approval_ref: "" }],
    };
    expect(validateQ0BenchmarkCase(mutated)).toContain("document_not_anonymized");
    expect(validateQ0BenchmarkCase(mutated)).toContain("document_approval_missing");
  });

  test("requires hashes and provenance for recorded outputs", () => {
    const item: Q0BenchmarkCase = {
      ...baseCase(),
      recorded_output: { ...recorded(), output_sha256: "bad", provenance_ref: "" },
      status: "lawyer_review_pending",
    };
    const errors = validateQ0BenchmarkCase(item);
    expect(errors).toContain("recorded_output_sha256_invalid");
    expect(errors).toContain("recorded_output_provenance_missing");
  });

  test("requires prompt/provider/model/version metadata when an output exists", () => {
    const item: Q0BenchmarkCase = {
      ...baseCase(),
      recorded_output: { ...recorded(), provider: "", model_version: "", prompt_version: "" },
      status: "lawyer_review_pending",
    };
    expect(validateQ0BenchmarkCase(item)).toContain("recorded_output_model_metadata_missing");
  });

  test("rejects lifecycle labels inconsistent with actual artifacts", () => {
    expect(validateQ0BenchmarkCase({ ...baseCase(), status: "ready_for_evaluation" }))
      .toContain("status_does_not_match_artifacts");
  });

  test("expected fields must come from the 09A canonical registry", () => {
    for (const item of Q0_BENCHMARK_MANIFEST_09B) {
      for (const fieldId of item.expected_field_ids) {
        expect(CANONICAL_FIELD_EVALUATION_REGISTRY[fieldId]).toBeDefined();
      }
    }
  });

  test("synthetic fixtures cannot be represented as completed benchmark evidence", async () => {
    const source = await Bun.file(new URL("./q0-benchmark.ts", import.meta.url)).text();
    expect(source).toContain("make no accuracy/non-regression claim");
    expect(source).not.toContain("accuracy_score");
    expect(source).not.toContain("non_regression_passed");
  });
});
