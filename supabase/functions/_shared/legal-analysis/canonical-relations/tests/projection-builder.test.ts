import { expect, test } from "bun:test";
import { isCanonicalRelation, projectUsageClaims, USAGE_RELATION_KIND } from "../index.ts";

const conclusions = [{ conclusion_id: "conclusion:first" }, { conclusion_id: "conclusion:second" }];
const trustedSources = [{ source_ref: "law:first" }, { source_ref: "law:second" }];

test("projects a valid claim from conclusion_id to source_ref with the fixed kind", () => {
  expect(
    projectUsageClaims({
      claims: [{ conclusionIndex: 0, sourceId: "law:first" }],
      conclusions,
      trustedSources,
    }),
  ).toEqual([
    {
      sourceEntityId: "conclusion:first",
      targetEntityId: "law:first",
      kind: "uses-source",
    },
  ]);
  expect(USAGE_RELATION_KIND).toBe("uses-source");
});

test("projects multiple conclusions in successful claim order", () => {
  expect(
    projectUsageClaims({
      claims: [
        { conclusionIndex: 1, sourceId: "law:second" },
        { conclusionIndex: 0, sourceId: "law:first" },
      ],
      conclusions,
      trustedSources,
    }),
  ).toEqual([
    {
      sourceEntityId: "conclusion:second",
      targetEntityId: "law:second",
      kind: "uses-source",
    },
    {
      sourceEntityId: "conclusion:first",
      targetEntityId: "law:first",
      kind: "uses-source",
    },
  ]);
});

test("preserves repeated claims as repeated relations", () => {
  const claim = { conclusionIndex: 0, sourceId: "law:first" };
  const relations = projectUsageClaims({
    claims: [claim, claim],
    conclusions,
    trustedSources,
  });

  expect(relations).toHaveLength(2);
  expect(relations[0]).toEqual(relations[1]);
});

test("skips unresolved sources and continues processing", () => {
  expect(
    projectUsageClaims({
      claims: [
        { conclusionIndex: 0, sourceId: "law:missing" },
        { conclusionIndex: 1, sourceId: "law:second" },
      ],
      conclusions,
      trustedSources,
    }),
  ).toEqual([
    {
      sourceEntityId: "conclusion:second",
      targetEntityId: "law:second",
      kind: "uses-source",
    },
  ]);
});

test("does not fall back to source_id", () => {
  expect(
    projectUsageClaims({
      claims: [{ conclusionIndex: 0, sourceId: "raw-id" }],
      conclusions,
      trustedSources: [{ source_ref: "law:correct", source_id: "raw-id" }],
    }),
  ).toEqual([]);
});

test("source matching remains exact, case-sensitive, and untrimmed", () => {
  expect(
    projectUsageClaims({
      claims: [
        { conclusionIndex: 0, sourceId: "LAW:FIRST" },
        { conclusionIndex: 0, sourceId: " law:first " },
      ],
      conclusions,
      trustedSources,
    }),
  ).toEqual([]);
});

test.each([-1, 0.5, NaN, Infinity, -Infinity, 2])(
  "skips invalid conclusion index %s",
  (conclusionIndex) => {
    expect(
      projectUsageClaims({
        claims: [{ conclusionIndex, sourceId: "law:first" }],
        conclusions,
        trustedSources,
      }),
    ).toEqual([]);
  },
);

test.each([[null], [42], ["conclusion"], [[]], [undefined]])(
  "skips a non-object conclusion identity %#",
  (conclusion) => {
    expect(
      projectUsageClaims({
        claims: [{ conclusionIndex: 0, sourceId: "law:first" }],
        conclusions: [conclusion],
        trustedSources,
      }),
    ).toEqual([]);
  },
);

test.each([
  {},
  { conclusion_id: 1 },
  { conclusion_id: null },
  { conclusion_id: {} },
  { conclusion_id: "" },
])("skips an invalid conclusion_id %#", (conclusion) => {
  expect(
    projectUsageClaims({
      claims: [{ conclusionIndex: 0, sourceId: "law:first" }],
      conclusions: [conclusion],
      trustedSources,
    }),
  ).toEqual([]);
});

