# Canonical relations shared infrastructure

This dependency-free module contains the small contracts used to describe canonical
entities and their directed relations, an opt-in feature flag, and deterministic JSON
serialization. It deliberately performs no producer, generator, reviewer, database, or
other runtime integration.

## Feature flag

`CANONICAL_RELATIONS_ENABLED` is disabled unless its trimmed, case-insensitive value is
exactly `true`. `readCanonicalRelationsFeatureFlags` accepts an environment reader so
callers and tests do not depend on a particular runtime.

## Stable JSON

`stableJsonStringify` sorts object keys recursively while retaining array order. It
rejects circular references and values JSON cannot represent consistently, rather than
allowing native `JSON.stringify` to omit or coerce them. Shared (non-circular) object
references are supported.
