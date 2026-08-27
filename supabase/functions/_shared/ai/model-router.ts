import { getModelPolicy } from "./model-policy.ts";
import type {
  ModelAttempt,
  ModelAttemptRecord,
  ModelProvider,
  ModelRawStatus,
  ModelRunResult,
  ModelSpec,
  ModelTaskType,
} from "./model-types.ts";

export type ModelRunner<T> = (params: {
  provider: ModelProvider;
  model: string;
  attempt: number;
  signal: AbortSignal;
}) => Promise<ModelAttempt<T>>;

export async function runModelTask<T>(params: {
  taskType: ModelTaskType;
  run: ModelRunner<T>;
  availableProviders: Partial<Record<ModelProvider, boolean>>;
  validate?: (output: T) => string[];
  timeoutMs?: number;
  maxCostPerRunUsd?: number | null;
}): Promise<ModelRunResult<T>> {
  const policy = getModelPolicy(params.taskType);
  const costCap = params.maxCostPerRunUsd ?? policy.max_cost_per_run_usd;

  if (policy.requires_explicit_cost_cap && costCap === null) {
    return blockedResult(params.taskType, "explicit cost cap is required");
  }

  const models = [policy.primary, ...policy.fallback]
    .filter((spec, index, all) => all.findIndex((item) => sameSpec(item, spec)) === index)
    .filter((spec) => policy.allowed_models.some((item) => sameSpec(item, spec)))
    .filter((spec) => params.availableProviders[spec.provider] === true)
    .slice(0, policy.max_attempts);

  if (models.length === 0) {
    return blockedResult(params.taskType, "no configured provider is available");
  }

  if (
    policy.requires_cross_provider_fallback &&
    new Set(models.map((spec) => spec.provider)).size < 2
  ) {
    return blockedResult(
      params.taskType,
      "cross-provider fallback is required but a second provider is unavailable",
    );
  }

  const errors: string[] = [];
  const attemptHistory: ModelAttemptRecord[] = [];
  let totalEstimatedCost = 0;
  let last: ModelRunResult<T> | null = null;

  for (let index = 0; index < models.length; index += 1) {
    const spec = models[index];
    const started = Date.now();
    const controller = new AbortController();

    try {
      const attempt = await withTimeout(
        params.run({
          provider: spec.provider,
          model: spec.model,
          attempt: index + 1,
          signal: controller.signal,
        }),
        params.timeoutMs ?? policy.timeout_ms,
        () => controller.abort(),
      );

      const validationErrors = [
        ...(attempt.validation_errors ?? []),
        ...(params.validate ? params.validate(attempt.output as T) : []),
      ];
      const rawStatus: ModelRawStatus = attempt.raw_status ??
        (attempt.json_valid === true && validationErrors.length === 0
          ? "success"
          : "invalid_json");
      const jsonValid =
        attempt.json_valid === true &&
        rawStatus === "success" &&
        validationErrors.length === 0;
      const estimatedCost = attempt.estimated_cost_usd ?? null;
      if (estimatedCost !== null) totalEstimatedCost += estimatedCost;

      const latencyMs = Date.now() - started;
      const fallbackUsed = index > 0;

      if (costCap !== null && totalEstimatedCost > costCap) {
        const costError = "cumulative estimated cost exceeds cap";
        const record = makeAttemptRecord({
          attempt,
          spec,
          attemptNumber: index + 1,
          latencyMs,
          jsonValid: false,
          rawStatus: "cost_cap_exceeded",
          validationErrors: [costError],
          fallbackUsed,
        });
        attemptHistory.push(record);
        errors.push(`${spec.provider}/${spec.model}: ${costError}`);
        last = makeResult({
          attempt,
          spec,
          taskType: params.taskType,
          attemptNumber: index + 1,
          latencyMs,
          jsonValid: false,
          rawStatus: "cost_cap_exceeded",
          validationErrors: [costError],
          fallbackUsed,
          attemptHistory,
          totalEstimatedCost,
        });
        break;
      }

      if (jsonValid) {
        attemptHistory.push(makeAttemptRecord({
          attempt,
          spec,
          attemptNumber: index + 1,
          latencyMs,
          jsonValid: true,
          rawStatus: "success",
          validationErrors: [],
          fallbackUsed,
        }));
        return makeResult({
          attempt,
          spec,
          taskType: params.taskType,
          attemptNumber: index + 1,
          latencyMs,
          jsonValid: true,
          rawStatus: "success",
          validationErrors: [],
          fallbackUsed,
          attemptHistory,
          totalEstimatedCost,
        });
      }

      attemptHistory.push(makeAttemptRecord({
        attempt,
        spec,
        attemptNumber: index + 1,
        latencyMs,
        jsonValid: false,
        rawStatus,
        validationErrors,
        fallbackUsed,
      }));
      errors.push(...validationErrors, `${spec.provider}/${spec.model}: invalid result`);
      last = makeResult({
        attempt,
        spec,
        taskType: params.taskType,
        attemptNumber: index + 1,
        latencyMs,
        jsonValid: false,
        rawStatus,
        validationErrors,
        fallbackUsed,
        attemptHistory,
        totalEstimatedCost,
      });

      if (attempt.retryable === false) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "model request failed";
      const rawStatus: ModelRawStatus = message.includes("timeout")
        ? "timeout"
        : "http_error";
      const latencyMs = Date.now() - started;
      errors.push(`${spec.provider}/${spec.model}: ${message}`);
      attemptHistory.push({
        provider: spec.provider,
        model: spec.model,
        attempt: index + 1,
        latency_ms: latencyMs,
        input_tokens: null,
        output_tokens: null,
        cached_input_tokens: null,
        estimated_cost_usd: null,
        raw_status: rawStatus,
        json_valid: false,
        validation_errors: [message],
        fallback_used: index > 0,
      });
      last = {
        provider: spec.provider,
        model: spec.model,
        task_type: params.taskType,
        attempt: index + 1,
        latency_ms: latencyMs,
        input_tokens: null,
        output_tokens: null,
        cached_input_tokens: null,
        estimated_cost_usd: null,
        total_estimated_cost_usd: totalEstimatedCost || null,
        raw_status: rawStatus,
        json_valid: false,
        validation_errors: [message],
        fallback_used: index > 0,
        attempt_history: [...attemptHistory],
        source_document_ids: [],
        source_quote_refs: [],
        confidence: null,
      };
    }
  }

  if (last) {
    return {
      ...last,
      attempt_history: attemptHistory,
      total_estimated_cost_usd: totalEstimatedCost || null,
      validation_errors: [...last.validation_errors, ...errors],
    };
  }

  return blockedResult(params.taskType, "router ended without a result");
}

