import type { RawSource } from "./repositories.ts";
import type { ResearchQuestion } from "./research-routing.ts";
import {
  buildResearchQueryPlan,
  type ResearchSensitivityClass,
} from "./research-query-plan.ts";
import { evaluateResearchTransportDecision } from "./research-transport-policy.ts";
import {
  retrieveBrasKadApiCloud,
  type BrasKadApiCloudConfig,
  type BrasKadFetch,
} from "./bras-kad-api-cloud.ts";
import { admitResearchRetrievalCandidates } from "./research-source-admission.ts";

export type BrasKadPartnerShadowStatus = "disabled" | "completed" | "failed";
export type BrasKadPartnerShadowErrorCode =
  | "shadow_adapter_not_configured"
  | "shadow_retrieval_blocked"
  | "shadow_retrieval_failed"
  | "shadow_execution_failed";

/**
 * Bounded observability output for the contracted BRAS/KAD adapter.
 * It deliberately contains no candidate, case, query, URL, token or raw error.
 */
export type BrasKadPartnerShadowTelemetry = {
  shadow_version: "08F-bras-kad-v1";
  status: BrasKadPartnerShadowStatus;
  enabled: boolean;
  primary_unchanged: true;
  provider_id: "bras_kad_api_cloud";
  plan_id: string | null;
  transport_status: string | null;
  candidates_found: number;
  discovery_only: number;
  blocked: number;
  substantive_admitted: 0;
  latency_ms: number;
  error_count: number;
  error_code?: BrasKadPartnerShadowErrorCode;
};

export type RunBrasKadPartnerShadowInput = {
  enabled?: boolean;
  matter_id: string;
  legal_analysis_run_id: string;
  research_issue: ResearchQuestion;
  legacy_sources: readonly RawSource[];
  local_sources_for_admission?: readonly RawSource[];
  exact_case_number?: string | null;
  applicable_provisions?: string[];
  sensitivity_class?: ResearchSensitivityClass;
  /** Both dependencies must be injected. This observer never reads env or uses global fetch. */
  config?: BrasKadApiCloudConfig;
  fetcher?: BrasKadFetch;
  now?: () => number;
};

function result(
  status: BrasKadPartnerShadowStatus,
  enabled: boolean,
  planId: string | null,
  transportStatus: string | null,
  latencyMs: number,
  counts: Partial<Pick<BrasKadPartnerShadowTelemetry, "candidates_found" | "discovery_only" | "blocked" | "error_count">> = {},
  errorCode?: BrasKadPartnerShadowErrorCode,
): BrasKadPartnerShadowTelemetry {
  return {
    shadow_version: "08F-bras-kad-v1",
    status,
    enabled,
    primary_unchanged: true,
    provider_id: "bras_kad_api_cloud",
    plan_id: planId,
    transport_status: transportStatus,
    candidates_found: counts.candidates_found ?? 0,
    discovery_only: counts.discovery_only ?? 0,
    blocked: counts.blocked ?? 0,
    // The adapter's contract says every result remains discovery-only until an
    // independent official verification flow completes. Shadow cannot override it.
    substantive_admitted: 0,
    latency_ms: Math.max(0, latencyMs),
    error_count: counts.error_count ?? 0,
    ...(errorCode ? { error_code: errorCode } : {}),
  };
}

function retrievalError(status: string): BrasKadPartnerShadowErrorCode | undefined {
  if (status === "blocked" || status === "unavailable") return "shadow_retrieval_blocked";
  if (status === "failed") return "shadow_retrieval_failed";
  return undefined;
}

/**
 * Side-effect-free BRAS/KAD partner observer.
 *
 * This is intentionally separate from runResearchRetrievalShadow: the existing
 * Pravo shadow contract remains unchanged, while this adapter can be verified
 * behind its own explicit flag. The function neither persists candidates nor
 * returns them to an accepted consumer.
 */
export async function runBrasKadPartnerShadow(
  input: RunBrasKadPartnerShadowInput,
): Promise<BrasKadPartnerShadowTelemetry> {
  if (input.enabled !== true) return result("disabled", false, null, null, 0);

  const now = input.now ?? (() => Date.now());
  const started = now();
  let planId: string | null = null;
  let transportStatus: string | null = null;
  try {
    // Requiring both injected values prevents accidental live network execution
    // even if someone enables this observer before secrets are configured.
    if (!input.config || !input.fetcher) {
      return result(
        "failed",
        true,
        null,
        null,
        now() - started,
        { error_count: 1 },
        "shadow_adapter_not_configured",
      );
    }

    const plan = buildResearchQueryPlan({
      matter_id: input.matter_id,
      legal_analysis_run_id: input.legal_analysis_run_id,
      research_issue: input.research_issue,
      exact_case_number: input.exact_case_number,
      applicable_provisions: input.applicable_provisions ?? [],
      sensitivity_class: input.sensitivity_class ?? "unclassified",
    });
    planId = plan.plan_id;
    const decision = evaluateResearchTransportDecision({
      plan,
      provider_id: "bras_kad_api_cloud",
      provider_capabilities: ["court_practice"],
      required_capability: "court_practice",
      integration_mode: "partner_api",
      transport_id: "api_cloud_ras_arbitr",
      transport_version: input.config.transport_version,
      partner_contract_id: input.config.contract_id,
      partner_documentation_url: "https://api-cloud.ru/ras_arbitr",
    });
    transportStatus = decision.status;
    if (!decision.executable) {
      return result(
        "completed",
        true,
        planId,
        transportStatus,
        now() - started,
        { blocked: 1, error_count: 1 },
        "shadow_retrieval_blocked",
      );
    }

    const retrieval = await retrieveBrasKadApiCloud({
      plan,
      decision,
      config: input.config,
      fetcher: input.fetcher,
    });
    const admission = admitResearchRetrievalCandidates(
      [...(input.local_sources_for_admission ?? input.legacy_sources)],
      retrieval.sources,
    );
    const errorCode = retrievalError(retrieval.diagnostics.status);
    return result(
      "completed",
      true,
      planId,
      transportStatus,
      now() - started,
      {
        candidates_found: retrieval.sources.length,
        discovery_only: admission.decisions.filter((item) => item.status === "discovery_only").length,
        blocked: admission.decisions.filter((item) => item.status === "blocked").length,
        error_count: errorCode ? 1 : 0,
      },
      errorCode,
    );
  } catch (_) {
    return result(
      "failed",
      true,
      planId,
      transportStatus,
      now() - started,
      { error_count: 1 },
      "shadow_execution_failed",
    );
  }
}
