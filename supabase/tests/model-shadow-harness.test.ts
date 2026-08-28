import { describe, expect, test } from "bun:test";
import {
  runShadowHarness,
  type ShadowConfig,
  type ShadowStore,
} from "../functions/_shared/ai/model-shadow-harness.ts";
import type { ModelEligibility } from "../functions/_shared/ai/model-registry.ts";
import type { ModelRunResult } from "../functions/_shared/ai/model-types.ts";

const primary: ModelRunResult<{ accepted: true }> = {
  provider: "gemini",
  model: "gemini-2.5-flash",
  task_type: "classification",
  attempt: 1,
  latency_ms: 12,
  input_tokens: 5,
  output_tokens: 2,
  cached_input_tokens: 0,
  estimated_cost_usd: 0.001,
  total_estimated_cost_usd: 0.001,
  raw_status: "success",
  json_valid: true,
  validation_errors: [],
  fallback_used: false,
  attempt_history: [],
  source_document_ids: ["doc-primary"],
  source_quote_refs: ["quote-primary"],
  confidence: 0.9,
  output: { accepted: true },
};

const eligibility = (eligible = true): ModelEligibility => ({
  eligible,
  reasons: eligible ? [] : ["no_task_approval"],
});

const config = (overrides: Partial<ShadowConfig> = {}): ShadowConfig => ({
  enabled: true,
  sample_rate: 0.2,
  timeout_ms: 100,
  budget: {
    budget_day: "2026-08-27",
    budget_scope: "model-shadow-v1",
    daily_cap_usd: 2,
    per_run_cap_usd: 0.2,
    reserved_cost_usd: 0.1,
  },
  ...overrides,
});

const createStore = (overrides: Partial<ShadowStore> = {}): ShadowStore => ({
  reserveBudget: async () => ({ reserved: true }),
  persistTelemetry: async () => undefined,
  ...overrides,
});

const request = (
  overrides: Partial<Parameters<typeof runShadowHarness<{ accepted: true }>>[0]> = {},
) => ({
  operation_run_id: "operation-1",
  task_type: "classification" as const,
  primary_result: primary,
  candidate: { provider: "openai" as const, model: "gpt-5.6-luna" },
  candidate_eligibility: eligibility(),
  sampling_bucket: 0.1,
  config: config(),
  store: createStore(),
  create_shadow_run_id: () => "shadow-1",
  now: () => 100,
  run_candidate: async () => ({
    provider: "openai" as const,
    model: "gpt-5.6-luna",
    output: { shadow: true },
    raw_status: "success" as const,
    json_valid: true,
    input_tokens: 8,
    output_tokens: 3,
    cached_input_tokens: 1,
    estimated_cost_usd: 0.01,
  }),
  validate: () => ({
    schema_valid: true,
    semantic_valid: true,
    source_ref_fidelity: "pass" as const,
    reviewer_finding_codes: [],
  }),
  ...overrides,
});

