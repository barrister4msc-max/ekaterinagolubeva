import { describe, expect, test } from "bun:test";
import type { ResearchQuery } from "./fact-extraction.ts";
import { runAllRepositories } from "./repositories.ts";

class EmptyQueryBuilder implements PromiseLike<{ data: unknown[]; error: null }> {
  select() { return this; }
  eq() { return this; }
  or() { return this; }
  filter() { return this; }
  not() { return this; }
  in() { return this; }
  ilike() { return this; }
  limit() { return this; }
  order() { return this; }
  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: [], error: null }).then(onfulfilled ?? undefined);
  }
}

function sbWithLaw7(options: { available: boolean }) {
  return {
    from: () => new EmptyQueryBuilder(),
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === "law7_mirror_is_available") {
        return { data: options.available, error: null };
      }
      if (name === "law7_mirror_get_article_version") {
        expect(args?.p_code_id).toBe("NK_RF");
        expect(args?.p_article_number).toBe("54.1");
        return {
          data: [{
            code_id: "NK_RF",
            article_number: "54.1",
            version_date: "2022-01-01",
            article_title: "Статья 54.1 — СИНТЕТИЧЕСКИЙ TEST FIXTURE",
            article_text: "СИНТЕТИЧЕСКИЙ TEST FIXTURE TEXT. Не является текстом закона.",
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
      if (name === "law7_mirror_trace_amendment_history") {
        return { data: [], error: null };
      }
      if (name === "law7_mirror_query_laws") {
        return { data: [], error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  };
}

function query(): ResearchQuery {
  return {
    practice_area: "tax",
    subcategory: null,
    document_type: null,
    facts: ["СИНТЕТИЧЕСКИЙ факт для routing test"],
    parties: [],
    amounts: [],
    dates: ["2022-03-01"],
    temporal_anchors: [{
      role: "transaction_date",
      label: "Дата операции",
      date: "2022-03-01",
      date_from: null,
      date_to: null,
      basis: "fixture",
    }],
    legal_issues: ["Применение ст. 54.1 НК РФ"],
    research_topics: ["ст. 54.1 НК РФ"],
    keywords: ["54.1"],
    articles: ["ст. 54.1 НК РФ"],
    organizations: [],
    inn: [],
    ogrn: [],
    semantic_intents: [],
    legal_concepts: [],
    metadata_terms: ["НК РФ 54.1"],
    search_hypotheses: [],
  };
}

describe("Law7 mirror wiring in runAllRepositories", () => {
  test("is fail-soft when mirror has not been synced", async () => {
    const result = await runAllRepositories(sbWithLaw7({ available: false }) as any, query(), "tax");
    expect(result.counts.law7_found).toBe(0);
    expect(result.counts.law7_provider_unavailable).toBeGreaterThan(0);
    expect(result.sources.some((source) => source.metadata?.provider_id === "law7")).toBe(false);
  });

  test("adds Law7 mirror candidates to ordinary RawSource flow without self-certifying authority", async () => {
    const result = await runAllRepositories(sbWithLaw7({ available: true }) as any, query(), "tax");
    expect(result.counts.law7_found).toBeGreaterThan(0);
    expect(result.counts.law7_provider_success).toBeGreaterThan(0);
    const source = result.sources.find((item) => item.metadata?.provider_id === "law7");
    expect(source).toBeDefined();
    expect(source?.bucket).toBe("laws");
    expect(source?.metadata.provider_integration_mode).toBe("local");
    expect(source?.metadata.retrieval_method).toBe("supabase_law7_mirror");
    expect(source?.metadata.provider_source_class).toBe("retrieval_intermediary");
    expect(source?.metadata.official_origin_verified).toBe(false);
    expect(source?.metadata.substantive_use_allowed).toBe(false);
    expect(Array.isArray(source?.metadata.research_issue_ids)).toBe(true);
  });
});
