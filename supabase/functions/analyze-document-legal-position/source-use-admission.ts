import type { TrustedSource } from "./enrich.ts";

export type SourceAdmissionStatus =
  | "admitted"
  | "retrieval_only"
  | "verification_unavailable"
  | "temporal_unresolved"
  | "outdated";

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : null;
}

function value(source: Record<string, unknown>, meta: Record<string, unknown>, key: string): unknown {
  return source[key] ?? meta[key];
}

/**
 * Runtime-only SourceUse bridge.
 *
 * Retrieval and model research context are intentionally unchanged. This runs
 * after canonical metadata projection and before deterministic conclusion
 * validation, so an internal source may be discovered but cannot support a
 * conclusion unless its persistent admission policy AND current temporal and
 * content verification are all positive.
 *
 * `use_in_generation` on TrustedSource is an ephemeral eligibility signal for
 * this analysis run. `actually_used_in_generation` is populated later from
 * admitted conclusions; neither field is written back to the Knowledge Base.
 */
export function applyRuntimeSourceAdmission(sources: TrustedSource[]): TrustedSource[] {
  return sources.map((source) => {
    const record = source as unknown as Record<string, unknown>;
    const meta =
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : {};

    const substantive = bool(value(record, meta, "substantive_use_allowed"));
    const content = bool(value(record, meta, "content_verified"));
    const temporal = bool(value(record, meta, "temporal_verified"));
    const freshness = String(value(record, meta, "freshness_status") ?? "").trim();

    const admitted =
      substantive === true &&
      content === true &&
      temporal === true &&
      freshness !== "outdated" &&
      freshness !== "verification_unavailable";

    let status: SourceAdmissionStatus;
    if (freshness === "outdated") status = "outdated";
    else if (freshness === "verification_unavailable") status = "verification_unavailable";
    else if (substantive !== true || content !== true) status = "retrieval_only";
    else if (temporal !== true) status = "temporal_unresolved";
    else status = "admitted";

    return {
      ...source,
      // Existing validator consumes this ephemeral, per-run eligibility field.
      use_in_generation: admitted,
      actually_used_in_generation: false,
      metadata: {
        ...meta,
        source_use_admission: {
          status,
          eligible_for_conclusion: admitted,
          selected_for_run: false,
          actually_used_in_generation: false,
          evaluated_at_runtime: true,
        },
      },
    } as TrustedSource;
  });
}
