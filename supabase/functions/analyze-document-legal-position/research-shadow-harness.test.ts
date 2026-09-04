import { describe, expect, test } from "bun:test";
import type { ResearchQuestion } from "./research-routing.ts";
import type { RawSource } from "./repositories.ts";
import type { OfficialSourceDiagnostics, OfficialSourceResult } from "./official-sources.ts";
import type { PravoRetriever } from "./research-retrieval-adapter.ts";
import { runResearchRetrievalShadow } from "./research-shadow-harness.ts";

function question(): ResearchQuestion {
  return {
    id: "issue-08f",
    issue: "Применимость статьи 54.1 НК РФ к налоговой реконструкции",
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
    buckets: ["laws", "court_practice"],
  };
}

function legacy(): RawSource[] {
  return [{
    bucket: "laws",
    source_table: "legal_knowledge_chunks",
    source_id: "legacy:54.1",
    source_type: "federal_law",
    title: "НК РФ — статья 54.1",
    official_url: null,
    citation: "ст. 54.1 НК РФ",
    snippet: "legacy",
    metadata: {
      canonical_document_key: "ru:laws:nk:54.1",
      substantive_use_allowed: true,
    },
  }];
}

function diagnostics(): OfficialSourceDiagnostics {
  return {
    enabled: true,
    pravo_exact_attempted: 1,
    pravo_context_attempted: 0,
    pravo_found: 1,
    pravo_identity_verified: 1,
    pravo_ambiguous: 0,
    substantive_usable: 1,
    registered_providers: 6,
    failures: [],
  };
}

function official(overrides: Record<string, unknown> = {}): OfficialSourceResult {
  return {
    bucket: "laws",
    source_table: "external_official_source",
    source_id: "pravo:54.1",
    source_type: "official_publication_pravo",
    title: "НК РФ — статья 54.1",
    official_url: "https://publication.pravo.gov.ru/document/fixture",
    citation: "ст. 54.1 НК РФ",
    snippet: "fixture",
    metadata: {
      canonical_document_key: "ru:laws:nk:54.1",
      safety: {
        official_origin_verified: true,
        document_identity_verified: true,
        content_verified: true,
        actuality_status: "verified",
        substantive_use_allowed: true,
        verification_level: "substantive",
      },
      ...overrides,
    },
  };
}

function input(retriever?: PravoRetriever) {
  return {
    matter_id: "matter-08f",
    legal_analysis_run_id: "run-08f",
    research_issue: question(),
    legacy_sources: legacy(),
    applicable_provisions: ["ст. 54.1 НК РФ"],
    sensitivity_class: "public_legal_issue" as const,
    retriever,
  };
}

