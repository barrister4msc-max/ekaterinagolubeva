import type {
  ModelAttempt,
  ModelProvider,
  ProviderError,
  ProviderModelAvailability,
} from "./model-types.ts";
import type { EnvReader } from "./provider-registry.ts";

export type JsonAdapterRequest = {
  model: string;
  prompt: string;
  signal: AbortSignal;
};

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ProviderAdapter = {
  provider: ModelProvider;
  /** Level 2 check: request model metadata only; never sends client materials. */
  checkModelAvailability(request: { model: string; signal: AbortSignal }): Promise<ProviderModelAvailability>;
  runJson(request: JsonAdapterRequest): Promise<ModelAttempt<unknown>>;
};

/** Registration exists independently of provider configuration and authorization. */
export const REGISTERED_ADAPTERS: readonly ModelProvider[] = ["gemini", "openai"] as const;

export function isAdapterRegistered(provider: ModelProvider): boolean {
  return REGISTERED_ADAPTERS.includes(provider);
}

export function createOpenAiAdapter(deps: {
  readEnv: EnvReader;
  fetchFn?: FetchLike;
}): ProviderAdapter {
  const fetchFn = deps.fetchFn ?? fetch;
  return {
    provider: "openai",
    async checkModelAvailability(request): Promise<ProviderModelAvailability> {
      const apiKey = deps.readEnv("OPENAI_API_KEY")?.trim();
      if (!apiKey) return unavailableCheck();
      try {
        const response = await fetchFn(`https://api.openai.com/v1/models/${encodeURIComponent(request.model)}`, {
          method: "GET",
          signal: request.signal,
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return availabilityFromStatus(response.status, response.ok);
      } catch {
        return unavailableCheck();
      }
    },
    async runJson(request): Promise<ModelAttempt<unknown>> {
      const apiKey = deps.readEnv("OPENAI_API_KEY")?.trim();
      if (!apiKey) return failedAttempt("openai", request.model, null, "unauthorized");

      try {
        const response = await fetchFn("https://api.openai.com/v1/responses", {
          method: "POST",
          signal: request.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model,
            input: request.prompt,
            text: { format: { type: "json_object" } },
          }),
        });
        if (!response.ok) return failedAttempt("openai", request.model, response.status, statusCode(response.status));
        const payload = await response.json() as Record<string, unknown>;
        return attemptFromJsonText("openai", request.model, readOpenAiText(payload), readOpenAiUsage(payload));
      } catch (error) {
        return failedAttempt("openai", request.model, null, isAbort(error) ? "timeout" : "network_error");
      }
    },
  };
}

export function createGeminiAdapter(deps: {
  readEnv: EnvReader;
  fetchFn?: FetchLike;
}): ProviderAdapter {
  const fetchFn = deps.fetchFn ?? fetch;
  return {
    provider: "gemini",
    async checkModelAvailability(request): Promise<ProviderModelAvailability> {
      const apiKey = deps.readEnv("GEMINI_API_KEY")?.trim();
      if (!apiKey) return unavailableCheck();
      try {
        const response = await fetchFn(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}`,
          {
            method: "GET",
            signal: request.signal,
            headers: { "x-goog-api-key": apiKey },
          },
        );
        return availabilityFromStatus(response.status, response.ok);
      } catch {
        return unavailableCheck();
      }
    },
    async runJson(request): Promise<ModelAttempt<unknown>> {
      const apiKey = deps.readEnv("GEMINI_API_KEY")?.trim();
      if (!apiKey) return failedAttempt("gemini", request.model, null, "unauthorized");

      try {
        const response = await fetchFn(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`,
          {
            method: "POST",
            signal: request.signal,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: request.prompt }] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
          },
        );
        if (!response.ok) return failedAttempt("gemini", request.model, response.status, statusCode(response.status));
        const payload = await response.json() as Record<string, unknown>;
        return attemptFromJsonText("gemini", request.model, readGeminiText(payload), readGeminiUsage(payload));
      } catch (error) {
        return failedAttempt("gemini", request.model, null, isAbort(error) ? "timeout" : "network_error");
      }
    },
  };
}

function attemptFromJsonText(
  provider: ModelProvider,
  model: string,
  raw: string | undefined,
  usage: Pick<ModelAttempt, "input_tokens" | "output_tokens" | "cached_input_tokens">,
): ModelAttempt<unknown> {
  if (!raw) return failedAttempt(provider, model, null, "invalid_response", usage);
  try {
    return { provider, model, output: JSON.parse(raw), json_valid: true, estimated_cost_usd: null, ...usage };
  } catch {
    return failedAttempt(provider, model, null, "invalid_response", usage);
  }
}

