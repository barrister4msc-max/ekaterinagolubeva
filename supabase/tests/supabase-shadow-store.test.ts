import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseShadowStore } from "../functions/_shared/ai/supabase-shadow-store.ts";
import type { ShadowRunTelemetry } from "../functions/_shared/ai/model-shadow-harness.ts";

const migration = readFileSync(
  join(import.meta.dir, "../migrations/20260828210000_p1b1_private_model_shadow_store.sql"),
  "utf8",
);

const telemetry: ShadowRunTelemetry = {
  operation_run_id: "operation-1",
  shadow_run_id: "shadow-1",
  task_type: "generation",
  provider: "openai",
  model: "gpt-5.6-terra",
  latency_ms: 15,
  input_tokens: 1,
  output_tokens: 2,
  cached_input_tokens: 0,
  cost_known: true,
  estimated_cost_usd: 0.01,
  raw_status: "success",
  json_valid: true,
  schema_valid: true,
  semantic_valid: true,
  source_ref_fidelity: "pass",
  reviewer_finding_codes: [],
  reviewer_findings_count: 0,
  candidate_identity_verified: true,
};

describe("P1-B.1 Supabase shadow store", () => {
  test("closes every PL/pgSQL dollar-quoted function body", () => {
    expect(migration.match(/\bas \$\$/g)).toHaveLength(2);
    expect(migration.match(/^\$\$;$/gm)).toHaveLength(2);
    expect(migration).not.toMatch(/^\$;$/m);
  });

  test("uses only closed RPCs and forwards no prompt or output fields", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const store = createSupabaseShadowStore({
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: name === "reserve_model_shadow_budget", error: null };
      },
    });

    await expect(store.reserveBudget({
      shadow_run_id: "shadow-1",
      budget_day: "2026-08-28",
      budget_scope: "generator-terra",
      reserved_cost_usd: 0.01,
      daily_cap_usd: 1,
      per_run_cap_usd: 0.1,
    })).resolves.toEqual({ reserved: true });
    await store.persistTelemetry(telemetry);

    expect(calls.map((call) => call.name)).toEqual([
      "reserve_model_shadow_budget",
      "record_model_shadow_telemetry",
    ]);
    const telemetryPayload = calls[1].args.p_telemetry as Record<string, unknown>;
    expect(telemetryPayload).not.toHaveProperty("prompt");
    expect(telemetryPayload).not.toHaveProperty("output");
    expect(telemetryPayload).toHaveProperty("output_tokens", 2);
  });

  test("fails closed when either RPC is unavailable", async () => {
    const store = createSupabaseShadowStore({
      rpc: async () => ({ data: null, error: { message: "db unavailable" } }),
    });
    await expect(store.reserveBudget({
      shadow_run_id: "shadow-1",
      budget_day: "2026-08-28",
      budget_scope: "generator-terra",
      reserved_cost_usd: 0.01,
      daily_cap_usd: 1,
      per_run_cap_usd: 0.1,
    })).rejects.toThrow("shadow budget reservation unavailable");
    await expect(store.persistTelemetry(telemetry)).rejects.toThrow("shadow telemetry persistence unavailable");
  });
});
