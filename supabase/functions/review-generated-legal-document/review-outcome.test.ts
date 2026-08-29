import { describe, expect, test } from "bun:test";
import { normalizeReviewOutcome } from "./review-outcome.ts";

describe("Prompt 07B Reviewer critical finding fail-closed", () => {
  test("passed without critical finding remains passed", () => {
    const result = normalizeReviewOutcome({
      review_status: "passed",
      ready_for_client: true,
      can_be_sent_as_final: true,
      problems: [{ severity: "high" }],
    });
    expect(result.review_status).toBe("passed");
    expect(result.ready_for_client).toBe(true);
    expect(result.can_be_sent_as_final).toBe(true);
  });

  test("passed with critical finding is blocked and not final", () => {
    const result = normalizeReviewOutcome({
      review_status: "passed",
      ready_for_client: true,
      can_be_sent_as_final: true,
      problems: [{ severity: "critical", problem: "fatal defect" }],
      required_fixes: ["fix it"],
    });
    expect(result.review_status).toBe("blocked");
    expect(result.ready_for_client).toBe(false);
    expect(result.can_be_sent_as_final).toBe(false);
    expect(result.problems).toEqual([{ severity: "critical", problem: "fatal defect" }]);
    expect(result.required_fixes).toEqual(["fix it"]);
  });

  test("needs_revision with critical finding is blocked", () => {
    const result = normalizeReviewOutcome({
      review_status: "needs_revision",
      ready_for_client: false,
      can_be_sent_as_final: false,
      problems: [{ severity: "critical" }],
    });
    expect(result.review_status).toBe("blocked");
  });

  test("already blocked with critical finding stays blocked", () => {
    const result = normalizeReviewOutcome({
      review_status: "blocked",
      ready_for_client: false,
      can_be_sent_as_final: false,
      problems: [{ severity: "critical" }],
    });
    expect(result.review_status).toBe("blocked");
    expect(result.ready_for_client).toBe(false);
    expect(result.can_be_sent_as_final).toBe(false);
  });

  test("high-only finding does not invent a new blocker", () => {
    const result = normalizeReviewOutcome({
      review_status: "needs_revision",
      ready_for_client: false,
      can_be_sent_as_final: false,
      problems: [{ severity: "high" }],
    });
    expect(result.review_status).toBe("needs_revision");
  });

  test("draft payload and document-like fields are preserved", () => {
    const result = normalizeReviewOutcome({
      review_status: "passed",
      ready_for_client: true,
      can_be_sent_as_final: true,
      summary: "keep draft",
      problems: [{ severity: "critical" }],
      recommendations: ["lawyer review"],
    });
    expect(result.summary).toBe("keep draft");
    expect(result.recommendations).toEqual(["lawyer review"]);
    expect(result.problems).toEqual([{ severity: "critical" }]);
  });
});
