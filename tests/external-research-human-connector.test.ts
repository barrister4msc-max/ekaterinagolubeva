import { describe, expect, test } from "bun:test";
import { buildHumanResearchRequest } from "../src/lib/external-research-human-connector";

describe("external research human connector", () => {
  test("builds a Strizh request from legal research gaps without asserting context as facts", () => {
    const request = buildHumanResearchRequest("strizh", {
      facts: [],
      legal_qualification: "",
      main_legal_position: "",
      tax_authority_position: "",
      taxpayer_position: "",
      applicable_laws: [],
      fact_to_law_mapping: [],
      alternative_positions: [],
      rejected_laws: [],
      why_rejected: [],
      counter_arguments: ["ФНС может ссылаться на формальный документооборот"],
      weak_points: [],
      missing_evidence: [],
      risks: [],
      court_practice: [],
      fns_letters: [],
      minfin_letters: [],
      ekaterina_practice: [],
      sources: [],
      source_actuality: [],
      generation_instructions: [],
      research_query: {
        practice_area: "tax",
        subcategory: null,
        document_type: null,
        facts: ["Контрагент исполнял поставку в 2021 году"],
        parties: [],
        amounts: [],
        dates: ["2021"],
        legal_issues: ["Применение ст. 54.1 НК РФ"],
        research_topics: ["должная осмотрительность"],
        keywords: ["54.1", "реальность операций"],
      },
      source_sufficiency: {
        status: "insufficient",
        gaps: ["Нет неблагоприятной практики кассации"],
      },
      challenge_result: {
        status: "needs_revision",
        issues: [{
          kind: "adverse_missing",
          description: "Нужно проверить противоположную практику",
          affected_conclusions: [],
          affected_sources: [],
        }],
        required_changes: [],
        adverse_sources: ["Практика против налогоплательщика"],
        unresolved_risks: [],
        reasoning: "",
      },
      external_search_required: true,
      external_search_reason: "Недостаточно внешних источников",
    });

    expect(request.provider).toBe("strizh");
    expect(request.prompt).toContain("Это не доказанные факты");
    expect(request.prompt).toContain("Не превращай предположения");
    expect(request.prompt).toContain("Применение ст. 54.1 НК РФ");
    expect(request.prompt).toContain("Нет неблагоприятной практики кассации");
    expect(request.prompt).toContain("Фактический контекст только для поиска");
    expect(request.diagnostics.external_search_required).toBe(true);
  });

  test("does not invent source identifiers when analysis is absent", () => {
    const request = buildHumanResearchRequest("strizh", null);
    expect(request.issue_ids).toEqual([]);
    expect(request.prompt).toContain("Если источник не удаётся надежно идентифицировать");
    expect(request.prompt).not.toContain("research-issue-1");
  });
});
