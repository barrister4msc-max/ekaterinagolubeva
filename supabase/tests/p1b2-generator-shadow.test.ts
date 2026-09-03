import { describe, expect, test } from "bun:test";
import {
  benchmarkApprovals,
  observeGeneratorShadow,
  readGeneratorShadowConfig,
  stableSamplingBucket,
} from "../functions/generate-legal-document-v2/generator-shadow.ts";

const baseInput = (overrides: Partial<Parameters<typeof observeGeneratorShadow>[0]> = {}) => ({
  readEnv: () => undefined,
  operation_run_id: "generator-run-1",
  prompt: "safe test prompt",
  accepted_output: { content: "accepted" },
  accepted_model: "gemini-2.5-flash-lite",
  createStore: () => ({
    reserveBudget: async () => ({ reserved: true }),
    persistTelemetry: async () => undefined,
  }),
  fetchFn: async () => {
    throw new Error("provider must not be called");
  },
  ...overrides,
});

describe("P1-B.2 generator shadow hook", () => {
  test("is disabled by default and does not call a provider or reserve budget", async () => {
    let reserved = false;
    const result = await observeGeneratorShadow(baseInput({
      createStore: () => ({
        reserveBudget: async () => {
          reserved = true;
          return { reserved: true };
        },
        persistTelemetry: async () => undefined,
      }),
    }));

    expect(result).toEqual({ ran: false, skipped_reason: "feature_disabled" });
    expect(reserved).toBe(false);
  });

  test("sample rate zero remains a deterministic no-op even when enabled", async () => {
    const result = await observeGeneratorShadow(baseInput({
      readEnv: (name) => name === "MODEL_SHADOW_ENABLED" ? "true" : undefined,
    }));

    expect(result).toEqual({ ran: false, skipped_reason: "not_sampled" });
  });

  test("missing budget skips before availability probing", async () => {
    let providerCalled = false;
    const result = await observeGeneratorShadow(baseInput({
      readEnv: (name) => {
        if (name === "MODEL_SHADOW_ENABLED") return "true";
        if (name === "MODEL_SHADOW_SAMPLE_RATE") return "0.9999";
        return undefined;
      },
      fetchFn: async () => {
        providerCalled = true;
        throw new Error("provider must not be called without a budget");
      },
    }));

    expect(providerCalled).toBe(false);
    expect(result.skipped_reason).toBe("cost_unknown");
  });

  test("config parsing is fail-closed and approvals are explicit", () => {
    const config = readGeneratorShadowConfig(() => undefined, () => "2026-09-03");
    expect(config).toMatchObject({
      enabled: false,
      sample_rate: 0,
      budget: {
        budget_day: "2026-09-03",
        reserved_cost_usd: null,
      },
    });
    expect(benchmarkApprovals(() => "generation:openai:gpt-5.6-terra,classification:openai:other")).toEqual([
      { task_type: "generation", provider: "openai", model: "gpt-5.6-terra" },
    ]);
  });

  test("isolates hook failures and skips an unconfigured provider", async () => {
    const env = (name: string) => {
      if (name === "MODEL_SHADOW_ENABLED") return "true";
      if (name === "MODEL_SHADOW_SAMPLE_RATE") return "0.9999";
      if (name === "MODEL_SHADOW_RESERVED_COST_USD") return "0.01";
      if (name === "MODEL_SHADOW_PER_RUN_CAP_USD") return "1";
      if (name === "MODEL_SHADOW_DAILY_CAP_USD") return "1";
      return undefined;
    };

    const skipped = await observeGeneratorShadow(baseInput({ readEnv: env }));
    expect(skipped).toEqual({ ran: false, skipped_reason: "candidate_ineligible" });

    const isolated = await observeGeneratorShadow(baseInput({
      readEnv: env,
      createStore: () => {
        throw new Error("shadow store failure must not escape");
      },
    }));
    expect(isolated).toEqual({ ran: false, skipped_reason: "hook_error" });
  });

  test("uses a stable sampling bucket", () => {
    expect(stableSamplingBucket("generator-run-1")).toBe(stableSamplingBucket("generator-run-1"));
    expect(stableSamplingBucket("generator-run-1")).toBeGreaterThanOrEqual(0);
    expect(stableSamplingBucket("generator-run-1")).toBeLessThan(1);
  });
});
