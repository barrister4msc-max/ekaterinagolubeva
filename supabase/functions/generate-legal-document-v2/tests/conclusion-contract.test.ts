import { describe, expect, test } from "bun:test";
import { selectConclusionSets } from "../conclusion-contract.ts";

describe("Analyzer -> Generator conclusion contract", () => {
  test("uses explicit Analyzer arrays as the authoritative contract", () => {
    const generation = [{ conclusion_id: "allowed" }];
    const blocked = [{ conclusion_id: "blocked" }];
    const result = selectConclusionSets({
      conclusions: [{ conclusion_id: "legacy-only" }],
      generation_conclusions: generation,
      blocked_conclusions: blocked,
    });

    expect(result.generationConclusions).toBe(generation);
    expect(result.blockedConclusions).toBe(blocked);
  });

  test("legacy fallback excludes conclusions blocked by either provenance flag", () => {
    const allowed = { conclusion_id: "allowed", provenance: {} };
    const blockedByUse = {
      conclusion_id: "blocked-use",
      provenance: { use_in_generation: false },
    };
    const blockedBySource = {
      conclusion_id: "blocked-source",
      provenance: { needs_source: true },
    };
    const result = selectConclusionSets({
      conclusions: [allowed, blockedByUse, blockedBySource],
    });

    expect(result.generationConclusions).toEqual([allowed]);
    expect(result.blockedConclusions).toEqual([blockedByUse, blockedBySource]);
  });

  test("returns empty sets without a legal analysis payload", () => {
    expect(selectConclusionSets(null)).toEqual({
      generationConclusions: [],
      blockedConclusions: [],
    });
  });
});
