import type { Bucket } from "./repositories.ts";
import type { ResearchQueryPlan } from "./research-query-plan.ts";
import type { ResearchSourceRole } from "./research-routing.ts";
import {
  listSourceCapabilities,
  SOURCE_CAPABILITY_REGISTRY,
  type SourceCapabilityOperationalStatus,
  type SourceCapabilityRegistration,
} from "./source-capability-registry.ts";

export type ResearchSourceRequirementKind = "mandatory" | "optional";
export type ResearchSourceRouteReadiness = "ready" | "degraded" | "manual_action_required" | "blocked";
export type ResearchSourcePlanGapCode =
  | "no_capability"
  | "privacy_not_permitted"
  | "query_class_not_supported"
  | "manual_transport_only"
  | "blocked_transport_only"
  | "unmapped_source_role"
  | "all_candidate_routes_failed"
  | "all_candidate_routes_zero_result";

export type ResearchSourceRoute = {
  route_id: string;
  provider_id: string;
  transport_id: string;
  transport_version: string;
  operational_status: SourceCapabilityOperationalStatus;
  readiness: ResearchSourceRouteReadiness;
  query_class: "exact" | "issue" | "adverse" | "temporal";
  source_family: Bucket;
  substantive_use_allowed: false;
  executable: false;
};

export type ResearchSourceRequirement = {
  requirement_id: string;
  role: ResearchSourceRole;
  source_family: Bucket | null;
  kind: ResearchSourceRequirementKind;
  query_class: "exact" | "issue" | "adverse" | "temporal";
  candidate_routes: readonly ResearchSourceRoute[];
  initial_route_ids: readonly string[];
};

export type ResearchSourcePlanCoverageGap = {
  requirement_id: string;
  role: ResearchSourceRole;
  source_family: Bucket | null;
  code: ResearchSourcePlanGapCode;
  attempted_provider_ids: readonly string[];
  required_action: "add_capability" | "classify_privacy" | "manual_import" | "verify_transport" | "review_source_family";
};

export type ResearchSourcePlan = {
  source_plan_id: string;
  plan_version: "08I-v1";
  query_plan_id: string;
  lineage: ResearchQueryPlan["lineage"];
  context: {
    jurisdiction: ResearchQueryPlan["jurisdiction"];
    procedure_stage: ResearchQueryPlan["procedure_stage"];
    court_level: ResearchQueryPlan["court_level"];
    temporal_window: ResearchQueryPlan["temporal_window"];
    sensitivity_class: ResearchQueryPlan["sensitivity_class"];
  };
  coverage_policy: {
    adverse_required: boolean;
    temporal_required: boolean;
    max_initial_provider_attempts_per_requirement: 2;
    max_total_provider_attempts: 12;
  };
  requirements: readonly ResearchSourceRequirement[];
  preflight_coverage_gaps: readonly ResearchSourcePlanCoverageGap[];
  planner_provenance: {
    planner: "deterministic_research_source_planner";
    version: "08I-v1";
    network_used: false;
    provider_selected_in_issue_semantics: false;
    model_input_changed: false;
  };
};

export type ResearchSourceAttemptStatus = "success" | "zero_result" | "failed";
export type ResearchSourceAttempt = {
  requirement_id: string;
  provider_id: string;
  status: ResearchSourceAttemptStatus;
};

export type ResearchSourceCoverageAssessment = {
  requirement_id: string;
  status: "covered" | "pending" | "gap";
  attempts: readonly ResearchSourceAttempt[];
  coverage_gap: ResearchSourcePlanCoverageGap | null;
};

const ROLE_FAMILIES: Record<ResearchSourceRole, readonly Bucket[]> = {
  normative: ["laws"],
  official_explanation: ["fns_letters", "minfin_letters"],
  judicial: ["court_practice"],
  fact_pattern: ["court_practice"],
  adverse: ["court_practice"],
  temporal: ["laws", "court_practice", "fns_letters", "minfin_letters"],
  factual_data: [],
  secondary_discovery: ["ekaterina", "manuals"],
};

