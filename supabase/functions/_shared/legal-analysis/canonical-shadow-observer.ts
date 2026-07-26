import {
  canonicalConsumerObservationEnabled,
  readCanonicalShadow,
  type CanonicalShadowReadClient,
} from "./canonical-shadow-reader.ts";
import { compareCanonicalShadowParity } from "./canonical-shadow-parity.ts";

export { canonicalConsumerObservationEnabled };

export interface CanonicalShadowObserverLogger {
  info(message: string, details: Record<string, unknown>): void;
  warn(message: string, details: Record<string, unknown>): void;
}

export interface ObserveCanonicalShadowParityInput {
  readonly enabled: boolean;
  readonly client: CanonicalShadowReadClient;
  readonly analysisRunId: unknown;
  readonly expectedAnalysisVersion: unknown;
  readonly conclusions: readonly unknown[];
  readonly trustedSources: readonly unknown[];
  readonly logger?: CanonicalShadowObserverLogger;
}

const defaultLogger: CanonicalShadowObserverLogger = {
  info: (message, details) => console.info(message, details),
  warn: (message, details) => console.warn(message, details),
};

/** Runs consumer parity observation without exposing canonical data to callers. */
export async function observeCanonicalShadowParity(
  input: ObserveCanonicalShadowParityInput,
): Promise<void> {
  try {
    if (!input.enabled) return;

    const logger = input.logger ?? defaultLogger;
    const shadow = await readCanonicalShadow({
      client: input.client,
      analysisRunId: input.analysisRunId,
      expectedAnalysisVersion: input.expectedAnalysisVersion,
    });

    if (!shadow.usable) {
      logger.warn("[canonical-relations-consumer] fallback", {
        analysis_run_id: input.analysisRunId,
        analysis_version: input.expectedAnalysisVersion,
        outcome: "fallback",
        fallback_reason: shadow.reason,
      });
      return;
    }

    const parity = compareCanonicalShadowParity({
      conclusions: input.conclusions,
      trustedSources: input.trustedSources,
      canonicalRelations: shadow.row.relations,
    });
    logger.info("[canonical-relations-consumer] parity", {
      analysis_run_id: shadow.row.analysis_run_id,
      analysis_version: shadow.row.analysis_version,
      schema_version: shadow.row.schema_version,
      outcome: parity.outcome,
      claim_count: shadow.row.claim_count,
      relation_count: shadow.row.relation_count,
      unique_relation_count: shadow.row.unique_relation_count,
      ordered_equality: parity.orderedEquality,
      duplicate_equality: parity.duplicateEquality,
      coverage: parity.coverageEquality,
      reverse_index_equality: parity.reverseIndexEquality,
    });
  } catch {
    // Observation, including hostile inputs and logging, is subordinate to generation.
  }
}
