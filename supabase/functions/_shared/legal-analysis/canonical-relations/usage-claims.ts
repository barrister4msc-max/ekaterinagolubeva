export interface UsageClaim {
  readonly conclusionIndex: number;
  readonly sourceId: string;
  readonly supportLevel?: string;
}

interface UsageClaimProvenance {
  readonly laws_used?: readonly string[];
  readonly court_practice_used?: readonly string[];
  readonly letters_used?: readonly string[];
  readonly ekaterina_used?: readonly string[];
  readonly manuals_used?: readonly string[];
}

interface UsageClaimConclusion {
  readonly provenance?: UsageClaimProvenance;
}

/**
 * Flattens the source references already attached to conclusion provenance.
 *
 * This is deliberately a projection only: it does not validate, normalize,
 * deduplicate, sort, or otherwise enrich the supplied analysis data.
 */
export function extractUsageClaims(
  conclusions: readonly unknown[],
): readonly UsageClaim[] {
  const claims: UsageClaim[] = [];

  conclusions.forEach((value, conclusionIndex) => {
    const conclusion = value as UsageClaimConclusion;
    const provenance = conclusion?.provenance;
    const sourceRefs = [
      ...(provenance?.laws_used ?? []),
      ...(provenance?.court_practice_used ?? []),
      ...(provenance?.letters_used ?? []),
      ...(provenance?.ekaterina_used ?? []),
      ...(provenance?.manuals_used ?? []),
    ];

    for (const sourceId of sourceRefs) {
      claims.push({
        conclusionIndex,
        sourceId,
      });
    }
  });

  return claims;
}
