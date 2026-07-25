import { CANONICAL_RELATIONS_FEATURE_FLAGS } from "./constants.ts";
import type { CanonicalRelationsFeatureFlags } from "./types.ts";

export type EnvironmentReader = (name: string) => string | undefined;

const disabledFlags: CanonicalRelationsFeatureFlags = Object.freeze({
  shadow: false,
  analytics: false,
  generator: false,
  reviewer: false,
});

/** Returns a new all-disabled snapshot, the safe default for this rollout. */
export function defaultCanonicalRelationsFeatureFlags(): CanonicalRelationsFeatureFlags {
  return { ...disabledFlags };
}

/** A flag is enabled only by the unambiguous value `true` (case-insensitive). */
export function readCanonicalRelationsFeatureFlags(
  readEnvironment: EnvironmentReader = () => undefined,
): CanonicalRelationsFeatureFlags {
  const enabled = (name: string): boolean => readEnvironment(name)?.trim().toLowerCase() === "true";

  return {
    shadow: enabled(CANONICAL_RELATIONS_FEATURE_FLAGS.shadow),
    analytics: enabled(CANONICAL_RELATIONS_FEATURE_FLAGS.analytics),
    generator: enabled(CANONICAL_RELATIONS_FEATURE_FLAGS.generator),
    reviewer: enabled(CANONICAL_RELATIONS_FEATURE_FLAGS.reviewer),
  };
}
