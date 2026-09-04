import { describe, expect, test } from "bun:test";
import type { ResearchQuestion } from "./research-routing.ts";
import type { BrasKadApiCloudConfig, BrasKadFetch } from "./bras-kad-api-cloud.ts";
import { runBrasKadPartnerShadow } from "./bras-kad-shadow-harness.ts";

const question: ResearchQuestion = {
  id: "shadow-bras-kad", issue: "Применение статьи 54.1 НК РФ арбитражными судами",
  modes: ["exact"], source_roles: ["judicial"], exact_terms: [], metadata_terms: [], semantic_terms: [],
  fact_pattern_terms: [], argument_terms: [], adverse_terms: [], temporal_terms: [], temporal_anchors: [],
  buckets: ["court_practice"],
};

const config: BrasKadApiCloudConfig = {
  enabled: true,
  token: "synthetic-token-not-for-telemetry",
  contract_id: "synthetic-contract",
  transport_version: "test-v1",
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    matter_id: "matter-shadow", legal_analysis_run_id: "run-shadow", research_issue: question,
    legacy_sources: [], exact_case_number: "А40-12345/2024",
    sensitivity_class: "public_case_reference" as const,
    ...overrides,
  };
}

describe("contracted BRAS/KAD shadow consumer", () => {
  test("is default OFF and never invokes the injected transport", async () => {
    let calls = 0;
    const fetcher: BrasKadFetch = async () => { calls += 1; return new Response(); };
    const telemetry = await runBrasKadPartnerShadow(input({ config, fetcher }));
    expect(telemetry.status).toBe("disabled");
    expect(telemetry.primary_unchanged).toBe(true);
    expect(calls).toBe(0);
  });

  test("requires injected adapter dependencies and cannot silently use env or global fetch", async () => {
    const telemetry = await runBrasKadPartnerShadow(input({ enabled: true }));
    expect(telemetry.status).toBe("failed");
    expect(telemetry.error_code).toBe("shadow_adapter_not_configured");
    expect(telemetry.primary_unchanged).toBe(true);
  });

  test("observes a candidate as discovery-only without changing accepted sources", async () => {
    let calls = 0;
    const fetcher: BrasKadFetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: 200, Result: [{
        CaseId: "case-id", CaseUrl: "https://kad.arbitr.ru/Card/case-id",
        InstanceNumber: "А40-12345/2024", RegistrationDate: "2024-02-17",
        Court: "АС города Москвы", Type: "Решение",
      }] }), { status: 200 });
    };
    const ticks = [10, 18];
    const telemetry = await runBrasKadPartnerShadow(input({
      enabled: true, config, fetcher, now: () => ticks.shift() ?? 18,
    }));
    expect(calls).toBe(1);
    expect(telemetry.status).toBe("completed");
    expect(telemetry.transport_status).toBe("approved_retrieval");
    expect(telemetry.candidates_found).toBe(1);
    expect(telemetry.discovery_only).toBe(1);
    expect(telemetry.substantive_admitted).toBe(0);
    expect(telemetry.primary_unchanged).toBe(true);
    expect(telemetry.latency_ms).toBe(8);
    const serialized = JSON.stringify(telemetry);
    expect(serialized).not.toContain(config.token!);
    expect(serialized).not.toContain("А40-12345/2024");
    expect(serialized).not.toContain("kad.arbitr.ru");
  });

  test("blocks a restricted plan before the provider transport", async () => {
    let calls = 0;
    const fetcher: BrasKadFetch = async () => { calls += 1; return new Response(); };
    const telemetry = await runBrasKadPartnerShadow(input({
      enabled: true, config, fetcher, sensitivity_class: "restricted_exact_party",
    }));
    expect(calls).toBe(0);
    expect(telemetry.status).toBe("completed");
    expect(telemetry.transport_status).toBe("blocked");
    expect(telemetry.error_code).toBe("shadow_retrieval_blocked");
    expect(telemetry.primary_unchanged).toBe(true);
  });

  test("redacts failed provider details from shadow telemetry", async () => {
    const secret = "token=super-secret; ИНН 7701234567";
    const fetcher: BrasKadFetch = async () => { throw new Error(secret); };
    const telemetry = await runBrasKadPartnerShadow(input({ enabled: true, config, fetcher }));
    expect(telemetry.status).toBe("completed");
    expect(telemetry.error_code).toBe("shadow_retrieval_failed");
    expect(JSON.stringify(telemetry)).not.toContain(secret);
    expect(JSON.stringify(telemetry)).not.toContain("7701234567");
  });
});
