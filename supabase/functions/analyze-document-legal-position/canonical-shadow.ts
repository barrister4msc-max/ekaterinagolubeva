import {
  extractUsageClaims,
  projectUsageClaims,
  type CanonicalRelationSet,
  type TrustedSourceIdentity,
} from "../_shared/legal-analysis/canonical-relations/index.ts";

export interface CanonicalShadowInput<
  T extends TrustedSourceIdentity = TrustedSourceIdentity,
> {
  readonly enabled: boolean;
  readonly conclusions: readonly unknown[];
  readonly trustedSources: readonly T[];
}

export interface CanonicalShadowResult {
  readonly relations: CanonicalRelationSet;
  readonly claimCount: number;
  readonly relationCount: number;
  readonly skippedCount: number;
  readonly durationMs: number;
}

export interface CanonicalShadowLogger {
  info(message: string, details: Record<string, unknown>): void;
  warn(message: string, details: Record<string, unknown>): void;
}

const defaultLogger: CanonicalShadowLogger = {
  info: (message, details) => console.info(message, details),
  warn: (message, details) => console.warn(message, details),
};

const now = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function safeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === "string") return error.message;
    return String(error);
  } catch {
    return "Unknown error";
  }
}

export function computeCanonicalRelationsShadow<
  T extends TrustedSourceIdentity = TrustedSourceIdentity,
>(
  input: CanonicalShadowInput<T>,
  logger: CanonicalShadowLogger = defaultLogger,
): CanonicalShadowResult | undefined {
  if (!input.enabled) return undefined;

  try {
    const startedAt = now();
    const claims = extractUsageClaims(input.conclusions);
    const relations = projectUsageClaims({
      claims,
      conclusions: input.conclusions,
      trustedSources: input.trustedSources,
    });
    const claimCount = claims.length;
    const relationCount = relations.length;
    const skippedCount = claimCount - relationCount;
    const durationMs = Math.max(0, Math.trunc(now() - startedAt));

    logger.info("[canonical-relations-shadow] projected", {
      claims: claimCount,
      relations: relationCount,
      skipped: skippedCount,
      duration_ms: durationMs,
    });

    return { relations, claimCount, relationCount, skippedCount, durationMs };
  } catch (error) {
    try {
      logger.warn("[canonical-relations-shadow] computation_failed", {
        error: safeErrorMessage(error),
      });
    } catch {
      // Shadow logging must not affect the legacy analysis path.
    }
    return undefined;
  }
}
