export type ReviewOutcome = Record<string, unknown> & {
  review_status?: unknown;
  ready_for_client?: unknown;
  can_be_sent_as_final?: unknown;
  problems?: unknown;
};

/**
 * Deterministic fail-closed reconciliation for the existing Reviewer contract.
 * A critical finding cannot coexist with a successful/final review projection.
 * The draft and all findings remain intact; only readiness/status fields are normalized.
 */
export function normalizeReviewOutcome(input: unknown): ReviewOutcome {
  const review: ReviewOutcome =
    input && typeof input === "object" && !Array.isArray(input)
      ? { ...(input as Record<string, unknown>) }
      : {};

  const problems = Array.isArray(review.problems) ? review.problems : [];
  const hasCriticalFinding = problems.some((problem) => {
    if (!problem || typeof problem !== "object" || Array.isArray(problem)) return false;
    return (problem as Record<string, unknown>).severity === "critical";
  });

  if (!hasCriticalFinding) return review;

  return {
    ...review,
    review_status: "blocked",
    ready_for_client: false,
    can_be_sent_as_final: false,
  };
}
