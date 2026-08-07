import { describe, expect, test } from "bun:test";
import { normalizeLegalAnalysisResult, type LegalAnalysisResult } from "./legal-analysis";

function analysis(overrides: Record<string, unknown> = {}): LegalAnalysisResult {
  return {
    facts: [], legal_qualification: "", main_legal_position: "",
    tax_authority_position: "", taxpayer_position: "", applicable_laws: [],
    fact_to_law_mapping: [], alternative_positions: [], rejected_laws: [],
    why_rejected: [], counter_arguments: [], weak_points: [], missing_evidence: [],
    risks: [], court_practice: [], fns_letters: [], minfin_letters: [],
    ekaterina_practice: [], sources: [], source_actuality: [],
    generation_instructions: [], ...overrides,
  } as LegalAnalysisResult;
}

describe("normalizeLegalAnalysisResult", () => {
  test("does not invent facts, documents, or sources for an argument", () => {
    const argument = { argument: "Позиция без подтвержденной связи" };
    const value = analysis({
      facts_index: [{ fact_id: "fact-1", fact_text: "Несвязанный факт" }],
      trusted_sources: [{ source_id: "uuid-1", source_ref: "law:nk:54.1",
        is_winner: true, use_in_generation: true, title: "НК РФ" }],
      argument_map: [argument],
    });
    normalizeLegalAnalysisResult(value);
    expect((value as any).argument_map[0]).toEqual(argument);
    expect((value as any).argument_map[0].facts_used).toBeUndefined();
    expect((value as any).argument_map[0].documents_used).toBeUndefined();
    expect((value as any).argument_map[0].sources_used).toBeUndefined();
  });

  test("preserves explicit source_ref and never substitutes source_id", () => {
    const value = analysis({
      argument_map: [{ argument: "Позиция", sources_used: ["law:nk:54.1"] }],
      trusted_sources: [{ source_id: "uuid-1", source_ref: "law:nk:54.1", title: "НК РФ" }],
    });
    normalizeLegalAnalysisResult(value);
    expect((value as any).argument_map[0].sources_used).toEqual(["law:nk:54.1"]);
    expect((value as any).argument_map[0].sources_used).not.toContain("uuid-1");
  });

  test("normalizes legacy text to canonical fact_text", () => {
    const value = analysis({ facts_index: [{ fact_id: "fact-1", text: "Старый формат" }] });
    normalizeLegalAnalysisResult(value);
    expect(value.facts_index).toEqual([{ fact_id: "fact-1", fact_text: "Старый формат" }]);
    expect(value.facts_index?.[0]).not.toHaveProperty("text");
  });
});
