import type { CanonicalRelation } from "./canonical-relations/index.ts";

export type CanonicalShadowParityReason =
  | "ordered_mismatch"
  | "duplicate_mismatch"
  | "coverage_mismatch"
  | "identity_mismatch"
  | "reverse_index_mismatch"
  | "per_conclusion_mismatch";

export interface CanonicalShadowParityResult {
  readonly outcome: "match" | "mismatch";
  readonly reasons: readonly CanonicalShadowParityReason[];
  readonly orderedEquality: boolean;
  readonly duplicateEquality: boolean;
  readonly coverageEquality: boolean;
  readonly identityEquality: boolean;
  readonly reverseIndexEquality: boolean;
  readonly perConclusionEquality: boolean;
  readonly legacyClaimCount: number;
  readonly legacyRelationCount: number;
  readonly legacyUniqueRelationCount: number;
}

const provenanceKeys = [
  "laws_used",
  "court_practice_used",
  "letters_used",
  "ekaterina_used",
  "manuals_used",
] as const;
const tuple = (relation: CanonicalRelation) =>
  JSON.stringify([relation.sourceEntityId, relation.targetEntityId, relation.kind]);
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Replays the legacy projection without normalizing, sorting, or deduplicating it. */
export function projectLegacyCanonicalRelations(
  conclusions: readonly unknown[],
  trustedSources: readonly unknown[],
): { readonly claims: number; readonly relations: readonly CanonicalRelation[] } {
  const knownSources = new Set(
    trustedSources.flatMap((value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const ref = (value as Record<string, unknown>).source_ref;
        return typeof ref === "string" && ref !== "" ? [ref] : [];
      }
      return [];
    }),
  );
  const relations: CanonicalRelation[] = [];
  let claims = 0;
  for (const value of conclusions) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const conclusion = value as Record<string, unknown>;
    const provenance = conclusion.provenance;
    if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) continue;
    for (const key of provenanceKeys) {
      const refs = (provenance as Record<string, unknown>)[key];
      if (!Array.isArray(refs)) continue;
      for (const ref of refs) {
        claims += 1;
        if (
          typeof conclusion.conclusion_id === "string" &&
          conclusion.conclusion_id !== "" &&
          typeof ref === "string" &&
          knownSources.has(ref)
        ) {
          relations.push({
            sourceEntityId: conclusion.conclusion_id,
            targetEntityId: ref,
            kind: "uses-source",
          });
        }
      }
    }
  }
  return { claims, relations };
}

function multiplicities(relations: readonly CanonicalRelation[]) {
  const counts: Record<string, number> = {};
  for (const relation of relations) counts[tuple(relation)] = (counts[tuple(relation)] ?? 0) + 1;
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .sort();
}

function index(relations: readonly CanonicalRelation[], key: "sourceEntityId" | "targetEntityId") {
  const result: Record<string, string[]> = {};
  for (const relation of relations) {
    (result[relation[key]] ??= []).push(
      key === "sourceEntityId" ? relation.targetEntityId : relation.sourceEntityId,
    );
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

export function compareCanonicalShadowParity(input: {
  readonly conclusions: readonly unknown[];
  readonly trustedSources: readonly unknown[];
  readonly canonicalRelations: readonly CanonicalRelation[];
}): CanonicalShadowParityResult {
  const legacy = projectLegacyCanonicalRelations(input.conclusions, input.trustedSources);
  const canonical = input.canonicalRelations;
  const orderedEquality = equal(legacy.relations.map(tuple), canonical.map(tuple));
  const duplicateEquality = equal(multiplicities(legacy.relations), multiplicities(canonical));
  const identityEquality = equal(
    [...new Set(legacy.relations.map(tuple))].sort(),
    [...new Set(canonical.map(tuple))].sort(),
  );
  const perConclusionEquality = equal(
    index(legacy.relations, "sourceEntityId"),
    index(canonical, "sourceEntityId"),
  );
  const reverseIndexEquality = equal(
    index(legacy.relations, "targetEntityId"),
    index(canonical, "targetEntityId"),
  );
  const coverageEquality =
    legacy.relations.length === canonical.length &&
    Object.keys(index(legacy.relations, "sourceEntityId")).length ===
      Object.keys(index(canonical, "sourceEntityId")).length;
  const checks: Array<[boolean, CanonicalShadowParityReason]> = [
    [orderedEquality, "ordered_mismatch"],
    [duplicateEquality, "duplicate_mismatch"],
    [coverageEquality, "coverage_mismatch"],
    [identityEquality, "identity_mismatch"],
    [reverseIndexEquality, "reverse_index_mismatch"],
    [perConclusionEquality, "per_conclusion_mismatch"],
  ];
  const reasons = checks.filter(([matches]) => !matches).map(([, reason]) => reason);
  return {
    outcome: reasons.length === 0 ? "match" : "mismatch",
    reasons,
    orderedEquality,
    duplicateEquality,
    coverageEquality,
    identityEquality,
    reverseIndexEquality,
    perConclusionEquality,
    legacyClaimCount: legacy.claims,
    legacyRelationCount: legacy.relations.length,
    legacyUniqueRelationCount: new Set(legacy.relations.map(tuple)).size,
  };
}
