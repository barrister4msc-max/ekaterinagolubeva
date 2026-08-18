import { describe, expect, test } from "bun:test";
import type { ResearchQuery } from "./fact-extraction.ts";
import type { ResearchQuestion } from "./research-routing.ts";
import { executeResearchProvider } from "./research-provider-contract.ts";
import {
  SupabaseLaw7ResearchProvider,
  SupabaseLaw7Transport,
} from "./law7-supabase-transport.ts";

type RpcReply = { data: unknown; error: { message?: string } | null };

function mockClient(
  handler: (name: string, args?: Record<string, unknown>) => RpcReply | Promise<RpcReply>,
) {
  return {
    rpc: (name: string, args?: Record<string, unknown>) => Promise.resolve(handler(name, args)),
  };
}

function query(overrides: Partial<ResearchQuery> = {}): ResearchQuery {
  return {
    practice_area: "tax",
    subcategory: null,
    document_type: null,
    facts: [],
    parties: [],
    amounts: [],
    dates: [],
    temporal_anchors: [],
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
    ...overrides,
  };
}

function question(overrides: Partial<ResearchQuestion> = {}): ResearchQuestion {
  return {
    id: "issue-1",
    issue: "Применение ст. 54.1 НК РФ к спорной операции",
    modes: ["exact", "metadata", "semantic", "temporal"],
    source_roles: ["normative", "temporal"],
    exact_terms: ["ст. 54.1 НК РФ"],
    metadata_terms: [],
    semantic_terms: [],
    fact_pattern_terms: [],
    argument_terms: [],
    adverse_terms: [],
    temporal_terms: ["2022-03-01"],
    temporal_anchors: [{
      role: "transaction_date",
      label: "Дата операции",
      date: "2022-03-01",
      date_from: null,
      date_to: null,
      basis: "fixture",
    }],
    buckets: ["laws"],
    ...overrides,
  };
}

describe("SupabaseLaw7Transport", () => {
  test("is fail-closed when mirror is unavailable or RPC fails", async () => {
    const unavailable = new SupabaseLaw7Transport(mockClient((name) => ({
      data: name === "law7_mirror_is_available" ? false : null,
      error: null,
    })));
    expect(await unavailable.isAvailable()).toBe(false);

    const failed = new SupabaseLaw7Transport(mockClient(() => ({
      data: null,
      error: { message: "no function" },
    })));
    expect(await failed.isAvailable()).toBe(false);
  });

  test("maps historical article lookup to bounded service-role RPC args and compatible output", async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const transport = new SupabaseLaw7Transport(mockClient((name, args) => {
      calls.push({ name, args });
      if (name === "law7_mirror_get_article_version") {
        return {
          data: [{
            code_id: "NK_RF",
            article_number: "54.1",
            version_date: "2022-01-01",
            article_title: "Статья 54.1",
            article_text: "СИНТЕТИЧЕСКИЙ TEST FIXTURE TEXT",
            amendment_eo_number: "fixture-amendment",
            amendment_date: "2021-12-01",
            is_current: false,
            is_repealed: false,
            repealed_date: null,
            text_hash: "fixture-hash",
          }],
          error: null,
        };
      }
      return { data: null, error: null };
    }));

    const output = await transport.callTool("get-article-version", {
      code_id: "NK_RF",
      article_number: "54.1",
      as_of_date: "2022-03-01",
    });

    expect(calls[0]).toEqual({
      name: "law7_mirror_get_article_version",
      args: {
        p_code_id: "NK_RF",
        p_article_number: "54.1",
        p_as_of_date: "2022-03-01",
      },
    });
    expect(output).toContain("- **Version Date**: 2022-01-01");
    expect(output).toContain("- **Source Amendment**: fixture-amendment");
    expect(output).toContain("## Full Text");
    expect(output).toContain("SИНТЕТИЧЕСКИЙ TEST FIXTURE TEXT".replace("S", "С"));
  });

  test("bounds history and text search result counts", async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const transport = new SupabaseLaw7Transport(mockClient((name, args) => {
      calls.push({ name, args });
      if (name === "law7_mirror_trace_amendment_history") {
        return { data: [], error: null };
      }
      if (name === "law7_mirror_query_laws") {
        return { data: [], error: null };
      }
      return { data: false, error: null };
    }));

    await transport.callTool("trace-amendment-history", {
      code_id: "NK_RF",
      article_number: "54.1",
      limit: 999,
    });
    await transport.callTool("query-laws", {
      query: "налоговая реконструкция",
      max_results: 999,
    });

    expect(calls[0].args?.p_limit).toBe(50);
    expect(calls[1].args?.p_max_results).toBe(30);
  });
});

describe("SupabaseLaw7ResearchProvider", () => {
  test("reuses existing Law7 parser but reports local mirror provenance and remains non-substantive", async () => {
    const transport = new SupabaseLaw7Transport(mockClient((name) => {
      if (name === "law7_mirror_is_available") return { data: true, error: null };
      if (name === "law7_mirror_get_article_version") {
        return {
          data: [{
            code_id: "NK_RF",
            article_number: "54.1",
            version_date: "2022-01-01",
            article_title: "Статья 54.1",
            article_text: "СИНТЕТИЧЕСКИЙ TEST FIXTURE TEXT",
            amendment_eo_number: "fixture-amendment",
            is_current: false,
            is_repealed: false,
          }],
          error: null,
        };
      }
      if (name === "law7_mirror_trace_amendment_history") return { data: [], error: null };
      return { data: [], error: null };
    }));
    const provider = new SupabaseLaw7ResearchProvider(transport);
    const result = await executeResearchProvider(
      provider,
      query({ articles: ["ст. 54.1 НК РФ"] }),
      { question: question(), practice_area: "tax" },
    );

    expect(result.diagnostics.status).toBe("success");
    expect(result.diagnostics.integration_mode).toBe("local");
    const article = result.sources.find((source) => source.source_type === "law7_article_version");
    expect(article).toBeDefined();
    expect(article?.metadata.provider_integration_mode).toBe("local");
    expect(article?.metadata.retrieval_method).toBe("supabase_law7_mirror");
    expect(article?.metadata.law7_transport).toBe("supabase_rpc");
    expect(article?.metadata.provider_source_class).toBe("retrieval_intermediary");
    expect(article?.metadata.official_origin_verified).toBe(false);
    expect(article?.metadata.substantive_use_allowed).toBe(false);
    expect(article?.metadata.verification_status).toBe("needs_primary_verification");
  });
});
