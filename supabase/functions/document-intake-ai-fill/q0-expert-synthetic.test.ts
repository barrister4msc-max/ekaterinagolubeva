import { describe, expect, test } from "bun:test";
import { FLAGSHIP_TEMPLATE_CODES_09A } from "./evaluation-baseline.ts";
import {
  Q0_EXPERT_SYNTHETIC_TRUTH_09C,
  Q0_EXPERT_SYNTHETIC_VERSION,
  validateQ0ExpertSyntheticCase,
} from "./q0-expert-synthetic.ts";

describe("Prompt 09C-1 expert synthetic ground truth", () => {
  test("covers every approved flagship without presenting synthetic truth as model evidence", () => {
    expect(Q0_EXPERT_SYNTHETIC_VERSION).toBe("09C-1-v1");
    expect(Q0_EXPERT_SYNTHETIC_TRUTH_09C.map((item) => item.template_code).sort())
      .toEqual([...FLAGSHIP_TEMPLATE_CODES_09A].sort());
    for (const item of Q0_EXPERT_SYNTHETIC_TRUTH_09C) {
      expect(item.classification).toBe("expert_synthetic");
      expect(item.lawyer_reviewed).toBe(false);
      expect(item.eligible_for_model_accuracy_claim).toBe(false);
      expect(validateQ0ExpertSyntheticCase(item)).toEqual([]);
    }
  });

  test("covers supported, negated, conflicting/unknown and manual-preserved field semantics", () => {
    const all = Q0_EXPERT_SYNTHETIC_TRUTH_09C.flatMap((item) => item.fields);
    expect(all.some((field) => field.expected_value !== null && field.evidence.length > 0)).toBe(true);
    expect(all.some((field) => field.negation_present)).toBe(true);
    expect(all.some((field) => field.conflict_present && field.expected_value === null)).toBe(true);
    expect(all.some((field) => field.manual_override.applied && field.manual_override.accepted_explicitly)).toBe(true);
  });

  test("fails closed when a synthetic case claims legal review, accuracy, invalid roles or unsupported fields", () => {
    const base = Q0_EXPERT_SYNTHETIC_TRUTH_09C[0];
    expect(validateQ0ExpertSyntheticCase({ ...base, lawyer_reviewed: true as false }))
      .toContain("expert_synthetic_cannot_claim_lawyer_review");
    expect(validateQ0ExpertSyntheticCase({ ...base, eligible_for_model_accuracy_claim: true as false }))
      .toContain("expert_synthetic_cannot_claim_model_accuracy");
    expect(validateQ0ExpertSyntheticCase({
      ...base,
      fields: [{ ...base.fields[0], field_id: "tax.court_case_number" }, ...base.fields.slice(1)],
    })).toContain("field_not_applicable_to_template");
    expect(validateQ0ExpertSyntheticCase({
      ...base,
      fields: [{ ...base.fields[0], evidence: [{ ...base.fields[0].evidence[0], document_role: "court_act" }] }, ...base.fields.slice(1)],
    })).toContain("ground_truth_evidence_role_invalid");
  });
});
