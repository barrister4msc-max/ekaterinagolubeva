import { describe, expect, test } from "bun:test";
import {
  buildGeneratorPromptInputs,
  selectConclusionSets,
} from "../conclusion-contract.ts";

describe("Analyzer -> Generator conclusion contract", () => {
  test("uses explicit Analyzer arrays as the authoritative contract", () => {
    const generation = [{ conclusion_id: "allowed" }];
    const blocked = [{ conclusion_id: "blocked" }];
    const result = selectConclusionSets({
      conclusions: [{ conclusion_id: "legacy-only" }],
      generation_conclusions: generation,
      blocked_conclusions: blocked,
    });

    expect(result.generationConclusions).toEqual(generation);
    expect(result.blockedConclusions).toEqual(blocked);
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

  test("revalidates an explicitly allowed conclusion at the generator boundary", () => {
    const blocked = {
      conclusion_id: "blocked-in-wrong-array",
      provenance: { use_in_generation: false },
    };
    const result = selectConclusionSets({ generation_conclusions: [blocked] });

    expect(result.generationConclusions).toEqual([]);
    expect(result.blockedConclusions).toEqual([blocked]);
  });

  test("explicit blocked membership wins over a conflicting allowed array", () => {
    const allowedCopy = {
      conclusion_id: "same",
      provenance: { use_in_generation: true },
    };
    const blockedCopy = {
      conclusion_id: "same",
      provenance: { use_in_generation: false },
    };
    const result = selectConclusionSets({
      generation_conclusions: [allowedCopy],
      blocked_conclusions: [blockedCopy],
    });

    expect(result.generationConclusions).toEqual([]);
    expect(result.blockedConclusions).toEqual([blockedCopy]);
  });

  test("removes blocked narrative from the exact model-facing context", () => {
    const blockedText = "BLOCKED_SENTINEL_MUST_NOT_REACH_PROMPT";
    const allowed = {
      conclusion_id: "allowed",
      statement: "Допустимый вывод",
      provenance: { use_in_generation: true, needs_source: false },
    };
    const blocked = {
      conclusion_id: "blocked",
      statement: blockedText,
      provenance: { use_in_generation: false, needs_source: true },
    };
    const result = buildGeneratorPromptInputs({
      facts: ["Подтверждённый факт"],
      main_legal_position: blockedText,
      legal_qualification: blockedText,
      recommendations: [blockedText],
      generation_instructions: [blockedText],
      applicable_laws: [{ title: blockedText }],
      facts_index: [{ fact_id: "blocked-fact", fact_text: blockedText }],
      evidence_matrix: [{ fact_id: "blocked-fact", fact_text: blockedText }],
      source_warnings: [{ message: blockedText }],
      generation_allowed: { draft: true, final: false, reasons: [blockedText] },
      source_sufficiency: { status: "partial", gaps: [blockedText] },
      reasoning_engine: {
        selected_position: blockedText,
        blocked_arguments: [blockedText],
      },
      generation_conclusions: [allowed],
      blocked_conclusions: [blocked],
      trusted_sources: [{ title: "НК РФ", use_in_generation: true }],
    }, {
      facts: { items: ["Подтверждённый факт"] },
      legal_position: { items: blockedText },
      recommendations: { items: [blockedText] },
      generation_instructions: [blockedText],
      applicable_laws: { items: [{ title: blockedText }] },
      fact_to_evidence_mapping: [{
        fact: "Подтверждённый факт",
        document_ids: ["doc-1"],
        document_titles: ["Документ"],
        evidence: [blockedText],
        supporting_laws: [blockedText],
      }],
    }, {
      strategy_source: "ai_reasoning",
      selected_strategy_id: "ai-1",
      strategy_position: {
        position: blockedText,
        supporting_arguments: ["Допустимый аргумент"],
        blocked_arguments: [blockedText],
      },
    });

    const exactPromptContext = JSON.stringify({
      legalAnalysis: result.legalAnalysisForGeneration,
      documentContext: result.documentContextForGeneration,
      workingStrategy: result.workingStrategyForGeneration,
      blockedConclusionCount: result.blockedConclusionCount,
    });
    expect(exactPromptContext).not.toContain(blockedText);
    expect(exactPromptContext).toContain("Допустимый вывод");
    expect(result.blockedConclusionCount).toBe(1);
  });

  test("preserves an explicit lawyer strategy override", () => {
    const lawyerPosition = "Позиция, выбранная юристом";
    const result = buildGeneratorPromptInputs({
      blocked_conclusions: [{
        conclusion_id: "blocked-ai",
        statement: lawyerPosition,
        provenance: { use_in_generation: false },
      }],
    }, null, {
      strategy_source: "lawyer_override",
      selected_strategy_id: "lawyer-1",
      strategy_position: { position: lawyerPosition },
    });

    expect(
      (result.workingStrategyForGeneration?.strategy_position as { position: string }).position,
    ).toBe(lawyerPosition);
  });

  test("wires only sanitized objects into the generator prompt", async () => {
    const source = await Bun.file(new URL("../index.ts", import.meta.url)).text();

    expect(source).toContain("buildGeneratorPromptInputs(");
    expect(source).toContain("JSON.stringify(legalAnalysisForGeneration, null, 2)");
    expect(source).toContain("JSON.stringify(documentContextForGeneration, null, 2)");
    expect(source).not.toContain("JSON.stringify(legalAnalysisObject, null, 2)");
    expect(source).not.toContain("JSON.stringify(document_context, null, 2)");
  });

  test("returns empty sets without a legal analysis payload", () => {
    expect(selectConclusionSets(null)).toEqual({
      generationConclusions: [],
      blockedConclusions: [],
    });
  });
});
