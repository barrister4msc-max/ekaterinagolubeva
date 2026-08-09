import {
  canonicalConsumerObservationEnabled,
  readCanonicalShadow,
  type CanonicalShadowReadClient,
} from "./canonical-shadow-reader.ts";
import { compareCanonicalShadowParity } from "./canonical-shadow-parity.ts";
import {
  buildCanonicalConsumerFallbackObservation,
  buildCanonicalConsumerParityObservation,
  persistCanonicalConsumerObservationBestEffort,
  type CanonicalConsumerObservationRecord,
} from "./canonical-consumer-observation-persistence.ts";

export { canonicalConsumerObservationEnabled };

export interface CanonicalShadowObserverLogger {
  info(message: string, details: Record<string, unknown>): void;
  warn(message: string, details: Record<string, unknown>): void;
}

export interface ObserveCanonicalShadowParityInput {
  readonly enabled: boolean;
  readonly client: CanonicalShadowReadClient & CanonicalConsumerObservationSupabaseClient;
  readonly analysisRunId: unknown;
  readonly expectedAnalysisVersion: unknown;
  readonly conclusions: readonly unknown[];
  readonly trustedSources: readonly unknown[];
  readonly logger?: CanonicalShadowObserverLogger;
}

export interface CanonicalConsumerObservationSupabaseClient {
  from(table: "document_intake_canonical_consumer_observations"): {
    insert(record: CanonicalConsumerObservationRecord): Promise<{ readonly error?: unknown }>;
  };
}

function buildRelationScope(
  conclusions: readonly unknown[],
  trustedSources: readonly unknown[],
):
  | {
      readonly eligibleConclusionIds: ReadonlySet<string>;
      readonly trustedSourceRefs: ReadonlySet<string>;
    }
  | undefined {
  const eligibleConclusionIds = new Set<string>();
  for (const value of conclusions) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const conclusionId = (value as Record<string, unknown>).conclusion_id;
    if (
      typeof conclusionId !== "string" ||
      conclusionId.trim().length === 0 ||
      eligibleConclusionIds.has(conclusionId)
    ) {
      return undefined;
    }
    eligibleConclusionIds.add(conclusionId);
  }

  const trustedSourceRefs = new Set<string>();
  for (const value of trustedSources) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const sourceRef = (value as Record<string, unknown>).source_ref;
    if (
      typeof sourceRef !== "string" ||
      sourceRef.trim().length === 0 ||
      trustedSourceRefs.has(sourceRef)
    ) {
      return undefined;
    }
    trustedSourceRefs.add(sourceRef);
  }

  return { eligibleConclusionIds, trustedSourceRefs };
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
    const relationScope = buildRelationScope(input.conclusions, input.trustedSources);
    if (relationScope === undefined) {
      await persistCanonicalConsumerObservationBestEffort({
        client: {
          insertCanonicalConsumerObservation: (record) =>
            input.client.from("document_intake_canonical_consumer_observations").insert(record),
        },
        record: buildCanonicalConsumerFallbackObservation({
          analysisRunId: input.analysisRunId,
          analysisVersion: input.expectedAnalysisVersion,
          fallbackReason: "invalid_scope",
        }),
        logger,
      });
      logger.warn("[canonical-relations-consumer] fallback", {
        analysis_run_id: input.analysisRunId,
        analysis_version: input.expectedAnalysisVersion,
        outcome: "fallback",
        fallback_reason: "invalid_scope",
      });
      return;
    }
    const shadow = await readCanonicalShadow({
      client: input.client,
      analysisRunId: input.analysisRunId,
      expectedAnalysisVersion: input.expectedAnalysisVersion,
      ...relationScope,
    });

    if (!shadow.usable) {
      await persistCanonicalConsumerObservationBestEffort({
        client: {
          insertCanonicalConsumerObservation: (record) =>
            input.client.from("document_intake_canonical_consumer_observations").insert(record),
        },
        record: buildCanonicalConsumerFallbackObservation({
          analysisRunId: input.analysisRunId,
          analysisVersion: input.expectedAnalysisVersion,
          fallbackReason: shadow.reason,
        }),
        logger,
      });
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
    await persistCanonicalConsumerObservationBestEffort({
      client: {
        insertCanonicalConsumerObservation: (record) =>
          input.client.from("document_intake_canonical_consumer_observations").insert(record),
      },
      record: buildCanonicalConsumerParityObservation({
        analysisRunId: shadow.row.analysis_run_id,
        analysisVersion: shadow.row.analysis_version,
        schemaVersion: shadow.row.schema_version,
        claimCount: shadow.row.claim_count,
        relationCount: shadow.row.relation_count,
        uniqueRelationCount: shadow.row.unique_relation_count,
        parity,
      }),
      logger,
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
