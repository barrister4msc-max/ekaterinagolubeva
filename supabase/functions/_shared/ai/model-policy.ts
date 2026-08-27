import type { ModelPolicy, ModelSpec, ModelTaskType } from "./model-types.ts";

const geminiFlash: ModelSpec = { provider: "gemini", model: "gemini-2.5-flash" };
const geminiPro: ModelSpec = { provider: "gemini", model: "gemini-2.5-pro" };
const geminiLite: ModelSpec = { provider: "gemini", model: "gemini-2.5-flash-lite" };
const luna: ModelSpec = { provider: "openai", model: "gpt-5.6-luna" };
const terra: ModelSpec = { provider: "openai", model: "gpt-5.6-terra" };

export const MODEL_POLICIES: Record<ModelTaskType, ModelPolicy> = {
  classification: {
    task_type: "classification",
    allowed_models: [geminiFlash, luna],
    primary: geminiFlash,
    fallback: [luna],
    max_attempts: 2,
    timeout_ms: 30_000,
    max_cost_per_run_usd: null,
    requires_explicit_cost_cap: true,
    requires_cross_provider_fallback: true,
    requires_human_review: false,
  },
  fact_extraction: {
    task_type: "fact_extraction",
    allowed_models: [geminiFlash, luna],
    primary: geminiFlash,
    fallback: [luna],
    max_attempts: 2,
    timeout_ms: 45_000,
    max_cost_per_run_usd: null,
    requires_explicit_cost_cap: true,
    requires_cross_provider_fallback: true,
    requires_human_review: false,
  },
  ai_fill: {
    task_type: "ai_fill",
    allowed_models: [geminiFlash, luna],
    primary: geminiFlash,
    fallback: [luna],
    max_attempts: 2,
    timeout_ms: 120_000,
    max_cost_per_run_usd: null,
    requires_explicit_cost_cap: true,
    requires_cross_provider_fallback: true,
    requires_human_review: false,
  },
  legal_research: {
    task_type: "legal_research",
    allowed_models: [geminiPro, terra],
    primary: geminiPro,
    fallback: [terra],
    max_attempts: 2,
    timeout_ms: 180_000,
    max_cost_per_run_usd: null,
    requires_explicit_cost_cap: true,
    requires_cross_provider_fallback: true,
    requires_human_review: false,
  },
  generation: {
    task_type: "generation",
    allowed_models: [geminiLite, terra],
    primary: geminiLite,
    fallback: [terra],
    max_attempts: 2,
    timeout_ms: 180_000,
    max_cost_per_run_usd: null,
    requires_explicit_cost_cap: true,
    requires_cross_provider_fallback: true,
    requires_human_review: false,
  },
  review: {
    task_type: "review",
    allowed_models: [geminiFlash, terra],
    primary: geminiFlash,
    fallback: [terra],
    max_attempts: 2,
    timeout_ms: 180_000,
    max_cost_per_run_usd: null,
    requires_explicit_cost_cap: true,
    requires_cross_provider_fallback: true,
    requires_human_review: false,
  },
  challenge: {
    task_type: "challenge",
    allowed_models: [geminiFlash, terra],
    primary: geminiFlash,
    fallback: [terra],
    max_attempts: 2,
    timeout_ms: 180_000,
    max_cost_per_run_usd: null,
    requires_explicit_cost_cap: true,
    requires_cross_provider_fallback: true,
    requires_human_review: false,
  },
};

export function getModelPolicy(taskType: ModelTaskType): ModelPolicy {
  return MODEL_POLICIES[taskType];
}
