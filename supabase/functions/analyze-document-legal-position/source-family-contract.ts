import type { Bucket } from "./repositories.ts";

export type LegalResearchSourceFamily =
  | "normative_retrieval"
  | "official_explanation"
  | "judicial"
  | "secondary_discovery"
  | "legislative_process"
  | "factual_official_data"
  | "manual";

/**
 * Source-type routing contract for material that is already inside KATI's
 * controlled knowledge/import layer. This does NOT authorize any network
 * transport and does NOT confer legal authority. Imported candidates still
 * pass canonical matching, verification, ranking and downstream safety gates.
 */
const TYPES_BY_BUCKET: Readonly<Record<Bucket, readonly string[]>> = {
  laws: [
    "law_full_text",
    "federal_law",
    "law_full_text_placeholder",
    "ruslawod_act",
    "russian_law_mcp_provision",
    "federal_law_initial_text",
  ],
  court_practice: [
    "court_practice",
    "vs_review",
    "vsrf_act",
    "vsrf_review",
    "kad_case",
    "sudact_case",
  ],
  fns_letters: [
    "fns_letter",
    "fns_explanation",
    "fns_appeal_decision",
  ],
  minfin_letters: [
    "minfin_letter",
    "minfin_explanation",
  ],
  ekaterina: ["ekaterina_practice"],
  manuals: ["manual", "manual_seed", "template"],
};

export function sourceTypesForBucket(bucket: Bucket): string[] {
  return [...TYPES_BY_BUCKET[bucket]];
}

export function sourceFamilyForType(sourceType: string): LegalResearchSourceFamily {
  const normalized = sourceType.trim().toLowerCase();
  if (["law_full_text", "federal_law", "law_full_text_placeholder", "ruslawod_act", "russian_law_mcp_provision", "federal_law_initial_text"].includes(normalized)) {
    return "normative_retrieval";
  }
  if (["fns_letter", "fns_explanation", "fns_appeal_decision", "minfin_letter", "minfin_explanation"].includes(normalized)) {
    return "official_explanation";
  }
  if (["court_practice", "vs_review", "vsrf_act", "vsrf_review", "kad_case"].includes(normalized)) {
    return "judicial";
  }
  if (["sudact_case", "klerk_analysis"].includes(normalized)) {
    return "secondary_discovery";
  }
  if (["duma_bill", "duma_legislative_event"].includes(normalized)) {
    return "legislative_process";
  }
  if (["fns_open_data", "fns_egrul", "fns_bfo_public"].includes(normalized)) {
    return "factual_official_data";
  }
  return "manual";
}

/**
 * Legislative-process and factual-registry material must never silently enter
 * a substantive-law bucket merely because it mentions a statute. Their role is
 * enrichment/freshness/evidence, not proof of the currently applicable text.
 */
export function isSubstantiveLegalBucketType(sourceType: string): boolean {
  const family = sourceFamilyForType(sourceType);
  return family === "normative_retrieval" || family === "official_explanation" || family === "judicial";
}