function failedAttempt(
  provider: ModelProvider,
  model: string,
  statusCodeValue: number | null,
  code: ProviderError["code"],
  usage: Pick<ModelAttempt, "input_tokens" | "output_tokens" | "cached_input_tokens"> = {},
): ModelAttempt<unknown> {
  const provider_error = providerError(provider, model, statusCodeValue, code);
  return {
    provider,
    model,
    json_valid: false,
    estimated_cost_usd: null,
    raw_status: code === "timeout" ? "timeout" : "http_error",
    retryable: provider_error.retryable,
    validation_errors: [provider_error.safe_message],
    provider_error,
    ...usage,
  };
}

export function providerError(
  provider: ModelProvider,
  model: string,
  status: number | null,
  code: ProviderError["code"],
): ProviderError {
  const retryable = code === "timeout" || code === "rate_limited" || code === "server_error" || code === "network_error";
  const safe_message = {
    timeout: "Provider request timed out",
    rate_limited: "Provider rate limit reached",
    server_error: "Provider temporary error",
    malformed_request: "Provider rejected the request",
    unauthorized: "Provider authorization is unavailable",
    forbidden: "Provider access is forbidden",
    model_unavailable: "Requested model is unavailable",
    network_error: "Provider network request failed",
    invalid_response: "Provider returned an invalid structured response",
  }[code];
  return { provider, model, status_code: status, code, retryable, safe_message };
}

function statusCode(status: number): ProviderError["code"] {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "model_unavailable";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "malformed_request";
}

function readOpenAiText(payload: Record<string, unknown>): string | undefined {
  // `output_text` is an SDK convenience field. The raw Responses REST payload
  // carries generated text in every `output[].content[]` item of type
  // `output_text`; preserve their order and concatenate all of them.
  const hasRawOutput = Array.isArray(payload.output);
  const output = hasRawOutput ? payload.output : [];
  const text = output.flatMap((item) => {
    const content = asRecord(item)?.content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      const record = asRecord(part);
      return record?.type === "output_text" && typeof record.text === "string" ? [record.text] : [];
    });
  }).join("");

  if (text) return text;
  // Retain compatibility with callers that supply an SDK-normalized payload,
  // but never mask a malformed raw REST `output` array with that convenience field.
  return !hasRawOutput && typeof payload.output_text === "string" ? payload.output_text : undefined;
}

function readOpenAiUsage(payload: Record<string, unknown>): Pick<ModelAttempt, "input_tokens" | "output_tokens" | "cached_input_tokens"> {
  const usage = asRecord(payload.usage);
  const inputDetails = asRecord(usage?.input_tokens_details);
  return {
    input_tokens: asNumber(usage?.input_tokens),
    output_tokens: asNumber(usage?.output_tokens),
    cached_input_tokens: asNumber(inputDetails?.cached_tokens),
  };
}

function readGeminiText(payload: Record<string, unknown>): string | undefined {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = asRecord(candidates[0]);
  const content = asRecord(candidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const part = asRecord(parts[0]);
  return typeof part?.text === "string" ? part.text : undefined;
}

function readGeminiUsage(payload: Record<string, unknown>): Pick<ModelAttempt, "input_tokens" | "output_tokens" | "cached_input_tokens"> {
  const usage = asRecord(payload.usageMetadata);
  return {
    input_tokens: asNumber(usage?.promptTokenCount),
    output_tokens: asNumber(usage?.candidatesTokenCount),
    cached_input_tokens: asNumber(usage?.cachedContentTokenCount),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function availabilityFromStatus(status: number, ok: boolean): ProviderModelAvailability {
  const checked_at = new Date().toISOString();
  if (ok) return { authorized: true, model_available: true, reachable: true, checked_at };
  if (status === 401 || status === 403) {
    return { authorized: false, model_available: null, reachable: true, checked_at };
  }
  if (status === 404) return { authorized: true, model_available: false, reachable: true, checked_at };
  return { authorized: null, model_available: null, reachable: true, checked_at };
}

function unavailableCheck(): ProviderModelAvailability {
  return { authorized: null, model_available: null, reachable: null, checked_at: new Date().toISOString() };
}
