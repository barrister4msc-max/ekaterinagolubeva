import type { ResearchQuery, TemporalAnchor } from "./fact-extraction.ts";
import type { RawSource } from "./repositories.ts";
import type { ResearchQuestion } from "./research-routing.ts";
import type {
  LegalResearchProvider,
  ResearchProviderContext,
  ResearchProviderResult,
} from "./research-provider-contract.ts";

export type Law7ToolName =
  | "query-laws"
  | "get-article-version"
  | "trace-amendment-history";

export type Law7ToolCall = {
  name: Law7ToolName;
  arguments: Record<string, unknown>;
  purpose: "document_search" | "temporal_version" | "amendment_history";
};

/**
 * Transport is injected deliberately. The upstream Law7 repository currently
 * exposes a stdio MCP server, not a documented public HTTP endpoint.
 * KATI must not invent a network URL; a real transport/gateway can implement
 * this interface later without changing the provider or Analyzer contracts.
 */
export interface Law7McpTransport {
  isAvailable(): boolean | Promise<boolean>;
  callTool(name: Law7ToolName, args: Record<string, unknown>): Promise<string>;
}

const CODE_MAP: Array<{ re: RegExp; codeId: string }> = [
  { re: /(?:НК|налогов(?:ый|ого) кодекс)(?:\s+РФ)?\s*(?:ч(?:асть)?\.?\s*1)?/iu, codeId: "NK_RF" },
  { re: /(?:НК|налогов(?:ый|ого) кодекс)(?:\s+РФ)?\s*(?:ч(?:асть)?\.?\s*2)/iu, codeId: "NK_RF_2" },
  { re: /(?:ГК|гражданск(?:ий|ого) кодекс)(?:\s+РФ)?\s*(?:ч(?:асть)?\.?\s*2)/iu, codeId: "GK_RF_2" },
  { re: /(?:ГК|гражданск(?:ий|ого) кодекс)(?:\s+РФ)?\s*(?:ч(?:асть)?\.?\s*3)/iu, codeId: "GK_RF_3" },
  { re: /(?:ГК|гражданск(?:ий|ого) кодекс)(?:\s+РФ)?\s*(?:ч(?:асть)?\.?\s*4)/iu, codeId: "GK_RF_4" },
  { re: /(?:ГК|гражданск(?:ий|ого) кодекс)(?:\s+РФ)?/iu, codeId: "GK_RF" },
  { re: /(?:АПК|арбитражн(?:ый|ого) процессуальн(?:ый|ого) кодекс)(?:\s+РФ)?/iu, codeId: "APK_RF" },
  { re: /(?:ГПК|гражданск(?:ий|ого) процессуальн(?:ый|ого) кодекс)(?:\s+РФ)?/iu, codeId: "GPK_RF" },
  { re: /(?:КоАП|кодекс(?:а)? об административных правонарушениях)(?:\s+РФ)?/iu, codeId: "KoAP_RF" },
  { re: /(?:ЗК|земельн(?:ый|ого) кодекс)(?:\s+РФ)?/iu, codeId: "ZK_RF" },
  { re: /(?:ЖК|жилищн(?:ый|ого) кодекс)(?:\s+РФ)?/iu, codeId: "ZhK_RF" },
  { re: /(?:ТК|трудов(?:ой|ого) кодекс)(?:\s+РФ)?/iu, codeId: "TK_RF" },
  { re: /(?:СК|семейн(?:ый|ого) кодекс)(?:\s+РФ)?/iu, codeId: "SK_RF" },
  { re: /(?:БК|бюджетн(?:ый|ого) кодекс)(?:\s+РФ)?/iu, codeId: "BK_RF" },
  { re: /(?:Конституци(?:я|и)(?:\s+РФ)?)/iu, codeId: "KONST_RF" },
];

function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && !!value.trim()).map((value) => value.trim()))];
}

function firstIsoAnchor(anchors: TemporalAnchor[]): string | null {
  for (const anchor of anchors) {
    for (const value of [anchor.date, anchor.date_from, anchor.date_to]) {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    }
  }
  return null;
}

function articleRefs(query: ResearchQuery, question: ResearchQuestion): Array<{ codeId: string; article: string }> {
  const values = uniq([
    ...(query.articles ?? []),
    question.issue,
    ...question.exact_terms,
    ...question.metadata_terms,
  ]);
  const out: Array<{ codeId: string; article: string }> = [];
  for (const value of values) {
    const article = value.match(/(?:ст\.?|статья|статьи|статьей)\s*(\d+(?:\.\d+)*)/iu)?.[1];
    if (!article) continue;
    const code = CODE_MAP.find((entry) => entry.re.test(value));
    if (!code) continue;
    const key = `${code.codeId}:${article}`;
    if (!out.some((item) => `${item.codeId}:${item.article}` === key)) out.push({ codeId: code.codeId, article });
  }
  return out.slice(0, 6);
}

