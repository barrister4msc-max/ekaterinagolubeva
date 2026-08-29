import { describe, expect, test } from "bun:test";
import { buildResearchQueryPlan } from "./research-query-plan.ts";
import type { ResearchQuestion } from "./research-routing.ts";
import { evaluateResearchTransportDecision } from "./research-transport-policy.ts";

function question(buckets: ResearchQuestion["buckets"] = ["laws", "court_practice"]): ResearchQuestion {
  return {
    id: "issue-08c",
    issue: "Применимость статьи 54.1 НК РФ и судебной практики",
    modes: ["exact", "semantic", "issue_argument"],
    source_roles: ["normative", "judicial"],
    exact_terms: ["ст. 54.1 НК РФ"],
    metadata_terms: [],
    semantic_terms: ["налоговая реконструкция"],
    fact_pattern_terms: [],
    argument_terms: ["пределы налоговой выгоды"],
    adverse_terms: [],
    temporal_terms: [],
    temporal_anchors: [],
    buckets,
  };
}

function plan(options: { sensitivity?: "public_legal_issue" | "restricted_exact_party" } = {}) {
  return buildResearchQueryPlan({
    matter_id: "matter-08c",
    legal_analysis_run_id: "run-08c",
    research_issue: question(),
    revision: 1,
    sensitivity_class: options.sensitivity ?? "public_legal_issue",
    applicable_provisions: ["ст. 54.1 НК РФ"],
  });
}

describe("Prompt 08C Research Transport/Compliance Gate", () => {
  test("allows existing Pravo documented direct backend transport without changing its capability", () => {
    const result = evaluateResearchTransportDecision({
      plan: plan(),
      provider_id: "pravo",
      provider_capabilities: ["laws"],
      required_capability: "laws",
      integration_mode: "direct_api",
      transport_id: "pravo_official_api",
      transport_version: "existing-v1",
    });

    expect(result.status).toBe("approved_retrieval");
    expect(result.reason).toBe("approved_direct_transport");
    expect(result.network_allowed).toBe(true);
    expect(result.executable).toBe(true);
    expect(result.registry_provider_id).toBe("pravo");
  });

  test("keeps BRAS/KAD manual import non-network and manual-only", () => {
    const result = evaluateResearchTransportDecision({
      plan: plan(),
      provider_id: "bras_kad",
      provider_capabilities: ["court_practice"],
      required_capability: "court_practice",
      integration_mode: "manual_import",
    });

    expect(result.status).toBe("manual_import_only");
    expect(result.reason).toBe("manual_import_only");
    expect(result.network_allowed).toBe(false);
    expect(result.executable).toBe(false);
    expect(result.registry_provider_id).toBe("kad");
  });

  test("does not upgrade BRAS/KAD to direct network retrieval", () => {
    const result = evaluateResearchTransportDecision({
      plan: plan(),
      provider_id: "bras_kad",
      provider_capabilities: ["court_practice"],
      required_capability: "court_practice",
      integration_mode: "direct_api",
      transport_id: "unproven-kad-api",
      transport_version: "v1",
      requested_status: "approved_retrieval",
    });

    expect(result.status).toBe("manual_import_only");
    expect(result.reason).toBe("machine_interface_not_documented");
    expect(result.network_allowed).toBe(false);
  });

  test("blocks public-interface provider when machine interface is not documented", () => {
    const result = evaluateResearchTransportDecision({
      plan: plan(),
      provider_id: "fns",
      provider_capabilities: ["laws"],
      required_capability: "laws",
      integration_mode: "direct_api",
      transport_id: "fns-public-web",
      transport_version: "v1",
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("machine_interface_not_documented");
    expect(result.network_allowed).toBe(false);
  });

  test("blocks unknown provider and unknown capability route by default", () => {
    const unknownProvider = evaluateResearchTransportDecision({
      plan: plan(),
      provider_id: "unknown_provider",
      provider_capabilities: ["laws"],
      required_capability: "laws",
      integration_mode: "direct_api",
    });
    expect(unknownProvider.status).toBe("blocked");
    expect(unknownProvider.reason).toBe("unknown_provider");

    const missingCapability = evaluateResearchTransportDecision({
      plan: plan(),
      provider_id: "pravo",
      provider_capabilities: ["laws"],
      required_capability: "court_practice",
      integration_mode: "direct_api",
      transport_id: "pravo_official_api",
      transport_version: "existing-v1",
    });
    expect(missingCapability.status).toBe("blocked");
    expect(missingCapability.reason).toBe("provider_capability_missing");
  });

  test("blocks restricted exact-party search without separate authorization", () => {
    const result = evaluateResearchTransportDecision({
      plan: plan({ sensitivity: "restricted_exact_party" }),
      provider_id: "pravo",
      provider_capabilities: ["laws"],
      required_capability: "laws",
      integration_mode: "direct_api",
      transport_id: "pravo_official_api",
      transport_version: "existing-v1",
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("sensitive_exact_party_not_authorized");
    expect(result.network_allowed).toBe(false);
  });

  test("allows separately authorized restricted search only when transport policy is otherwise valid", () => {
    const result = evaluateResearchTransportDecision({
      plan: plan({ sensitivity: "restricted_exact_party" }),
      provider_id: "pravo",
      provider_capabilities: ["laws"],
      required_capability: "laws",
      integration_mode: "direct_api",
      transport_id: "pravo_official_api",
      transport_version: "existing-v1",
      sensitive_exact_party_authorized: true,
    });

    expect(result.status).toBe("approved_retrieval");
    expect(result.network_allowed).toBe(true);
  });

  test("supports disabled, shadow and degraded operational states without accidental execution", () => {
    const disabled = evaluateResearchTransportDecision({
      plan: plan(), provider_id: "pravo", provider_capabilities: ["laws"], required_capability: "laws",
      integration_mode: "direct_api", policy_enabled: false,
    });
    expect(disabled.status).toBe("disabled");
    expect(disabled.network_allowed).toBe(false);

    const shadow = evaluateResearchTransportDecision({
      plan: plan(), provider_id: "pravo", provider_capabilities: ["laws"], required_capability: "laws",
      integration_mode: "direct_api", transport_id: "pravo_official_api", transport_version: "existing-v1",
      requested_status: "shadow_retrieval",
    });
    expect(shadow.status).toBe("shadow_retrieval");
    expect(shadow.network_allowed).toBe(false);
    expect(shadow.executable).toBe(false);

    const degraded = evaluateResearchTransportDecision({
      plan: plan(), provider_id: "pravo", provider_capabilities: ["laws"], required_capability: "laws",
      integration_mode: "direct_api", transport_id: "pravo_official_api", transport_version: "existing-v1",
      requested_status: "degraded",
    });
    expect(degraded.status).toBe("degraded");
    expect(degraded.network_allowed).toBe(false);
  });

  test("is deterministic for identical policy input", () => {
    const input = {
      plan: plan(),
      provider_id: "pravo" as const,
      provider_capabilities: ["laws"] as const,
      required_capability: "laws" as const,
      integration_mode: "direct_api" as const,
      transport_id: "pravo_official_api",
      transport_version: "existing-v1",
    };

    expect(evaluateResearchTransportDecision(input)).toEqual(evaluateResearchTransportDecision(input));
  });
});
