import { expect, test } from "bun:test";
import { isCanonicalRelation } from "../index.ts";

test("accepts a minimal valid relation", () => {
  expect(
    isCanonicalRelation({
      sourceEntityId: "fact:1",
      targetEntityId: "document:1",
      kind: "SUPPORTS",
    }),
  ).toBe(true);
});

test("accepts a consumer-defined relation kind", () => {
  expect(
    isCanonicalRelation({
      sourceEntityId: "fact:1",
      targetEntityId: "document:1",
      kind: "consumer-defined-kind",
    }),
  ).toBe(true);
});

test("accepts relation-kind strings without treating them as a closed allowlist", () => {
  const kinds = [
    "DIRECTLY_RECORDS",
    "SUPPORTS",
    "PARTIALLY_SUPPORTS",
    "MERELY_STATES",
    "CONTRADICTS",
    "consumer-defined-kind",
  ];

  for (const kind of kinds) {
    expect(
      isCanonicalRelation({
        sourceEntityId: "fact:1",
        targetEntityId: "document:1",
        kind,
      }),
    ).toBe(true);
  }
});

test("accepts an empty sourceEntityId", () => {
  expect(isCanonicalRelation({ sourceEntityId: "", targetEntityId: "target", kind: "kind" }))
    .toBe(true);
});

test("accepts an empty targetEntityId", () => {
  expect(isCanonicalRelation({ sourceEntityId: "source", targetEntityId: "", kind: "kind" }))
    .toBe(true);
});

test("accepts an empty kind", () => {
  expect(isCanonicalRelation({ sourceEntityId: "source", targetEntityId: "target", kind: "" }))
    .toBe(true);
});

test("accepts whitespace-only string fields", () => {
  expect(isCanonicalRelation({ sourceEntityId: " ", targetEntityId: "\t", kind: "\n" })).toBe(
    true,
  );
});

test("accepts identical source and target IDs", () => {
  expect(
    isCanonicalRelation({ sourceEntityId: "entity:1", targetEntityId: "entity:1", kind: "kind" }),
  ).toBe(true);
});

test("accepts additional properties", () => {
  expect(
    isCanonicalRelation({
      sourceEntityId: "source",
      targetEntityId: "target",
      kind: "kind",
      metadata: { consumer: true },
    }),
  ).toBe(true);
});

test("does not remove or modify additional properties", () => {
  const metadata = { consumer: true };
  const relation = {
    sourceEntityId: "source",
    targetEntityId: "target",
    kind: "kind",
    metadata,
  };

  expect(isCanonicalRelation(relation)).toBe(true);
  expect(relation.metadata).toBe(metadata);
  expect(relation).toEqual({
    sourceEntityId: "source",
    targetEntityId: "target",
    kind: "kind",
    metadata: { consumer: true },
  });
});

test("does not mutate a frozen valid object", () => {
  const relation = Object.freeze({
    sourceEntityId: " source ",
    targetEntityId: " target ",
    kind: " kind ",
  });

  expect(isCanonicalRelation(relation)).toBe(true);
  expect(relation).toEqual({
    sourceEntityId: " source ",
    targetEntityId: " target ",
    kind: " kind ",
  });
});

test("returns the same result on repeated calls", () => {
  const relation = { sourceEntityId: "source", targetEntityId: "target", kind: "kind" };

  expect(isCanonicalRelation(relation)).toBe(isCanonicalRelation(relation));
});

test("rejects undefined", () => {
  expect(isCanonicalRelation(undefined)).toBe(false);
});

test("rejects null", () => {
  expect(isCanonicalRelation(null)).toBe(false);
});

test("rejects strings", () => {
  expect(isCanonicalRelation("relation")).toBe(false);
});

test("rejects numbers", () => {
  expect(isCanonicalRelation(1)).toBe(false);
});

test("rejects booleans", () => {
  expect(isCanonicalRelation(true)).toBe(false);
});

test("rejects functions", () => {
  expect(isCanonicalRelation(() => undefined)).toBe(false);
});

test("rejects symbols", () => {
  expect(isCanonicalRelation(Symbol("relation"))).toBe(false);
});

test("rejects arrays", () => {
  expect(
    isCanonicalRelation(["sourceEntityId", "targetEntityId", "kind"]),
  ).toBe(false);
});

test("rejects an object missing sourceEntityId", () => {
  expect(isCanonicalRelation({ targetEntityId: "target", kind: "kind" })).toBe(false);
});

test("rejects an object missing targetEntityId", () => {
  expect(isCanonicalRelation({ sourceEntityId: "source", kind: "kind" })).toBe(false);
});

test("rejects an object missing kind", () => {
  expect(isCanonicalRelation({ sourceEntityId: "source", targetEntityId: "target" })).toBe(false);
});

test("rejects a non-string sourceEntityId", () => {
  expect(isCanonicalRelation({ sourceEntityId: 1, targetEntityId: "target", kind: "kind" }))
    .toBe(false);
});

test("rejects a non-string targetEntityId", () => {
  expect(isCanonicalRelation({ sourceEntityId: "source", targetEntityId: 1, kind: "kind" }))
    .toBe(false);
});

test("rejects a non-string kind", () => {
  expect(isCanonicalRelation({ sourceEntityId: "source", targetEntityId: "target", kind: 1 }))
    .toBe(false);
});