export function buildLaw7ToolPlan(query: ResearchQuery, question: ResearchQuestion): Law7ToolCall[] {
  const calls: Law7ToolCall[] = [];
  const asOfDate = firstIsoAnchor(question.temporal_anchors ?? []);
  const refs = articleRefs(query, question);

  for (const ref of refs) {
    calls.push({
      name: "get-article-version",
      purpose: "temporal_version",
      arguments: {
        code_id: ref.codeId,
        article_number: ref.article,
        ...(asOfDate ? { as_of_date: asOfDate } : {}),
        include_amendment_chain: false,
      },
    });
    if (question.modes.includes("temporal")) {
      calls.push({
        name: "trace-amendment-history",
        purpose: "amendment_history",
        arguments: {
          code_id: ref.codeId,
          article_number: ref.article,
          include_details: true,
          limit: 20,
        },
      });
    }
  }

  // Search individual acts only when the issue contains no specific code article.
  if (refs.length === 0) {
    calls.push({
      name: "query-laws",
      purpose: "document_search",
      arguments: {
        country_code: "RU",
        query: question.issue,
        max_results: 10,
        // Upstream currently accepts this flag but query-laws implementation
        // still uses keyword/Postgres search; do not claim semantic capability.
        use_hybrid: false,
      },
    });
  }

  return calls.slice(0, 12);
}

function lineValue(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^- \\*\\*${escaped}\\*\\*:\\s*(.+)$`, "mi"));
  return match?.[1]?.trim() || null;
}

function fullTextSection(text: string): string {
  const marker = "## Full Text";
  const start = text.indexOf(marker);
  if (start < 0) return text.slice(0, 4000);
  const rest = text.slice(start + marker.length).trim();
  const next = rest.indexOf("\n## ");
  return (next >= 0 ? rest.slice(0, next) : rest).trim().slice(0, 12000);
}

function sourceFromToolResult(
  call: Law7ToolCall,
  output: string,
  question: ResearchQuestion,
): RawSource | null {
  if (!output.trim() || /^Error:/i.test(output) || /not found/i.test(output)) return null;

  const codeId = typeof call.arguments.code_id === "string" ? call.arguments.code_id : null;
  const article = typeof call.arguments.article_number === "string" ? call.arguments.article_number : null;
  const asOfDate = typeof call.arguments.as_of_date === "string" ? call.arguments.as_of_date : null;
  const versionDate = lineValue(output, "Version Date");
  const sourceAmendment = lineValue(output, "Source Amendment");
  const sourceId = `law7:${call.name}:${codeId ?? "document"}:${article ?? "search"}:${asOfDate ?? versionDate ?? "current"}`;

  return {
    bucket: call.name === "query-laws" ? "laws" : "laws",
    source_table: "external_provider",
    source_id: sourceId,
    source_type: call.name === "get-article-version" ? "law7_article_version" : "law7_research_result",
    title: codeId && article
      ? `Law7 ${codeId} ст. ${article}${asOfDate ? ` на ${asOfDate}` : ""}`
      : `Law7: ${question.issue}`,
    official_url: null,
    citation: codeId && article ? `${codeId} ст. ${article}` : null,
    snippet: fullTextSection(output),
    metadata: {
      provider_id: "law7",
      provider_type: "research",
      provider_integration_mode: "mcp",
      provider_source_class: "retrieval_intermediary",
      research_issue_ids: [question.id],
      research_issue_texts: [question.issue],
      research_modes: question.modes,
      law7_tool: call.name,
      law7_purpose: call.purpose,
      law7_code_id: codeId,
      article,
      requested_as_of_date: asOfDate,
      version_date: versionDate,
      amendment_external_id: sourceAmendment,
      // Law7 is an intermediary. Its text must be canonicalized/verified before
      // becoming an official substantive source in KATI.
      official_origin_verified: false,
      primary_source_verified: false,
      verification_status: "needs_primary_verification",
      substantive_use_allowed: false,
      retrieval_method: "mcp_intermediary",
    },
    article,
  };
}

export class Law7ResearchProvider implements LegalResearchProvider {
  readonly id = "law7";
  readonly integration_mode = "mcp" as const;
  readonly source_class = "retrieval_intermediary" as const;
  readonly capabilities = [
    "query-laws",
    "get-article-version",
    "trace-amendment-history",
  ] as const;

  constructor(private readonly transport: Law7McpTransport | null) {}

  async isAvailable(): Promise<boolean> {
    return this.transport ? await this.transport.isAvailable() : false;
  }

  async search(query: ResearchQuery, context: ResearchProviderContext): Promise<ResearchProviderResult> {
    if (!this.transport) throw new Error("Law7 MCP transport is not configured");
    const plan = buildLaw7ToolPlan(query, context.question);
    const sources: RawSource[] = [];
    const errors: string[] = [];

    for (const call of plan) {
      try {
        const output = await this.transport.callTool(call.name, call.arguments);
        const source = sourceFromToolResult(call, output, context.question);
        if (source) sources.push(source);
      } catch (error) {
        errors.push(`${call.name}:${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      sources,
      diagnostics: {
        provider_id: this.id,
        status: errors.length ? (sources.length ? "partial" : "failed") : "success",
        integration_mode: this.integration_mode,
        source_class: this.source_class,
        latency_ms: 0,
        candidates_found: sources.length,
        ...(errors.length ? { error_code: "law7_tool_failure", error_message: errors.join(" | ").slice(0, 1000) } : {}),
        details: { tool_calls: plan.map((call) => ({ name: call.name, purpose: call.purpose })) },
      },
    };
  }
}
