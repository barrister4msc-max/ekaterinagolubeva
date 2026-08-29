import { describe, expect, test } from "bun:test";
import { computeDocumentReadiness } from "../../src/lib/document-readiness";
import { evaluateReviewApproval } from "../../src/lib/document-approval";

const consistency = {
  ready: true,
  criticalFailed: [],
  warningsFailed: [],
  blockReason: null,
};

describe("Prompt 07F stale Reviewer freshness gate", () => {
  test("readiness allows current passed review", () => {
    const result = computeDocumentReadiness({
      consistency,
      review: { review_status: "passed", problems: [] },
      reviewCompleted: true,
      reviewCompletedAt: "2026-08-29T15:30:00.000Z",
      documentUpdatedAt: "2026-08-29T15:29:00.000Z",
    });
    expect(result.status).toBe("READY");
  });

  test("readiness rejects stale passed review", () => {
    const result = computeDocumentReadiness({
      consistency,
      review: { review_status: "passed", problems: [] },
      reviewCompleted: true,
      reviewCompletedAt: "2026-08-29T15:29:00.000Z",
      documentUpdatedAt: "2026-08-29T15:30:00.000Z",
    });
    expect(result.status).toBe("NEEDS_REVISION");
    expect(result.reasons).toContain("review_stale");
  });

  test("approval accepts current completed passed review", () => {
    expect(evaluateReviewApproval(
      {
        status: "completed",
        ai_result: { review_status: "passed", problems: [] },
        completed_at: "2026-08-29T15:30:00.000Z",
      },
      "2026-08-29T15:29:00.000Z",
    )).toEqual({ allowed: true, reason: null });
  });

  test("approval rejects stale completed passed review", () => {
    expect(evaluateReviewApproval(
      {
        status: "completed",
        ai_result: { review_status: "passed", problems: [] },
        completed_at: "2026-08-29T15:29:00.000Z",
      },
      "2026-08-29T15:30:00.000Z",
    )).toEqual({ allowed: false, reason: "review_stale" });
  });

  test("existing non-passed behavior remains fail closed", () => {
    expect(evaluateReviewApproval(
      {
        status: "completed",
        ai_result: { review_status: "needs_revision" },
        completed_at: "2026-08-29T15:31:00.000Z",
      },
      "2026-08-29T15:30:00.000Z",
    )).toEqual({ allowed: false, reason: "review_not_passed" });
  });
});
