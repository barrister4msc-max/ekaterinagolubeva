import type { CanonicalRelation } from "./types.ts";

export function isCanonicalRelation(
  value: unknown,
): value is CanonicalRelation {
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
