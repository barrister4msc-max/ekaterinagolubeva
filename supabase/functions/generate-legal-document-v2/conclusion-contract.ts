export type ConclusionLike = {
  provenance?: {
    use_in_generation?: boolean;
    needs_source?: boolean;
  } | null;
  [key: string]: unknown;
};

export type ConclusionSets = {
  generationConclusions: ConclusionLike[];
  blockedConclusions: ConclusionLike[];
};

/**
 * Selects the Analyzer -> Generator conclusion contract.
 * Explicit Analyzer arrays are authoritative. The legacy conclusions fallback
 * remains only for analysis runs created before those arrays existed.
 */
export function selectConclusionSets(
  legalAnalysis: Record<string, unknown> | null,
): ConclusionSets {
  const allConclusions = Array.isArray(legalAnalysis?.conclusions)
    ? (legalAnalysis.conclusions as ConclusionLike[])
    : [];

  const generationConclusions = Array.isArray(legalAnalysis?.generation_conclusions)
    ? (legalAnalysis.generation_conclusions as ConclusionLike[])
    : allConclusions.filter(
        (conclusion) =>
          conclusion?.provenance?.use_in_generation !== false &&
          conclusion?.provenance?.needs_source !== true,
      );

  const blockedConclusions = Array.isArray(legalAnalysis?.blocked_conclusions)
    ? (legalAnalysis.blocked_conclusions as ConclusionLike[])
    : allConclusions.filter(
        (conclusion) =>
          conclusion?.provenance?.use_in_generation === false ||
          conclusion?.provenance?.needs_source === true,
      );

  return { generationConclusions, blockedConclusions };
}
