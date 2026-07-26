import {
  isCanonicalRelation,
  type CanonicalRelation,
  type CanonicalRelationSet,
} from "../_shared/legal-analysis/canonical-relations/index.ts";
import type { CanonicalShadowResult } from "./canonical-shadow.ts";

export const CANONICAL_SHADOW_PERSISTENCE_SCHEMA_VERSION = 1;

export type CanonicalShadowPersistenceStatus = "succeeded" | "projection_failed";
export type CanonicalShadowPersistenceErrorCode = "projection_failed";

export interface CanonicalShadowPersistenceRecord {
  readonly analysis_run_id: string;
  readonly analysis_version: number;
  readonly status: CanonicalShadowPersistenceStatus;
  readonly schema_version: number;
  readonly claim_count: number | null;
  readonly relation_count: number | null;
  readonly unique_relation_count: number | null;
  readonly skipped_count: number | null;
  readonly duration_ms: number | null;
  readonly relations: CanonicalRelationSet | null;
  readonly error_code: CanonicalShadowPersistenceErrorCode | null;
}

export interface BuildCanonicalShadowPersistenceRecordInput {
  readonly analysisRunId: string;
  readonly analysisVersion: number;
  readonly result: CanonicalShadowResult | undefined;
  readonly shadowEnabled: boolean;
}

function projectionFailedRecord(
  analysisRunId: string,
  analysisVersion: number,
): CanonicalShadowPersistenceRecord {
  return {
    analysis_run_id: analysisRunId,
    analysis_version: analysisVersion,
    status: "projection_failed",
    schema_version: CANONICAL_SHADOW_PERSISTENCE_SCHEMA_VERSION,
    claim_count: null,
    relation_count: null,
    unique_relation_count: null,
    skipped_count: null,
    duration_ms: null,
    relations: null,
    error_code: "projection_failed",
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
  );
}

function exactTupleKey(relation: CanonicalRelation): string {
  return JSON.stringify([relation.sourceEntityId, relation.targetEntityId, relation.kind]);
}

export function buildCanonicalShadowPersistenceRecord(
  input: BuildCanonicalShadowPersistenceRecordInput,
): CanonicalShadowPersistenceRecord | undefined {
  if (!input.shadowEnabled) return undefined;

  const failed = () => projectionFailedRecord(input.analysisRunId, input.analysisVersion);
  const { result } = input;
  if (result === undefined) return failed();

  try {
    const claimCount = result.claimCount;
    const relationCount = result.relationCount;
    const skippedCount = result.skippedCount;
    const durationMs = result.durationMs;
    const relations = result.relations;

    if (
      typeof input.analysisRunId !== "string" ||
      input.analysisRunId.length === 0 ||
      !Number.isInteger(input.analysisVersion) ||
      input.analysisVersion <= 0 ||
      !isNonNegativeInteger(claimCount) ||
      !isNonNegativeInteger(relationCount) ||
      !isNonNegativeInteger(skippedCount) ||
      !isNonNegativeInteger(durationMs) ||
      !Array.isArray(relations) ||
      relationCount !== relations.length ||
      relationCount > claimCount ||
      !relations.every(isCanonicalRelation)
    ) {
      return failed();
    }

    const uniqueRelationCount = new Set(relations.map(exactTupleKey)).size;
    return {
      analysis_run_id: input.analysisRunId,
      analysis_version: input.analysisVersion,
      status: "succeeded",
      schema_version: CANONICAL_SHADOW_PERSISTENCE_SCHEMA_VERSION,
      claim_count: claimCount,
      relation_count: relationCount,
      unique_relation_count: uniqueRelationCount,
      skipped_count: skippedCount,
      duration_ms: durationMs,
      relations,
      error_code: null,
    };
  } catch {
    return failed();
  }
}

export interface CanonicalShadowInsertResult {
  readonly error?: { readonly message?: string } | null;
}

export interface CanonicalShadowInsertClient {
  insertCanonicalShadow(
    record: CanonicalShadowPersistenceRecord,
  ): Promise<CanonicalShadowInsertResult>;
}

export interface CanonicalShadowPersistenceLogger {
  info(message: string, details: Record<string, unknown>): void;
  warn(message: string, details: Record<string, unknown>): void;
}

export interface PersistCanonicalShadowBestEffortInput {
  readonly client: CanonicalShadowInsertClient;
  readonly logger?: CanonicalShadowPersistenceLogger;
  readonly record: CanonicalShadowPersistenceRecord | undefined;
}

const defaultLogger: CanonicalShadowPersistenceLogger = {
  info: (message, details) => console.info(message, details),
  warn: (message, details) => console.warn(message, details),
};

export async function persistCanonicalShadowBestEffort(
  input: PersistCanonicalShadowBestEffortInput,
): Promise<"skipped" | "persisted" | "failed"> {
  if (input.record === undefined) return "skipped";

  const { record } = input;
  const logger = input.logger ?? defaultLogger;
  try {
    const result = await input.client.insertCanonicalShadow(record);
    if (result.error) throw result.error;
  } catch {
    try {
      logger.warn("[canonical-relations-shadow] persistence_failed", {
        analysis_run_id: record.analysis_run_id,
        status: record.status,
        error_code: "insert_failed",
      });
    } catch {
      // Logging is subordinate to the already-completed legacy analysis.
    }
    return "failed";
  }

  try {
    logger.info("[canonical-relations-shadow] persistence_succeeded", {
      analysis_run_id: record.analysis_run_id,
      status: record.status,
      relations: record.relation_count,
    });
  } catch {
    // Logging is subordinate to the already-completed legacy analysis.
  }
  return "persisted";
}
