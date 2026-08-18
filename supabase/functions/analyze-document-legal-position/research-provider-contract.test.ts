import { describe, expect, test } from "bun:test";
import type { ResearchQuery } from "./fact-extraction.ts";
import type { RawSource } from "./repositories.ts";
import type { ResearchQuestion } from "./research-routing.ts";
import {
  executeResearchProvider,
  type LegalResearchProvider,
  type ResearchProviderDiagnostics,
} from "./research-provider-contract.ts";

const query: ResearchQuery = {
  practice_area: "tax",
  subcategory: null,
  document_type: null,
  facts: [],
  parties: [],
  amounts: [],
  dates: [],
  temporal_anchors: [],
  legal_issues: ["Применение ст. 54.1 НК РФ"],
  research_topics: [],
  keywords: [],
  articles: ["ст. 54.1 НК РФ"],
  organizations: [],
  inn: [],
  ogrn: [],
  semantic_intents: [],
  legal_concepts: [],
  metadata_terms: [],
  search_hypotheses: [],
};

const question: ResearchQuestion = {
  id: "issue-1",
  issue: "Применение ст. 54.1 НК РФ",
  modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
  source_roles: ["normative", "judicial", "official_explanation", "adverse", "temporal"],
  exact_terms: [],
  metadata_terms: [],
  semantic_terms: [],
  fact_pattern_terms: [],
  argument_terms: [],
  adverse_terms: [],
  temporal_terms: [],
  temporal_anchors: [],
  buckets: ["laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals"],
};

function rawSource(): RawSource {
  return {
    bucket: "laws",
    source_table: "external_provider",
    source_id: "doc-1",
    source_type: "law",
    title: "НК РФ ст. 54.1",
    official_url: "https://publication.pravo.gov.ru/example",
    citation: "НК РФ ст. 54.1",
    snippet: "test",
    metadata: {
      official_origin_verified: false,
      authority_level: "federal_law",
    },
  };
}

function diagnostics(providerId: string): ResearchProviderDiagnostics {
  return {
    provider_id: providerId,
    status: "success",
    integration_mode: "mcp",
    source_class: "retrieval_intermediary",
    latency_ms: 0,
    candidates_found: 1,
  };
}

describe("research provider contract", () => {
  test("normalizes provider provenance without overwriting legal authority metadata", async () => {
    const provider: LegalResearchProvider = {
      id: "law7",
      integration_mode: "mcp",
      source_class: "retrieval_intermediary",
      capabilities: ["query-laws"],
      isAvailable: () => true,
      search: async () => ({ sources: [rawSource()], diagnostics: diagnostics("law7") }),
    };

    const result = await executeResearchProvider(provider, query, { question, practice_area: "tax" });
    expect(result.diagnostics.status).toBe("success");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].metadata.provider_id).toBe("law7");
    expect(result.sources[0].metadata.provider_source_class).toBe("retrieval_intermediary");
    expect(result.sources[0].metadata.authority_level).toBe("federal_law");
    // A retrieval intermediary cannot become official merely through provider annotation.
    expect(result.sources[0].metadata.official_origin_verified).toBe(false);
  });

  test("returns unavailable diagnostics without executing provider search", async () => {
    let searched = false;
    const provider: LegalResearchProvider = {
      id: "law7",
      integration_mode: "mcp",
      source_class: "retrieval_intermediary",
      capabilities: [],
      isAvailable: () => false,
      search: async () => {
        searched = true;
        return { sources: [], diagnostics: diagnostics("law7") };
      },
    };

    const result = await executeResearchProvider(provider, query, { question, practice_area: "tax" });
    expect(searched).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.diagnostics.status).toBe("unavailable");
  });

  test("fails soft when an optional provider throws", async () => {
    const provider: LegalResearchProvider = {
      id: "strizh",
      integration_mode: "partner_api",
      source_class: "retrieval_intermediary",
      capabilities: [],
      isAvailable: () => true,
      search: async () => { throw new Error("temporary upstream failure"); },
    };

    const result = await executeResearchProvider(provider, query, { question, practice_area: "tax" });
    expect(result.sources).toEqual([]);
    expect(result.diagnostics.status).toBe("failed");
    expect(result.diagnostics.error_code).toBe("provider_exception");
    expect(result.diagnostics.error_message).toContain("upstream failure");
  });
});
