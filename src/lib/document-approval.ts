export type ReviewRunForApproval = {
  status?: unknown;
  ai_result?: unknown;
  created_at?: unknown;
  completed_at?: unknown;
} | null;

export type ReviewApprovalGate =
  | { allowed: true; reason: null }
  | { allowed: false; reason: "review_not_completed" | "review_result_invalid" | "review_not_passed" | "review_stale" | "review_freshness_unverifiable" | "review_safety_payload_invalid" };

function parseRequiredTimestamp(value: unknown): number | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
}

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
  if (!Array.isArray(result?.problems)) {
    return { allowed: false, reason: "review_safety_payload_invalid" };
  }

  const reviewCompletedAt = reviewRun.completed_at ?? reviewRun.created_at;
  const reviewTime = parseRequiredTimestamp(reviewCompletedAt);
  const documentTime = parseRequiredTimestamp(documentUpdatedAt);
  if (reviewTime === null || documentTime === null) {
    return { allowed: false, reason: "review_freshness_unverifiable" };
  }
  if (reviewTime < documentTime) {
    return { allowed: false, reason: "review_stale" };
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
