import type {
  ModelCapability,
  ModelDescriptor,
  ModelPolicy,
  ModelProvider,
  ModelSpec,
  ModelTier,
  ProviderState,
} from "./model-types.ts";

/**
 * Static technical catalogue. Registration does not prove a provider key,
 * authorization, model access, benchmark approval or production eligibility.
 */
export const MODEL_REGISTRY: readonly ModelDescriptor[] = [
  {
    provider: "gemini",
    model: "gemini-2.5-flash",
    tier: "baseline",
    capabilities: ["text_generation", "structured_json", "long_context"],
    cost_profile: "low",
    enabled: true,
  },
  {
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    tier: "baseline",
    capabilities: ["text_generation", "structured_json"],
    cost_profile: "low",
    enabled: true,
  },
  {
    provider: "gemini",
    model: "gemini-2.5-pro",
    tier: "standard",
    capabilities: ["text_generation", "structured_json", "long_context"],
    cost_profile: "medium",
    enabled: true,
  },
  {
    provider: "openai",
    model: "gpt-5.6-luna",
    tier: "baseline",
    capabilities: ["text_generation", "structured_json"],
    cost_profile: "low",
    enabled: true,
  },
  {
    provider: "openai",
    model: "gpt-5.6-terra",
    tier: "standard",
    capabilities: ["text_generation", "structured_json", "long_context"],
    cost_profile: "medium",
    enabled: true,
  },
  {
    provider: "openai",
    model: "gpt-5.6-sol",
    tier: "advanced",
    capabilities: ["text_generation", "structured_json", "long_context"],
    cost_profile: "high",
    enabled: true,
  },
] as const;

const TIER_RANK: Record<ModelTier, number> = {
  baseline: 1,
  standard: 2,
  advanced: 3,
};

export type ModelApproval = {
  provider: ModelProvider;
  model: string;
  task_type: ModelPolicy["task_type"];
};

export type ModelEligibilityInput = {
  descriptor: ModelDescriptor;
  policy: ModelPolicy;
  provider_state: ProviderState;
  adapter_registered: boolean;
  production_baseline_approvals: readonly ModelApproval[];
  benchmark_approvals: readonly ModelApproval[];
  remaining_budget_allows_attempt: boolean;
  policy_allows_model: boolean;
};

export type ModelEligibility = {
  eligible: boolean;
  reasons: string[];
};

export function getModelDescriptor(spec: ModelSpec): ModelDescriptor | undefined {
  return MODEL_REGISTRY.find((item) => sameSpec(item, spec));
}

export function evaluateModelEligibility(input: ModelEligibilityInput): ModelEligibility {
  const reasons: string[] = [];
  const { descriptor, policy, provider_state: state } = input;

  if (!descriptor.enabled) reasons.push("model_disabled");
  if (!input.adapter_registered) reasons.push("adapter_unregistered");
  if (!state.configured) reasons.push("provider_not_configured");
  if (state.authorized !== true) reasons.push("provider_not_authorized");
  if (state.model_available !== true) reasons.push("model_not_available");
  if (state.reachable !== true) reasons.push("provider_unreachable");
  if (!hasCapabilities(descriptor.capabilities, policy.required_capabilities)) {
    reasons.push("missing_required_capability");
  }
  if (TIER_RANK[descriptor.tier] < TIER_RANK[policy.minimum_quality_tier]) {
    reasons.push("tier_below_policy_floor");
  }
  if (!isApprovedForTask(descriptor, policy, input)) reasons.push("no_task_approval");
  if (!input.remaining_budget_allows_attempt) reasons.push("remaining_budget_insufficient");
  if (!input.policy_allows_model) reasons.push("model_not_allowed_by_policy");

  return { eligible: reasons.length === 0, reasons };
}

function hasCapabilities(
  available: readonly ModelCapability[],
  required: readonly ModelCapability[],
): boolean {
  return required.every((capability) => available.includes(capability));
}

function isApprovedForTask(
  descriptor: ModelDescriptor,
  policy: ModelPolicy,
  input: ModelEligibilityInput,
): boolean {
  const matches = (approval: ModelApproval) =>
    approval.task_type === policy.task_type &&
    approval.provider === descriptor.provider &&
    approval.model === descriptor.model;

  // Baseline approval is intentionally limited to the exact current policy primary.
  const productionBaseline = sameSpec(descriptor, policy.primary) &&
    input.production_baseline_approvals.some(matches);
  return productionBaseline || input.benchmark_approvals.some(matches);
}

function sameSpec(left: ModelSpec, right: ModelSpec): boolean {
  return left.provider === right.provider && left.model === right.model;
}
