export type ReviewRunForApproval = {
  status?: unknown;
  ai_result?: unknown;
  created_at?: unknown;
  completed_at?: unknown;
} | null;

export type ReviewApprovalGate =
  | { allowed: true; reason: null }
  | { allowed: false; reason: "review_not_completed" | "review_result_invalid" | "review_not_passed" | "review_stale" };

export function evaluateReviewApproval(
  reviewRun: ReviewRunForApproval,
  documentUpdatedAt?: string | null,
): ReviewApprovalGate {
  if (!reviewRun || String(reviewRun.status ?? "").toLowerCase() !== "completed") {
    return { allowed: false, reason: "review_not_completed" };
  }
  const result = reviewRun.ai_result && typeof reviewRun.ai_result === "object" && !Array.isArray(reviewRun.ai_result)
    ? reviewRun.ai_result as Record<string, unknown>
    : null;
  const reviewStatus = String(result?.review_status ?? "").toLowerCase();
  if (!["passed", "needs_revision", "blocked"].includes(reviewStatus)) {
    return { allowed: false, reason: "review_result_invalid" };
  }
  if (reviewStatus !== "passed") return { allowed: false, reason: "review_not_passed" };

  const reviewCompletedAt = String(reviewRun.completed_at ?? reviewRun.created_at ?? "");
  if (reviewCompletedAt && documentUpdatedAt) {
    const reviewTime = new Date(reviewCompletedAt).getTime();
    const documentTime = new Date(documentUpdatedAt).getTime();
    if (Number.isFinite(reviewTime) && Number.isFinite(documentTime) && reviewTime < documentTime) {
      return { allowed: false, reason: "review_stale" };
    }
  }

  return { allowed: true, reason: null };
}

export function assertReviewAllowsApproval(
  reviewRun: ReviewRunForApproval,
  documentUpdatedAt?: string | null,
): void {
  const gate = evaluateReviewApproval(reviewRun, documentUpdatedAt);
  if (!gate.allowed) throw new Error(`Document approval blocked: ${gate.reason}`);
}
