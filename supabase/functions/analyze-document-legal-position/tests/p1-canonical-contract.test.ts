import { describe, expect, test } from "bun:test";
import {
  CANONICAL_CONSUMER_OBSERVER_VERSION,
  CANONICAL_SHADOW_SCHEMA_VERSION,
} from "../../_shared/legal-analysis/canonical-relations/index.ts";
import { CANONICAL_SHADOW_PERSISTENCE_SCHEMA_VERSION } from "../canonical-shadow-persistence.ts";
import { computeCanonicalRelationsShadow } from "../canonical-shadow.ts";

describe("P1 canonical generator-facing contract", () => {
  test("producer, reader, and observer share the v2 rollout versions", () => {
    expect(CANONICAL_SHADOW_SCHEMA_VERSION).toBe(2);
    expect(CANONICAL_SHADOW_PERSISTENCE_SCHEMA_VERSION).toBe(2);
    expect(CANONICAL_CONSUMER_OBSERVER_VERSION).toBe(2);
  });

  test("blocked conclusions are outside the projected generator scope", () => {
    const trustedSources = [{ source_ref: "source:allowed" }];
    const generationConclusions = [
      {
        conclusion_id: "conclusion:allowed",
        provenance: { laws_used: ["source:allowed"] },
      },
    ];
    const result = computeCanonicalRelationsShadow({
      enabled: true,
      conclusions: generationConclusions,
      trustedSources,
    });
    expect(result?.relations).toEqual([
      {
        sourceEntityId: "conclusion:allowed",
        targetEntityId: "source:allowed",
        kind: "uses-source",
      },
    ]);
  });

  test("Analyzer and Generator wire the observer to the same generation scope", async () => {
    const analyzer = await Bun.file(new URL("../index.ts", import.meta.url)).text();
    const generator = await Bun.file(
      new URL("../../generate-legal-document-v2/index.ts", import.meta.url),
    ).text();

    expect(analyzer).toContain("conclusions: generationConclusions");
    expect(analyzer).toContain("trustedSources: parsed.trusted_sources");
    expect(generator).toContain("conclusions: generationConclusions");
    expect(generator).toContain("analysisRunId: legal_analysis_run_id");
    expect(generator).toContain("payload.working_strategy ??");
    expect(generator).toContain("legalAnalysisObject?.working_strategy ??");
  });
});
