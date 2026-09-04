import type { Bucket } from "./repositories.ts";
import type { ResearchProviderIntegrationMode } from "./research-provider-contract.ts";
import type { ResearchSensitivityClass } from "./research-query-plan.ts";

/**
 * Provider-neutral description of a source route. This is deliberately data
 * only: registration never opens a connection and never grants legal
 * authority to a retrieved candidate.
 */
export type SourceCapabilityOperationalStatus =
  | "active"
  | "disabled"
  | "shadow_retrieval"
  | "manual_import_only"
  | "blocked"
  | "degraded";

export type SourceCapabilityAuthMode = "none" | "service_secret" | "user_session" | "manual";
export type SourceCapabilityPlanEligibility = "eligible" | "legacy_compatibility_only";
export type SourceCapabilityTransportKind =
  | "local_mirror"
  | "documented_api"
  | "contracted_api"
  | "official_bulk_download"
  | "official_rss"
  | "official_html_document"
  | "browser_handoff"
  | "manual_import";

export type SourceCapabilityRegistration = {
  provider_id: string;
  official_provider_id: "pravo" | "fns" | "minfin" | "vsrf" | "kad" | "kremlin" | null;
  source_families: readonly Bucket[];
  transport_id: string;
  transport_version: string;
  transport_kind: SourceCapabilityTransportKind;
  integration_mode: ResearchProviderIntegrationMode;
  auth_mode: SourceCapabilityAuthMode;
  query_classes: readonly ("exact" | "issue" | "adverse" | "temporal")[];
  privacy_classes: readonly ResearchSensitivityClass[];
  // New provider-neutral plans must not silently expand an existing legacy
  // integration. The registry, rather than the Router, owns that distinction.
  plan_eligibility: SourceCapabilityPlanEligibility;
  operational_status: SourceCapabilityOperationalStatus;
  rate_policy: "local_only" | "documented" | "manual" | "not_configured";
  cache_policy: "local_versioned" | "policy_bounded" | "none";
  last_verified_at: string | null;
  evidence: readonly string[];
  kill_switch: true;
  // A provider or transport must never self-authorize a source for reasoning.
  substantive_use_allowed_by_provider: false;
};

export type SourceCapabilityResolution = {
  provider_id: string;
  source_family: Bucket;
  status: SourceCapabilityOperationalStatus | "unknown_provider" | "unsupported_source_family" | "transport_version_drift";
  capability: SourceCapabilityRegistration | null;
  executable: false;
  substantive_use_allowed: false;
};

const SOURCE_FAMILIES = new Set<Bucket>([
  "laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals",
]);

function copy(capability: SourceCapabilityRegistration): SourceCapabilityRegistration {
  return {
    ...capability,
    source_families: [...capability.source_families],
    query_classes: [...capability.query_classes],
    privacy_classes: [...capability.privacy_classes],
    evidence: [...capability.evidence],
  };
}

/** Validates the static registry at module construction time. */
export function createSourceCapabilityRegistry(
  capabilities: readonly SourceCapabilityRegistration[],
): readonly SourceCapabilityRegistration[] {
  const seen = new Set<string>();
  for (const capability of capabilities) {
    if (!capability.provider_id || !capability.transport_id || !capability.transport_version) {
      throw new Error("invalid_source_capability_identity");
    }
    if (!capability.source_families.length || capability.source_families.some((family) => !SOURCE_FAMILIES.has(family))) {
      throw new Error("invalid_source_capability_family");
    }
    if (capability.substantive_use_allowed_by_provider !== false || capability.kill_switch !== true) {
      throw new Error("invalid_source_capability_safety_contract");
    }
    if (capability.plan_eligibility !== "eligible" && capability.plan_eligibility !== "legacy_compatibility_only") {
      throw new Error("invalid_source_capability_plan_eligibility");
    }
    const key = `${capability.provider_id}|${capability.transport_id}|${capability.transport_version}`;
    if (seen.has(key)) throw new Error("duplicate_source_capability");
    seen.add(key);
  }
  return capabilities.map(copy);
}