const MAX_INITIAL_PROVIDER_ATTEMPTS = 2 as const;
const MAX_TOTAL_PROVIDER_ATTEMPTS = 12 as const;

function hash32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function isMandatory(role: ResearchSourceRole): boolean {
  return role === "normative" || role === "judicial" || role === "official_explanation" || role === "adverse" || role === "temporal";
}

function queryClass(plan: ResearchQueryPlan, role: ResearchSourceRole): ResearchSourceRequirement["query_class"] {
  if (role === "adverse") return "adverse";
  if (role === "temporal") return "temporal";
  if (plan.objective === "exact_case") return "exact";
  return "issue";
}

function readiness(status: SourceCapabilityOperationalStatus): ResearchSourceRouteReadiness {
  if (status === "active") return "ready";
  if (status === "degraded" || status === "shadow_retrieval") return "degraded";
  if (status === "manual_import_only") return "manual_action_required";
  return "blocked";
}

function routeFrom(capability: SourceCapabilityRegistration, sourceFamily: Bucket, requiredQueryClass: ResearchSourceRequirement["query_class"]): ResearchSourceRoute {
  return {
    route_id: `${capability.provider_id}:${capability.transport_id}:${capability.transport_version}:${sourceFamily}`,
    provider_id: capability.provider_id,
    transport_id: capability.transport_id,
    transport_version: capability.transport_version,
    operational_status: capability.operational_status,
    readiness: readiness(capability.operational_status),
    query_class: requiredQueryClass,
    source_family: sourceFamily,
    executable: false,
    substantive_use_allowed: false,
  };
}

function statusRank(status: ResearchSourceRouteReadiness): number {
  return ({ ready: 0, degraded: 1, manual_action_required: 2, blocked: 3 })[status];
}

function candidateRoutes(input: {
  source_family: Bucket;
  query_class: ResearchSourceRequirement["query_class"];
  sensitivity_class: ResearchQueryPlan["sensitivity_class"];
  registry: readonly SourceCapabilityRegistration[];
  unavailable_provider_ids: ReadonlySet<string>;
}): { routes: readonly ResearchSourceRoute[]; all_family_routes: number; query_compatible_routes: number; privacy_compatible_routes: number } {
  const familyRoutes = listSourceCapabilities({ source_family: input.source_family, registry: input.registry });
  const queryCompatible = familyRoutes.filter((route) => route.query_classes.includes(input.query_class));
  const privacyCompatible = queryCompatible.filter((route) => route.privacy_classes.includes(input.sensitivity_class));
  const seenProviders = new Set<string>();
  const routes = privacyCompatible
    .filter((route) => !input.unavailable_provider_ids.has(route.provider_id))
    .sort((a, b) => statusRank(readiness(a.operational_status)) - statusRank(readiness(b.operational_status)) || a.provider_id.localeCompare(b.provider_id) || a.transport_id.localeCompare(b.transport_id))
    // One provider may expose several transports. Initial planning retains a
    // single deterministic route and leaves transport failover to its own gate.
    .filter((route) => {
      if (seenProviders.has(route.provider_id)) return false;
      seenProviders.add(route.provider_id);
      return true;
    })
    .map((route) => routeFrom(route, input.source_family, input.query_class));
  return {
    routes,
    all_family_routes: familyRoutes.length,
    query_compatible_routes: queryCompatible.length,
    privacy_compatible_routes: privacyCompatible.length,
  };
}

