/** Environment-variable names controlling the canonical-relations rollout. */
export const CANONICAL_RELATIONS_FEATURE_FLAGS = {
  shadow: "CANONICAL_RELATIONS_SHADOW",
  analytics: "CANONICAL_RELATIONS_ANALYTICS",
  generator: "CANONICAL_RELATIONS_GENERATOR",
  reviewer: "CANONICAL_RELATIONS_REVIEWER",
} as const;

export type CanonicalRelationsFeature = keyof typeof CANONICAL_RELATIONS_FEATURE_FLAGS;
