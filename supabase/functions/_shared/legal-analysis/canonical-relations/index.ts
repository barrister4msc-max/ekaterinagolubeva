export { CANONICAL_RELATIONS_FEATURE_FLAGS, type CanonicalRelationsFeature } from "./constants.ts";
export { CanonicalRelationsError, StableJsonError } from "./errors.ts";
export {
  defaultCanonicalRelationsFeatureFlags,
  type EnvironmentReader,
  readCanonicalRelationsFeatureFlags,
} from "./feature-flags.ts";
export {
  createStructuredAnalysisResult,
  STRUCTURED_ANALYSIS_RESULT_SCHEMA_VERSION,
  type CreateStructuredAnalysisResultInput,
  type StructuredAnalysisCanonicalPayload,
  type StructuredAnalysisLegacySnapshot,
  type StructuredAnalysisResult,
  type StructuredAnalysisResultSchemaVersion,
} from "./result.ts";
export { stableJsonStringify } from "./stable-json.ts";
export type {
  CanonicalEntityId,
  CanonicalEntityKind,
  CanonicalEntityRef,
  CanonicalRelation,
  CanonicalRelationKind,
  CanonicalRelationSet,
  CanonicalRelationsFeatureFlags,
  JsonPrimitive,
  JsonValue,
} from "./types.ts";
