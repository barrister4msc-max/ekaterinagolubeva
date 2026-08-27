import { getModelPolicy } from "./model-policy.ts";
import type {
  ModelAttempt,
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
}): Promise<ModelRunResult<T>> {
  const policy = getModelPolicy(params.taskType);
  const models = [policy.primary, ...policy.fallback]
    .filter((model, index, all) => all.indexOf(model) === index)
    .filter((model) => policy.allowed_models.includes(model))
    .slice(0, policy.max_attempts);

  const errors: string[] = [];
  const attempts = new Set<string>();
  let last: ModelRunResult<T> | null = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    if (attempts.has(model)) continue;
    attempts.add(model);

    const provider: ModelProvider = model.startsWith("gpt-") ? "openai" : "gemini";
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

      if (!jsonValid) {
        errors.push(...validationErrors, `${provider}/${model}: invalid result`);
        last = makeResult({
          attempt,
          provider,
          model,
          taskType: params.taskType,
          attemptNumber: index + 1,
          latencyMs: Date.now() - started,
          jsonValid: false,
          validationErrors,
          fallbackUsed: index > 0,
        });
        continue;
      }

      return makeResult({
        attempt,
        provider,
        model,
        taskType: params.taskType,
        attemptNumber: index + 1,
        latencyMs: Date.now() - started,
        jsonValid: true,
        validationErrors: [],
        fallbackUsed: index > 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "model request failed";
      errors.push(`${provider}/${model}: ${message}`);
      last = {
        provider,
        model,
        task_type: params.taskType,
        attempt: index + 1,
        latency_ms: Date.now() - started,
        input_tokens: null,
        output_tokens: null,
        estimated_cost_usd: null,
        raw_status: message.includes("timeout") ? "timeout" : "http_error",
        json_valid: false,
        validation_errors: [message],
        fallback_used: index > 0,
        source_document_ids: [],
        source_quotes: [],
        confidence: null,
      };
    }
  }

  if (last) {
    return {
      ...last,
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
    raw_status: "http_error",
    json_valid: false,
    validation_errors: ["no allowed models configured"],
    fallback_used: false,
    source_document_ids: [],
    source_quotes: [],
    confidence: null,
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
  validationErrors: string[];
  fallbackUsed: boolean;
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
    raw_status: params.jsonValid ? "success" : "invalid_json",
    json_valid: params.jsonValid,
    validation_errors: params.validationErrors,
    fallback_used: params.fallbackUsed,
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