describe("Prompt 08F research retrieval shadow harness", () => {
  test("is opt-in and default OFF without invoking retrieval", async () => {
    let calls = 0;
    const retriever: PravoRetriever = async () => {
      calls += 1;
      return { sources: [official()], diagnostics: diagnostics() };
    };
    const result = await runResearchRetrievalShadow(input(retriever));
    expect(calls).toBe(0);
    expect(result.status).toBe("disabled");
    expect(result.enabled).toBe(false);
    expect(result.primary_unchanged).toBe(true);
    expect(result.shadow.discovered_sources).toBe(0);
  });

  test("enabled shadow requires an explicit retriever and never falls back to live network implicitly", async () => {
    const ticks = [10, 11];
    const result = await runResearchRetrievalShadow({
      ...input(),
      enabled: true,
      now: () => ticks.shift() ?? 11,
    });
    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("shadow_retriever_not_configured");
    expect(result.shadow.error_count).toBe(1);
    expect(result.shadow.discovered_sources).toBe(0);
    expect(result.primary_unchanged).toBe(true);
  });

  test("runs 08B-08E in shadow with deterministic bounded parity telemetry", async () => {
    const retriever: PravoRetriever = async () => ({ sources: [official()], diagnostics: diagnostics() });
    const ticks = [1000, 1012];
    const result = await runResearchRetrievalShadow({
      ...input(retriever),
      enabled: true,
      now: () => ticks.shift() ?? 1012,
    });
    expect(result.status).toBe("completed");
    expect(result.provider_id).toBe("pravo");
    expect(result.transport_status).toBe("approved_retrieval");
    expect(result.plan_id).toMatch(/^rqp_/);
    expect(result.primary_unchanged).toBe(true);
    expect(result.legacy.discovered_sources).toBe(1);
    expect(result.shadow.discovered_sources).toBe(1);
    expect(result.shadow.canonical_matches).toBe(1);
    expect(result.shadow.substantive_admitted).toBe(0);
    expect(result.shadow.discovery_only).toBe(0);
    expect(result.shadow.blocked).toBe(0);
    expect(result.shadow.duplicate_sources).toBe(0);
    expect(result.shadow.source_family_coverage).toEqual(["normative_retrieval"]);
    expect(result.shadow.latency_ms).toBe(12);
    expect(result.shadow.error_count).toBe(0);
    expect(result.shadow.safety_regressions).toBe(0);
    expect(result.parity.discovered_delta).toBe(0);
    expect(JSON.stringify(result)).not.toContain("налоговой реконструкции");
    expect(JSON.stringify(result)).not.toContain("legacy:54.1");
  });

  test("reports a standalone fully verified source as substantive without changing primary", async () => {
    const retriever: PravoRetriever = async () => ({
      sources: [official({ canonical_document_key: "ru:laws:document:new" })],
      diagnostics: diagnostics(),
    });
    const result = await runResearchRetrievalShadow({
      ...input(retriever),
      enabled: true,
      now: () => 100,
      local_sources_for_admission: [],
    });
    expect(result.primary_unchanged).toBe(true);
    expect(result.shadow.substantive_admitted).toBe(1);
    expect(result.shadow.safety_regressions).toBe(0);
    expect(result.parity.substantive_delta).toBe(0);
  });

  test("keeps unverified candidates discovery-only and records no safety regression", async () => {
    const retriever: PravoRetriever = async () => ({
      sources: [official({
        safety: {
          official_origin_verified: true,
          document_identity_verified: true,
          content_verified: false,
          actuality_status: "unknown",
          substantive_use_allowed: false,
          verification_level: "identity",
        },
      })],
      diagnostics: diagnostics(),
    });
    const result = await runResearchRetrievalShadow({ ...input(retriever), enabled: true, now: () => 1 });
    expect(result.shadow.discovery_only).toBe(1);
    expect(result.shadow.substantive_admitted).toBe(0);
    expect(result.shadow.safety_regressions).toBe(0);
  });

  test("is fail-soft and never exposes raw retrieval errors in telemetry", async () => {
    const secret = "ИНН 7701234567 ООО «Секретный клиент»";
    const retriever: PravoRetriever = async () => {
      throw new Error(`synthetic_shadow_failure ${secret}`);
    };
    const ticks = [20, 27];
    const result = await runResearchRetrievalShadow({
      ...input(retriever),
      enabled: true,
      now: () => ticks.shift() ?? 27,
    });
    expect(result.status).toBe("completed");
    expect(result.primary_unchanged).toBe(true);
    expect(result.shadow.error_count).toBe(1);
    expect(result.shadow.discovered_sources).toBe(0);
    expect(result.error_code).toBe("shadow_retrieval_failed");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("7701234567");
    expect(JSON.stringify(result)).not.toContain("Секретный клиент");
  });

  test("never exposes a BRAS/KAD network option in the shadow contract", async () => {
    const retriever: PravoRetriever = async () => ({ sources: [], diagnostics: diagnostics() });
    const result = await runResearchRetrievalShadow({ ...input(retriever), enabled: true, now: () => 1 });
    expect(result.provider_id).toBe("pravo");
    expect(JSON.stringify(result)).not.toContain("bras_kad");
    expect(JSON.stringify(result)).not.toContain("kad.arbitr.ru");
  });
});
