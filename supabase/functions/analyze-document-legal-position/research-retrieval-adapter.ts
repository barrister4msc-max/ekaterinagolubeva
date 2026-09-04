import type { ResearchQuery } from "./fact-extraction.ts";
import type { RawSource } from "./repositories.ts";
import type { ResearchQueryPlan } from "./research-query-plan.ts";
import type { ResearchTransportDecision } from "./research-transport-policy.ts";
import {
  searchOfficialLegalSources,
  type OfficialSourceDiagnostics,
  type OfficialSourceResult,
} from "./official-sources.ts";

export const RESEARCH_RETRIEVAL_ERROR_CODES = [
  "decision_plan_mismatch",
  "privacy_external_query_blocked",
  "transport_not_approved",
  "provider_not_supported",
  "integration_mode_not_supported",
  "capability_not_supported",
  "transport_identity_missing",
  "retrieval_timeout",
  "retrieval_network_error",
  "retrieval_provider_error",
  "retrieval_unknown_error",
] as const;

export type ResearchRetrievalErrorCode = typeof RESEARCH_RETRIEVAL_ERROR_CODES[number];

export type ResearchRetrievalDiagnostics = {
  adapter_version: "08D-v1";
  provider_id: "pravo";
  plan_id: string;
  decision_version: ResearchTransportDecision["decision_version"];
  transport_id: string;
  transport_version: string;
  idempotency_key: string;
  attempts: number;
  max_attempts: number;
  timeout_ms: number;
  status: "success" | "empty" | "failed" | "blocked";
  candidates_found: number;
  error_code?: ResearchRetrievalErrorCode;
  provider_diagnostics?: OfficialSourceDiagnostics;
};

export type ResearchRetrievalResult = {
  sources: RawSource[];
  diagnostics: ResearchRetrievalDiagnostics;
};

export type PravoRetrieverResult = {
  sources: OfficialSourceResult[];
  diagnostics: OfficialSourceDiagnostics;
};

export type PravoRetriever = (query: ResearchQuery) => Promise<PravoRetrieverResult>;

export type ExecuteResearchRetrievalInput = {
  plan: ResearchQueryPlan;
  decision: ResearchTransportDecision;
  retriever?: PravoRetriever;
  timeout_ms?: number;
  max_attempts?: number;
};

function hash32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildResearchRetrievalIdempotencyKey(
  plan: ResearchQueryPlan,
  decision: ResearchTransportDecision,
): string {
  return `rrj_${hash32([
    "08D-v1",
    plan.plan_id,
    String(plan.revision),
    decision.decision_version,
    decision.provider_id,
    decision.required_capability,
    decision.transport.transport_id ?? "",
    decision.transport.transport_version ?? "",
  ].join("|"))}`;
}

function values(
  plan: ResearchQueryPlan,
  kind: ResearchQueryPlan["external_query"]["facets"][number]["kind"],
): string[] {
  return plan.external_query.facets.filter((facet) => facet.kind === kind).map((facet) => facet.value);
}

/** Build an external query only from the 08G structured/redacted projection. */
export function queryFromResearchPlan(plan: ResearchQueryPlan): ResearchQuery {
  const provisions = values(plan, "applicable_provision");
  const dates = [plan.temporal_window.from, plan.temporal_window.to].filter((v): v is string => Boolean(v));
  return {
    practice_area: null,
    subcategory: null,
    document_type: null,
    facts: [],
    parties: [],
    amounts: [],
    dates,
    temporal_anchors: [],
    legal_issues: [],
    research_topics: [],
    keywords: provisions,
    articles: provisions,
    organizations: [],
    inn: [],
    ogrn: [],
    semantic_intents: [],
    legal_concepts: provisions,
    metadata_terms: [...provisions, ...dates],
    search_hypotheses: [],
  };
}

function validateApprovedPravoPath(plan: ResearchQueryPlan, decision: ResearchTransportDecision): string | null {
  if (decision.plan_id !== plan.plan_id || decision.plan_version !== plan.plan_version) return "decision_plan_mismatch";
  if (!plan.external_query.external_execution_allowed) return "privacy_external_query_blocked";
  if (decision.status !== "approved_retrieval" || !decision.executable || !decision.network_allowed) return "transport_not_approved";
  if (decision.provider_id !== "pravo" || decision.registry_provider_id !== "pravo") return "provider_not_supported";
  if (decision.integration_mode !== "direct_api") return "integration_mode_not_supported";
  if (decision.required_capability !== "laws" || !plan.required_capabilities.includes("laws")) return "capability_not_supported";
  if (!decision.transport.transport_id || !decision.transport.transport_version) return "transport_identity_missing";
  return null;
}

