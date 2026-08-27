import type { ModelProvider, ProviderState } from "./model-types.ts";

export type ProviderConfig = {
  provider: ModelProvider;
  secret_env: "GEMINI_API_KEY" | "OPENAI_API_KEY";
};

export const PROVIDER_REGISTRY: readonly ProviderConfig[] = [
  { provider: "gemini", secret_env: "GEMINI_API_KEY" },
  { provider: "openai", secret_env: "OPENAI_API_KEY" },
] as const;

export type EnvReader = (name: string) => string | undefined;

/** Level 1 health check: local only, no network and no model inference. */
export function getLocalProviderState(
  provider: ModelProvider,
  readEnv: EnvReader = readDenoEnv,
  checkedAt = new Date().toISOString(),
): ProviderState {
  const config = PROVIDER_REGISTRY.find((item) => item.provider === provider);
  if (!config) {
    return {
      registered: false,
      configured: false,
      authorized: null,
      model_available: null,
      reachable: null,
      checked_at: checkedAt,
    };
  }

  return {
    registered: true,
    configured: Boolean(readEnv(config.secret_env)?.trim()),
    authorized: null,
    model_available: null,
    reachable: null,
    checked_at: checkedAt,
  };
}

function readDenoEnv(name: string): string | undefined {
  const deno = (globalThis as unknown as { Deno?: { env?: { get: EnvReader } } }).Deno;
  return deno?.env?.get(name);
}
