import type { Bucket } from "./repositories.ts";
import type { ResearchQueryPlan, ResearchSensitivityClass } from "./research-query-plan.ts";
import { getOfficialProviderRegistration, type OfficialProviderId } from "./official-sources.ts";
import type { ResearchProviderIntegrationMode } from "./research-provider-contract.ts";

export type ResearchTransportStatus = "disabled" | "manual_import_only" | "shadow_retrieval" | "approved_retrieval" | "degraded" | "blocked";
export type ResearchTransportReason =
  | "policy_disabled" | "capability_not_required" | "provider_capability_missing"
  | "sensitivity_unclassified" | "external_query_not_allowed" | "sensitive_exact_party_not_authorized"
  | "manual_import_only" | "machine_interface_not_documented" | "direct_backend_not_allowed"
  | "shadow_transport_not_approved" | "transport_identity_missing" | "approved_direct_transport"
  | "approved_partner_transport" | "partner_contract_missing" | "partner_documentation_missing"
  | "degraded_transport" | "unknown_provider";

export type ResearchTransportDecision = {
  decision_version: "08C-v1";
  plan_id: string;
  plan_version: ResearchQueryPlan["plan_version"];
  provider_id: string;
  registry_provider_id: OfficialProviderId | null;
  required_capability: Bucket;
  integration_mode: ResearchProviderIntegrationMode;
  status: ResearchTransportStatus;
  reason: ResearchTransportReason;
  network_allowed: boolean;
  executable: boolean;
  sensitivity_class: ResearchSensitivityClass;
  transport: { transport_id: string | null; transport_version: string | null };
  policy_provenance: {
    policy: "deterministic_research_transport_policy";
    version: "08C-v1";
    provider_registry_reused: true;
    default_fail_closed: true;
  };
};

export type ResearchTransportDecisionInput = {
  plan: ResearchQueryPlan;
  provider_id: OfficialProviderId | "bras_kad" | "bras_kad_api_cloud" | string;
  provider_capabilities: readonly Bucket[];
  required_capability: Bucket;
  integration_mode: ResearchProviderIntegrationMode;
  transport_id?: string | null;
  transport_version?: string | null;
  policy_enabled?: boolean;
  requested_status?: ResearchTransportStatus;
  sensitive_exact_party_authorized?: boolean;
  partner_contract_id?: string | null;
  partner_documentation_url?: string | null;
};

const VALID_CAPABILITIES = new Set<Bucket>(["laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals"]);

function registryProviderId(providerId: string): OfficialProviderId | null {
  if (providerId === "bras_kad" || providerId === "bras_kad_api_cloud") return "kad";
  if (["pravo", "fns", "minfin", "vsrf", "kad", "kremlin"].includes(providerId)) return providerId as OfficialProviderId;
  return null;
}

function decision(input: ResearchTransportDecisionInput, status: ResearchTransportStatus, reason: ResearchTransportReason, registryId: OfficialProviderId | null, networkAllowed = false): ResearchTransportDecision {
  return {
    decision_version: "08C-v1", plan_id: input.plan.plan_id, plan_version: input.plan.plan_version,
    provider_id: input.provider_id, registry_provider_id: registryId, required_capability: input.required_capability,
    integration_mode: input.integration_mode, status, reason, network_allowed: networkAllowed,
    executable: status === "approved_retrieval" && networkAllowed, sensitivity_class: input.plan.sensitivity_class,
    transport: { transport_id: input.transport_id?.trim() || null, transport_version: input.transport_version?.trim() || null },
    policy_provenance: { policy: "deterministic_research_transport_policy", version: "08C-v1", provider_registry_reused: true, default_fail_closed: true },
  };
}

export function evaluateResearchTransportDecision(input: ResearchTransportDecisionInput): ResearchTransportDecision {
  if (!input?.plan || input.plan.plan_version !== "08B-v1") throw new Error("invalid_research_query_plan");
  if (!VALID_CAPABILITIES.has(input.required_capability)) throw new Error("invalid_required_capability");

  const registryId = registryProviderId(input.provider_id);
  if (!registryId) return decision(input, "blocked", "unknown_provider", null);
  if (input.policy_enabled === false || input.requested_status === "disabled") return decision(input, "disabled", "policy_disabled", registryId);
  if (!input.plan.required_capabilities.includes(input.required_capability)) return decision(input, "blocked", "capability_not_required", registryId);
  if (!input.provider_capabilities.includes(input.required_capability)) return decision(input, "blocked", "provider_capability_missing", registryId);
  if (input.plan.sensitivity_class === "unclassified") return decision(input, "blocked", "sensitivity_unclassified", registryId);
  if (input.plan.sensitivity_class === "restricted_exact_party") return decision(input, "blocked", "sensitive_exact_party_not_authorized", registryId);
  if (!input.plan.external_query.external_execution_allowed) return decision(input, "blocked", "external_query_not_allowed", registryId);
  if (input.integration_mode === "manual_import") return decision(input, "manual_import_only", "manual_import_only", registryId);
  if (input.provider_id === "bras_kad") return decision(input, "manual_import_only", "machine_interface_not_documented", registryId);

  if (input.provider_id === "bras_kad_api_cloud") {
    if (input.integration_mode !== "partner_api") return decision(input, "blocked", "direct_backend_not_allowed", registryId);
    if (!input.partner_contract_id?.trim()) return decision(input, "blocked", "partner_contract_missing", registryId);
    try {
      const documentation = new URL(input.partner_documentation_url ?? "");
      if (documentation.protocol !== "https:") throw new Error("invalid");
    } catch {
      return decision(input, "blocked", "partner_documentation_missing", registryId);
    }
    if (!input.transport_id?.trim() || !input.transport_version?.trim()) return decision(input, "blocked", "transport_identity_missing", registryId);
    if (input.requested_status === "shadow_retrieval") return decision(input, "shadow_retrieval", "shadow_transport_not_approved", registryId);
    if (input.requested_status === "degraded") return decision(input, "degraded", "degraded_transport", registryId);
    return decision(input, "approved_retrieval", "approved_partner_transport", registryId, true);
  }

  const provider = getOfficialProviderRegistration(registryId);
  const documented = provider.documented_machine_interface && provider.machine_readable_search && provider.direct_backend_allowed;
  if (!provider.documented_machine_interface || !provider.machine_readable_search) return decision(input, "blocked", "machine_interface_not_documented", registryId);
  if (!provider.direct_backend_allowed) return decision(input, "blocked", "direct_backend_not_allowed", registryId);
  if (input.requested_status === "shadow_retrieval") {
    if (!input.transport_id?.trim() || !input.transport_version?.trim()) return decision(input, "blocked", "transport_identity_missing", registryId);
    return decision(input, "shadow_retrieval", "shadow_transport_not_approved", registryId);
  }
  if (input.requested_status === "degraded") return decision(input, "degraded", "degraded_transport", registryId);
  if (!documented) return decision(input, "blocked", "direct_backend_not_allowed", registryId);
  if (!input.transport_id?.trim() || !input.transport_version?.trim()) return decision(input, "blocked", "transport_identity_missing", registryId);
  return decision(input, "approved_retrieval", "approved_direct_transport", registryId, true);
}