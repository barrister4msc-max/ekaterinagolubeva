import type { RawSource } from "./repositories.ts";
import type { ResearchQuestion } from "./research-routing.ts";
import {
  buildResearchQueryPlan,
  type ResearchSensitivityClass,
} from "./research-query-plan.ts";
import { evaluateResearchTransportDecision } from "./research-transport-policy.ts";
import {
  executeApprovedResearchRetrieval,
  type PravoRetriever,
} from "./research-retrieval-adapter.ts";
import {
  admitResearchRetrievalCandidates,
  type ResearchSourceUseDecision,
  type VerificationObservation,
} from "./research-source-admission.ts";
import { sourceFamilyForType } from "./source-family-contract.ts";

export type ResearchShadowStatus = "disabled" | "completed" | "failed";
export type ResearchShadowErrorCode =
  | "shadow_retriever_not_configured"
  | "shadow_retrieval_failed"
  | "shadow_retrieval_blocked"
  | "shadow_execution_failed";

export type ResearchShadowMetrics = {
  discovered_sources: number;
  canonical_matches: number;
  substantive_admitted: number;
  discovery_only: number;
  blocked: number;
  duplicate_sources: number;
  source_family_coverage: string[];
  latency_ms: number;
  error_count: number;
  safety_regressions: number;
};

export type ResearchShadowTelemetry = {
  shadow_version: "08F-v1";
  status: ResearchShadowStatus;
  enabled: boolean;
  primary_unchanged: true;
  plan_id: string | null;
  transport_status: string | null;
  provider_id: string | null;
  legacy: ResearchShadowMetrics;
  shadow: ResearchShadowMetrics;
  parity: {
    discovered_delta: number;
    canonical_match_delta: number;
    substantive_delta: number;
    duplicate_delta: number;
    family_coverage_delta: number;
  };
  error_code?: ResearchShadowErrorCode;
};

export type RunResearchShadowInput = {
  enabled?: boolean;
  matter_id: string;
  legal_analysis_run_id: string;
  research_issue: ResearchQuestion;
  legacy_sources: readonly RawSource[];
  local_sources_for_admission?: readonly RawSource[];
  applicable_provisions?: string[];
  sensitivity_class?: ResearchSensitivityClass;
  retriever?: PravoRetriever;
  /**
   * Independent verification evidence. Deliberately separate from retriever
   * payloads so a provider cannot self-promote a candidate into substantive
   * use by populating its own metadata.
   */
  verification_observations?: readonly VerificationObservation[];
  now?: () => number;
};

function sourceIdentity(source: RawSource): string {
  const canonical = typeof source.metadata?.canonical_document_key === "string"
    ? source.metadata.canonical_document_key
    : null;
  return canonical || `${source.source_table}|${source.source_id}`;
}

