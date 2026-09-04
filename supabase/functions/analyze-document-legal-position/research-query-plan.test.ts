import { describe, expect, test } from "bun:test";
import { buildResearchQueryPlan } from "./research-query-plan.ts";
import type { ResearchQuestion } from "./research-routing.ts";

function question(overrides: Partial<ResearchQuestion> = {}): ResearchQuestion {
  return {
    id: "issue-1",
    issue: "Применимость статьи 54.1 НК РФ к налоговой реконструкции",
    modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
    source_roles: ["normative", "judicial", "adverse", "temporal"],
    exact_terms: ["ст. 54.1 НК РФ", "7701234567", "ООО «Секретный клиент»"],
    metadata_terms: ["редакция нормы"],
    semantic_terms: ["налоговая реконструкция"],
    fact_pattern_terms: ["реальность операций"],
    argument_terms: ["пределы налоговой выгоды"],
    adverse_terms: ["неблагоприятная практика"],
    temporal_terms: ["2024"],
    temporal_anchors: [],
    buckets: ["laws", "court_practice", "fns_letters", "minfin_letters"],
    ...overrides,
  };
}

function baseInput() {
  return {
    matter_id: "matter-1",
    legal_analysis_run_id: "run-1",
    research_issue: question(),
    revision: 1,
    applicable_provisions: ["ст. 54.1 НК РФ"],
  };
}

describe("Prompt 08B ResearchQueryPlan", () => {
  test("builds exact case-number plan without selecting a provider or transport", () => {
    const plan = buildResearchQueryPlan({
      ...baseInput(),
      exact_case_number: "А40-123/2024",
    });

    expect(plan.objective).toBe("exact_case");
    expect(plan.jurisdiction).toBe("RU_ARBITRATION");
    expect(plan.required_capabilities).toContain("court_practice");
    expect(plan.allowlisted_facets).toContainEqual({ kind: "case_number", value: "А40-123/2024" });
    expect(plan.transport).toEqual({ provider_id: null, transport_id: null });
    expect(plan.planner_provenance.network_used).toBe(false);
    expect(plan.planner_provenance.provider_selected).toBe(false);
  });

  test("builds provider-neutral issue search from existing ResearchQuestion buckets", () => {
    const plan = buildResearchQueryPlan({
      ...baseInput(),
      objective: "issue_search",
      jurisdiction: "RU_TAX",
    });

    expect(plan.objective).toBe("issue_search");
    expect(plan.required_capabilities).toEqual(["laws", "court_practice", "fns_letters", "minfin_letters"]);
    expect(plan.allowlisted_facets).toContainEqual({
      kind: "legal_issue",
      value: "Применимость статьи 54.1 НК РФ к налоговой реконструкции",
    });
    const facetValues = plan.allowlisted_facets.map((facet) => facet.value);
    expect(facetValues).not.toContain("7701234567");
    expect(facetValues).not.toContain("ООО «Секретный клиент»");
  });

  test("fails closed until sensitivity is classified and projects only structured facets externally", () => {
    const unclassified = buildResearchQueryPlan(baseInput());
    expect(unclassified.sensitivity_class).toBe("unclassified");
    expect(unclassified.external_query.classification_provenance).toBe("unclassified_fail_closed");
    expect(unclassified.external_query.external_execution_allowed).toBe(false);

    const publicPlan = buildResearchQueryPlan({
      ...baseInput(),
      sensitivity_class: "public_legal_issue",
      research_issue: question({
        issue: "Спор по документам клиента и обстоятельствам конкретного эпизода",
      }),
    });
    expect(publicPlan.external_query.external_execution_allowed).toBe(true);
    expect(publicPlan.external_query.redaction).toBe("structured_facets_only");
    expect(publicPlan.external_query.facets.map((facet) => facet.kind)).not.toContain("legal_issue");
    expect(publicPlan.external_query.facets.map((facet) => facet.value))
      .not.toContain("Спор по документам клиента и обстоятельствам конкретного эпизода");
  });

  test("marks adverse search without turning model expansion proposals into executable facets", () => {
    const plan = buildResearchQueryPlan({
      ...baseInput(),
      objective: "adverse_search",
      issue_argument_type: "adverse",
      model_expansion_proposals: ["субсидиарная неблагоприятная практика"],
    });

    expect(plan.adverse_search).toBe(true);
    expect(plan.issue_argument_type).toBe("adverse");
    expect(plan.query_expansion_proposals).toEqual(["субсидиарная неблагоприятная практика"]);
    expect(plan.allowlisted_facets.map((facet) => facet.value)).not.toContain("субсидиарная неблагоприятная практика");
  });

  test("derives deterministic temporal window from existing issue anchors", () => {
    const plan = buildResearchQueryPlan({
      ...baseInput(),
      objective: "temporal_search",
      research_issue: question({
        temporal_anchors: [{
          role: "tax_period",
          label: "налоговый период",
          date: null,
          date_from: "2023-01-01",
          date_to: "2023-12-31",
          basis: "материалы дела",
        }],
      }),
    });

    expect(plan.temporal_window).toEqual({ from: "2023-01-01", to: "2023-12-31" });
    expect(plan.allowlisted_facets).toContainEqual({ kind: "temporal_from", value: "2023-01-01" });
    expect(plan.allowlisted_facets).toContainEqual({ kind: "temporal_to", value: "2023-12-31" });
  });

  test("is idempotent for the same input revision and creates a new identity for a new revision", () => {
    const first = buildResearchQueryPlan(baseInput());
    const duplicate = buildResearchQueryPlan(baseInput());
    const revised = buildResearchQueryPlan({ ...baseInput(), revision: 2 });

    expect(duplicate).toEqual(first);
    expect(duplicate.plan_id).toBe(first.plan_id);
    expect(revised.plan_id).not.toBe(first.plan_id);
    expect(revised.revision).toBe(2);
  });

  test("rejects free document text and personal identifier fields at the planner boundary", () => {
    expect(() => buildResearchQueryPlan({
      ...baseInput(),
      document_text: "полный текст клиентского документа",
    })).toThrow("forbidden_query_plan_field:document_text");

    expect(() => buildResearchQueryPlan({
      ...baseInput(),
      inn: ["7701234567"],
    })).toThrow("forbidden_query_plan_field:inn");
  });

  test("rejects a research issue containing a direct protected identifier", () => {
    expect(() => buildResearchQueryPlan({
      ...baseInput(),
      research_issue: question({ issue: "Проверить позицию ООО «Секретный клиент» по ст. 54.1 НК РФ" }),
    })).toThrow("forbidden_identifier_in_research_issue");
  });

  test("rejects unknown or malformed issue instead of inventing a query", () => {
    expect(() => buildResearchQueryPlan({
      ...baseInput(),
      research_issue: question({ id: "", issue: "" }),
    })).toThrow("invalid_research_issue_id");

    expect(() => buildResearchQueryPlan({
      ...baseInput(),
      research_issue: { ...question(), buckets: ["unknown_bucket"] },
    })).toThrow("invalid_research_capabilities");
  });
});
