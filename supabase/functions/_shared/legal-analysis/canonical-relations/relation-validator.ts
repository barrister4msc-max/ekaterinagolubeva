import { USAGE_RELATION_KIND } from "./projection-builder.ts";
import { stableJsonStringify } from "./stable-json.ts";
import type { CanonicalRelation } from "./types.ts";

export function isCanonicalRelation(value: unknown): value is CanonicalRelation {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const relation = value as Record<string, unknown>;

  return (
    typeof relation.sourceEntityId === "string" &&
    typeof relation.targetEntityId === "string" &&
    typeof relation.kind === "string"
  );
}

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** Strict validator for the v2 conclusion -> source shadow relation. */
export function isCanonicalUsageRelation(value: unknown): value is CanonicalRelation {
  if (!isCanonicalRelation(value)) return false;
  return (
    isNonBlankString(value.sourceEntityId) &&
    isNonBlankString(value.targetEntityId) &&
    value.kind === USAGE_RELATION_KIND
  );
}

/** Stable, field-name-aware key used for duplicate and parity comparisons. */
export function canonicalUsageRelationKey(relation: CanonicalRelation): string {
  return stableJsonStringify({
    kind: relation.kind,
    sourceEntityId: relation.sourceEntityId,
    targetEntityId: relation.targetEntityId,
  });
}

/**
 * Validates the v2 relation shape and both endpoints against the exact
 * generator-facing entity universes. The original array/order/duplicates are
 * preserved; undefined means fail closed.
 */
export function validateCanonicalUsageRelations(input: {
  readonly relations: readonly unknown[];
  readonly eligibleConclusionIds: ReadonlySet<string>;
  readonly trustedSourceRefs: ReadonlySet<string>;
}): readonly CanonicalRelation[] | undefined {
  const output: CanonicalRelation[] = [];
  for (const value of input.relations) {
    if (!isCanonicalUsageRelation(value)) return undefined;
    if (!input.eligibleConclusionIds.has(value.sourceEntityId)) return undefined;
    if (!input.trustedSourceRefs.has(value.targetEntityId)) return undefined;
    output.push(value);
  }
  return output;
}
