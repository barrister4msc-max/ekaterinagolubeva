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
    documents: [
      {
        document_ref: "fixture://doc-1",
        sha256: SHA,
        provenance_ref: "fixture:doc-1:p1",
        anonymized: true,
        approval_ref: "fixture:approval:1",
      },
    ],
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
  label: "correct",
  expected_value: "ООО Тест",
  expected_meaning: CANONICAL_FIELD_EVALUATION_REGISTRY["company.name"].meaning,
  evidence: [
    {
      document_role: "party_identity",
      document_ref: "fixture://doc-1",
      quote: "ООО Тест",
      provenance_ref: "fixture:doc-1:p1",
    },
  ],
  negation_present: false,
  conflict_present: false,
  manual_override: {
    applied: false,
    accepted_explicitly: false,
    final_value_unchanged: false,
  },
};

const RESPONSE_REQUIRED_FIELDS = [
  "company.name",
  "company.inn",
  "tax.authority_name",
  "tax.request_number",
  "tax.request_date",
  "tax.position_summary",
] as const;

function groundTruthFor(
  field_id: (typeof RESPONSE_REQUIRED_FIELDS)[number],
): CanonicalFieldGroundTruth {
  const expected_value =
    field_id === "tax.request_date"
      ? "2026-08-15"
      : field_id === "tax.position_summary"
        ? "Клиент не согласен с выводом инспекции."
        : field_id === "company.name"
          ? "ООО Тест"
          : "123";
  return {
    ...groundTruth,
    field_id,
    expected_value,
    expected_meaning: CANONICAL_FIELD_EVALUATION_REGISTRY[field_id].meaning,
    evidence: [
      {
        ...groundTruth.evidence[0],
        document_role: field_id.startsWith("company.") ? "party_identity" : "procedural_request",
      },
    ],
  };
}

function reviewed(): Q0BenchmarkCase["lawyer_ground_truth"] {
  return {
    review_ref: "fixture:lawyer:review-1",
    review_sha256: SHA,
    reviewed_at: "2026-08-02T12:00:00Z",
    reviewer_id: "lawyer:fixture-1",
    reviewer_role: "lawyer",
    annotation_version: "09C-v1",
    fields: RESPONSE_REQUIRED_FIELDS.map(groundTruthFor),
  };
}

function admissibleCase(): Q0BenchmarkCase {
  const values = Object.fromEntries(
    RESPONSE_REQUIRED_FIELDS.map((fieldId) => [fieldId, groundTruthFor(fieldId).expected_value]),
  );
  const item: Q0BenchmarkCase = {
    ...baseCase(),
    expected_field_ids: RESPONSE_REQUIRED_FIELDS,
    recorded_output: { ...recorded(), fields: values },
    lawyer_ground_truth: reviewed(),
    status: "ready_for_evaluation",
  };
  return item;
}

