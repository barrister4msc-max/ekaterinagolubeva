import { describe, expect, test } from "bun:test";
import { normalizeReviewOutcome } from "../functions/review-generated-legal-document/review-outcome";
import { computeDocumentReadiness } from "../../src/lib/document-readiness";
import { evaluateReviewApproval } from "../../src/lib/document-approval";

const consistency = {
  ready: true,
  criticalFailed: [],
  warningsFailed: [],
  blockReason: null,
};

const reviewCompletedAt = "2026-08-29T16:30:00.000Z";
const documentUpdatedAt = "2026-08-29T16:29:00.000Z";

function readiness(review: unknown) {
  return computeDocumentReadiness({
    consistency,
    review,
    reviewCompleted: true,
    reviewCompletedAt,
    documentUpdatedAt,
  });
}

function approval(aiResult: unknown) {
  return evaluateReviewApproval(
    {
      status: "completed",
      ai_result: aiResult,
      completed_at: reviewCompletedAt,
    },
    documentUpdatedAt,
  );
}

const malformedProblems = [
  { label: "missing", review: { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true } },
  { label: "null", review: { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true, problems: null } },
  { label: "object", review: { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true, problems: { severity: "critical", problem: "fatal defect" } } },
  { label: "string", review: { review_status: "passed", ready_for_client: true, can_be_sent_as_final: true, problems: "critical defect" } },
] as const;

describe("Prompt 07H malformed Reviewer safety payload gate", () => {
  for (const { label, review } of malformedProblems) {
    test(`normalization fails closed for ${label} problems payload`, () => {
      const result = normalizeReviewOutcome(review);
      expect(result.review_status).toBe("needs_revision");
      expect(result.ready_for_client).toBe(false);
      expect(result.can_be_sent_as_final).toBe(false);
      expect(Array.isArray(result.problems)).toBe(true);
      expect(result.problems).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "missing_information", severity: "high" }),
      ]));
    });

    test(`readiness and approval reject persisted ${label} problems payload`, () => {
      const ready = readiness(review);
      expect(ready.status).toBe("NEEDS_REVISION");
      expect(ready.reasons).toContain("review_safety_payload_invalid");
      expect(approval(review)).toEqual({
        allowed: false,
        reason: "review_safety_payload_invalid",
      });
    });
  }

  test("valid empty problems array preserves passed projection", () => {
    const review = {
      review_status: "passed",
      ready_for_client: true,
      can_be_sent_as_final: true,
      problems: [],
    };
    expect(normalizeReviewOutcome(review)).toEqual(review);
    expect(readiness(review)).toEqual({ status: "READY", reasons: [] });
    expect(approval(review)).toEqual({ allowed: true, reason: null });
  });

  test("valid noncritical problems array remains a warning, not a blocker", () => {
    const review = {
      review_status: "passed",
      ready_for_client: true,
      can_be_sent_as_final: true,
      problems: [{ severity: "high", problem: "lawyer should inspect" }],
    };
    expect(normalizeReviewOutcome(review).review_status).toBe("passed");
    expect(readiness(review).status).toBe("READY_WITH_WARNINGS");
    expect(approval(review)).toEqual({ allowed: true, reason: null });
  });

  test("valid critical problems array preserves Prompt 07B blocked semantics", () => {
    const review = {
      review_status: "passed",
      ready_for_client: true,
      can_be_sent_as_final: true,
      problems: [{ severity: "critical", problem: "fatal defect" }],
    };
    const normalized = normalizeReviewOutcome(review);
    expect(normalized.review_status).toBe("blocked");
    expect(normalized.ready_for_client).toBe(false);
    expect(normalized.can_be_sent_as_final).toBe(false);

    const persistedBlocked = { ...normalized, problems: review.problems };
    expect(readiness(persistedBlocked).status).toBe("BLOCKED");
    expect(approval(persistedBlocked)).toEqual({
      allowed: false,
      reason: "review_not_passed",
    });
  });
});