/**
 * Current routes are descriptive only. Existing runtime adapters retain their
 * own gates until a later, parity-tested consumer migration.
 */
export const SOURCE_CAPABILITY_REGISTRY = createSourceCapabilityRegistry([
  {
    provider_id: "law7_local", official_provider_id: null,
    source_families: ["laws"], transport_id: "supabase_law7_mirror", transport_version: "v1", transport_kind: "local_mirror",
    integration_mode: "local", auth_mode: "none", query_classes: ["exact", "issue", "temporal"],
    privacy_classes: ["public_legal_issue", "public_case_reference", "restricted_exact_party"],
    plan_eligibility: "eligible",
    operational_status: "active", rate_policy: "local_only", cache_policy: "local_versioned",
    last_verified_at: null, evidence: ["existing_law7_transport_contract"], kill_switch: true,
    substantive_use_allowed_by_provider: false,
  },
  {
    provider_id: "pravo", official_provider_id: "pravo",
    source_families: ["laws"], transport_id: "pravo_official_api", transport_version: "existing-v1", transport_kind: "documented_api",
    integration_mode: "direct_api", auth_mode: "none", query_classes: ["exact", "issue", "temporal"],
    privacy_classes: ["public_legal_issue", "public_case_reference"], operational_status: "active",
    plan_eligibility: "legacy_compatibility_only",
    rate_policy: "documented", cache_policy: "policy_bounded", last_verified_at: null,
    evidence: ["official_provider_registry"], kill_switch: true, substantive_use_allowed_by_provider: false,
  },
  {
    provider_id: "bras_kad", official_provider_id: "kad",
    source_families: ["court_practice"], transport_id: "browser_handoff", transport_version: "v1", transport_kind: "browser_handoff",
    integration_mode: "manual_import", auth_mode: "manual", query_classes: ["exact"],
    privacy_classes: ["public_case_reference"], operational_status: "manual_import_only",
    plan_eligibility: "eligible",
    rate_policy: "manual", cache_policy: "none", last_verified_at: null,
    evidence: ["manual_import_admission_contract"], kill_switch: true, substantive_use_allowed_by_provider: false,
  },
  {
    provider_id: "bras_kad_api_cloud", official_provider_id: "kad",
    source_families: ["court_practice"], transport_id: "api_cloud_ras_arbitr", transport_version: "unverified", transport_kind: "contracted_api",
    integration_mode: "partner_api", auth_mode: "service_secret", query_classes: ["exact", "issue", "adverse"],
    privacy_classes: ["public_legal_issue", "public_case_reference"], operational_status: "shadow_retrieval",
    plan_eligibility: "legacy_compatibility_only",
    rate_policy: "not_configured", cache_policy: "policy_bounded", last_verified_at: null,
    evidence: ["shadow_only_pending_transport_evidence"], kill_switch: true, substantive_use_allowed_by_provider: false,
  },
  {
    provider_id: "fns_official", official_provider_id: "fns",
    // FNS Open Data remains a separate factual-evidence path. Do not relabel
    // it as legal FNS letters merely because its files are downloadable.
    source_families: ["fns_letters"], transport_id: "official_html_document", transport_version: "unverified", transport_kind: "official_html_document",
    integration_mode: "official_web_document", auth_mode: "none", query_classes: ["exact", "issue", "temporal"],
    privacy_classes: ["public_legal_issue"], operational_status: "blocked", rate_policy: "not_configured",
    plan_eligibility: "eligible",
    cache_policy: "none", last_verified_at: null, evidence: ["official_provider_registry_no_machine_interface"],
    kill_switch: true, substantive_use_allowed_by_provider: false,
  },
  {
    provider_id: "minfin_official", official_provider_id: "minfin",
    source_families: ["minfin_letters"], transport_id: "official_html_document", transport_version: "unverified", transport_kind: "official_html_document",
    integration_mode: "official_web_document", auth_mode: "none", query_classes: ["exact", "issue", "temporal"],
    privacy_classes: ["public_legal_issue"], operational_status: "blocked", rate_policy: "not_configured",
    plan_eligibility: "eligible",
    cache_policy: "none", last_verified_at: null, evidence: ["official_provider_registry_no_machine_interface"],
    kill_switch: true, substantive_use_allowed_by_provider: false,
  },
  {
    provider_id: "vsrf_official", official_provider_id: "vsrf",
    source_families: ["court_practice"], transport_id: "official_html_document", transport_version: "unverified", transport_kind: "official_html_document",
    integration_mode: "official_web_document", auth_mode: "none", query_classes: ["exact", "issue", "adverse"],
    privacy_classes: ["public_legal_issue", "public_case_reference"], operational_status: "degraded",
    plan_eligibility: "eligible",
    rate_policy: "not_configured", cache_policy: "none", last_verified_at: null,
    evidence: ["official_provider_registry_no_machine_interface"], kill_switch: true, substantive_use_allowed_by_provider: false,
  },
  {
    provider_id: "consultant", official_provider_id: null,
    source_families: ["laws", "court_practice", "fns_letters", "minfin_letters"],
    transport_id: "manual_import", transport_version: "v1", transport_kind: "manual_import", integration_mode: "manual_import", auth_mode: "manual",
    query_classes: ["exact", "issue", "adverse", "temporal"], privacy_classes: ["public_legal_issue", "public_case_reference"],
    operational_status: "manual_import_only", rate_policy: "manual", cache_policy: "none", last_verified_at: null,
    plan_eligibility: "eligible",
    evidence: ["external_research_import_contract"], kill_switch: true, substantive_use_allowed_by_provider: false,
  },
  {
    provider_id: "strizh", official_provider_id: null,
    source_families: ["laws", "court_practice", "fns_letters", "minfin_letters"],
    transport_id: "manual_import", transport_version: "v1", transport_kind: "manual_import", integration_mode: "manual_import", auth_mode: "manual",
    query_classes: ["exact", "issue", "adverse", "temporal"], privacy_classes: ["public_legal_issue", "public_case_reference"],
    operational_status: "manual_import_only", rate_policy: "manual", cache_policy: "none", last_verified_at: null,
    plan_eligibility: "eligible",
    evidence: ["external_research_import_contract"], kill_switch: true, substantive_use_allowed_by_provider: false,
  },
]);

