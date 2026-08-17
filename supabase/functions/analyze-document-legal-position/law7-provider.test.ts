import { describe, expect, test } from "bun:test";
import type { ResearchQuery } from "./fact-extraction.ts";
import type { ResearchQuestion } from "./research-routing.ts";
import { executeResearchProvider } from "./research-provider-contract.ts";
import {
  buildLaw7ToolPlan,
  Law7ResearchProvider,
  type Law7McpTransport,
} from "./law7-provider.ts";

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
    modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
    source_roles: ["normative", "judicial", "official_explanation", "adverse", "temporal"],
    exact_terms: ["ст. 54.1 НК РФ"],
    metadata_terms: [],
    semantic_terms: [],
    fact_pattern_terms: [],
    argument_terms: [],
    adverse_terms: [],
    temporal_terms: ["2022-03-01"],
    temporal_anchors: [{
      role: "transaction_date",
      label: "Дата спорной операции",
      date: "2022-03-01",
      date_from: null,
      date_to: null,
      basis: "Дата установлена из первичных документов",
    }],
    buckets: ["laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals"],
    ...overrides,
  };
}

describe("Law7 MCP provider adapter", () => {
  test("plans historical code article lookup and amendment history from issue-specific temporal anchor", () => {
    const calls = buildLaw7ToolPlan(
      query({ articles: ["ст. 54.1 НК РФ"] }),
      question(),
    );

    expect(calls[0]).toEqual({
      name: "get-article-version",
      purpose: "temporal_version",
      arguments: {
        code_id: "NK_RF",
        article_number: "54.1",
        as_of_date: "2022-03-01",
        include_amendment_chain: false,
      },
    });
    expect(calls.some((call) => call.name === "trace-amendment-history")).toBe(true);
  });

  test("falls back to query-laws for an individual-act issue without a code article", () => {
    const q = question({
      issue: "Федеральный закон о государственной регистрации недвижимости",
      exact_terms: [],
      temporal_anchors: [],
    });
    const calls = buildLaw7ToolPlan(query(), q);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("query-laws");
    expect(calls[0].arguments.use_hybrid).toBe(false);
  });

  test("is unavailable by default when no real MCP transport is configured", async () => {
    const provider = new Law7ResearchProvider(null);
    const result = await executeResearchProvider(
      provider,
      query({ articles: ["ст. 54.1 НК РФ"] }),
      { question: question(), practice_area: "tax" },
    );
    expect(result.sources).toEqual([]);
    expect(result.diagnostics.status).toBe("unavailable");
  });

  test("normalizes MCP article output as intermediary evidence requiring primary verification", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const transport: Law7McpTransport = {
      isAvailable: () => true,
      callTool: async (name, args) => {
        calls.push({ name, args });
        if (name === "get-article-version") {
          return `# Налоговый кодекс Российской Федерации (NK_RF)\n\n# Article 54.1\n\n[HISTORICAL]\n\n## Metadata\n- **Code ID**: NK_RF\n- **Article Number**: 54.1\n- **Version Date**: 01.01.2022\n- **Status**: Historical\n- **Source Amendment**: 163-ФЗ\n\n## Full Text\nСтатья 54.1. Пределы осуществления прав по исчислению налоговой базы.\n`;
        }
        return `# Amendment History: Article 54.1\n\n**Code ID**: NK_RF\n**Total Versions**: 2`;
      },
    };
    const provider = new Law7ResearchProvider(transport);
    const result = await executeResearchProvider(
      provider,
      query({ articles: ["ст. 54.1 НК РФ"] }),
      { question: question(), practice_area: "tax" },
    );

    expect(calls.some((call) => call.name === "get-article-version")).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
    const article = result.sources.find((source) => source.source_type === "law7_article_version");
    expect(article).toBeDefined();
    expect(article?.metadata.provider_id).toBe("law7");
    expect(article?.metadata.provider_source_class).toBe("retrieval_intermediary");
    expect(article?.metadata.official_origin_verified).toBe(false);
    expect(article?.metadata.substantive_use_allowed).toBe(false);
    expect(article?.metadata.verification_status).toBe("needs_primary_verification");
    expect(article?.metadata.research_issue_ids).toEqual(["issue-1"]);
    expect(article?.snippet).toContain("Пределы осуществления прав");
  });
});
