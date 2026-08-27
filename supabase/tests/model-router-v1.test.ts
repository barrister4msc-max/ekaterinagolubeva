import { describe, expect, test } from "bun:test";
import { runModelTask } from "../functions/_shared/ai/model-router.ts";

const bothProviders = { gemini: true, openai: true };

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

  test("blocks a required cross-provider route when the second provider is unavailable", async () => {
    let calls = 0;
    const result = await runModelTask({
      taskType: "classification",
      availableProviders: { gemini: true, openai: false },
      maxCostPerRunUsd: 0.01,
      run: async () => {
        calls += 1;
        return { provider: "gemini", model: "gemini-2.5-flash", output: {}, json_valid: true };
      },
    });

    expect(calls).toBe(0);
    expect(result.raw_status).toBe("policy_blocked");
    expect(result.validation_errors[0]).toContain("second provider");
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
});