function preflightGap(input: {
  requirement: ResearchSourceRequirement;
  family_routes: number;
  query_compatible_routes: number;
  privacy_compatible_routes: number;
}): ResearchSourcePlanCoverageGap | null {
  if (input.requirement.kind !== "mandatory") return null;
  if (input.requirement.source_family === null) {
    return { ...gapBase(input.requirement), code: "unmapped_source_role", required_action: "review_source_family" };
  }
  if (input.privacy_compatible_routes === 0 && input.query_compatible_routes > 0) {
    return { ...gapBase(input.requirement), code: "privacy_not_permitted", required_action: "classify_privacy" };
  }
  if (input.query_compatible_routes === 0 && input.family_routes > 0) {
    return { ...gapBase(input.requirement), code: "query_class_not_supported", required_action: "add_capability" };
  }
  if (input.requirement.candidate_routes.length === 0) {
    return { ...gapBase(input.requirement), code: "no_capability", required_action: "add_capability" };
  }
  if (input.requirement.candidate_routes.some((route) => route.readiness === "ready" || route.readiness === "degraded")) return null;
  if (input.requirement.candidate_routes.some((route) => route.readiness === "manual_action_required")) {
    return { ...gapBase(input.requirement), code: "manual_transport_only", required_action: "manual_import" };
  }
  return { ...gapBase(input.requirement), code: "blocked_transport_only", required_action: "verify_transport" };
}

function gapBase(requirement: ResearchSourceRequirement): Omit<ResearchSourcePlanCoverageGap, "code" | "required_action"> {
  return {
    requirement_id: requirement.requirement_id,
    role: requirement.role,
    source_family: requirement.source_family,
    attempted_provider_ids: [],
  };
}

function familiesForRole(plan: ResearchQueryPlan, role: ResearchSourceRole): readonly Bucket[] {
  if (role === "temporal" && !plan.temporal_window.from && !plan.temporal_window.to) return [];
  if (role === "adverse" && !plan.adverse_search) return [];
  return ROLE_FAMILIES[role].filter((family) => plan.required_capabilities.includes(family));
}

/**
 * Prompt 08I: provider-neutral, deterministic and offline planning layer.
 * The query plan owns legal issue semantics; this planner only binds those
 * roles to registered capabilities. It does not execute transports, alter
 * model input, or grant substantive authority to any candidate route.
 */
export function buildResearchSourcePlan(input: {
  query_plan: ResearchQueryPlan;
  registry?: readonly SourceCapabilityRegistration[];
  unavailable_provider_ids?: readonly string[];
}): ResearchSourcePlan {
  const registry = input.registry ?? SOURCE_CAPABILITY_REGISTRY;
  const unavailableProviderIds = new Set(input.unavailable_provider_ids ?? []);
  const requirements: ResearchSourceRequirement[] = [];
  const gaps: ResearchSourcePlanCoverageGap[] = [];

  for (const role of input.query_plan.source_roles) {
    const families = familiesForRole(input.query_plan, role);
    if (families.length === 0) {
      // Factual and secondary roles are intentionally represented even before
      // their future source family is registered. They cannot be silently
      // rewritten into a legal-source bucket.
      if (role === "factual_data" || role === "secondary_discovery") {
        const requirement: ResearchSourceRequirement = {
          requirement_id: `${input.query_plan.plan_id}:${role}:unmapped`, role, source_family: null,
          kind: isMandatory(role) ? "mandatory" : "optional", query_class: queryClass(input.query_plan, role), candidate_routes: [], initial_route_ids: [],
        };
        requirements.push(requirement);
        const gap = preflightGap({ requirement, family_routes: 0, query_compatible_routes: 0, privacy_compatible_routes: 0 });
        if (gap) gaps.push(gap);
      }
      continue;
    }
    for (const sourceFamily of families) {
      const candidates = candidateRoutes({
        source_family: sourceFamily,
        query_class: queryClass(input.query_plan, role),
        sensitivity_class: input.query_plan.sensitivity_class,
        registry,
        unavailable_provider_ids: unavailableProviderIds,
      });
      const requirement: ResearchSourceRequirement = {
        requirement_id: `${input.query_plan.plan_id}:${role}:${sourceFamily}`,
        role,
        source_family: sourceFamily,
        kind: isMandatory(role) ? "mandatory" : "optional",
        query_class: queryClass(input.query_plan, role),
        candidate_routes: candidates.routes,
        initial_route_ids: candidates.routes.slice(0, MAX_INITIAL_PROVIDER_ATTEMPTS).map((route) => route.route_id),
      };
      requirements.push(requirement);
      const gap = preflightGap({ requirement, ...candidates });
      if (gap) gaps.push(gap);
    }
  }

  const identity = {
    query_plan_id: input.query_plan.plan_id,
    requirements: requirements.map((requirement) => ({
      requirement_id: requirement.requirement_id,
      route_ids: requirement.candidate_routes.map((route) => route.route_id),
    })),
  };
  return {
    source_plan_id: `rsp_${hash32(stableStringify(identity))}`,
    plan_version: "08I-v1",
    query_plan_id: input.query_plan.plan_id,
    lineage: { ...input.query_plan.lineage },
    context: {
      jurisdiction: input.query_plan.jurisdiction,
      procedure_stage: input.query_plan.procedure_stage,
      court_level: input.query_plan.court_level,
      temporal_window: { ...input.query_plan.temporal_window },
      sensitivity_class: input.query_plan.sensitivity_class,
    },
    coverage_policy: {
      adverse_required: input.query_plan.adverse_search,
      temporal_required: Boolean(input.query_plan.temporal_window.from || input.query_plan.temporal_window.to),
      max_initial_provider_attempts_per_requirement: MAX_INITIAL_PROVIDER_ATTEMPTS,
      max_total_provider_attempts: MAX_TOTAL_PROVIDER_ATTEMPTS,
    },
    requirements,
    preflight_coverage_gaps: gaps,
    planner_provenance: {
      planner: "deterministic_research_source_planner",
      version: "08I-v1",
      network_used: false,
      provider_selected_in_issue_semantics: false,
      model_input_changed: false,
    },
  };
}

