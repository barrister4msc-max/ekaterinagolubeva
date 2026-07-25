# Canonical relations shared infrastructure

This module is the dependency-free foundation for the canonical-relations rollout.
It currently provides feature-flag snapshots, common types and errors, and
deterministic JSON serialization. It does not integrate with Producer, Generator,
or Reviewer.

## Feature flags

All flags are disabled unless their environment value is exactly `true`
(ignoring case and surrounding whitespace):

- `CANONICAL_RELATIONS_SHADOW`
- `CANONICAL_RELATIONS_ANALYTICS`
- `CANONICAL_RELATIONS_GENERATOR`
- `CANONICAL_RELATIONS_REVIEWER`

Pass an environment reader to `readCanonicalRelationsFeatureFlags`. Keeping the
reader injectable makes flag evaluation runtime-neutral and straightforward to
test.

## Stable JSON

`stableJsonStringify` recursively sorts object keys while preserving array order.
It rejects circular references, non-finite numbers, and `bigint` values with a
`StableJsonError`.

## Canonical types

PR-1 defines only minimal entity and relation infrastructure.
CanonicalRelationKind intentionally remains an open string type.
The final legal-reasoning vocabulary will be introduced later
strictly from the approved CDM-1/RRM-1 contract.

## Structured analysis result

PR-2A introduces the versioned StructuredAnalysisResult contract.
It separates the existing Producer legacy snapshot from the future
canonical relation payload.

This PR does not connect the contract to Producer, Generator, or Reviewer.
Runtime adoption is deferred to later migration PRs.
