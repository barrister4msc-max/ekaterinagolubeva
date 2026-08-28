import type {
  ShadowBudgetReservation,
  ShadowRunTelemetry,
  ShadowStore,
} from "./model-shadow-harness.ts";

type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
};

/** Server-side bridge to the P1-B.1 private store. Never use in a browser client. */
export function createSupabaseShadowStore(client: RpcClient): ShadowStore {
  return {
    async reserveBudget(input: ShadowBudgetReservation): Promise<{ reserved: boolean }> {
      const { data, error } = await client.rpc("reserve_model_shadow_budget", {
        p_shadow_run_id: input.shadow_run_id,
        p_budget_day: input.budget_day,
        p_budget_scope: input.budget_scope,
        p_reserved_cost_usd: input.reserved_cost_usd,
        p_daily_cap_usd: input.daily_cap_usd,
        p_per_run_cap_usd: input.per_run_cap_usd,
      });
      if (error || typeof data !== "boolean") {
        throw new Error("shadow budget reservation unavailable");
      }
      return { reserved: data };
    },

    async persistTelemetry(telemetry: ShadowRunTelemetry): Promise<void> {
      const { error } = await client.rpc("record_model_shadow_telemetry", {
        p_shadow_run_id: telemetry.shadow_run_id,
        p_telemetry: telemetry,
      });
      if (error) throw new Error("shadow telemetry persistence unavailable");
    },
  };
}