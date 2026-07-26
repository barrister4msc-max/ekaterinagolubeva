# Canonical relations shared infrastructure

This dependency-free module contains the small contracts used to describe canonical
entities and their directed relations, an opt-in feature flag, and deterministic JSON
serialization. It deliberately performs no producer, generator, reviewer, database, or
other runtime integration.

## Usage claims

`extractUsageClaims` projects source-reference strings from each conclusion's
`provenance.laws_used`, `court_practice_used`, `letters_used`, `ekaterina_used`, and
`manuals_used` arrays, in that order, into a flat list containing the conclusion index
and source ID. It preserves conclusion, category, and source order (including repeated
references) and performs no ID generation, validation, deduplication, sorting,
persistence, or runtime wiring.

## Structured analysis result

`createStructuredAnalysisResult` is a pure contract constructor for pairing an exact
legacy analysis snapshot with a `CanonicalRelationSet`. Callers must supply the schema
version, identifiers, and timestamp. The constructor creates fresh top-level, legacy,
and canonical containers while preserving all nested value references; it performs no
generation, validation, deep cloning, persistence, or runtime wiring.

## Feature flag

`CANONICAL_RELATIONS_ENABLED` is disabled unless its trimmed, case-insensitive value is
exactly `true`. `readCanonicalRelationsFeatureFlags` accepts an environment reader so
callers and tests do not depend on a particular runtime.

## Stable JSON

`stableJsonStringify` sorts object keys recursively while retaining array order. It
rejects circular references and values JSON cannot represent consistently, rather than
allowing native `JSON.stringify` to omit or coerce them. Shared (non-circular) object
references are supported.
