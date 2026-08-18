import type { ResearchQuery } from "./fact-extraction.ts";
import type {
  LegalResearchProvider,
  ResearchProviderContext,
  ResearchProviderResult,
} from "./research-provider-contract.ts";
import {
  Law7ResearchProvider,
  type Law7McpTransport,
  type Law7ToolName,
} from "./law7-provider.ts";

// Minimal structural contract used by the Edge Function and tests. We keep it
// independent from a specific supabase-js version.
type SupabaseRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

type ArticleVersionRow = {
  code_id?: unknown;
  article_number?: unknown;
  version_date?: unknown;
  article_title?: unknown;
  article_text?: unknown;
  amendment_eo_number?: unknown;
  amendment_date?: unknown;
  is_current?: unknown;
  is_repealed?: unknown;
  repealed_date?: unknown;
  text_hash?: unknown;
};

type LawQueryRow = {
  code_id?: unknown;
  article_number?: unknown;
  version_date?: unknown;
  article_title?: unknown;
  article_text?: unknown;
  rank?: unknown;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function rows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((value): value is Record<string, unknown> => !!value && typeof value === "object");
  }
  if (data && typeof data === "object") return [data as Record<string, unknown>];
  return [];
}

async function rpc(
  sb: SupabaseRpcClient,
  name: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message ?? "rpc_failed"}`);
  return data;
}

function formatArticleVersion(row: ArticleVersionRow): string {
  const codeId = text(row.code_id) ?? "unknown";
  const article = text(row.article_number) ?? "unknown";
  const versionDate = text(row.version_date);
  const title = text(row.article_title);
  const articleText = text(row.article_text);
  const amendment = text(row.amendment_eo_number);
  const amendmentDate = text(row.amendment_date);
  const repealedDate = text(row.repealed_date);
  const status = bool(row.is_repealed)
    ? `Repealed${repealedDate ? ` ${repealedDate}` : ""}`
    : bool(row.is_current)
      ? "Current"
      : "Historical";

  return [
    `# ${codeId}`,
    "",
    `# Article ${article}`,
    "",
    "## Metadata",
    `- **Code ID**: ${codeId}`,
    `- **Article Number**: ${article}`,
    `- **Version Date**: ${versionDate ?? "unknown"}`,
    `- **Status**: ${status}`,
    `- **Source Amendment**: ${amendment ?? "unknown"}`,
    `- **Amendment Date**: ${amendmentDate ?? "unknown"}`,
    `- **Repealed Date**: ${repealedDate ?? "unknown"}`,
    "",
    "## Full Text",
    title ? `${title}\n${articleText ?? ""}` : (articleText ?? ""),
  ].join("\n");
}

function formatHistory(data: unknown, codeId: string, article: string): string {
  const history = rows(data) as ArticleVersionRow[];
  const lines = [
    `# Amendment History: Article ${article}`,
    "",
    `**Code ID**: ${codeId}`,
    `**Total Versions**: ${history.length}`,
    "",
    "## Versions",
  ];
  for (const row of history) {
    lines.push([
      `- ${text(row.version_date) ?? "unknown"}`,
      text(row.amendment_eo_number) ? `amendment ${text(row.amendment_eo_number)}` : null,
      bool(row.is_repealed) ? "repealed" : null,
    ].filter(Boolean).join(" — "));
  }
  return lines.join("\n");
}

function formatQueryResults(data: unknown, query: string): string {
  const found = rows(data) as LawQueryRow[];
  const sections = found.map((row, index) => {
    const codeId = text(row.code_id) ?? "unknown";
    const article = text(row.article_number) ?? "unknown";
    const version = text(row.version_date) ?? "unknown";
    const title = text(row.article_title);
    const body = text(row.article_text) ?? "";
    return [
      `## Result ${index + 1}`,
      `- **Code ID**: ${codeId}`,
      `- **Article Number**: ${article}`,
      `- **Version Date**: ${version}`,
      title ? `- **Title**: ${title}` : null,
      "",
      "## Full Text",
      body,
    ].filter((line): line is string => typeof line === "string").join("\n");
  });
  return [`# Law7 Mirror Search`, `Query: ${query}`, `Results: ${found.length}`, ...sections].join("\n\n");
}

