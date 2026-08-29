export type ReviewOutcome = Record<string, unknown> & {
  review_status?: unknown;
  ready_for_client?: unknown;
  can_be_sent_as_final?: unknown;
  problems?: unknown;
};

export type ReviewReadinessContext = {
  requiresParagraphProvenance?: boolean;
  paragraphProvenance?: unknown;
};

const PARAGRAPH_PROVENANCE_GAP = {
  type: "missing_information",
  severity: "high",
  text_fragment: "",
  problem: "Обязательная трассировка paragraph_provenance отсутствует, пуста или структурно неполна.",
  recommendation: "Восстановить structurally complete paragraph provenance до финального согласования документа.",
} as const;

const PARAGRAPH_PROVENANCE_ARRAY_FIELDS = [
  "used_arguments",
  "used_conclusions",
  "used_facts",
  "used_documents",
  "used_sources",
] as const;

function isStructurallyCompleteParagraphProvenanceItem(item: unknown): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;

  const record = item as Record<string, unknown>;
  if (typeof record.paragraph_id !== "string" || record.paragraph_id.trim().length === 0) return false;
  if (typeof record.text_preview !== "string" || record.text_preview.trim().length === 0) return false;
  if (typeof record.used_strategy_id !== "string") return false;

  return PARAGRAPH_PROVENANCE_ARRAY_FIELDS.every((field) => Array.isArray(record[field]));
}

function hasStructurallyCompleteParagraphProvenance(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isStructurallyCompleteParagraphProvenanceItem)
  );
}

/**
 * Deterministic fail-closed reconciliation for the existing Reviewer contract.
 * Critical findings cannot coexist with a successful/final review projection.
 * A substantive generated document without structurally complete mandatory paragraph provenance
 * may remain a draft, but cannot retain a successful/final readiness projection.
 */
export function normalizeReviewOutcome(
  input: unknown,
  context: ReviewReadinessContext = {},
): ReviewOutcome {
  const review: ReviewOutcome =
    input && typeof input === "object" && !Array.isArray(input)
      ? { ...(input as Record<string, unknown>) }
      : {};

  const problems = Array.isArray(review.problems) ? review.problems : [];
  const hasCriticalFinding = problems.some((problem) => {
    if (!problem || typeof problem !== "object" || Array.isArray(problem)) return false;
    return (problem as Record<string, unknown>).severity === "critical";
  });

  if (hasCriticalFinding) {
    return {
      ...review,
      review_status: "blocked",
      ready_for_client: false,
      can_be_sent_as_final: false,
    };
  }

  const hasParagraphProvenance = hasStructurallyCompleteParagraphProvenance(
    context.paragraphProvenance,
  );
  const paragraphProvenanceMissingOrIncomplete =
    context.requiresParagraphProvenance === true && !hasParagraphProvenance;

  if (!paragraphProvenanceMissingOrIncomplete) return review;

  const alreadyReported = problems.some((problem) => {
    if (!problem || typeof problem !== "object" || Array.isArray(problem)) return false;
    return (problem as Record<string, unknown>).problem === PARAGRAPH_PROVENANCE_GAP.problem;
  });

  return {
    ...review,
    review_status:
      review.review_status === "passed" ? "needs_revision" : review.review_status,
    ready_for_client: false,
    can_be_sent_as_final: false,
    problems: alreadyReported ? problems : [...problems, PARAGRAPH_PROVENANCE_GAP],
  };
}