export function resolveSourceCapability(input: {
  provider_id: string;
  source_family: Bucket;
  transport_version?: string | null;
  registry?: readonly SourceCapabilityRegistration[];
}): SourceCapabilityResolution {
  const registry = input.registry ?? SOURCE_CAPABILITY_REGISTRY;
  const providerRoutes = registry.filter((route) => route.provider_id === input.provider_id);
  if (!providerRoutes.length) {
    return { provider_id: input.provider_id, source_family: input.source_family, status: "unknown_provider", capability: null, executable: false, substantive_use_allowed: false };
  }
  const route = providerRoutes.find((candidate) => candidate.source_families.includes(input.source_family));
  if (!route) {
    return { provider_id: input.provider_id, source_family: input.source_family, status: "unsupported_source_family", capability: null, executable: false, substantive_use_allowed: false };
  }
  if (input.transport_version?.trim() && input.transport_version.trim() !== route.transport_version) {
    return { provider_id: input.provider_id, source_family: input.source_family, status: "transport_version_drift", capability: copy(route), executable: false, substantive_use_allowed: false };
  }
  return { provider_id: input.provider_id, source_family: input.source_family, status: route.operational_status, capability: copy(route), executable: false, substantive_use_allowed: false };
}

/**
 * Provider-neutral capability lookup for a source family. This remains a
 * description-only resolver: consumers receive copies and cannot execute a
 * transport or obtain substantive authority from it.
 */
export function listSourceCapabilities(input: {
  source_family: Bucket;
  registry?: readonly SourceCapabilityRegistration[];
  include_legacy_compatibility?: boolean;
}): readonly SourceCapabilityRegistration[] {
  const registry = input.registry ?? SOURCE_CAPABILITY_REGISTRY;
  return registry
    .filter((route) => route.source_families.includes(input.source_family))
    .filter((route) => input.include_legacy_compatibility || route.plan_eligibility === "eligible")
    .map(copy);
}
