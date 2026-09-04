import { describe, expect, test } from "bun:test";
import { buildResearchQueryPlan } from "./research-query-plan.ts";
import type { ResearchQuestion } from "./research-routing.ts";
import { evaluateResearchTransportDecision } from "./research-transport-policy.ts";
import {
  buildResearchRetrievalIdempotencyKey,
  classifyResearchRetrievalError,
  executeApprovedResearchRetrieval,
  queryFromResearchPlan,
  type PravoRetriever,
} from "./research-retrieval-adapter.ts";
import type { OfficialSourceDiagnostics, OfficialSourceResult } from "./official-sources.ts";

function question(): ResearchQuestion {
  return {
    id: "issue-08d",
    issue: "Применимость статьи 54.1 НК РФ к налоговой реконструкции",
    modes: ["exact", "semantic", "issue_argument"],
    source_roles: ["normative", "judicial"],
    exact_terms: ["ст. 54.1 НК РФ", "служебный маркер"],
    metadata_terms: [],
    semantic_terms: ["налоговая реконструкция"],
    fact_pattern_terms: [],
    argument_terms: ["пределы налоговой выгоды"],
    adverse_terms: [],
    temporal_terms: [],
    temporal_anchors: [],
    buckets: ["laws", "court_practice"],
  };
}

function plan() {
  return buildResearchQueryPlan({
    matter_id: "matter-08d",
    legal_analysis_run_id: "run-08d",
    research_issue: question(),
    revision: 1,
    sensitivity_class: "public_legal_issue",
    applicable_provisions: ["ст. 54.1 НК РФ"],
    temporal_window: { from: "2023-01-01", to: "2024-12-31" },
  });
}

function approvedDecision(p = plan()) {
  return evaluateResearchTransportDecision({
    plan: p,
    provider_id: "pravo",
    provider_capabilities: ["laws"],
    required_capability: "laws",
    integration_mode: "direct_api",
    transport_id: "pravo_official_api",
    transport_version: "existing-v1",
  });
}

function diagnostics(): OfficialSourceDiagnostics {
  return {
    enabled: true,
    pravo_exact_attempted: 1,
    pravo_context_attempted: 0,
    pravo_found: 1,
    pravo_identity_verified: 1,
    pravo_ambiguous: 0,
    substantive_usable: 0,
    registered_providers: 6,
    failures: [],
  };
}

function source(): OfficialSourceResult {
  return {
    bucket: "laws",
    source_table: "external_official_source",
    source_id: "pravo:fixture",
    source_type: "official_publication_pravo",
    title: "Федеральный закон",
    official_url: "https://publication.pravo.gov.ru/document/fixture",
    citation: "Федеральный закон",
    snippet: "Синтетический официальный источник",
    metadata: {
      provider_id: "pravo",
      substantive_use_allowed: false,
      verification_status: "identity",
    },
  };
}

