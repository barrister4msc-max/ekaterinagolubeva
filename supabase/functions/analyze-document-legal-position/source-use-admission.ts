import type { TrustedSource } from "./enrich.ts";

export type SourceAdmissionStatus = "admitted" | "retrieval_only" | "verification_unavailable" | "temporal_unresolved";

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : null;
}

export function applyRuntimeSourceAdmission(sources: TrustedSource[]): TrustedSource[] {
  return sources.map((source) => {
    const meta = (source as Record<string, unknown>).metadata as Record<string, unknown> | undefined;
    const substantive = bool((source as Record<string, unknown>).substantive_use_allowed) ?? bool(meta?.substantive_use_allowed);
    const content = bool((source as Record<string, unknown>).content_verified) ?? bool(meta?.content_verified);
    const temporal = bool((source as Record<string, unknown>).temporal_verified) ?? bool(meta?.temporal_verified);
    const freshness = String(meta?.freshness_status ?? "");
    const admitted = substantive === true && content === true && temporal === true && freshness !== "outdated" && freshness !== "verification_unavailable";
    const status: SourceAdmissionStatus = admitted ? "admitted" : freshness === "verification_unavailable" ? "verification_unavailable" : temporal !== true ? "temporal_unresolved" : "retrieval_only";
    return {
      ...source,
      use_in_generation: admitted,
      metadata: { ...meta, source_use_admission: { status, selected_for_run: false, evaluated_at_runtime: true } },
    } as TrustedSource;
  });
}
