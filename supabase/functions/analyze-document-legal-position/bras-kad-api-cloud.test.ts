import { describe, expect, test } from "bun:test";
import { buildResearchQueryPlan } from "./research-query-plan.ts";
import { evaluateResearchTransportDecision } from "./research-transport-policy.ts";
import { retrieveBrasKadApiCloud } from "./bras-kad-api-cloud.ts";
import { admitResearchRetrievalCandidates } from "./research-source-admission.ts";
import type { ResearchQuestion } from "./research-routing.ts";

const question: ResearchQuestion = {
  id: "bras-kad-api-cloud", issue: "Применение статьи 54.1 НК РФ арбитражными судами",
  modes: ["exact"], source_roles: ["judicial"], exact_terms: [], metadata_terms: [], semantic_terms: [],
  fact_pattern_terms: [], argument_terms: [], adverse_terms: [], temporal_terms: [], temporal_anchors: [],
  buckets: ["court_practice"],
};

function plan() {
  return buildResearchQueryPlan({
    matter_id: "matter-api-cloud", legal_analysis_run_id: "run-api-cloud", research_issue: question,
    exact_case_number: "А40-12345/2024", sensitivity_class: "public_case_reference",
  });
}

function decision(p = plan()) {
  return evaluateResearchTransportDecision({
    plan: p, provider_id: "bras_kad_api_cloud", provider_capabilities: ["court_practice"],
    required_capability: "court_practice", integration_mode: "partner_api",
    transport_id: "api_cloud_ras_arbitr", transport_version: "2026-09-04",
    partner_contract_id: "contract-123", partner_documentation_url: "https://api-cloud.ru/ras_arbitr",
  });
}

const configured = { enabled: true, token: "token-not-for-output", contract_id: "contract-123", transport_version: "2026-09-04" };

describe("contracted BRAS/KAD API-CLOUD adapter", () => {
  test("keeps token out of URL and maps only discovery candidates", async () => {
    const p = plan(); let request = ""; let token = "";
    const result = await retrieveBrasKadApiCloud({
      plan: p, decision: decision(p), config: configured,
      fetcher: async (input, init) => {
        request = String(input); token = new Headers(init?.headers).get("Token") ?? "";
        return new Response(JSON.stringify({ status: 200, Result: [{
          CaseId: "case-id", CaseUrl: "https://kad.arbitr.ru/Card/case-id",
          FileUrl: "https://ras.arbitr.ru/Document/Pdf/case-id/document.pdf?download=true",
          InstanceNumber: "А40-12345/2024", RegistrationDate: "17.02.2024",
          Court: "АС города Москвы", Type: "Решение", InstanceLevel: 1,
        }] }), { status: 200 });
      },
    });
    expect(request).toContain("CaseNumber=%D0%9040-12345%2F2024");
    expect(request).not.toContain(configured.token);
    expect(token).toBe(configured.token);
    expect(result.diagnostics.status).toBe("success");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].metadata.retrieval_candidate_only).toBe(true);
    expect(result.sources[0].metadata.substantive_use_allowed).toBe(false);
  });

  test("fails closed without configuration and cannot change accepted analysis", async () => {
    const p = plan(); let calls = 0;
    const unavailable = await retrieveBrasKadApiCloud({
      plan: p, decision: decision(p), config: { ...configured, enabled: false },
      fetcher: async () => { calls += 1; return new Response(); },
    });
    expect(unavailable.diagnostics.error_code).toBe("partner_not_configured");
    expect(calls).toBe(0);

    const result = await retrieveBrasKadApiCloud({
      plan: p, decision: decision(p), config: configured,
      fetcher: async () => new Response(JSON.stringify({ status: 200, Result: [{
        InstanceNumber: "А40-12345/2024", CaseUrl: "https://kad.arbitr.ru/Card/case-id",
      }] }), { status: 200 }),
    });
    const admission = admitResearchRetrievalCandidates([], result.sources);
    expect(admission.substantive_sources).toEqual([]);
    expect(admission.discovery_candidates).toHaveLength(1);
    expect(admission.decisions[0]).toMatchObject({
      status: "discovery_only", reason: "verification_observation_missing", substantive_use_allowed: false,
    });
  });
});
