import { describe, expect, test } from "bun:test";
import { buildResearchQueryPlan } from "./research-query-plan.ts";
import {
  assessResearchSourcePlanCoverage,
  buildResearchSourcePlan,
} from "./research-source-plan.ts";
import { SOURCE_CAPABILITY_REGISTRY, type SourceCapabilityRegistration } from "./source-capability-registry.ts";
import type { ResearchQuestion } from "./research-routing.ts";

function question(overrides: Partial<ResearchQuestion> = {}): ResearchQuestion {
  return {
    id: "issue-1",
    issue: "Применимость статьи 54.1 НК РФ к налоговой реконструкции",
    modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
    source_roles: ["normative", "official_explanation", "judicial", "adverse", "temporal"],
    exact_terms: [], metadata_terms: [], semantic_terms: [], fact_pattern_terms: [], argument_terms: [], adverse_terms: [], temporal_terms: [],
    temporal_anchors: [], buckets: ["laws", "court_practice", "fns_letters", "minfin_letters"],
    ...overrides,
  };
}

function queryPlan(overrides: Record<string, unknown> = {}) {
  return buildResearchQueryPlan({
    matter_id: "matter-1",
    legal_analysis_run_id: "run-1",
    research_issue: question(),
    applicable_provisions: ["ст. 54.1 НК РФ"],
    jurisdiction: "RU_TAX",
    sensitivity_class: "public_legal_issue",
    ...overrides,
  });
}

function requirement(plan: ReturnType<typeof buildResearchSourcePlan>, role: ResearchQuestion["source_roles"][number], family?: string) {
  const found = plan.requirements.find((item) => item.role === role && (!family || item.source_family === family));
  if (!found) throw new Error(`missing_requirement:${role}:${family ?? ""}`);
  return found;
}

