/** Base error for failures in canonical-relations infrastructure. */
export class CanonicalRelationsError extends Error {
  override readonly name = "CanonicalRelationsError";
}

/** Thrown when a value cannot be represented as deterministic JSON. */
export class StableJsonError extends CanonicalRelationsError {
  override readonly name = "StableJsonError";
}
