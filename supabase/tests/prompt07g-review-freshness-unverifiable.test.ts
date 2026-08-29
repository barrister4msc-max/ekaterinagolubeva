import { describe, expect, test } from "bun:test";
import { computeDocumentReadiness } from "../../src/lib/document-readiness";
import { evaluateReviewApproval } from "../../src/lib/document-approval";

const consistency = {
  ready: true,
  criticalFailed: [],
  warningsFailed: [],
  blockReason: null,
};

const passedReview = { review_status: "passed", problems: [] };

function readiness(reviewCompletedAt?: string | null, documentUpdatedAt?: string | null) {
  return computeDocumentReadiness({
    consistency,
    review: passedReview,
    reviewCompleted: true,
    reviewCompletedAt,
    documentUpdatedAt,
  });
}

function approval(reviewTimestamp?: string | null, documentUpdatedAt?: string | null) {
  return evaluateReviewApproval(
    {
      status: "completed",
      ai_result: { review_status: "passed", problems: [] },
      completed_at: reviewTimestamp,
    },
    documentUpdatedAt,
  );
}

describe("Prompt 07G unverifiable Review freshness gate", () => {
  test("valid current timestamps remain allowed", () => {
    expect(readiness("2026-08-29T15:30:00.000Z", "2026-08-29T15:29:00.000Z").status).toBe("READY");
    expect(approval("2026-08-29T15:30:00.000Z", "2026-08-29T15:29:00.000Z"))
      .toEqual({ allowed: true, reason: null });
  });

  test("valid stale timestamps keep review_stale semantics", () => {
    expect(readiness("2026-08-29T15:29:00.000Z", "2026-08-29T15:30:00.000Z").reasons)
      .toContain("review_stale");
    expect(approval("2026-08-29T15:29:00.000Z", "2026-08-29T15:30:00.000Z"))
      .toEqual({ allowed: false, reason: "review_stale" });
  });

  test("missing Review timestamp is fail closed", () => {
    const result = readiness(null, "2026-08-29T15:30:00.000Z");
    expect(result.status).toBe("NEEDS_REVISION");
    expect(result.reasons).toContain("review_freshness_unverifiable");
    expect(approval(null, "2026-08-29T15:30:00.000Z"))
      .toEqual({ allowed: false, reason: "review_freshness_unverifiable" });
  });

  test("invalid Review timestamp is fail closed", () => {
    expect(readiness("not-a-date", "2026-08-29T15:30:00.000Z").reasons)
      .toContain("review_freshness_unverifiable");
    expect(approval("not-a-date", "2026-08-29T15:30:00.000Z"))
      .toEqual({ allowed: false, reason: "review_freshness_unverifiable" });
  });

  test("missing document timestamp is fail closed", () => {
    expect(readiness("2026-08-29T15:30:00.000Z", null).reasons)
      .toContain("review_freshness_unverifiable");
    expect(approval("2026-08-29T15:30:00.000Z", null))
      .toEqual({ allowed: false, reason: "review_freshness_unverifiable" });
  });

  test("invalid document timestamp is fail closed", () => {
    expect(readiness("2026-08-29T15:30:00.000Z", "not-a-date").reasons)
      .toContain("review_freshness_unverifiable");
    expect(approval("2026-08-29T15:30:00.000Z", "not-a-date"))
      .toEqual({ allowed: false, reason: "review_freshness_unverifiable" });
  });

  test("existing non-passed Review remains fail closed", () => {
    expect(evaluateReviewApproval({
      status: "completed",
      ai_result: { review_status: "needs_revision" },
      completed_at: null,
    }, null)).toEqual({ allowed: false, reason: "review_not_passed" });
  });
});