function sameSpec(left: ModelSpec, right: ModelSpec): boolean {
  return left.provider === right.provider && left.model === right.model;
}

function blockedResult<T>(
  taskType: ModelTaskType,
  reason: string,
): ModelRunResult<T> {
  return {
    provider: "gemini",
    model: "none",
    task_type: taskType,
    attempt: 0,
    latency_ms: 0,
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
    estimated_cost_usd: null,
    total_estimated_cost_usd: null,
    raw_status: "policy_blocked",
    json_valid: false,
    validation_errors: [reason],
    fallback_used: false,
    attempt_history: [],
    source_document_ids: [],
    source_quote_refs: [],
    confidence: null,
  };
}

function makeAttemptRecord<T>(params: {
  attempt: ModelAttempt<T>;
  spec: ModelSpec;
  attemptNumber: number;
  latencyMs: number;
  jsonValid: boolean;
  rawStatus: ModelRawStatus;
  validationErrors: string[];
  fallbackUsed: boolean;
}): ModelAttemptRecord {
  return {
    provider: params.spec.provider,
    model: params.spec.model,
    attempt: params.attemptNumber,
    latency_ms: params.latencyMs,
    input_tokens: params.attempt.input_tokens ?? null,
    output_tokens: params.attempt.output_tokens ?? null,
    cached_input_tokens: params.attempt.cached_input_tokens ?? null,
    estimated_cost_usd: params.attempt.estimated_cost_usd ?? null,
    raw_status: params.rawStatus,
    json_valid: params.jsonValid,
    validation_errors: params.validationErrors,
    fallback_used: params.fallbackUsed,
  };
}

function makeResult<T>(params: {
  attempt: ModelAttempt<T>;
  spec: ModelSpec;
  taskType: ModelTaskType;
  attemptNumber: number;
  latencyMs: number;
  jsonValid: boolean;
  rawStatus: ModelRawStatus;
  validationErrors: string[];
  fallbackUsed: boolean;
  attemptHistory: ModelAttemptRecord[];
  totalEstimatedCost: number;
}): ModelRunResult<T> {
  return {
    provider: params.spec.provider,
    model: params.spec.model,
    task_type: params.taskType,
    attempt: params.attemptNumber,
    latency_ms: params.latencyMs,
    input_tokens: params.attempt.input_tokens ?? null,
    output_tokens: params.attempt.output_tokens ?? null,
    cached_input_tokens: params.attempt.cached_input_tokens ?? null,
    estimated_cost_usd: params.attempt.estimated_cost_usd ?? null,
    total_estimated_cost_usd: params.totalEstimatedCost || null,
    raw_status: params.rawStatus,
    json_valid: params.jsonValid,
    validation_errors: params.validationErrors,
    fallback_used: params.fallbackUsed,
    attempt_history: [...params.attemptHistory],
    source_document_ids: params.attempt.source_document_ids ?? [],
    source_quote_refs: params.attempt.source_quote_refs ?? [],
    confidence: params.attempt.confidence ?? null,
    output: params.jsonValid ? params.attempt.output : undefined,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`model timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
