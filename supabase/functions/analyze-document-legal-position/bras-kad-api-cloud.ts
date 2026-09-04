import type { RawSource } from "./repositories.ts";
import type { ResearchQueryPlan } from "./research-query-plan.ts";
import type { ResearchTransportDecision } from "./research-transport-policy.ts";
import { evaluateOfficialSourceSafety } from "./official-sources.ts";

const API_ENDPOINT = "https://api-cloud.ru/api/ras_arbitr.php";
const API_DOCUMENTATION_URL = "https://api-cloud.ru/ras_arbitr";
const API_TRANSPORT_ID = "api_cloud_ras_arbitr";
const MAX_RESULTS = 10;

export type BrasKadApiCloudConfig = {
  enabled: boolean;
  token: string | null;
  contract_id: string | null;
  transport_version: string | null;
};

export type BrasKadApiCloudDiagnostics = {
  adapter_version: "08F-v1";
  provider_id: "bras_kad_api_cloud";
  source_class: "retrieval_intermediary";
  transport_id: typeof API_TRANSPORT_ID;
  transport_version: string | null;
  status: "success" | "empty" | "unavailable" | "blocked" | "failed";
  candidates_found: number;
  error_code?:
    | "transport_not_approved"
    | "privacy_external_query_blocked"
    | "query_not_specific_enough"
    | "partner_not_configured"
    | "provider_response_invalid"
    | "provider_request_failed";
};

export type BrasKadApiCloudResult = {
  sources: RawSource[];
  diagnostics: BrasKadApiCloudDiagnostics;
};

export type BrasKadFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ApiCloudItem = {
  CaseId?: unknown;
  CaseUrl?: unknown;
  RegistrationDate?: unknown;
  InstanceNumber?: unknown;
  CaseNumber?: unknown;
  FileName?: unknown;
  FileUrl?: unknown;
  InstanceLevel?: unknown;
  Court?: unknown;
  Type?: unknown;
  ContentTypes?: unknown;
};

