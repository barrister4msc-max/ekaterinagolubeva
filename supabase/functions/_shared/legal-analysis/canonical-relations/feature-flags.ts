import { CANONICAL_RELATIONS_ENABLED_ENV } from "./constants.ts";

export type EnvironmentReader = (name: string) => string | undefined;

export interface CanonicalRelationsFeatureFlags {
  readonly enabled: boolean;
}

function runtimeEnvironmentReader(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get(name: string): string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };

  return runtime.Deno?.env?.get(name) ?? runtime.process?.env?.[name];
}

/** Only the explicit, case-insensitive value `true` enables a flag. */
export function readBooleanFeatureFlag(
  name: string,
  readEnvironment: EnvironmentReader = runtimeEnvironmentReader,
): boolean {
  return readEnvironment(name)?.trim().toLowerCase() === "true";
}

export function readCanonicalRelationsFeatureFlags(
  readEnvironment: EnvironmentReader = runtimeEnvironmentReader,
): CanonicalRelationsFeatureFlags {
  return {
    enabled: readBooleanFeatureFlag(CANONICAL_RELATIONS_ENABLED_ENV, readEnvironment),
  };
}