/**
 * KATI-owned transport over service-role-only Supabase RPCs. It intentionally
 * implements the already existing Law7 transport contract so Analyzer/tool
 * planning does not fork into a second research engine.
 */
export class SupabaseLaw7Transport implements Law7McpTransport {
  constructor(private readonly sb: SupabaseRpcClient) {}

  async isAvailable(): Promise<boolean> {
    try {
      const data = await rpc(this.sb, "law7_mirror_is_available");
      return data === true;
    } catch {
      return false;
    }
  }

  async callTool(name: Law7ToolName, args: Record<string, unknown>): Promise<string> {
    if (name === "get-article-version") {
      const codeId = text(args.code_id);
      const article = text(args.article_number);
      if (!codeId || !article) throw new Error("get-article-version requires code_id and article_number");
      const data = await rpc(this.sb, "law7_mirror_get_article_version", {
        p_code_id: codeId,
        p_article_number: article,
        p_as_of_date: text(args.as_of_date),
      });
      const row = rows(data)[0] as ArticleVersionRow | undefined;
      return row ? formatArticleVersion(row) : "Error: article version not found";
    }

    if (name === "trace-amendment-history") {
      const codeId = text(args.code_id);
      const article = text(args.article_number);
      if (!codeId || !article) throw new Error("trace-amendment-history requires code_id and article_number");
      const requestedLimit = typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.trunc(args.limit)
        : 20;
      const data = await rpc(this.sb, "law7_mirror_trace_amendment_history", {
        p_code_id: codeId,
        p_article_number: article,
        p_limit: Math.min(Math.max(requestedLimit, 1), 50),
      });
      return formatHistory(data, codeId, article);
    }

    if (name === "query-laws") {
      const query = text(args.query);
      if (!query) throw new Error("query-laws requires query");
      const requestedMax = typeof args.max_results === "number" && Number.isFinite(args.max_results)
        ? Math.trunc(args.max_results)
        : 10;
      const data = await rpc(this.sb, "law7_mirror_query_laws", {
        p_query: query,
        p_max_results: Math.min(Math.max(requestedMax, 1), 30),
      });
      return formatQueryResults(data, query);
    }

    const exhaustive: never = name;
    throw new Error(`Unsupported Law7 tool: ${exhaustive}`);
  }
}

/**
 * Truthful provider facade for the Supabase mirror. The existing
 * Law7ResearchProvider remains the parser/tool planner; this facade only fixes
 * runtime provenance from `mcp` to `local` and does not change authority.
 */
export class SupabaseLaw7ResearchProvider implements LegalResearchProvider {
  readonly id = "law7";
  readonly integration_mode = "local" as const;
  readonly source_class = "retrieval_intermediary" as const;
  readonly capabilities = ["query-laws", "get-article-version", "trace-amendment-history"] as const;
  private readonly delegate: Law7ResearchProvider;

  constructor(transport: SupabaseLaw7Transport) {
    this.delegate = new Law7ResearchProvider(transport);
  }

  isAvailable(): Promise<boolean> {
    return this.delegate.isAvailable();
  }

  async search(query: ResearchQuery, context: ResearchProviderContext): Promise<ResearchProviderResult> {
    const result = await this.delegate.search(query, context);
    return {
      sources: result.sources.map((source) => ({
        ...source,
        metadata: {
          ...(source.metadata ?? {}),
          provider_integration_mode: "local",
          retrieval_method: "supabase_law7_mirror",
          law7_transport: "supabase_rpc",
          // Mirror content is still intermediary retrieval evidence. Official
          // authority requires the normal KATI canonical/verification path.
          official_origin_verified: false,
          primary_source_verified: false,
          substantive_use_allowed: false,
        },
      })),
      diagnostics: {
        ...result.diagnostics,
        integration_mode: "local",
        details: {
          ...(result.diagnostics.details ?? {}),
          transport: "supabase_rpc",
        },
      },
    };
  }
}
