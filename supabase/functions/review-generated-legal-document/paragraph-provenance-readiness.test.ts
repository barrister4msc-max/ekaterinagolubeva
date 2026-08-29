import { describe, expect, test } from "bun:test";
import { normalizeReviewOutcome } from "./review-outcome.ts";

const completeParagraphProvenance = {
  paragraph_id: "p_1",
  text_preview: "Начало содержательного абзаца",
  used_arguments: [],
  used_conclusions: [],
  used_facts: [],
  used_documents: [],
  used_sources: [],
  used_strategy_id: "",
};

describe("Prompt 07C/07E paragraph provenance readiness", () => {
  test("keeps passed when substantive document has structurally complete paragraph provenance", () => {
    const result = normalizeReviewOutcome(
      { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true, problems: [] },
      { requiresParagraphProvenance: true, paragraphProvenance: [completeParagraphProvenance] },
    );

    expect(result.review_status).toBe("passed");
    expect(result.ready_for_client).toBe(true);
    expect(result.can_be_sent_as_final).toBe(true);
  });

  test("downgrades passed when required paragraph provenance is empty", () => {
    const result = normalizeReviewOutcome(
      { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true, problems: [] },
      { requiresParagraphProvenance: true, paragraphProvenance: [] },
    );

    expect(result.review_status).toBe("needs_revision");
    expect(result.ready_for_client).toBe(false);
    expect(result.can_be_sent_as_final).toBe(false);
    expect(result.problems).toEqual(expect.arrayContaining([expect.objectContaining({
      type: "missing_information",
      severity: "high",
    })]));
  });

  test("downgrades passed when required paragraph provenance is missing", () => {
    const result = normalizeReviewOutcome(
      { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true, problems: [] },
      { requiresParagraphProvenance: true },
    );

    expect(result.review_status).toBe("needs_revision");
    expect(result.ready_for_client).toBe(false);
    expect(result.can_be_sent_as_final).toBe(false);
  });

  test("downgrades passed for empty object provenance item", () => {
    const result = normalizeReviewOutcome(
      { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true, problems: [] },
      { requiresParagraphProvenance: true, paragraphProvenance: [{}] },
    );

    expect(result.review_status).toBe("needs_revision");
    expect(result.ready_for_client).toBe(false);
    expect(result.can_be_sent_as_final).toBe(false);
  });

  test("downgrades passed for partial provenance item", () => {
    const result = normalizeReviewOutcome(
      { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true, problems: [] },
      { requiresParagraphProvenance: true, paragraphProvenance: [{ paragraph_id: "p_1" }] },
    );

    expect(result.review_status).toBe("needs_revision");
  });

  test("downgrades passed when any provenance item is malformed", () => {
    const result = normalizeReviewOutcome(
      { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true, problems: [] },
      {
        requiresParagraphProvenance: true,
        paragraphProvenance: [completeParagraphProvenance, { ...completeParagraphProvenance, used_sources: null }],
      },
    );

    expect(result.review_status).toBe("needs_revision");
  });

  test("does not replace an existing blocked outcome", () => {
    const result = normalizeReviewOutcome(
      { review_status: "blocked", ready_for_client: false, can_be_sent_as_final: false, problems: [] },
      { requiresParagraphProvenance: true, paragraphProvenance: [{}] },
    );

    expect(result.review_status).toBe("blocked");
    expect(result.ready_for_client).toBe(false);
    expect(result.can_be_sent_as_final).toBe(false);
  });

  test("does not require paragraph provenance for non-substantive content", () => {
    const result = normalizeReviewOutcome(
      { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true, problems: [] },
      { requiresParagraphProvenance: false, paragraphProvenance: [{}] },
    );

    expect(result.review_status).toBe("passed");
    expect(result.ready_for_client).toBe(true);
    expect(result.can_be_sent_as_final).toBe(true);
  });

  test("preserves Prompt 07B critical fail-closed precedence", () => {
    const result = normalizeReviewOutcome(
      {
        review_status: "passed",
        ready_for_client: true,
        can_be_sent_as_final: true,
        problems: [{ severity: "critical", problem: "critical legal defect" }],
      },
      { requiresParagraphProvenance: true, paragraphProvenance: [{}] },
    );

    expect(result.review_status).toBe("blocked");
    expect(result.ready_for_client).toBe(false);
    expect(result.can_be_sent_as_final).toBe(false);
  });
});
