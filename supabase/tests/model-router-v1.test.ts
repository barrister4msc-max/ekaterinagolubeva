import { describe, expect, test } from "bun:test";
import { getModelPolicy, MODEL_POLICIES } from "../functions/_shared/ai/model-policy.ts";
import { runModelTask } from "../functions/_shared/ai/model-router.ts";

const bothProviders = { gemini: true, openai: true };

async function withClassificationFallbackMode<T>(
  fallbackMode: "none" | "optional" | "required",
  callback: () => Promise<T>,
): Promise<T> {
  const previous = MODEL_POLICIES.classification;
  MODEL_POLICIES.classification = { ...previous, fallback_mode: fallbackMode };
  try {
    return await callback();
  } finally {
    MODEL_POLICIES.classification = previous;
  }
}

describe("Model Router Contract & Policy Foundation", () => {
  test("keeps Gemini primary until benchmark and returns normalized telemetry", async () => {
    const calls: string[] = [];
    const result = await runModelTask({
      taskType: "classification",
      availableProviders: bothProviders,
      maxCostPerRunUsd: 0.01,
      run: async ({ provider, model }) => {
        calls.push(model);
        return {
          provider,
          model,
          output: { ok: true },
          input_tokens: 10,
          output_tokens: 4,
          cached_input_tokens: 2,
          estimated_cost_usd: 0.001,
          json_valid: true,
          source_document_ids: ["doc-1"],
          source_quote_refs: ["quote-ref-1"],
          confidence: 0.92,
        };
      },
    });

    expect(calls).toEqual(["gemini-2.5-flash"]);
    expect(result.provider).toBe("gemini");
    expect(result.raw_status).toBe("success");
    expect(result.source_quote_refs).toEqual(["quote-ref-1"]);
    expect(result.attempt_history[0].cached_input_tokens).toBe(2);
    expect(result.total_estimated_cost_usd).toBe(0.001);
  });

  test("blocks execution when an explicit cost cap is missing", async () => {
    let calls = 0;
    const result = await runModelTask({
      taskType: "generation",
      availableProviders: bothProviders,
      run: async () => {
        calls += 1;
        return { provider: "gemini", model: "gemini-2.5-flash-lite", output: {}, json_valid: true };
      },
    });

    expect(calls).toBe(0);
    expect(result.raw_status).toBe("policy_blocked");
    expect(result.validation_errors[0]).toContain("cost cap");
  });

  test("keeps the Gemini baseline available when an optional OpenAI reserve is unavailable", async () => {
    const calls: string[] = [];
    const result = await runModelTask({
      taskType: "classification",
      availableProviders: { gemini: true, openai: false },
      maxCostPerRunUsd: 0.01,
      run: async ({ provider, model }) => {
        calls.push(model);
        return { provider, model, output: { ok: true }, json_valid: true };
      },
    });

    expect(getModelPolicy("classification").fallback_mode).toBe("optional");
    expect(calls).toEqual(["gemini-2.5-flash"]);
    expect(result.raw_status).toBe("success");
    expect(result.provider).toBe("gemini");
  });

  test("blocks a required route before model execution when its reserve is unavailable", async () => {
    let calls = 0;
    const result = await withClassificationFallbackMode("required", () => runModelTask({
      taskType: "classification",
      availableProviders: { gemini: true, openai: false },
      maxCostPerRunUsd: 0.01,
      run: async () => {
        calls += 1;
        return { provider: "gemini", model: "gemini-2.5-flash", output: {}, json_valid: true };
      },
    }));

    expect(calls).toBe(0);
    expect(result.raw_status).toBe("policy_blocked");
    expect(result.validation_errors[0]).toContain("required fallback");
  });

  test("uses only the primary when fallback mode is none", async () => {
    const calls: string[] = [];
    const result = await withClassificationFallbackMode("none", () => runModelTask({
      taskType: "classification",
      availableProviders: bothProviders,
      maxCostPerRunUsd: 0.01,
      run: async ({ provider, model }) => {
        calls.push(model);
        return { provider, model, output: {}, json_valid: false };
      },
    }));

    expect(calls).toEqual(["gemini-2.5-flash"]);
    expect(result.raw_status).toBe("invalid_json");
  });

  test("uses sequential cross-provider fallback after fail-closed JSON validation", async () => {
    const calls: string[] = [];
    const result = await runModelTask({
      taskType: "classification",
      availableProviders: bothProviders,
      maxCostPerRunUsd: 0.03,
      run: async ({ provider, model }) => {
        calls.push(model);
        if (calls.length === 1) {
          return { provider, model, output: {}, validation_errors: [] };
        }
        return { provider, model, output: { ok: true }, json_valid: true };
      },
    });

    expect(calls).toEqual(["gemini-2.5-flash", "gpt-5.6-luna"]);
    expect(result.provider).toBe("openai");
    expect(result.fallback_used).toBe(true);
    expect(result.attempt_history[0].raw_status).toBe("invalid_json");
  });

  test("does not call a fallback after cumulative cap is exceeded", async () => {
    let calls = 0;
    const result = await runModelTask({
      taskType: "classification",
      availableProviders: bothProviders,
      maxCostPerRunUsd: 0.01,
      run: async ({ provider, model }) => {
        calls += 1;
        return {
          provider,
          model,
          output: { ok: true },
          estimated_cost_usd: 0.02,
          json_valid: true,
        };
      },
    });

    expect(calls).toBe(1);
    expect(result.raw_status).toBe("cost_cap_exceeded");
    expect(result.attempt_history).toHaveLength(1);
    expect(result.total_estimated_cost_usd).toBe(0.02);
  });

  test("aborts the runner on timeout and does not treat non-retryable errors as fallbackable", async () => {
    let aborted = false;
    const timeoutResult = await runModelTask({
      taskType: "classification",
      availableProviders: bothProviders,
      maxCostPerRunUsd: 0.01,
      timeoutMs: 1,
      run: ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      }),
    });
    expect(aborted).toBe(true);
    expect(timeoutResult.raw_status).toBe("timeout");

    let nonRetryableCalls = 0;
    const nonRetryableResult = await runModelTask({
      taskType: "classification",
      availableProviders: bothProviders,
      maxCostPerRunUsd: 0.01,
      run: async ({ provider, model }) => {
        nonRetryableCalls += 1;
        return {
          provider,
          model,
          output: {},
          raw_status: "http_error",
          retryable: false,
          json_valid: false,
        };
      },
    });
    expect(nonRetryableCalls).toBe(1);
    expect(nonRetryableResult.attempt_history).toHaveLength(1);
  });

  test("accounts for invalid response cost before any validator and never calls that validator", async () => {
    let calls = 0;
    let validatorCalls = 0;
    const result = await runModelTask({
      taskType: "classification",
      availableProviders: bothProviders,
      maxCostPerRunUsd: 0.01,
      validate: () => {
        validatorCalls += 1;
        throw new Error("validator must not run for undecoded output");
      },
      run: async ({ provider, model }) => {
        calls += 1;
        return {
          provider,
          model,
          estimated_cost_usd: 0.02,
          json_valid: false,
        };
      },
    });

    expect(calls).toBe(1);
    expect(validatorCalls).toBe(0);
    expect(result.raw_status).toBe("cost_cap_exceeded");
    expect(result.total_estimated_cost_usd).toBe(0.02);
  });

  test("does not accept valid JSON without decoded output", async () => {
    const calls: string[] = [];
    const result = await runModelTask({
      taskType: "classification",
      availableProviders: bothProviders,
      maxCostPerRunUsd: 0.01,
      run: async ({ provider, model }) => {
        calls.push(model);
        if (calls.length === 1) {
          return { provider, model, json_valid: true };
        }
        return { provider, model, output: { ok: true }, json_valid: true };
      },
    });

    expect(calls).toEqual(["gemini-2.5-flash", "gpt-5.6-luna"]);
    expect(result.provider).toBe("openai");
    expect(result.output).toEqual({ ok: true });
  });

});
