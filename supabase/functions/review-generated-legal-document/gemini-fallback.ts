// Gemini call with cross-model fallback for AI Review.
// Retries on 429/500/502/503/504 by trying the next model.
// Fails fast on 400/401/403.

export type ModelAttempt = {
  model: string;
  status: "ok" | "http_error" | "exception";
  http_status?: number;
  error?: string;
};

export type GeminiCallResult = {
  text: string;
  rawResponse: string;
  model: string;
  attempts: ModelAttempt[];
  fallback_used: boolean;
};

// Flash-only ordered list — Review is a cheap structural check.
export const REVIEW_GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const FATAL = new Set([400, 401, 403]);

export class AllModelsFailedError extends Error {
  attempts: ModelAttempt[];
  lastError: string;
  constructor(attempts: ModelAttempt[], lastError: string) {
    super("all_models_failed");
    this.name = "AllModelsFailedError";
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

export class FatalGeminiError extends Error {
  attempts: ModelAttempt[];
  httpStatus: number;
  constructor(message: string, attempts: ModelAttempt[], httpStatus: number) {
    super(message);
    this.name = "FatalGeminiError";
    this.attempts = attempts;
    this.httpStatus = httpStatus;
  }
}

export async function callGeminiWithFallback(
  prompt: string,
  options?: {
    models?: string[];
    maxOutputTokens?: number;
    temperature?: number;
    responseMimeType?: string;
  },
): Promise<GeminiCallResult> {
  const KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!KEY) throw new Error("GEMINI_API_KEY is not set");

  const models = options?.models ?? REVIEW_GEMINI_MODELS;
  const attempts: ModelAttempt[] = [];
  let lastError = "no_attempts";

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options?.temperature ?? 0.2,
            maxOutputTokens: options?.maxOutputTokens ?? 8192,
            responseMimeType: options?.responseMimeType ?? "application/json",
          },
        }),
      });
      const rawResponse = await res.text();

      if (res.ok) {
        let data: any = null;
        try { data = JSON.parse(rawResponse); } catch { /* leave null */ }
        const text =
          data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
        attempts.push({ model, status: "ok", http_status: res.status });
        return { text, rawResponse, model, attempts, fallback_used: i > 0 };
      }

      const snippet = rawResponse.slice(0, 500);
      attempts.push({ model, status: "http_error", http_status: res.status, error: snippet });
      lastError = `Gemini ${res.status} (${model}): ${snippet}`;
      console.error("[review-gemini-fallback]", lastError);

      if (FATAL.has(res.status)) {
        throw new FatalGeminiError(lastError, attempts, res.status);
      }
      if (!RETRYABLE.has(res.status)) {
        // Unknown non-retryable — still try the next model.
      }
    } catch (e) {
      if (e instanceof FatalGeminiError) throw e;
      const msg = (e as Error).message ?? String(e);
      attempts.push({ model, status: "exception", error: msg });
      lastError = msg;
      console.error("[review-gemini-fallback] exception on", model, msg);
    }
  }

  throw new AllModelsFailedError(attempts, lastError);
}