describe("P1-B model shadow harness", () => {
  test("reserves durable budget and persists summary telemetry while preserving the only accepted primary result", async () => {
    const reservations: unknown[] = [];
    const persisted: unknown[] = [];
    const result = await runShadowHarness(request({
      store: createStore({
        reserveBudget: async (reservation) => {
          reservations.push(reservation);
          return { reserved: true };
        },
        persistTelemetry: async (telemetry) => {
          persisted.push(telemetry);
        },
      }),
    }));

    expect(result.accepted_result).toBe(primary);
    expect(result.accepted_result.output).toEqual({ accepted: true });
    expect(reservations).toEqual([{
      shadow_run_id: "shadow-1",
      budget_day: "2026-08-27",
      budget_scope: "model-shadow-v1",
      reserved_cost_usd: 0.1,
      daily_cap_usd: 2,
      per_run_cap_usd: 0.2,
    }]);
    expect(persisted).toHaveLength(1);
    expect(result.shadow_run).toEqual(expect.objectContaining({
      operation_run_id: "operation-1",
      shadow_run_id: "shadow-1",
      provider: "openai",
      model: "gpt-5.6-luna",
      json_valid: true,
      schema_valid: true,
      semantic_valid: true,
      source_ref_fidelity: "pass",
      cost_known: true,
      estimated_cost_usd: 0.01,
    }));
    expect(result).toMatchObject({ shadow_telemetry_persisted: true, skipped_reason: null });
  });

  test("a shadow failure is telemetry only and never breaks or changes the primary result", async () => {
    const result = await runShadowHarness(request({
      run_candidate: async () => {
        throw new Error("OCR-CONFIDENTIAL and secret-value must not escape");
      },
    }));

    expect(result.accepted_result).toBe(primary);
    expect(result.shadow_run).toMatchObject({ raw_status: "http_error", json_valid: false });
    expect(JSON.stringify(result)).not.toContain("OCR-CONFIDENTIAL");
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  test("a shadow timeout aborts the candidate and still preserves the primary result", async () => {
    let receivedSignal: AbortSignal | undefined;
    const result = await runShadowHarness(request({
      config: config({ timeout_ms: 5 }),
      run_candidate: async ({ signal }) => {
        receivedSignal = signal;
        return await new Promise<never>(() => undefined);
      },
    }));

    expect(receivedSignal?.aborted).toBe(true);
    expect(result.accepted_result).toBe(primary);
    expect(result.shadow_run).toMatchObject({ raw_status: "timeout", json_valid: false });
  });

  test("feature flag disables shadow execution before reservation or candidate call", async () => {
    let reserved = false;
    let called = false;
    const result = await runShadowHarness(request({
      config: config({ enabled: false }),
      store: createStore({ reserveBudget: async () => {
        reserved = true;
        return { reserved: true };
      } }),
      run_candidate: async () => {
        called = true;
        return { provider: "openai", model: "gpt-5.6-luna" };
      },
    }));

    expect(reserved).toBe(false);
    expect(called).toBe(false);
    expect(result).toEqual({
      accepted_result: primary,
      shadow_run: null,
      shadow_telemetry_persisted: false,
      skipped_reason: "feature_disabled",
    });
  });

  test("hard budget blocks unknown and per-run-over-cap shadows before a reservation or provider call", async () => {
    for (const shadowConfig of [
      config({ budget: { ...config().budget, reserved_cost_usd: null } }),
      config({ budget: { ...config().budget, reserved_cost_usd: 0.3 } }),
    ]) {
      let reserved = false;
      let called = false;
      const result = await runShadowHarness(request({
        config: shadowConfig,
        store: createStore({ reserveBudget: async () => {
          reserved = true;
          return { reserved: true };
        } }),
        run_candidate: async () => {
          called = true;
          return { provider: "openai", model: "gpt-5.6-luna" };
        },
      }));
      expect(reserved).toBe(false);
      expect(called).toBe(false);
      expect(result.shadow_run).toBeNull();
      expect(result.skipped_reason).toMatch(/cost_unknown|per_run_cap_exceeded/);
    }
  });

  test("a durable atomic budget denial prevents execution before any provider call", async () => {
    let called = false;
    const result = await runShadowHarness(request({
      store: createStore({ reserveBudget: async () => ({ reserved: false }) }),
      run_candidate: async () => {
        called = true;
        return { provider: "openai", model: "gpt-5.6-luna" };
      },
    }));

    expect(called).toBe(false);
    expect(result.skipped_reason).toBe("daily_cap_exceeded");
  });

  test("fails closed when durable budget storage is unavailable but never interrupts the primary", async () => {
    const result = await runShadowHarness(request({
      store: createStore({ reserveBudget: async () => {
        throw new Error("db unavailable");
      } }),
    }));

    expect(result.accepted_result).toBe(primary);
    expect(result.skipped_reason).toBe("budget_store_unavailable");
  });

  test("requires P1-A eligibility, uses the configured sample rate, and rejects full-traffic configuration", async () => {
    const unsampled = await runShadowHarness(request({ sampling_bucket: 0.2 }));
    const ineligible = await runShadowHarness(request({ candidate_eligibility: eligibility(false) }));
    const fullTraffic = await runShadowHarness(request({ config: config({ sample_rate: 1 }) }));

    expect(unsampled.skipped_reason).toBe("not_sampled");
    expect(ineligible.skipped_reason).toBe("candidate_ineligible");
    expect(fullTraffic.skipped_reason).toBe("invalid_shadow_config");
  });

  test("persists only safe reviewer finding codes and no raw OCR, provider output, errors, or secrets", async () => {
    const result = await runShadowHarness(request({
      run_candidate: async () => ({
        provider: "openai",
        model: "gpt-5.6-luna",
        output: { raw_ocr: "OCR-CONFIDENTIAL", secret: "secret-value" },
        json_valid: true,
        raw_status: "success",
        estimated_cost_usd: null,
      }),
      validate: () => ({
        schema_valid: true,
        semantic_valid: false,
        source_ref_fidelity: "fail",
        reviewer_finding_codes: ["missing_source_ref", "PRIVATE REVIEWER NOTE", "semantic-mismatch"],
      }),
    }));

    expect(JSON.stringify(result.shadow_run)).not.toContain("OCR-CONFIDENTIAL");
    expect(JSON.stringify(result.shadow_run)).not.toContain("secret-value");
    expect(result.shadow_run).toMatchObject({
      cost_known: false,
      estimated_cost_usd: null,
      reviewer_finding_codes: ["missing_source_ref", "semantic-mismatch"],
      reviewer_findings_count: 2,
    });
  });

  test("fails closed and records actual identity when an adapter returns a different provider or model", async () => {
    const result = await runShadowHarness(request({
      run_candidate: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        output: { shadow: true },
        raw_status: "success",
        json_valid: true,
      }),
    }));

    expect(result.accepted_result).toBe(primary);
    expect(result.shadow_run).toMatchObject({
      provider: "gemini",
      model: "gemini-2.5-flash",
      candidate_identity_verified: false,
      json_valid: false,
      raw_status: "invalid_json",
      reviewer_finding_codes: ["candidate_identity_mismatch"],
    });
  });

  test("a telemetry persistence failure stays isolated from the accepted primary result", async () => {
    const result = await runShadowHarness(request({
      store: createStore({ persistTelemetry: async () => {
        throw new Error("no persistence details should escape");
      } }),
    }));

    expect(result.accepted_result).toBe(primary);
    expect(result.shadow_run).not.toBeNull();
    expect(result.shadow_telemetry_persisted).toBe(false);
    expect(result.skipped_reason).toBeNull();
  });
});