describe("Prompt 08D bounded Pravo reference adapter", () => {
  test("executes an approved Pravo decision through an injected retriever and preserves safety semantics", async () => {
    const p = plan();
    const decision = approvedDecision(p);
    let calls = 0;
    const retriever: PravoRetriever = async () => {
      calls += 1;
      return { sources: [source()], diagnostics: diagnostics() };
    };
    const result = await executeApprovedResearchRetrieval({ plan: p, decision, retriever });
    expect(calls).toBe(1);
    expect(result.diagnostics.status).toBe("success");
    expect(result.diagnostics.candidates_found).toBe(1);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].metadata.substantive_use_allowed).toBe(false);
    expect(result.sources[0].metadata.research_query_plan_id).toBe(p.plan_id);
    expect(result.sources[0].metadata.research_transport_status).toBe("approved_retrieval");
    expect(result.sources[0].metadata.research_retrieval_adapter_version).toBe("08D-v1");
    expect(result.sources[0].metadata.retrieval_candidate_only).toBe(true);
  });

  test("fails closed before invoking any retriever for BRAS/KAD manual-only transport", async () => {
    const p = plan();
    const decision = evaluateResearchTransportDecision({
      plan: p,
      provider_id: "bras_kad",
      provider_capabilities: ["court_practice"],
      required_capability: "court_practice",
      integration_mode: "manual_import",
    });
    let calls = 0;
    const retriever: PravoRetriever = async () => {
      calls += 1;
      return { sources: [source()], diagnostics: diagnostics() };
    };
    const result = await executeApprovedResearchRetrieval({ plan: p, decision, retriever });
    expect(calls).toBe(0);
    expect(result.sources).toEqual([]);
    expect(result.diagnostics.status).toBe("blocked");
    expect(result.diagnostics.error_code).toBe("transport_not_approved");
  });

  test("rejects a decision belonging to a different query plan", async () => {
    const p1 = plan();
    const p2 = buildResearchQueryPlan({
      matter_id: "matter-other",
      legal_analysis_run_id: "run-other",
      research_issue: question(),
      revision: 2,
      applicable_provisions: ["ст. 54.1 НК РФ"],
    });
    let calls = 0;
    const retriever: PravoRetriever = async () => {
      calls += 1;
      return { sources: [], diagnostics: diagnostics() };
    };
    const result = await executeApprovedResearchRetrieval({ plan: p1, decision: approvedDecision(p2), retriever });
    expect(calls).toBe(0);
    expect(result.diagnostics.error_code).toBe("decision_plan_mismatch");
  });

  test("builds a deterministic idempotency key from plan and transport decision", () => {
    const p = plan();
    const decision = approvedDecision(p);
    const first = buildResearchRetrievalIdempotencyKey(p, decision);
    const second = buildResearchRetrievalIdempotencyKey(p, decision);
    expect(first).toBe(second);
    expect(first).toMatch(/^rrj_[0-9a-f]{8}$/);
  });

  test("converts only structured/redacted facets to the external Pravo query", () => {
    const query = queryFromResearchPlan(plan());
    expect(query.legal_issues).toEqual([]);
    expect(query.semantic_intents).toEqual([]);
    expect(query.search_hypotheses).toEqual([]);
    expect(query.articles).toEqual(["ст. 54.1 НК РФ"]);
    expect(query.parties).toEqual([]);
    expect(query.organizations).toEqual([]);
    expect(query.inn).toEqual([]);
    expect(query.ogrn).toEqual([]);
    expect(JSON.stringify(query)).not.toContain("служебный маркер");
    expect(JSON.stringify(query)).not.toContain("налоговой реконструкции");
  });

  test("does not invoke a retriever when privacy projection is not executable", async () => {
    const unclassified = buildResearchQueryPlan({
      matter_id: "matter-private",
      legal_analysis_run_id: "run-private",
      research_issue: question(),
      applicable_provisions: ["ст. 54.1 НК РФ"],
    });
    let calls = 0;
    const retriever: PravoRetriever = async () => {
      calls += 1;
      return { sources: [], diagnostics: diagnostics() };
    };
    const result = await executeApprovedResearchRetrieval({
      plan: unclassified,
      decision: approvedDecision(unclassified),
      retriever,
    });
    expect(calls).toBe(0);
    expect(result.diagnostics.status).toBe("blocked");
    expect(result.diagnostics.error_code).toBe("privacy_external_query_blocked");
  });

  test("uses bounded retry and succeeds on the second mock attempt", async () => {
    const p = plan();
    const decision = approvedDecision(p);
    let calls = 0;
    const retriever: PravoRetriever = async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary_failure");
      return { sources: [source()], diagnostics: diagnostics() };
    };
    const result = await executeApprovedResearchRetrieval({ plan: p, decision, retriever, max_attempts: 2 });
    expect(calls).toBe(2);
    expect(result.diagnostics.attempts).toBe(2);
    expect(result.diagnostics.max_attempts).toBe(2);
    expect(result.diagnostics.status).toBe("success");
  });

  test("caps retry contract at two attempts and returns fail-soft diagnostics", async () => {
    const p = plan();
    const decision = approvedDecision(p);
    let calls = 0;
    const retriever: PravoRetriever = async () => {
      calls += 1;
      throw new Error("persistent_failure");
    };
    const result = await executeApprovedResearchRetrieval({ plan: p, decision, retriever, max_attempts: 99 });
    expect(calls).toBe(2);
    expect(result.sources).toEqual([]);
    expect(result.diagnostics.max_attempts).toBe(2);
    expect(result.diagnostics.status).toBe("failed");
    expect(result.diagnostics.error_code).toBe("retrieval_provider_error");
  });

  test("uses a closed error taxonomy and never exposes provider error text", async () => {
    const p = plan();
    const decision = approvedDecision(p);
    const rawError = "https://provider.example/search?token=secret-token&case=private-case";
    const retriever: PravoRetriever = async () => {
      throw new Error(rawError);
    };
    const result = await executeApprovedResearchRetrieval({ plan: p, decision, retriever });
    expect(result.diagnostics.error_code).toBe("retrieval_provider_error");
    expect(JSON.stringify(result.diagnostics)).not.toContain(rawError);
    expect(JSON.stringify(result.diagnostics)).not.toContain("secret-token");
  });

  test("redacts provider diagnostic failure strings and classifies timeout/network errors", async () => {
    const p = plan();
    const decision = approvedDecision(p);
    const retriever: PravoRetriever = async () => ({
      sources: [],
      diagnostics: {
        ...diagnostics(),
        failures: ["Bearer provider-secret https://provider.example/private"],
      },
    });
    const result = await executeApprovedResearchRetrieval({ plan: p, decision, retriever });
    expect(result.diagnostics.provider_diagnostics?.failures).toEqual(["provider_failure"]);
    expect(JSON.stringify(result.diagnostics)).not.toContain("provider-secret");
    expect(classifyResearchRetrievalError(new Error("retrieval_timeout"))).toBe("retrieval_timeout");
    expect(classifyResearchRetrievalError(new TypeError("fetch failed"))).toBe("retrieval_network_error");
    expect(classifyResearchRetrievalError({ reason: "untrusted" })).toBe("retrieval_unknown_error");
  });
});