function env(name: string): string | undefined {
  try {
    return (globalThis as any).Deno?.env?.get?.(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function enabled(value: string | null | undefined): boolean {
  return ["1", "true", "on", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

function externalFacets(plan: ResearchQueryPlan, kind: "case_number" | "applicable_provision"): string[] {
  return plan.external_query.facets
    .filter((facet) => facet.kind === kind)
    .map((facet) => facet.value)
    .filter((value) => value.trim().length > 0);
}

function isOfficialCourtUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (host !== "kad.arbitr.ru" && host !== "ras.arbitr.ru")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hash32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeCaseNumber(value: string | null): string | null {
  const normalized = value?.replace(/s+/g, "").toUpperCase() ?? null;
  return normalized && /^А\d+-\d+\/\d{4}$/u.test(normalized) ? normalized : null;
}

function searchParameters(plan: ResearchQueryPlan): URLSearchParams | null {
  const params = new URLSearchParams({ type: "search" });
  const caseNumber = normalizeCaseNumber(externalFacets(plan, "case_number")[0] ?? null);
  if (caseNumber) {
    params.set("CaseNumber", caseNumber);
    return params;
  }
  const provision = externalFacets(plan, "applicable_provision")[0]?.replace(/s+/g, " ").slice(0, 120);
  if (!provision) return null;
  params.set("text", provision);
  return params;
}

function queryAllowed(plan: ResearchQueryPlan, decision: ResearchTransportDecision): boolean {
  return decision.plan_id === plan.plan_id &&
    decision.plan_version === plan.plan_version &&
    decision.provider_id === "bras_kad_api_cloud" &&
    decision.integration_mode === "partner_api" &&
    decision.required_capability === "court_practice" &&
    decision.status === "approved_retrieval" &&
    decision.executable &&
    decision.network_allowed &&
    decision.transport.transport_id === API_TRANSPORT_ID &&
    Boolean(decision.transport.transport_version) &&
    plan.external_query.external_execution_allowed;
}

export function readBrasKadApiCloudConfig(values: Record<string, string | undefined> = {}): BrasKadApiCloudConfig {
  const read = (name: string) => values[name] ?? env(name);
  return {
    enabled: enabled(read("BRAS_KAD_API_CLOUD_ENABLED")),
    token: text(read("BRAS_KAD_API_CLOUD_TOKEN")),
    contract_id: text(read("BRAS_KAD_API_CLOUD_CONTRACT_ID")),
    transport_version: text(read("BRAS_KAD_API_CLOUD_TRANSPORT_VERSION")),
  };
}

function baseDiagnostics(config: BrasKadApiCloudConfig): BrasKadApiCloudDiagnostics {
  return {
    adapter_version: "08F-v1",
    provider_id: "bras_kad_api_cloud",
    source_class: "retrieval_intermediary",
    transport_id: API_TRANSPORT_ID,
    transport_version: config.transport_version,
    status: "blocked",
    candidates_found: 0,
  };
}

function sourceFromItem(item: ApiCloudItem, plan: ResearchQueryPlan, decision: ResearchTransportDecision): RawSource | null {
  const caseNumber = normalizeCaseNumber(text(item.InstanceNumber) ?? text(item.CaseNumber));
  const officialUrl = isOfficialCourtUrl(item.FileUrl) ?? isOfficialCourtUrl(item.CaseUrl);
  if (!caseNumber || !officialUrl) return null;
  const court = text(item.Court);
  const type = text(item.Type);
  const date = text(item.RegistrationDate);
  const title = [type ?? "Судебный акт", caseNumber, court].filter(Boolean).join(" — ");
  const safety = evaluateOfficialSourceSafety({ officialUrl, identityVerified: false, contentVerified: false, actualityStatus: "unknown" });
  return {
    bucket: "court_practice",
    source_table: "external_official_source",
    source_id: `bras-kad-api-cloud:${hash32(`${caseNumber}|${officialUrl}`)}`,
    source_type: "kad_case",
    title,
    official_url: officialUrl,
    citation: [court, type, caseNumber, date].filter(Boolean).join(", ") || null,
    snippet: [court, type, date].filter(Boolean).join("; "),
    case_number: caseNumber,
    metadata: {
      provider_id: "bras_kad_api_cloud",
      provider_type: "research",
      provider_integration_mode: "partner_api",
      provider_source_class: "retrieval_intermediary",
      source_family: "bras_kad",
      transport_id: API_TRANSPORT_ID,
      transport_version: decision.transport.transport_version,
      partner_documentation_url: API_DOCUMENTATION_URL,
      research_query_plan_id: plan.plan_id,
      research_query_plan_version: plan.plan_version,
      research_transport_decision_version: decision.decision_version,
      research_transport_status: decision.status,
      retrieval_candidate_only: true,
      canonical_document_key: `ru:court_practice:case:${caseNumber.toLowerCase()}`,
      official_verification: safety,
      substantive_use_allowed: false,
      case_id: text(item.CaseId),
      registration_date: date,
      instance_level: typeof item.InstanceLevel === "number" ? item.InstanceLevel : null,
      content_types: Array.isArray(item.ContentTypes) ? item.ContentTypes.filter((value): value is string => typeof value === "string").slice(0, 12) : [],
    },
  };
}

export async function retrieveBrasKadApiCloud(
  input: { plan: ResearchQueryPlan; decision: ResearchTransportDecision; config?: BrasKadApiCloudConfig; fetcher?: BrasKadFetch },
): Promise<BrasKadApiCloudResult> {
  const config = input.config ?? readBrasKadApiCloudConfig();
  const diagnostics = baseDiagnostics(config);
  if (!queryAllowed(input.plan, input.decision)) {
    return { sources: [], diagnostics: { ...diagnostics, error_code: input.plan.external_query.external_execution_allowed ? "transport_not_approved" : "privacy_external_query_blocked" } };
  }
  const params = searchParameters(input.plan);
  if (!params) return { sources: [], diagnostics: { ...diagnostics, error_code: "query_not_specific_enough" } };
  if (!config.enabled || !config.token || !config.contract_id || !config.transport_version) {
    return { sources: [], diagnostics: { ...diagnostics, status: "unavailable", error_code: "partner_not_configured" } };
  }
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher(`${API_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: { Token: config.token, Accept: "application/json" },
    });
    if (!response.ok) return { sources: [], diagnostics: { ...diagnostics, status: "failed", error_code: "provider_request_failed" } };
    const payload = await response.json() as { status?: unknown; Result?: unknown };
    if (payload.status !== 200 || !Array.isArray(payload.Result)) {
      return { sources: [], diagnostics: { ...diagnostics, status: "failed", error_code: "provider_response_invalid" } };
    }
    const sources = payload.Result.slice(0, MAX_RESULTS)
      .map((item) => sourceFromItem((item ?? {}) as ApiCloudItem, input.plan, input.decision))
      .filter((source): source is RawSource => Boolean(source));
    return { sources, diagnostics: { ...diagnostics, status: sources.length ? "success" : "empty", candidates_found: sources.length } };
  } catch (_) {
    return { sources: [], diagnostics: { ...diagnostics, status: "failed", error_code: "provider_request_failed" } };
  }
}