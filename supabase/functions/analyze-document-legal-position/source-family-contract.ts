import type { Bucket } from "./repositories.ts";
import {
  isPlenumVsRfSource,
  PLENUM_VS_RF_SOURCE_TYPE,
  plenumAuthorityMetadata,
} from "./plenum-authority-contract.ts";

export type LegalResearchSourceFamily =
  | "normative_retrieval"
  | "official_explanation"
  | "judicial"
  | "judicial_guidance"
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
    "official_publication_pravo",
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

const NEW_FAIL_CLOSED_TYPES = new Set([
  "ruslawod_act",
  "russian_law_mcp_provision",
  "federal_law_initial_text",
  "official_publication_pravo",
  "vsrf_act",
  "vsrf_review",
  "kad_case",
  "sudact_case",
  "fns_explanation",
  "fns_appeal_decision",
  "minfin_explanation",
]);

export function sourceTypesForBucket(bucket: Bucket): string[] {
  return [...TYPES_BY_BUCKET[bucket]];
}

export function sourceFamilyForType(sourceType: string): LegalResearchSourceFamily {
  const normalized = sourceType.trim().toLowerCase();
  if (["law_full_text", "federal_law", "law_full_text_placeholder", "ruslawod_act", "russian_law_mcp_provision", "federal_law_initial_text", "official_publication_pravo"].includes(normalized)) {
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

function hasVerifiedOfficialSafety(metadata: Record<string, unknown>): boolean {
  const raw = metadata.official_verification;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const safety = raw as Record<string, unknown>;
  const actuality = typeof safety.actuality_status === "string" ? safety.actuality_status : "";
  return safety.official_origin_verified === true &&
    safety.document_identity_verified === true &&
    safety.content_verified === true &&
    (actuality === "verified" || actuality === "not_applicable") &&
    safety.substantive_use_allowed === true;
}

/**
 * New source families are fail-closed at the point where imported chunks enter
 * the existing repository layer. An importer cannot self-promote a candidate
 * by writing substantive_use_allowed=true. Promotion is possible only when the
 * existing Official Source Safety Contract is carried as a fully verified
 * `official_verification` observation.
 *
 * Legacy source types are intentionally not changed by this P0-A patch.
 */
export function sourceFamilyMetadataForType(
  sourceType: string,
  existingMetadata: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = sourceType.trim().toLowerCase();
  const result: Record<string, unknown> = {
    source_family: sourceFamilyForType(sourceType),
  };
  if (NEW_FAIL_CLOSED_TYPES.has(normalized)) {
    result.substantive_use_allowed = hasVerifiedOfficialSafety(existingMetadata);
  }
  return result;
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
