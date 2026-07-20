// P0-D: Global readiness resolver.
// Pure aggregator over EXISTING gate states. No legal interpretation.
// No sufficiency-as-blocker.

export type ReadinessStatus =
  | "BLOCKED"
  | "NEEDS_REVISION"
  | "READY_WITH_WARNINGS"
  | "READY";

export type ReadinessInput = {
  consistency: {
    ready: boolean;
    criticalFailed: Array<{ id: string; label: string }>;
    warningsFailed: Array<{ id: string; label: string }>;
    blockReason: string | null;
  } | null;
  review: any | null; // review_run.ai_result
  // Source Review warnings whose affected_conclusions is non-empty are treated
  // as Source Review blockers (matches source-warning-reviews contract).
  sourceWarnings?: Array<{
    warning_type?: string;
    source_ref?: string;
    affected_conclusions?: unknown;
  }> | null;
};

export type ReadinessResult = {
  status: ReadinessStatus;
  reasons: string[];
};

export function computeDocumentReadiness(input: ReadinessInput): ReadinessResult {
  const reasons: string[] = [];

  const reviewStatus = String(input.review?.review_status ?? "").toLowerCase();
  const problems = Array.isArray(input.review?.problems) ? input.review!.problems : [];
  const criticalProblems = problems.filter((p: any) => {
    const s = String(p?.severity ?? "").toLowerCase();
    return s === "critical" || s === "blocker";
  });

  const blockingSourceWarnings = (input.sourceWarnings ?? []).filter(
    (w) => Array.isArray(w?.affected_conclusions) && (w!.affected_conclusions as unknown[]).length > 0,
  );

  // BLOCKED — highest priority
  if (reviewStatus === "blocked") {
    reasons.push(`review_status=${reviewStatus}`);
    return { status: "BLOCKED", reasons };
  }
  if (blockingSourceWarnings.length > 0) {
    reasons.push(`source_review_blocked:${blockingSourceWarnings.length}`);
    return { status: "BLOCKED", reasons };
  }

  // NEEDS_REVISION
  if (reviewStatus === "needs_revision") {
    reasons.push(`review_status=${reviewStatus}`);
  }
  if (criticalProblems.length > 0) {
    reasons.push(`review_critical_problems:${criticalProblems.length}`);
  }
  if (input.consistency && !input.consistency.ready) {
    for (const c of input.consistency.criticalFailed ?? []) {
      reasons.push(`quality_gate_fail:${c.id}`);
    }
    if (reasons.length === 0 && input.consistency.blockReason) {
      reasons.push(input.consistency.blockReason);
    }
  }
  if (reasons.length > 0) {
    return { status: "NEEDS_REVISION", reasons };
  }

  // READY_WITH_WARNINGS
  const warnings = input.consistency?.warningsFailed ?? [];
  if (warnings.length > 0 || problems.length > 0 || (input.sourceWarnings ?? []).length > 0) {
    if (warnings.length > 0) reasons.push(`quality_warnings:${warnings.length}`);
    if (problems.length > 0) reasons.push(`review_warnings:${problems.length}`);
    return { status: "READY_WITH_WARNINGS", reasons };
  }

  return { status: "READY", reasons };
}
