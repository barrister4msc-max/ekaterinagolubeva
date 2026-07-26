import { expect, test } from "bun:test";
import type {
  CanonicalEntity,
  CanonicalRelation,
  CanonicalRelationKind,
  CanonicalRelationSet,
} from "../index.ts";

test("minimal canonical contracts accept open relation kinds", () => {
  const entity: CanonicalEntity = { id: "fact:1", type: "fact" };
  const customKind: CanonicalRelationKind = "consumer-defined-kind";
  const relation: CanonicalRelation = {
    sourceEntityId: entity.id,
    targetEntityId: "document:1",
    kind: customKind,
  };

  expect(relation.kind).toBe("consumer-defined-kind");
});

test("CanonicalRelationSet accepts a readonly CanonicalRelation array", () => {
  const relation: CanonicalRelation = {
    sourceEntityId: "fact:1",
    targetEntityId: "document:1",
    kind: "supported-by",
  };
  const relations = [relation] as const satisfies CanonicalRelationSet;

  expect(relations[0]).toBe(relation);
});
