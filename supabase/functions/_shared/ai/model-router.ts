import { getModelPolicy } from "./model-policy.ts";
import type {
  ModelAttempt,
  ModelAttemptRecord,
  ModelProvider,
  ModelRawStatus,
  ModelRunResult,
  ModelTaskType,
} from "./model-types.ts";

export type ModelRunner<T> = (params: {
  provider: ModelProvider;
  model: string;
  attempt: number;
}) => Promise<ModelAttempt<T>>;

export async function runModelTask<T>(params: {
  taskType: ModelTaskType;
  run: ModelRunner<T>;
  validate?: (output: T) => string[];
  timeoutMs?: number;
  maxCostPerRunUsd?: number | null;
}): Promise<ModelRunResult<T>> {
  const policy = getModelPolicy(params.taskType);
  const costCap = params.maxCostPerRunUsd ?? policy.max_cost_per_run_usd;
  const models = [policy.primary, ...policy.fallback]
    .filter((model, index, all) => all.indexOf(model) === index)
    .filter((model) => policy.allowed_models.includes(model))
    .slice(0, policy.max_attempts);

  if (
    policy.requires_cross_provider_fallback &&
    new Set(models.map(inferProvider)).size < 2
  ) {
    return {
      provider: inferProvider(models[0] ?? "gemini"),
      model: models[0] ?? "none",
      task_type: params.taskType,
      attempt: 0,
      latency_ms: 0,
      input_tokens: null,
      output_tokens: null,
      estimated_cost_usd: null,
      total_estimated_cost_usd: null,
      raw_status: "policy_blocked",
      json_valid: false,
      validation_errors: ["cross-provider fallback is required but not configured"],
      fallback_used: false,
      attempt_history: [],
      source_document_ids: [],
      source_quotes: [],
      confidence: null,
    };
  }

  const errors: string[] = [];
  const attempts = new Set<string>();
  const attemptHistory: ModelAttemptRecord[] = [];
  let totalEstimatedCost = 0;
  let last: ModelRunResult<T> | null = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    if (attempts.has(model)) continue;
    attempts.add(model);

    const provider = inferProvider(model);
    const started = Date.now();

    try {
      const attempt = await withTimeout(
        params.run({ provider, model, attempt: index + 1 }),
        params.timeoutMs ?? policy.timeout_ms,
      );
      const validationErrors = [
        ...(attempt.validation_errors ?? []),
        ...(params.validate ? params.validate(attempt.output as T) : []),
      ];
      const jsonValid = attempt.json_valid !== false && validationErrors.length === 0;
      const estimatedCost = attempt.estimated_cost_usd ?? null;
      if (estimatedCost !== null) totalEstimatedCost += estimatedCost;

      const rawStatus: ModelRawStatus = attempt.raw_status ??
        (jsonValid ? "success" : "invalid_json");
      const latencyMs = Date.now() - started;
      const fallbackUsed = index > 0;

      if (costCap !== null && totalEstimatedCost > costCap) {
        const costError = "cumulative estimated cost exceeds cap";
        errors.push(`${provider}/${model}: ${costError}`);
        const record = makeAttemptRecord({
          attempt,
          provider,
          model,
          attemptNumber: index + 1,
          latencyMs,
          jsonValid: false,
          rawStatus: "cost_cap_exceeded",
          validationErrors: [costError],
          fallbackUsed,
        });
        attemptHistory.push(record);
        last = makeResult({
          attempt,
          provider,
          model,
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
        continue;
      }

      if (!jsonValid) {
        errors.push(...validationErrors, `${provider}/${model}: invalid result`);
        attemptHistory.push(makeAttemptRecord({
          attempt,
          provider,
          model,
          attemptNumber: index + 1,
          latencyMs,
          jsonValid: false,
          rawStatus,
          validationErrors,
          fallbackUsed,
        }));
        last = makeResult({
          attempt,
          provider,
          model,
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
        continue;
      }

      attemptHistory.push(makeAttemptRecord({
        attempt,
        provider,
        model,
        attemptNumber: index + 1,
        latencyMs,
        jsonValid: true,
        rawStatus: "success",
        validationErrors: [],
        fallbackUsed,
      }));
      return makeResult({
        attempt,
        provider,
        model,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "model request failed";
      const latencyMs = Date.now() - started;
      const rawStatus: ModelRawStatus = message.includes("timeout")
        ? "timeout"
        : "http_error";
      errors.push(`${provider}/${model}: ${message}`);
      attemptHistory.push({
        provider,
        model,
        attempt: index + 1,
        latency_ms: latencyMs,
        input_tokens: null,
        output_tokens: null,
        estimated_cost_usd: null,
        raw_status: rawStatus,
        json_valid: false,
        validation_errors: [message],
        fallback_used: index > 0,
      });
      last = {
        provider,
        model,
        task_type: params.taskType,
        attempt: index + 1,
        latency_ms: latencyMs,
        input_tokens: null,
        output_tokens: null,
        estimated_cost_usd: null,
        total_estimated_cost_usd: totalEstimatedCost || null,
        raw_status: rawStatus,
        json_valid: false,
        validation_errors: [message],
        fallback_used: index > 0,
        attempt_history: [...attemptHistory],
        source_document_ids: [],
        source_quotes: [],
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

  return {
    provider: "gemini",
    model: "none",
    task_type: params.taskType,
    attempt: 0,
    latency_ms: 0,
    input_tokens: null,
    output_tokens: null,
    estimated_cost_usd: null,
    total_estimated_cost_usd: null,
    raw_status: "policy_blocked",
    json_valid: false,
    validation_errors: ["no allowed models configured"],
    fallback_used: false,
    attempt_history: [],
    source_document_ids: [],
    source_quotes: [],
    confidence: null,
  };
}

function inferProvider(model: string): ModelProvider {
  return model.startsWith("gpt-") ? "openai" : "gemini";
}

function makeAttemptRecord<T>(params: {
  attempt: ModelAttempt<T>;
  provider: ModelProvider;
  model: string;
  attemptNumber: number;
  latencyMs: number;
  jsonValid: boolean;
  rawStatus: ModelRawStatus;
  validationErrors: string[];
  fallbackUsed: boolean;
}): ModelAttemptRecord {
  return {
    provider: params.provider,
    model: params.model,
    attempt: params.attemptNumber,
    latency_ms: params.latencyMs,
    input_tokens: params.attempt.input_tokens ?? null,
    output_tokens: params.attempt.output_tokens ?? null,
    estimated_cost_usd: params.attempt.estimated_cost_usd ?? null,
    raw_status: params.rawStatus,
    json_valid: params.jsonValid,
    validation_errors: params.validationErrors,
    fallback_used: params.fallbackUsed,
  };
}

function makeResult<T>(params: {
  attempt: ModelAttempt<T>;
  provider: ModelProvider;
  model: string;
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
    provider: params.provider,
    model: params.model,
    task_type: params.taskType,
    attempt: params.attemptNumber,
    latency_ms: params.latencyMs,
    input_tokens: params.attempt.input_tokens ?? null,
    output_tokens: params.attempt.output_tokens ?? null,
    estimated_cost_usd: params.attempt.estimated_cost_usd ?? null,
    total_estimated_cost_usd: params.totalEstimatedCost || null,
    raw_status: params.rawStatus,
    json_valid: params.jsonValid,
    validation_errors: params.validationErrors,
    fallback_used: params.fallbackUsed,
    attempt_history: [...params.attemptHistory],
    source_document_ids: params.attempt.source_document_ids ?? [],
    source_quotes: params.attempt.source_quotes ?? [],
    confidence: params.attempt.confidence ?? null,
    output: params.jsonValid ? params.attempt.output : undefined,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`model timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