/**
 * A pure coverage reducer for future orchestrators. One failed or empty
 * provider does not erase remaining routes; a mandatory gap appears only when
 * every candidate route has reported the same terminal outcome.
 */
export function assessResearchSourcePlanCoverage(
  plan: ResearchSourcePlan,
  attempts: readonly ResearchSourceAttempt[],
): readonly ResearchSourceCoverageAssessment[] {
  return plan.requirements.map((requirement) => {
    const relevant = attempts.filter((attempt) =>
      attempt.requirement_id === requirement.requirement_id && requirement.candidate_routes.some((route) => route.provider_id === attempt.provider_id),
    );
    if (relevant.some((attempt) => attempt.status === "success")) {
      return { requirement_id: requirement.requirement_id, status: "covered", attempts: relevant, coverage_gap: null };
    }
    const providerIds = [...new Set(requirement.candidate_routes.map((route) => route.provider_id))];
    const attemptedIds = new Set(relevant.map((attempt) => attempt.provider_id));
    const preflight = plan.preflight_coverage_gaps.find((gap) => gap.requirement_id === requirement.requirement_id) ?? null;
    if (preflight) return { requirement_id: requirement.requirement_id, status: "gap", attempts: relevant, coverage_gap: preflight };
    if (attemptedIds.size < providerIds.length) {
      return { requirement_id: requirement.requirement_id, status: "pending", attempts: relevant, coverage_gap: null };
    }
    const code: ResearchSourcePlanGapCode = relevant.every((attempt) => attempt.status === "zero_result")
      ? "all_candidate_routes_zero_result"
      : "all_candidate_routes_failed";
    const coverageGap: ResearchSourcePlanCoverageGap | null = requirement.kind === "mandatory"
      ? { ...gapBase(requirement), code, attempted_provider_ids: [...attemptedIds].sort(), required_action: "review_source_family" }
      : null;
    return { requirement_id: requirement.requirement_id, status: coverageGap ? "gap" : "pending", attempts: relevant, coverage_gap: coverageGap };
  });
}
