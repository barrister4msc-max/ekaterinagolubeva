import { expect, test } from "bun:test";
import type {
  CanonicalRelation,
  CanonicalRelationSet,
  CanonicalRelationsFeatureFlags,
  JsonValue,
} from "../types.ts";

test("public data types describe feature snapshots and JSON values", () => {
  const flags: CanonicalRelationsFeatureFlags = {
    shadow: false,
    analytics: false,
    generator: false,
    reviewer: false,
  };
  const value: JsonValue = { flags: [flags.shadow, flags.reviewer], count: 2 };

  expect(value).toEqual({ flags: [false, false], count: 2 });
});

test("canonical relations support an open string relation kind", () => {
  const relation: CanonicalRelation<"SOURCE_SUPPORTS_ARGUMENT"> = {
    relation_id: "relation-1",
    relation_kind: "SOURCE_SUPPORTS_ARGUMENT",
    from: {
      kind: "legal_source",
      id: "source-1",
    },
    to: {
      kind: "conclusion",
      id: "conclusion-1",
    },
    source_ref: "source-1",
    metadata: {},
  };

  const relationSet: CanonicalRelationSet<"SOURCE_SUPPORTS_ARGUMENT"> = {
    schema_version: "1.0.0",
    relations: [relation],
  };

  expect(relationSet.relations.length).toBe(1);
  expect(relationSet.relations[0]?.relation_kind).toBe("SOURCE_SUPPORTS_ARGUMENT");
});
