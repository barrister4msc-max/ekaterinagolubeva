import type { OfficialSourceResult, OfficialSourceSafety } from "./official-sources.ts";
import type { RawSource } from "./repositories.ts";
import type { VerificationObservation } from "./research-source-admission.ts";
import { normalizeRawSourceCandidate } from "./research-source-admission.ts";

export type VerificationFallbackStage =
  | "official_provider"
  | "official_site_discovery"
  | "internet_official_discovery"
  | "unavailable";

export type RuntimeVerificationPlan = {
  version: "internal-source-runtime-verification-v1";
  canonical_document_key: string | null;
  stages: VerificationFallbackStage[];
  internet_fallback_may_only_admit_official_hosts: true;
};

/**
 * Internet fallback is discovery-only. It may locate another official URL, but
 * a third-party page can never self-promote an internal source to substantive
 * legal use. Admission still requires independent official-source evidence.
 */
export function buildRuntimeVerificationPlan(source: RawSource): RuntimeVerificationPlan {
  const normalized = normalizeRawSourceCandidate(source);
  return {
    version: "internal-source-runtime-verification-v1",
    canonical_document_key: normalized.canonical_identity.canonical_document_key,
    stages: ["official_provider", "official_site_discovery", "internet_official_discovery", "unavailable"],
    internet_fallback_may_only_admit_official_hosts: true,
  };
}

export function normalizeLegalText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function compareLegalText(internalText: string, officialText: string): {
  exact_normalized_match: boolean;
  internal_length: number;
  official_length: number;
} {
  const internal = normalizeLegalText(internalText);
  const official = normalizeLegalText(officialText);
  return {
    exact_normalized_match: internal.length > 0 && internal === official,
    internal_length: internal.length,
    official_length: official.length,
  };
}

function officialSafety(candidate: OfficialSourceResult): OfficialSourceSafety | null {
  const raw = (candidate.metadata as Record<string, unknown> | null)?.safety;
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<OfficialSourceSafety>;
  if (
    typeof s.official_origin_verified !== "boolean" ||
    typeof s.document_identity_verified !== "boolean" ||
    typeof s.content_verified !== "boolean" ||
    typeof s.substantive_use_allowed !== "boolean" ||
    !["verified", "not_applicable", "unknown"].includes(String(s.actuality_status)) ||
    !["discovery", "origin", "identity", "content", "substantive"].includes(String(s.verification_level))
  ) return null;
  return s as OfficialSourceSafety;
}

/**
 * Bridges an independently verified official retrieval candidate to an already
 * retrieved internal source with the same canonical identity. It does not
 * mutate persistent metadata and it never sets actually_used_in_generation.
 */
export function buildInternalSourceVerificationObservation(
  internalSource: RawSource,
  officialCandidate: OfficialSourceResult,
): VerificationObservation | null {
  const internal = normalizeRawSourceCandidate(internalSource);
  const official = normalizeRawSourceCandidate(officialCandidate as unknown as RawSource);
  const internalKey = internal.canonical_identity.canonical_document_key;
  const officialKey = official.canonical_identity.canonical_document_key;
  if (!internalKey || !officialKey || internalKey !== officialKey) return null;

  const safety = officialSafety(officialCandidate);
  if (!safety) return null;

  return {
    observation_version: "08J-v1",
    candidate_id: internal.candidate_id,
    canonical_document_key: internalKey,
    verifier: "official_verification_gate",
    safety,
  };
}

/**
 * A stale/unavailable verification may still leave the source in retrieval,
 * but it cannot support a legal conclusion.
 */
export function failClosedSafety(reason: "unavailable" | "content_mismatch" | "actuality_unknown"): OfficialSourceSafety {
  return {
    official_origin_verified: false,
    document_identity_verified: false,
    content_verified: false,
    actuality_status: "unknown",
    substantive_use_allowed: false,
    verification_level: "discovery",
    ...(reason === "content_mismatch" ? { official_origin_verified: true, document_identity_verified: true, verification_level: "identity" as const } : {}),
  };
}
