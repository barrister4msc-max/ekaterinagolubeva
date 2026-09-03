import {
  runShadowHarness,
  type ShadowConfig,
  type ShadowSkipReason,
  type ShadowStore,
} from "../_shared/ai/model-shadow-harness.ts";
import {
  createOpenAiAdapter,
  isAdapterRegistered,
  type FetchLike,
} from "../_shared/ai/provider-adapters.ts";
import {
  evaluateModelEligibility,
  getModelDescriptor,
  type ModelApproval,
} from "../_shared/ai/model-registry.ts";
import { getModelPolicy } from "../_shared/ai/model-policy.ts";
import { getLocalProviderState, type EnvReader } from "../_shared/ai/provider-registry.ts";
import type { ModelAttempt, ModelRunResult, ModelSpec } from "../_shared/ai/model-types.ts";

/**
 * P1-B.2: comparison-only shadow hook for the Generator.
 *
 * It observes an already accepted production result. It can never change,
 * delay-block or replace the generated document, and it never throws.
 * Everything is fail-closed: without an explicit enable flag, a positive
 * sample rate, explicit budget caps, a registered/configured provider and an
 * explicit benchmark approval, the hook skips before any network call.
 */

const CANDIDATE: ModelSpec = { provider: "openai", model: "gpt-5.6-terra" };
const TASK_TYPE = "generation" as const;
const BUDGET_SCOPE = "generate-legal-document-v2";

export type GeneratorShadowOutcome = {
  ran: boolean;
  skipped_reason: ShadowSkipReason | "hook_error" | null;
};

export type GeneratorShadowInput = {
  readEnv: EnvReader;
  operation_run_id: string;
  prompt: string;
  /** The already accepted production output; passed through untouched. */
  accepted_output: unknown;
  accepted_model: string;
  createStore: () => ShadowStore | null;
  fetchFn?: FetchLike;
  now?: () => number;
  today?: () => string;
};

export function readGeneratorShadowConfig(
  readEnv: EnvReader,
  today: () => string = defaultToday,
): ShadowConfig {
  return {
    enabled: readEnv("MODEL_SHADOW_ENABLED")?.trim().toLowerCase() === "true",
    sample_rate: numberOr(readEnv("MODEL_SHADOW_SAMPLE_RATE"), 0),
    timeout_ms: numberOr(readEnv("MODEL_SHADOW_TIMEOUT_MS"), 60_000),
    budget: {
      budget_day: today(),
      budget_scope: BUDGET_SCOPE,
      daily_cap_usd: numberOr(readEnv("MODEL_SHADOW_DAILY_CAP_USD"), 0),
      per_run_cap_usd: numberOr(readEnv("MODEL_SHADOW_PER_RUN_CAP_USD"), 0),
      reserved_cost_usd: nullableNumber(readEnv("MODEL_SHADOW_RESERVED_COST_USD")),
    },
  };
}

/** Deterministic per-run bucket in [0, 1); never random full-traffic sampling. */
export function stableSamplingBucket(runId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < runId.length; index += 1) {
    hash ^= runId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

export function benchmarkApprovals(readEnv: EnvReader): ModelApproval[] {
  const raw = readEnv("MODEL_SHADOW_BENCHMARK_APPROVED")?.trim();
  if (!raw) return [];
  return raw.split(",").flatMap((entry) => {
    const [task, provider, model] = entry.trim().split(":");
    if (task !== TASK_TYPE || provider !== CANDIDATE.provider || !model) return [];
    return [{ task_type: TASK_TYPE, provider: CANDIDATE.provider, model }];
  });
}

export async function observeGeneratorShadow(
  input: GeneratorShadowInput,
): Promise<GeneratorShadowOutcome> {
  try {
    const config = readGeneratorShadowConfig(input.readEnv, input.today ?? defaultToday);
    if (!config.enabled) return { ran: false, skipped_reason: "feature_disabled" };

    const bucket = stableSamplingBucket(input.operation_run_id);
    if (!(config.sample_rate > 0) || bucket >= config.sample_rate) {
      return { ran: false, skipped_reason: "not_sampled" };
    }

    const reserved = config.budget.reserved_cost_usd;
    if (reserved === null || !Number.isFinite(reserved)) {
      return { ran: false, skipped_reason: "cost_unknown" };
    }
    if (reserved > config.budget.per_run_cap_usd) {
      return { ran: false, skipped_reason: "per_run_cap_exceeded" };
    }

    const store = input.createStore();
    if (!store) return { ran: false, skipped_reason: "budget_store_unavailable" };

    const policy = getModelPolicy(TASK_TYPE);
    const descriptor = getModelDescriptor(CANDIDATE);
    if (!descriptor) return { ran: false, skipped_reason: "candidate_ineligible" };

    const adapter = createOpenAiAdapter({ readEnv: input.readEnv, fetchFn: input.fetchFn });
    const providerState = getLocalProviderState(CANDIDATE.provider, input.readEnv);
    if (!providerState.configured) return { ran: false, skipped_reason: "candidate_ineligible" };

    const availability = await adapter.checkModelAvailability({
      model: CANDIDATE.model,
      signal: AbortSignal.timeout(config.timeout_ms),
    });

    const eligibility = evaluateModelEligibility({
      descriptor,
      policy,
      provider_state: { ...providerState, ...availability },
      adapter_registered: isAdapterRegistered(CANDIDATE.provider),
      production_baseline_approvals: [],
      benchmark_approvals: benchmarkApprovals(input.readEnv),
      remaining_budget_allows_attempt: true,
      policy_allows_model: policy.allowed_models.some(
        (spec) => spec.provider === CANDIDATE.provider && spec.model === CANDIDATE.model,
      ),
    });

    const result = await runShadowHarness<unknown>({
      operation_run_id: input.operation_run_id,
      task_type: TASK_TYPE,
      primary_result: acceptedResult(input.accepted_output, input.accepted_model),
      candidate: CANDIDATE,
      candidate_eligibility: eligibility,
      sampling_bucket: bucket,
      config,
      store,
      run_candidate: ({ candidate, signal }): Promise<ModelAttempt<unknown>> =>
        adapter.runJson({ model: candidate.model, prompt: input.prompt, signal }),
      ...(input.now ? { now: input.now } : {}),
    });

    return { ran: result.shadow_run !== null, skipped_reason: result.skipped_reason };
  } catch {
    return { ran: false, skipped_reason: "hook_error" };
  }
}

function acceptedResult(output: unknown, model: string): ModelRunResult<unknown> {
  return {
    provider: "gemini",
    model,
    task_type: TASK_TYPE,
    attempt: 1,
    latency_ms: 0,
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
    estimated_cost_usd: null,
    total_estimated_cost_usd: null,
    raw_status: "success",
    json_valid: true,
    validation_errors: [],
    fallback_used: false,
    attempt_history: [],
    source_document_ids: [],
    source_quote_refs: [],
    confidence: null,
    output,
  };
}

function numberOr(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(raw: string | undefined): number | null {
  const parsed = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(parsed) ? parsed : null;
}

function defaultToday(): string {
  return new Date().toISOString().slice(0, 10);
}