function gateErrorCode(error: string): ResearchRetrievalErrorCode {
  return (RESEARCH_RETRIEVAL_ERROR_CODES as readonly string[]).includes(error)
    ? error as ResearchRetrievalErrorCode
    : "transport_not_approved";
}

/** Deliberately never returns provider text, URLs, request payloads, or tokens. */
export function classifyResearchRetrievalError(error: unknown): ResearchRetrievalErrorCode {
  if (error instanceof Error && /^retrieval_timeout(?:$|\b)/u.test(error.message)) {
    return "retrieval_timeout";
  }
  if (error instanceof TypeError) return "retrieval_network_error";
  if (error instanceof Error) return "retrieval_provider_error";
  return "retrieval_unknown_error";
}

function redactProviderDiagnostics(diagnostics: OfficialSourceDiagnostics): OfficialSourceDiagnostics {
  return {
    ...diagnostics,
    failures: Array.isArray(diagnostics.failures)
      ? diagnostics.failures.map(() => "provider_failure")
      : [],
  };
}

function baseDiagnostics(
  plan: ResearchQueryPlan,
  decision: ResearchTransportDecision,
  timeoutMs: number,
  maxAttempts: number,
): ResearchRetrievalDiagnostics {
  return {
    adapter_version: "08D-v1",
    provider_id: "pravo",
    plan_id: plan.plan_id,
    decision_version: decision.decision_version,
    transport_id: decision.transport.transport_id ?? "missing",
    transport_version: decision.transport.transport_version ?? "missing",
    idempotency_key: buildResearchRetrievalIdempotencyKey(plan, decision),
    attempts: 0,
    max_attempts: maxAttempts,
    timeout_ms: timeoutMs,
    status: "blocked",
    candidates_found: 0,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("retrieval_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toRawSource(
  source: OfficialSourceResult,
  plan: ResearchQueryPlan,
  decision: ResearchTransportDecision,
  idempotencyKey: string,
): RawSource {
  return {
    ...source,
    metadata: {
      ...(source.metadata ?? {}),
      research_query_plan_id: plan.plan_id,
      research_query_plan_version: plan.plan_version,
      research_transport_decision_version: decision.decision_version,
      research_transport_status: decision.status,
      research_transport_reason: decision.reason,
      research_transport_id: decision.transport.transport_id,
      research_transport_version: decision.transport.transport_version,
      research_retrieval_adapter_version: "08D-v1",
      research_retrieval_idempotency_key: idempotencyKey,
      // Retrieval provenance only. Existing safety/substantive fields are preserved unchanged.
      retrieval_candidate_only: true,
    },
  };
}

async function defaultPravoRetriever(query: ResearchQuery): Promise<PravoRetrieverResult> {
  const result = await searchOfficialLegalSources(query);
  return { sources: result.sources, diagnostics: result.diagnostics };
}

/**
 * Prompt 08D reference execution path. This is deliberately narrow: only an
 * already-approved Pravo direct transport may execute. BRAS/KAD and every
 * non-approved decision fail closed before the retriever is invoked.
 */
export async function executeApprovedResearchRetrieval(
  input: ExecuteResearchRetrievalInput,
): Promise<ResearchRetrievalResult> {
  const timeoutMs = Math.max(100, Math.min(input.timeout_ms ?? 12_000, 15_000));
  const maxAttempts = Math.max(1, Math.min(input.max_attempts ?? 2, 2));
  const diagnostics = baseDiagnostics(input.plan, input.decision, timeoutMs, maxAttempts);
  const gateError = validateApprovedPravoPath(input.plan, input.decision);
  if (gateError) return { sources: [], diagnostics: { ...diagnostics, error_code: gateErrorCode(gateError) } };

  const query = queryFromResearchPlan(input.plan);
  const retriever = input.retriever ?? defaultPravoRetriever;
  let lastError: ResearchRetrievalErrorCode = "retrieval_unknown_error";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    diagnostics.attempts = attempt;
    try {
      const result = await withTimeout(retriever(query), timeoutMs);
      const idempotencyKey = diagnostics.idempotency_key;
      const sources = (result.sources ?? []).map((source) => toRawSource(source, input.plan, input.decision, idempotencyKey));
      return {
        sources,
        diagnostics: {
          ...diagnostics,
          status: sources.length > 0 ? "success" : "empty",
          candidates_found: sources.length,
          provider_diagnostics: redactProviderDiagnostics(result.diagnostics),
        },
      };
    } catch (error) {
      lastError = classifyResearchRetrievalError(error);
    }
  }
  return {
    sources: [],
    diagnostics: { ...diagnostics, status: "failed", error_code: lastError },
  };
}