describe("Prompt 09B Q0 benchmark foundation", () => {
  test("freezes 09B version and reuses 09A evaluation version", () => {
    expect(Q0_BENCHMARK_VERSION).toBe("09B-v1");
    for (const item of Q0_BENCHMARK_MANIFEST_09B) {
      expect(item.evaluation_version).toBe(AI_FILL_EVALUATION_VERSION);
    }
  });

  test("contains exactly one pending contract fixture for each approved flagship", () => {
    expect(Q0_BENCHMARK_MANIFEST_09B.map((x) => x.template_code).sort()).toEqual(
      [...FLAGSHIP_TEMPLATE_CODES_09A].sort(),
    );
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
    expect(
      deriveQ0Status({ ...baseCase(), recorded_output: null, lawyer_ground_truth: null }),
    ).toBe("recorded_output_pending");
    expect(
      deriveQ0Status({ ...baseCase(), recorded_output: recorded(), lawyer_ground_truth: null }),
    ).toBe("lawyer_review_pending");
    expect(deriveQ0Status(admissibleCase())).toBe("ready_for_evaluation");
  });

  test("admits evaluation only with exact output and lawyer-annotation coverage", () => {
    expect(validateQ0BenchmarkCase(admissibleCase())).toEqual([]);

    const emptyAnnotations = admissibleCase();
    emptyAnnotations.lawyer_ground_truth = { ...reviewed()!, fields: [] };
    emptyAnnotations.status = "lawyer_review_pending";
    expect(validateQ0BenchmarkCase(emptyAnnotations)).toContain("ground_truth_field_missing");

    const partialOutput = admissibleCase();
    partialOutput.recorded_output = { ...recorded(), fields: { "company.name": "ООО Тест" } };
    partialOutput.status = "lawyer_review_pending";
    expect(validateQ0BenchmarkCase(partialOutput)).toContain("recorded_output_field_missing");

    const duplicate = admissibleCase();
    duplicate.lawyer_ground_truth = {
      ...reviewed()!,
      fields: [...reviewed()!.fields, groundTruthFor("company.name")],
    };
    duplicate.status = "lawyer_review_pending";
    expect(validateQ0BenchmarkCase(duplicate)).toContain("ground_truth_field_duplicate");

    const unknown = {
      ...admissibleCase(),
      expected_field_ids: [...RESPONSE_REQUIRED_FIELDS, "unknown.field"],
      status: "lawyer_review_pending" as const,
    };
    expect(validateQ0BenchmarkCase(unknown as unknown as Q0BenchmarkCase)).toContain(
      "unknown_expected_field_id",
    );
  });

  test("requires lawyer evidence provenance and required profile coverage while allowing omitted optional fields", () => {
    const missingEvidence = admissibleCase();
    missingEvidence.lawyer_ground_truth = {
      ...reviewed()!,
      fields: reviewed()!.fields.map((field, index) =>
        index === 0 ? { ...field, evidence: [] } : field,
      ),
    };
    missingEvidence.status = "lawyer_review_pending";
    expect(validateQ0BenchmarkCase(missingEvidence)).toContain("ground_truth_evidence_missing");

    const missingRequired = admissibleCase();
    missingRequired.expected_field_ids = ["company.name", "company.inn", "tax.position_summary"];
    missingRequired.status = "lawyer_review_pending";
    expect(validateQ0BenchmarkCase(missingRequired)).toContain("required_profile_field_missing");

    const optionalOmitted = admissibleCase();
    expect(optionalOmitted.expected_field_ids).not.toContain("company.kpp");
    expect(validateQ0BenchmarkCase(optionalOmitted)).toEqual([]);
  });

  test("rejects invalid review labels and timestamps from untyped external input", () => {
    const invalid = admissibleCase();
    invalid.recorded_output = { ...invalid.recorded_output!, captured_at: "not-a-timestamp" };
    invalid.lawyer_ground_truth = {
      ...invalid.lawyer_ground_truth!,
      reviewed_at: "not-a-timestamp",
      fields: invalid.lawyer_ground_truth!.fields.map((field, index) =>
        index === 0
          ? { ...field, label: "invented_label" as never, expected_value: 42 as never }
          : field,
      ),
    };
    invalid.status = "lawyer_review_pending";
    const errors = validateQ0BenchmarkCase(invalid);
    expect(errors).toContain("recorded_output_captured_at_invalid");
    expect(errors).toContain("ground_truth_reviewed_at_invalid");
    expect(errors).toContain("ground_truth_label_invalid");
    expect(errors).toContain("ground_truth_expected_value_invalid");
  });

  test("derivation and validation are idempotent and never call an incomplete case ready", () => {
    const incomplete = admissibleCase();
    incomplete.lawyer_ground_truth = { ...reviewed()!, fields: reviewed()!.fields.slice(0, -1) };
    incomplete.status = "lawyer_review_pending";
    expect(deriveQ0Status(incomplete)).toBe("lawyer_review_pending");
    expect(validateQ0BenchmarkCase(incomplete)).toEqual(validateQ0BenchmarkCase(incomplete));
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
    expect(validateQ0BenchmarkCase({ ...baseCase(), status: "ready_for_evaluation" })).toContain(
      "status_does_not_match_artifacts",
    );
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
