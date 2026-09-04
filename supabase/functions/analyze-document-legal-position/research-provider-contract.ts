import type { ResearchQuery } from "./fact-extraction.ts";
import type { RawSource } from "./repositories.ts";
import type { ResearchQuestion } from "./research-routing.ts";

export type ResearchProviderStatus = "success" | "partial" | "failed" | "unavailable";

export type ResearchProviderIntegrationMode =
  | "local"
  | "direct_api"
  | "partner_api"
  | "mcp"
  | "user_session"
  | "manual_import"
  // These are transport descriptions only. They do not imply that an adapter
  // exists, that a site permits automated access, or that a route is enabled.
  | "official_download"
  | "official_rss"
  | "official_web_document"
  | "browser_handoff";

export type ResearchProviderSourceClass =
  | "native"
  | "primary_official"
  | "primary_official_data"
  | "secondary_document_copy"
  | "secondary_analysis"
  | "retrieval_intermediary";

export type ResearchProviderContext = {
  question: ResearchQuestion;
  practice_area: string | null;
};

export type ResearchProviderDiagnostics = {
  provider_id: string;
  status: ResearchProviderStatus;
  integration_mode: ResearchProviderIntegrationMode;
  source_class: ResearchProviderSourceClass;
  latency_ms: number;
  candidates_found: number;
  error_code?: string;
  error_message?: string;
  details?: Record<string, unknown>;
};

export type ResearchProviderResult = {
  sources: RawSource[];
  diagnostics: ResearchProviderDiagnostics;
};

/**
 * Runtime provider interface only. It is NOT a document registry and does not
 * replace public.legal_research_sources / public.legal_source_registry.
 * Provider output is retrieval evidence only until normal KATI normalization,
 * canonical matching, verification, ranking and downstream quality gates run.
 */
export interface LegalResearchProvider {
  readonly id: string;
  readonly integration_mode: ResearchProviderIntegrationMode;
  readonly source_class: ResearchProviderSourceClass;
  readonly capabilities: readonly string[];
  isAvailable(): boolean | Promise<boolean>;
  search(query: ResearchQuery, context: ResearchProviderContext): Promise<ResearchProviderResult>;
}

function providerMetadata(
  source: RawSource,
  provider: LegalResearchProvider,
): Record<string, unknown> {
  return {
    ...(source.metadata ?? {}),
    provider_id: provider.id,
    provider_type: "research",
    provider_integration_mode: provider.integration_mode,
    provider_source_class: provider.source_class,
  };
}

/**
 * Fail-soft boundary for optional research providers.
 * - no provider narrative is accepted here, only RawSource[];
 * - provider metadata never self-certifies legal authority/official origin;
 * - unavailable/failed providers return diagnostics instead of throwing into
 *   the Legal Analysis Core.
 */
export async function executeResearchProvider(
  provider: LegalResearchProvider,
  query: ResearchQuery,
  context: ResearchProviderContext,
): Promise<ResearchProviderResult> {
  const startedAt = Date.now();
  try {
    if (!(await provider.isAvailable())) {
      return {
        sources: [],
        diagnostics: {
          provider_id: provider.id,
          status: "unavailable",
          integration_mode: provider.integration_mode,
          source_class: provider.source_class,
          latency_ms: Date.now() - startedAt,
          candidates_found: 0,
          error_code: "provider_unavailable",
        },
      };
    }

    const result = await provider.search(query, context);
    const sources = (result.sources ?? []).map((source) => ({
      ...source,
      metadata: providerMetadata(source, provider),
    }));
    return {
      sources,
      diagnostics: {
        ...result.diagnostics,
        provider_id: provider.id,
        integration_mode: provider.integration_mode,
        source_class: provider.source_class,
        latency_ms: Date.now() - startedAt,
        candidates_found: sources.length,
      },
    };
  } catch (error) {
    return {
      sources: [],
      diagnostics: {
        provider_id: provider.id,
        status: "failed",
        integration_mode: provider.integration_mode,
        source_class: provider.source_class,
        latency_ms: Date.now() - startedAt,
        candidates_found: 0,
        error_code: "provider_exception",
        error_message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
