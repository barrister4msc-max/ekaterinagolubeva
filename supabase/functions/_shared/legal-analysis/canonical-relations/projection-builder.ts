import { resolveSourceIdentity, type TrustedSourceIdentity } from "./source-identity.ts";
import type { CanonicalRelation, CanonicalRelationSet } from "./types.ts";
import type { UsageClaim } from "./usage-claims.ts";

export const USAGE_RELATION_KIND = "uses-source";

export interface ConclusionIdentity {
  readonly conclusion_id?: unknown;
}

export interface UsageClaimProjectionInput<
  T extends TrustedSourceIdentity = TrustedSourceIdentity,
> {
  readonly claims: readonly UsageClaim[];
  readonly conclusions: readonly unknown[];
  readonly trustedSources: readonly T[];
}

export function projectUsageClaims<T extends TrustedSourceIdentity = TrustedSourceIdentity>(
  input: UsageClaimProjectionInput<T>,
): CanonicalRelationSet {
  const relations: CanonicalRelation[] = [];

  for (const claim of input.claims) {
    if (
      !Number.isInteger(claim.conclusionIndex) ||
      claim.conclusionIndex < 0 ||
      claim.conclusionIndex >= input.conclusions.length
    ) {
      continue;
    }

    const rawConclusion = input.conclusions[claim.conclusionIndex];

    if (
      rawConclusion === null ||
      typeof rawConclusion !== "object" ||
      Array.isArray(rawConclusion)
    ) {
      continue;
    }

    const conclusion = rawConclusion as ConclusionIdentity;

    if (typeof conclusion.conclusion_id !== "string" || conclusion.conclusion_id === "") {
      continue;
    }

    const resolved = resolveSourceIdentity(claim, input.trustedSources);

    if (resolved === undefined) {
      continue;
    }

    relations.push({
      sourceEntityId: conclusion.conclusion_id,
      targetEntityId: resolved.sourceId,
      kind: USAGE_RELATION_KIND,
    });
  }

  return relations;
}
