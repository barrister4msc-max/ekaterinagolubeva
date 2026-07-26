import { expect, test } from "bun:test";
import { extractUsageClaims } from "../index.ts";

test("returns no claims for empty input", () => {
  expect(extractUsageClaims([])).toEqual([]);
});

test("returns no claims when provenance is missing", () => {
  expect(extractUsageClaims([{ statement: "No provenance" }])).toEqual([]);
});

test("extracts one source from laws_used", () => {
  expect(
    extractUsageClaims([{ provenance: { laws_used: ["law:1"] } }]),
  ).toEqual([{ conclusionIndex: 0, sourceId: "law:1" }]);
});

test("flattens all provenance arrays in the required category order", () => {
  expect(
    extractUsageClaims([
      {
        provenance: {
          laws_used: ["law:1"],
          court_practice_used: ["court:1"],
          letters_used: ["letter:1"],
          ekaterina_used: ["ekaterina:1"],
          manuals_used: ["manual:1"],
        },
      },
    ]),
  ).toEqual([
    { conclusionIndex: 0, sourceId: "law:1" },
    { conclusionIndex: 0, sourceId: "court:1" },
    { conclusionIndex: 0, sourceId: "letter:1" },
    { conclusionIndex: 0, sourceId: "ekaterina:1" },
    { conclusionIndex: 0, sourceId: "manual:1" },
  ]);
});

test("preserves conclusion order", () => {
  expect(
    extractUsageClaims([
      { provenance: { manuals_used: ["manual:first"] } },
      { provenance: { laws_used: ["law:second"] } },
    ]),
  ).toEqual([
    { conclusionIndex: 0, sourceId: "manual:first" },
    { conclusionIndex: 1, sourceId: "law:second" },
  ]);
});

test("preserves source order within arrays", () => {
  expect(
    extractUsageClaims([
      { provenance: { laws_used: ["law:b", "law:a", "law:c"] } },
    ]),
  ).toEqual([
    { conclusionIndex: 0, sourceId: "law:b" },
    { conclusionIndex: 0, sourceId: "law:a" },
    { conclusionIndex: 0, sourceId: "law:c" },
  ]);
});

test("preserves repeated source refs", () => {
  expect(
    extractUsageClaims([
      {
        provenance: {
          laws_used: ["source:repeated", "source:repeated"],
          letters_used: ["source:repeated"],
        },
      },
    ]),
  ).toEqual([
    { conclusionIndex: 0, sourceId: "source:repeated" },
    { conclusionIndex: 0, sourceId: "source:repeated" },
    { conclusionIndex: 0, sourceId: "source:repeated" },
  ]);
});

test("omits supportLevel from every claim", () => {
  const claims = extractUsageClaims([
    {
      provenance: {
        laws_used: ["law:1"],
        court_practice_used: ["court:1"],
      },
    },
  ]);

  expect(claims.every((claim) => !("supportLevel" in claim))).toBe(true);
});

test("does not mutate frozen input", () => {
  const lawsUsed = Object.freeze(["law:1", "law:2"]);
  const provenance = Object.freeze({ laws_used: lawsUsed });
  const conclusion = Object.freeze({ provenance });
  const conclusions = Object.freeze([conclusion]);

  extractUsageClaims(conclusions);

  expect(conclusions[0]).toBe(conclusion);
  expect(conclusion.provenance).toBe(provenance);
  expect(provenance.laws_used).toBe(lawsUsed);
  expect(lawsUsed).toEqual(["law:1", "law:2"]);
});

test("ignores an unverified source-reference object field", () => {
  expect(
    extractUsageClaims([
      { ["source" + "References"]: [{ sourceId: "invented-source" }] },
    ]),
  ).toEqual([]);
});