function duplicateCount(sources: readonly RawSource[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const source of sources) {
    const key = sourceIdentity(source);
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function familyCoverage(sources: readonly RawSource[]): string[] {
  return [...new Set(sources.map((source) => sourceFamilyForType(source.source_type)))].sort();
}

function legacyMetrics(sources: readonly RawSource[]): ResearchShadowMetrics {
  const canonicalMatches = sources.filter((source) =>
    typeof source.metadata?.canonical_document_key === "string" && Boolean(source.metadata.canonical_document_key)
  ).length;
  const substantive = sources.filter((source) => source.metadata?.substantive_use_allowed === true).length;
  return {
    discovered_sources: sources.length,
    canonical_matches: canonicalMatches,
    substantive_admitted: substantive,
    discovery_only: Math.max(0, sources.length - substantive),
    blocked: 0,
    duplicate_sources: duplicateCount(sources),
    source_family_coverage: familyCoverage(sources),
    latency_ms: 0,
    error_count: 0,
    safety_regressions: 0,
  };
}

function shadowMetrics(
  candidates: readonly RawSource[],
  admittedSources: readonly RawSource[],
  decisions: readonly ResearchSourceUseDecision[],
  latencyMs: number,
  errorCount: number,
): ResearchShadowMetrics {
  const substantive = decisions.filter((d) => d.status === "substantive_admitted").length;
  const discovery = decisions.filter((d) => d.status === "discovery_only").length;
  const blocked = decisions.filter((d) => d.status === "blocked").length;
  const linked = decisions.filter((d) => d.status === "linked_to_canonical").length;
  const safetyRegressions = decisions.filter((d) =>
    d.substantive_use_allowed === true && d.status !== "substantive_admitted"
  ).length + admittedSources.filter((source) =>
    source.metadata?.substantive_use_allowed === true &&
    source.metadata?.source_use_admission_status !== "substantive_admitted" &&
    source.metadata?.source_use_admission_status !== undefined
  ).length;
  return {
    discovered_sources: candidates.length,
    canonical_matches: linked,
    substantive_admitted: substantive,
    discovery_only: discovery,
    blocked,
    duplicate_sources: duplicateCount(candidates),
    source_family_coverage: familyCoverage(candidates),
    latency_ms: Math.max(0, latencyMs),
    error_count: errorCount,
    safety_regressions: safetyRegressions,
  };
}

function emptyMetrics(): ResearchShadowMetrics {
  return {
    discovered_sources: 0,
    canonical_matches: 0,
    substantive_admitted: 0,
    discovery_only: 0,
    blocked: 0,
    duplicate_sources: 0,
    source_family_coverage: [],
    latency_ms: 0,
    error_count: 0,
    safety_regressions: 0,
  };
}

function telemetry(
  status: ResearchShadowStatus,
  enabled: boolean,
  legacy: ResearchShadowMetrics,
  shadow: ResearchShadowMetrics,
  planId: string | null,
  transportStatus: string | null,
  providerId: string | null,
  errorCode?: ResearchShadowErrorCode,
): ResearchShadowTelemetry {
  const legacyFamilies = new Set(legacy.source_family_coverage);
  const shadowFamilies = new Set(shadow.source_family_coverage);
  const familyDelta = [...shadowFamilies].filter((f) => !legacyFamilies.has(f)).length -
    [...legacyFamilies].filter((f) => !shadowFamilies.has(f)).length;
  return {
    shadow_version: "08F-v1",
    status,
    enabled,
    primary_unchanged: true,
    plan_id: planId,
    transport_status: transportStatus,
    provider_id: providerId,
    legacy,
    shadow,
    parity: {
      discovered_delta: shadow.discovered_sources - legacy.discovered_sources,
      canonical_match_delta: shadow.canonical_matches - legacy.canonical_matches,
      substantive_delta: shadow.substantive_admitted - legacy.substantive_admitted,
      duplicate_delta: shadow.duplicate_sources - legacy.duplicate_sources,
      family_coverage_delta: familyDelta,
    },
    ...(errorCode ? { error_code: errorCode } : {}),
  };
}

function retrievalErrorCode(status: string): ResearchShadowErrorCode | undefined {
  if (status === "failed") return "shadow_retrieval_failed";
  if (status === "blocked") return "shadow_retrieval_blocked";
  return undefined;
}

/**
 * Prompt 08F side-effect-free observer. It never mutates or returns a replacement
 * for the primary source list. The caller may persist only this bounded telemetry.
 * Default is OFF. Errors are fail-soft and reduced to a fixed redacted taxonomy.
 * An enabled shadow requires an explicitly injected retriever, preventing any
 * accidental fallback to a live network transport from this observer itself.
 */
export async function runResearchRetrievalShadow(
  input: RunResearchShadowInput,
): Promise<ResearchShadowTelemetry> {
  const legacy = legacyMetrics(input.legacy_sources);
  if (input.enabled !== true) {
    return telemetry("disabled", false, legacy, emptyMetrics(), null, null, null);
  }

  const now = input.now ?? (() => Date.now());
  const started = now();
  let planId: string | null = null;
  let transportStatus: string | null = null;
  try {
    if (!input.retriever) {
      const failed = emptyMetrics();
      failed.latency_ms = Math.max(0, now() - started);
      failed.error_count = 1;
      return telemetry(
        "failed",
        true,
        legacy,
        failed,
        null,
        null,
        "pravo",
        "shadow_retriever_not_configured",
      );
    }

    const plan = buildResearchQueryPlan({
      matter_id: input.matter_id,
      legal_analysis_run_id: input.legal_analysis_run_id,
      research_issue: input.research_issue,
      applicable_provisions: input.applicable_provisions ?? [],
      // Shadow execution uses the same explicit privacy contract as any future
      // transport; an unclassified plan must remain non-executable.
      sensitivity_class: input.sensitivity_class ?? "unclassified",
    });
    planId = plan.plan_id;

    const decision = evaluateResearchTransportDecision({
      plan,
      provider_id: "pravo",
      provider_capabilities: ["laws"],
      required_capability: "laws",
      integration_mode: "direct_api",
      transport_id: "pravo_official_api",
      transport_version: "existing-v1",
    });
    transportStatus = decision.status;

    const retrieval = await executeApprovedResearchRetrieval({
      plan,
      decision,
      retriever: input.retriever,
    });
    const admission = admitResearchRetrievalCandidates(
      [...(input.local_sources_for_admission ?? input.legacy_sources)],
      retrieval.sources,
      input.verification_observations,
    );
    const latency = now() - started;
    const redactedError = retrievalErrorCode(retrieval.diagnostics.status);
    const shadow = shadowMetrics(
      retrieval.sources,
      admission.substantive_sources,
      admission.decisions,
      latency,
      redactedError ? 1 : 0,
    );
    return telemetry(
      "completed",
      true,
      legacy,
      shadow,
      plan.plan_id,
      decision.status,
      decision.provider_id,
      redactedError,
    );
  } catch (_) {
    const failed = emptyMetrics();
    failed.latency_ms = Math.max(0, now() - started);
    failed.error_count = 1;
    return telemetry("failed", true, legacy, failed, planId, transportStatus, "pravo", "shadow_execution_failed");
  }
}
