import { describe, expect, test } from "bun:test";
import {
  compareCanonicalShadowParity,
  projectLegacyCanonicalRelations,
} from "../canonical-shadow-parity.ts";

const conclusions = (refs: string[][] = [["s1"], ["s2"]]) =>
  refs.map((laws_used, index) => ({ conclusion_id: `c${index + 1}`, provenance: { laws_used } }));
const sources = [{ source_ref: "s1" }, { source_ref: "s2" }];
const relation = (sourceEntityId: string, targetEntityId: string) => ({
  sourceEntityId,
  targetEntityId,
  kind: "uses-source",
});
const compare = (canonicalRelations: ReturnType<typeof relation>[], legacy = conclusions()) =>
  compareCanonicalShadowParity({
    conclusions: legacy,
    trustedSources: sources,
    canonicalRelations,
  });

describe("canonical shadow parity", () => {
  test("matches exact ordered relations", () =>
    expect(compare([relation("c1", "s1"), relation("c2", "s2")])).toMatchObject({
      outcome: "match",
      reasons: [],
      orderedEquality: true,
    }));
  test("reports ordered mismatch", () =>
    expect(compare([relation("c2", "s2"), relation("c1", "s1")]).reasons).toContain(
      "ordered_mismatch",
    ));
  test("reports duplicate mismatch", () =>
    expect(compare([relation("c1", "s1")], conclusions([["s1", "s1"]]))).toMatchObject({
      duplicateEquality: false,
      coverageEquality: false,
    }));
  test("reports coverage mismatch", () =>
    expect(compare([relation("c1", "s1")])).toMatchObject({ coverageEquality: false }));
  test("reports identity mismatch even at equal aggregate count", () =>
    expect(compare([relation("c1", "s2"), relation("c2", "s1")])).toMatchObject({
      identityEquality: false,
    }));
  test("reports reverse index mismatch", () =>
    expect(compare([relation("c2", "s1"), relation("c1", "s2")])).toMatchObject({
      reverseIndexEquality: false,
    }));
  test("zero claims have parity", () =>
    expect(
      compareCanonicalShadowParity({ conclusions: [], trustedSources: [], canonicalRelations: [] }),
    ).toMatchObject({ outcome: "match", legacyClaimCount: 0 }));
  test("legacy projection counts unresolved claims but emits only resolved relations", () =>
    expect(projectLegacyCanonicalRelations(conclusions([["missing"]]), sources)).toEqual({
      claims: 1,
      relations: [],
    }));
});
