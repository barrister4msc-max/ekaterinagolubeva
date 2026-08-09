/** Environment variable controlling the opt-in canonical-relations feature. */
export const CANONICAL_RELATIONS_ENABLED_ENV = "CANONICAL_RELATIONS_ENABLED";

/**
 * Schema version for the generator-facing canonical shadow contract.
 *
 * Version 2 is scoped to generation_conclusions and the trusted sources that
 * are actually eligible for generation. Version 1 rows remain historical and
 * are intentionally rejected by the v2 reader.
 */
export const CANONICAL_SHADOW_SCHEMA_VERSION = 2;

/** Observer version used to isolate v2 rollout observations from old rows. */
export const CANONICAL_CONSUMER_OBSERVER_VERSION = 2;