test("skips whitespace-only conclusion IDs", () => {
  expect(
    projectUsageClaims({
      claims: [{ conclusionIndex: 0, sourceId: "law:first" }],
      conclusions: [{ conclusion_id: "   " }],
      trustedSources,
    }),
  ).toEqual([]);
});

test("never substitutes an array position or generates a missing conclusion ID", () => {
  expect(
    projectUsageClaims({
      claims: [
        { conclusionIndex: 0, sourceId: "law:first" },
        { conclusionIndex: 1, sourceId: "law:second" },
      ],
      conclusions: [{}, { conclusion_id: "existing-id" }],
      trustedSources,
    }),
  ).toEqual([
    {
      sourceEntityId: "existing-id",
      targetEntityId: "law:second",
      kind: "uses-source",
    },
  ]);
});

test("additional source fields do not affect projection", () => {
  expect(
    projectUsageClaims({
      claims: [{ conclusionIndex: 0, sourceId: "law:first" }],
      conclusions,
      trustedSources: [{ source_ref: "law:first", title: "Title", source_id: "row-1" }],
    }),
  ).toEqual([
    {
      sourceEntityId: "conclusion:first",
      targetEntityId: "law:first",
      kind: "uses-source",
    },
  ]);
});

test("duplicate source refs fail closed instead of depending on array order", () => {
  expect(() =>
    projectUsageClaims({
      claims: [{ conclusionIndex: 0, sourceId: "law:first" }],
      conclusions,
      trustedSources: [{ source_ref: "law:first" }, { source_ref: "law:first" }],
    }),
  ).toThrow("invalid_or_duplicate_source_ref");
});

test.each(["", "   "])("invalid source_ref %p fails closed", (sourceRef) => {
  expect(() =>
    projectUsageClaims({
      claims: [],
      conclusions,
      trustedSources: [{ source_ref: sourceRef }],
    }),
  ).toThrow("invalid_or_duplicate_source_ref");
});

test("ignores supportLevel and emits only canonical relation fields", () => {
  const relations = projectUsageClaims({
    claims: [
      { conclusionIndex: 0, sourceId: "law:first", supportLevel: "full" },
      { conclusionIndex: 1, sourceId: "law:second", supportLevel: "partial" },
    ],
    conclusions,
    trustedSources,
  });

  expect(relations.map((relation) => relation.kind)).toEqual(["uses-source", "uses-source"]);
  expect(Object.keys(relations[0])).toEqual(["sourceEntityId", "targetEntityId", "kind"]);
  expect(relations.every(isCanonicalRelation)).toBe(true);
});

test("does not mutate frozen inputs or clone consumer claim and source objects", () => {
  const claim = Object.freeze({ conclusionIndex: 0, sourceId: "law:first" });
  const conclusion = Object.freeze({ conclusion_id: "conclusion:first" });
  const source = Object.freeze({ source_ref: "law:first", title: "Title" });
  const claims = Object.freeze([claim]);
  const frozenConclusions = Object.freeze([conclusion]);
  const sources = Object.freeze([source]);
  const input = Object.freeze({ claims, conclusions: frozenConclusions, trustedSources: sources });

  expect(projectUsageClaims(input)).toHaveLength(1);
  expect(input.claims[0]).toBe(claim);
  expect(input.conclusions[0]).toBe(conclusion);
  expect(input.trustedSources[0]).toBe(source);
  expect(source).toEqual({ source_ref: "law:first", title: "Title" });
});

test("returns an empty array for empty claims", () => {
  expect(projectUsageClaims({ claims: [], conclusions, trustedSources })).toEqual([]);
});

test("returns an empty array for empty conclusions", () => {
  expect(
    projectUsageClaims({
      claims: [{ conclusionIndex: 0, sourceId: "law:first" }],
      conclusions: [],
      trustedSources,
    }),
  ).toEqual([]);
});

test("returns an empty array for empty trusted sources", () => {
  expect(
    projectUsageClaims({
      claims: [{ conclusionIndex: 0, sourceId: "law:first" }],
      conclusions,
      trustedSources: [],
    }),
  ).toEqual([]);
});
