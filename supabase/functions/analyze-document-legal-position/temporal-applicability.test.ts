import { describe, expect, test } from "bun:test";
import type { ResearchPlan } from "./research-routing.ts";
import type { TrustedSource } from "./enrich.ts";
import { evaluateTemporalApplicability } from "./temporal-applicability.ts";

function plan(): ResearchPlan {
  return {
    questions: [{
      id: "issue-1",
      issue: "Применимая редакция ст. 54.1 НК РФ к спорной операции",
      modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
      source_roles: ["normative", "judicial", "official_explanation", "adverse", "temporal"],
      exact_terms: [],
      metadata_terms: [],
      semantic_terms: [],
      fact_pattern_terms: [],
      argument_terms: [],
      adverse_terms: [],
      temporal_terms: ["2022-03-01"],
      temporal_anchors: [{
        role: "transaction_date",
        label: "Дата спорной операции",
        date: "2022-03-01",
        date_from: null,
        date_to: null,
        basis: "Дата прямо указана в договоре и первичных документах",
      }],
      buckets: ["laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals"],
    }],
    all_modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
    buckets: ["laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals"],
  };
}

function source(overrides: Record<string, unknown> = {}): TrustedSource {
  return {
    source_id: "law-1",
    source_ref: "legal_knowledge_chunks:law-1",
    source_type: "law_full_text",
    bucket: "laws",
    title: "НК РФ ст. 54.1",
    official_url: "https://publication.pravo.gov.ru/",
    citation: "НК РФ ст. 54.1",
    scores: { semantic: 0.9, keyword: 1, priority: 1, relevance: 1, final: 0.95 },
    appearances: 1,
    trust_score: 95,
    trust_reason: "test",
    use_in_generation: true,
    actually_used_in_generation: false,
    research_issue_ids: ["issue-1"],
    ...overrides,
  } as TrustedSource;
}

describe("temporal applicability", () => {
  test("marks a source as covered when its effective interval contains the issue anchor", () => {
    const result = evaluateTemporalApplicability({
      plan: plan(),
      trusted: [source({ effective_from: "2017-08-19", effective_to: null })],
    });

    expect(result.gaps).toEqual([]);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].status).toBe("covered");
  });

  test("reports a conflict when the source started after the researched event", () => {
    const result = evaluateTemporalApplicability({
      plan: plan(),
      trusted: [source({ effective_from: "2023-01-01", effective_to: null })],
    });

    expect(result.checks[0].status).toBe("conflict");
    expect(result.gaps.some((gap) => gap.includes("Не подтверждена применимая редакция"))).toBe(true);
  });

  test("reports unresolved instead of inventing applicability when temporal metadata is missing", () => {
    const result = evaluateTemporalApplicability({
      plan: plan(),
      trusted: [source()],
    });

    expect(result.checks[0].status).toBe("unresolved");
    expect(result.gaps.some((gap) => gap.includes("Недостаточно temporal metadata"))).toBe(true);
  });

  test("does not use a source attributed to another research issue", () => {
    const result = evaluateTemporalApplicability({
      plan: plan(),
      trusted: [source({ research_issue_ids: ["issue-2"], effective_from: "2017-08-19" })],
    });

    expect(result.checks).toEqual([]);
    expect(result.gaps.some((gap) => gap.includes("Не найден источник"))).toBe(true);
  });
});
