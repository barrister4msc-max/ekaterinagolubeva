import { isCanonicalRelation, type CanonicalRelation } from "./canonical-relations/index.ts";

export const CANONICAL_SHADOW_SCHEMA_VERSION = 1;
export const CANONICAL_RELATIONS_CONSUMER_OBSERVATION_ENABLED =
  "CANONICAL_RELATIONS_CONSUMER_OBSERVATION_ENABLED";

export function canonicalConsumerObservationEnabled(
  readEnvironment: (name: string) => string | undefined,
): boolean {
  return (
    readEnvironment(CANONICAL_RELATIONS_CONSUMER_OBSERVATION_ENABLED)?.trim().toLowerCase() ===
    "true"
  );
}

export type CanonicalShadowFallbackReason =
  | "run_id_missing"
  | "read_failed"
  | "missing"
  | "status_not_succeeded"
  | "unsupported_schema"
  | "analysis_version_mismatch"
  | "invalid_counts"
  | "invalid_relations";

export interface ValidCanonicalShadowRow {
  readonly analysis_run_id: string;
  readonly analysis_version: number;
  readonly status: "succeeded";
  readonly schema_version: 1;
  readonly claim_count: number;
  readonly relation_count: number;
  readonly unique_relation_count: number;
  readonly skipped_count: number;
  readonly relations: readonly CanonicalRelation[];
}

export type CanonicalShadowReadResult =
  | {
      readonly usable: true;
      readonly authority: "observational";
      readonly row: ValidCanonicalShadowRow;
    }
  | {
      readonly usable: false;
      readonly authority: "legacy";
      readonly reason: CanonicalShadowFallbackReason;
    };

interface MaybeSingleResult {
  readonly data: unknown;
  readonly error?: unknown;
}

export interface CanonicalShadowReadClient {
  from(table: "document_intake_canonical_shadow_runs"): {
    select(columns: string): {
      eq(
        column: "analysis_run_id",
        value: string,
      ): {
        maybeSingle(): Promise<MaybeSingleResult>;
      };
    };
  };
}

const fallback = (reason: CanonicalShadowFallbackReason): CanonicalShadowReadResult => ({
  usable: false,
  authority: "legacy",
  reason,
});

const nonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Best-effort, service-client reader. It intentionally converts every failure into legacy fallback. */
export async function readCanonicalShadow(input: {
  readonly client: CanonicalShadowReadClient;
  readonly analysisRunId: unknown;
  readonly expectedAnalysisVersion: unknown;
}): Promise<CanonicalShadowReadResult> {
  if (typeof input.analysisRunId !== "string" || input.analysisRunId.length === 0) {
    return fallback("run_id_missing");
  }

  try {
    const result = await input.client
      .from("document_intake_canonical_shadow_runs")
      .select(
        "analysis_run_id,analysis_version,status,schema_version,claim_count,relation_count,unique_relation_count,skipped_count,relations",
      )
      .eq("analysis_run_id", input.analysisRunId)
      .maybeSingle();
    if (result.error) return fallback("read_failed");
    if (result.data === null || result.data === undefined) return fallback("missing");
    if (typeof result.data !== "object" || Array.isArray(result.data))
      return fallback("read_failed");

    const row = result.data as Record<string, unknown>;
    if (row.status !== "succeeded") return fallback("status_not_succeeded");
    if (row.schema_version !== CANONICAL_SHADOW_SCHEMA_VERSION)
      return fallback("unsupported_schema");
    if (row.analysis_version !== input.expectedAnalysisVersion) {
      return fallback("analysis_version_mismatch");
    }
    if (!Array.isArray(row.relations)) return fallback("invalid_relations");

    const counts = [
      row.claim_count,
      row.relation_count,
      row.unique_relation_count,
      row.skipped_count,
    ];
    if (
      !counts.every(nonNegativeInteger) ||
      row.relation_count !== row.relations.length ||
      (row.relation_count as number) > (row.claim_count as number) ||
      (row.unique_relation_count as number) > (row.relation_count as number) ||
      row.unique_relation_count !==
        new Set(
          row.relations.map((relation) =>
            isCanonicalRelation(relation)
              ? JSON.stringify([relation.sourceEntityId, relation.targetEntityId, relation.kind])
              : Symbol(),
          ),
        ).size ||
      row.skipped_count !== (row.claim_count as number) - (row.relation_count as number)
    )
      return fallback("invalid_counts");

    if (
      !row.relations.every(
        (relation) => isCanonicalRelation(relation) && relation.kind === "uses-source",
      )
    )
      return fallback("invalid_relations");

    return {
      usable: true,
      authority: "observational",
      row: row as unknown as ValidCanonicalShadowRow,
    };
  } catch {
    return fallback("read_failed");
  }
}