describe("Prompt 08I provider-neutral ResearchSourcePlan", () => {
  test("routes tax and non-tax issue roles without putting providers into the ResearchQueryPlan", () => {
    const taxQueryPlan = queryPlan();
    const taxPlan = buildResearchSourcePlan({ query_plan: taxQueryPlan });

    expect(taxQueryPlan.source_roles).toContain("official_explanation");
    expect(taxQueryPlan.transport).toEqual({ provider_id: null, transport_id: null });
    expect(taxPlan.context).toMatchObject({ jurisdiction: "RU_TAX", procedure_stage: "any", sensitivity_class: "public_legal_issue" });
    expect(requirement(taxPlan, "normative", "laws").candidate_routes.map((route) => route.provider_id)).toContain("law7_local");
    expect(requirement(taxPlan, "normative", "laws").candidate_routes.map((route) => route.provider_id)).not.toContain("pravo");
    expect(taxPlan.preflight_coverage_gaps.map((gap) => gap.source_family)).toEqual(expect.arrayContaining(["fns_letters", "minfin_letters"]));

    const nonTax = queryPlan({
      research_issue: question({
        issue: "Недействительность сделки с недвижимостью",
        source_roles: ["normative", "judicial", "adverse"],
        buckets: ["laws", "court_practice"],
      }),
      jurisdiction: "RU_GENERAL_JURISDICTION",
    });
    const nonTaxPlan = buildResearchSourcePlan({ query_plan: nonTax });
    expect(nonTaxPlan.requirements.some((item) => item.source_family === "fns_letters")).toBe(false);
    expect(nonTaxPlan.requirements.some((item) => item.source_family === "minfin_letters")).toBe(false);
  });

  test("keeps an exact case, adverse search and historical period as separate role requirements", () => {
    const plan = buildResearchSourcePlan({
      query_plan: queryPlan({
        exact_case_number: "А40-123/2024",
        procedure_stage: "cassation",
        court_level: "cassation",
        temporal_window: { from: "2021-01-01", to: "2022-12-31" },
      }),
    });
    expect(requirement(plan, "judicial", "court_practice").query_class).toBe("exact");
    expect(requirement(plan, "adverse", "court_practice").query_class).toBe("adverse");
    expect(requirement(plan, "temporal", "laws").query_class).toBe("temporal");
    expect(plan.context).toMatchObject({ procedure_stage: "cassation", court_level: "cassation" });
    expect(plan.coverage_policy).toMatchObject({ adverse_required: true, temporal_required: true, max_initial_provider_attempts_per_requirement: 2 });
  });

  test("emits a mandatory coverage gap when a family has no capability", () => {
    const plan = buildResearchSourcePlan({ query_plan: queryPlan(), registry: [] });
    const normativeGap = plan.preflight_coverage_gaps.find((gap) => gap.role === "normative" && gap.source_family === "laws");
    expect(normativeGap).toMatchObject({ code: "no_capability", required_action: "add_capability" });
  });

  test("deduplicates provider alternatives and keeps fan-out bounded without hiding routes in issue semantics", () => {
    const law7 = SOURCE_CAPABILITY_REGISTRY.find((route) => route.provider_id === "law7_local") as SourceCapabilityRegistration;
    const alternateLaw7 = { ...law7, transport_id: "alternate_local_mirror", transport_version: "v2" };
    const plan = buildResearchSourcePlan({ query_plan: queryPlan({
      research_issue: question({ source_roles: ["normative"], buckets: ["laws"] }),
    }), registry: [law7, alternateLaw7] });
    const normative = requirement(plan, "normative", "laws");
    expect(normative.candidate_routes).toHaveLength(1);
    expect(normative.initial_route_ids).toHaveLength(1);
    expect(plan.coverage_policy.max_total_provider_attempts).toBe(12);
  });

  test("fails closed for a sensitive party when the provider registry lacks matching privacy permission", () => {
    const plan = buildResearchSourcePlan({
      query_plan: queryPlan({ sensitivity_class: "restricted_exact_party" }),
    });
    const courtGap = plan.preflight_coverage_gaps.find((gap) => gap.role === "judicial" && gap.source_family === "court_practice");
    expect(courtGap).toMatchObject({ code: "privacy_not_permitted", required_action: "classify_privacy" });
    expect(requirement(plan, "judicial", "court_practice").candidate_routes).toHaveLength(0);
  });

  test("one provider failure leaves other candidate routes pending, and zero results become a gap only after all routes report", () => {
    const vsrf = SOURCE_CAPABILITY_REGISTRY.find((route) => route.provider_id === "vsrf_official") as SourceCapabilityRegistration;
    const secondCourt = { ...vsrf, provider_id: "second_official_court", transport_id: "second_official_document", operational_status: "active" as const };
    const sourcePlan = buildResearchSourcePlan({
      query_plan: queryPlan({
        research_issue: question({ source_roles: ["judicial"], buckets: ["court_practice"] }),
      }),
      registry: [vsrf, secondCourt],
    });
    const judicial = requirement(sourcePlan, "judicial", "court_practice");
    expect(judicial.candidate_routes.map((route) => route.provider_id)).toEqual(["second_official_court", "vsrf_official"]);

    const afterOneFailure = assessResearchSourcePlanCoverage(sourcePlan, [{
      requirement_id: judicial.requirement_id, provider_id: "second_official_court", status: "failed",
    }]);
    expect(afterOneFailure.find((entry) => entry.requirement_id === judicial.requirement_id)).toMatchObject({ status: "pending", coverage_gap: null });

    const afterZeroResults = assessResearchSourcePlanCoverage(sourcePlan, judicial.candidate_routes.map((route) => ({
      requirement_id: judicial.requirement_id, provider_id: route.provider_id, status: "zero_result" as const,
    })));
    expect(afterZeroResults.find((entry) => entry.requirement_id === judicial.requirement_id)).toMatchObject({
      status: "gap",
      coverage_gap: { code: "all_candidate_routes_zero_result" },
    });
  });
});
