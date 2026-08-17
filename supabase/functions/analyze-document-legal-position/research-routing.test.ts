import { describe, expect, test } from "bun:test";
import type { ResearchQuery } from "./fact-extraction.ts";
import { buildResearchPlan, queryForBucket } from "./research-routing.ts";

const EMPTY_QUERY: ResearchQuery = {
  practice_area: null,
  subcategory: null,
  document_type: null,
  facts: [],
  parties: [],
  amounts: [],
  dates: [],
  legal_issues: [],
  research_topics: [],
  keywords: [],
  articles: [],
  organizations: [],
  inn: [],
  ogrn: [],
  semantic_intents: [],
  legal_concepts: [],
  metadata_terms: [],
  search_hypotheses: [],
};

function query(overrides: Partial<ResearchQuery> = {}): ResearchQuery {
  return {
    ...EMPTY_QUERY,
    ...overrides,
  };
}

describe("issue-based legal research routing", () => {
  test("tax judicial dispute routes one issue to law, courts and official explanations", () => {
    const q = query({
      legal_issues: ["Применение ст. 54.1 НК РФ к реальности хозяйственных операций"],
      research_topics: ["налоговая реконструкция", "бремя доказывания"],
      articles: ["ст. 54.1 НК РФ"],
      facts: ["Налоговый орган оспаривает реальность поставки товара"],
      semantic_intents: ["фактическое исполнение договора"],
      metadata_terms: ["налоговая проверка", "2022 год"],
    });

    const plan = buildResearchPlan(q);
    const issue = plan.questions[0];

    expect(plan.all_modes).toEqual([
      "exact",
      "metadata",
      "semantic",
      "fact_pattern",
      "issue_argument",
      "adverse",
      "temporal",
    ]);
    expect(issue.buckets).toContain("laws");
    expect(issue.buckets).toContain("court_practice");
    expect(issue.buckets).toContain("fns_letters");
    expect(issue.buckets).toContain("minfin_letters");
    expect(issue.source_roles).toContain("official_explanation");
    expect(issue.source_roles).toContain("factual_data");
    expect(issue.source_roles).toContain("adverse");
    expect(issue.source_roles).toContain("temporal");
  });

  test("routing does not promote search inference into case facts", () => {
    const q = query({
      facts: ["Договор поставки заключён 10.01.2022"],
      legal_issues: ["Реальность исполнения поставки"],
      search_hypotheses: ["проверить технического контрагента"],
    });

    const plan = buildResearchPlan(q);
    const routed = queryForBucket(q, plan, "court_practice");

    expect(routed.facts).toEqual(q.facts);
    expect(routed.facts).not.toContain("проверить технического контрагента");
    expect(routed.search_hypotheses).toContain("проверить технического контрагента");
  });

  test("non-tax issue does not mechanically route to FNS or Minfin", () => {
    const q = query({
      legal_issues: ["Недействительность сделки с недвижимостью"],
      research_topics: ["добросовестность приобретателя"],
    });

    const issue = buildResearchPlan(q).questions[0];
    expect(issue.buckets).toContain("laws");
    expect(issue.buckets).toContain("court_practice");
    expect(issue.buckets).not.toContain("fns_letters");
    expect(issue.buckets).not.toContain("minfin_letters");
  });

  test("adverse and temporal terms are attached to the issue rather than globally becoming facts", () => {
    const q = query({
      legal_issues: ["Должная осмотрительность при выборе контрагента"],
      dates: ["2022-03-01"],
    });

    const issue = buildResearchPlan(q).questions[0];
    expect(issue.adverse_terms.some((x) => x.includes("против позиции"))).toBe(true);
    expect(issue.temporal_terms).toContain("2022-03-01");
    expect(q.facts).toEqual([]);
  });
});
