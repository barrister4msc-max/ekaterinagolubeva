import { describe, expect, test } from "bun:test";
import { runModelTask } from "../functions/_shared/ai/model-router.ts";

describe("Model Router v1", () => {
  test("uses one primary model and returns normalized telemetry", async () => {
    const calls: string[] = [];
    const result = await runModelTask({
      taskType: "classification",
      run: async ({ provider, model }) => {
        calls.push(model);
        return {
          provider,
          model,
          output: { ok: true },
          input_tokens: 10,
          output_tokens: 4,
          estimated_cost_usd: 0.001,
          json_valid: true,
          source_document_ids: ["doc-1"],
          source_quotes: ["quote"],
          confidence: 0.92,
        };
      },
    });

    expect(calls).toEqual(["gpt-5.6-luna"]);
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-5.6-luna");
    expect(result.raw_status).toBe("success");
    expect(result.json_valid).toBe(true);
    expect(result.source_document_ids).toEqual(["doc-1"]);
    expect(result.confidence).toBe(0.92);
    expect(result.attempt_history).toHaveLength(1);
    expect(result.attempt_history[0].estimated_cost_usd).toBe(0.001);
    expect(result.total_estimated_cost_usd).toBe(0.001);
  });

  test("falls back once after invalid output and never runs models in parallel", async () => {
    const calls: string[] = [];
    const result = await runModelTask({
      taskType: "classification",
      run: async ({ model }) => {
        calls.push(model);
        if (calls.length === 1) {
          return { provider: "openai", model, output: {}, json_valid: false };
        }
        return { provider: "gemini", model, output: { ok: true }, json_valid: true };
      },
    });

    expect(calls).toEqual(["gpt-5.6-luna", "gemini-2.5-flash"]);
    expect(result.provider).toBe("gemini");
    expect(result.fallback_used).toBe(true);
    expect(result.raw_status).toBe("success");
    expect(result.attempt_history.map((attempt) => attempt.model)).toEqual([
      "gpt-5.6-luna",
      "gemini-2.5-flash",
    ]);
    expect(result.attempt_history[0].raw_status).toBe("invalid_json");
  });

  test("enforces the cumulative cost cap across fallback attempts", async () => {
    let calls = 0;
    const result = await runModelTask({
      taskType: "classification",
      maxCostPerRunUsd: 0.03,
      run: async ({ provider, model }) => {
        calls += 1;
        return {
          provider,
          model,
          output: { ok: calls > 1 },
          estimated_cost_usd: 0.02,
          json_valid: calls > 1,
        };
      },
    });

    expect(calls).toBe(2);
    expect(result.json_valid).toBe(false);
    expect(result.raw_status).toBe("cost_cap_exceeded");
    expect(result.attempt_history).toHaveLength(2);
    expect(result.total_estimated_cost_usd).toBe(0.04);
    expect(result.validation_errors.join(" ")).toContain("cumulative");
  });
});
