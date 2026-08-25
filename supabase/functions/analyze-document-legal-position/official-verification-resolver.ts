import {
  evaluateOfficialSourceSafety,
  type OfficialSourceSafety,
} from "./official-sources.ts";

export type OfficialVerificationStatus =
  | "verified"
  | "no_identity"
  | "ambiguous"
  | "no_content"
  | "content_mismatch"
  | "unknown_actuality";

export type OfficialContentObservation = {
  provider_id: "pravo";
  official_source_id: string;
  official_url: string;
  eo_number: string;
  code_id: string;
  article: string;
  /**
   * Optional explicit binding to a Law7 version identity. This MUST only be
   * populated when the official-content channel independently establishes the
   * same version boundary. The current-only Law7 corpus date is not treated as
   * an amending-act date by inference.
   */
  law7_version_date?: string | null;
  article_text: string;
  content_source: "documented_official_content";
  actuality_status: "verified" | "unknown";
  observed_at: string;
};

export type VerifiableLaw7Source = {
  source_id: string;
  source_type: string;
  official_url: string | null;
  snippet: string;
  article?: string | null;
  metadata: Record<string, unknown>;
};

export type PravoVerificationCandidate = {
  source_id: string;
  official_url: string;
  metadata: Record<string, unknown>;
};

export type OfficialVerificationResolution = {
  status: OfficialVerificationStatus;
  substantive_use_allowed: boolean;
  reason: string;
  official_source_id: string | null;
  official_url: string | null;
  safety: OfficialSourceSafety | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function observationOf(candidate: PravoVerificationCandidate): OfficialContentObservation | null {
  const raw = candidate.metadata?.content_observation;
  if (!raw || typeof raw !== "object") return null;
  const observation = raw as Partial<OfficialContentObservation>;
  if (
    observation.provider_id !== "pravo" ||
    observation.content_source !== "documented_official_content" ||
    typeof observation.official_source_id !== "string" ||
    typeof observation.official_url !== "string" ||
    typeof observation.eo_number !== "string" ||
    typeof observation.code_id !== "string" ||
    typeof observation.article !== "string" ||
    typeof observation.article_text !== "string" ||
    typeof observation.observed_at !== "string" ||
    (observation.law7_version_date !== undefined &&
      observation.law7_version_date !== null &&
      typeof observation.law7_version_date !== "string") ||
    (observation.actuality_status !== "verified" && observation.actuality_status !== "unknown")
  ) return null;
  return observation as OfficialContentObservation;
}

function law7Identity(source: VerifiableLaw7Source): {
  code_id: string | null;
  article: string | null;
  version_date: string | null;
} {
  return {
    code_id: text(source.metadata?.law7_code_id),
    article: text(source.article) ?? text(source.metadata?.article),
    version_date: text(source.metadata?.version_date),
  };
}

function candidateSafety(candidate: PravoVerificationCandidate): OfficialSourceSafety | null {
  const safety = candidate.metadata?.safety;
  if (!safety || typeof safety !== "object") return null;
  return safety as OfficialSourceSafety;
}

/**
 * Deterministic Pravo ↔ Law7 verification resolver.
 *
 * This resolver NEVER fetches an undocumented endpoint and NEVER infers legal
 * identity from titles, semantic similarity or a Law7 corpus date. It can
 * promote a Law7 retrieval source only when an upstream, documented
 * official-content channel supplies a typed OfficialContentObservation that
 * exactly matches code/article, official source identity, official URL,
 * article content and verified actuality.
 *
 * `law7_version_date` is an optional additional exact constraint only when an
 * official channel independently proves it. The current-only Law7 backup does
 * not provide authoritative amendment history, so its stored version_date is
 * not treated as an amending-act identity by itself.
 *
 * Until such an official content observation exists, the result is fail-closed.
 */
export function resolveLaw7OfficialVerification(
  law7: VerifiableLaw7Source,
  pravoCandidates: PravoVerificationCandidate[],
): OfficialVerificationResolution {
  const identity = law7Identity(law7);
  if (!identity.code_id || !identity.article) {
    return {
      status: "no_identity",
      substantive_use_allowed: false,
      reason: "Law7 source lacks exact code/article identity",
      official_source_id: null,
      official_url: null,
      safety: null,
    };
  }

  const exact = pravoCandidates
    .map((candidate) => ({ candidate, observation: observationOf(candidate) }))
    .filter(({ candidate, observation }) => {
      if (!observation) return false;
      const safety = candidateSafety(candidate);
      if (!safety?.official_origin_verified || !safety?.document_identity_verified) return false;
      if (observation.official_source_id !== candidate.source_id) return false;
      if (observation.official_url !== candidate.official_url) return false;
      if (observation.code_id !== identity.code_id) return false;
      if (observation.article !== identity.article) return false;
      if (
        observation.law7_version_date != null &&
        observation.law7_version_date !== identity.version_date
      ) return false;
      return true;
    });

  if (exact.length === 0) {
    const hasAnyObservation = pravoCandidates.some((candidate) => observationOf(candidate) !== null);
    return {
      status: hasAnyObservation ? "no_identity" : "no_content",
      substantive_use_allowed: false,
      reason: hasAnyObservation
        ? "No official content observation matches exact Law7 code/article identity and any explicit version binding"
        : "No documented official content observation is available",
      official_source_id: null,
      official_url: null,
      safety: null,
    };
  }

  if (exact.length > 1) {
    return {
      status: "ambiguous",
      substantive_use_allowed: false,
      reason: "More than one official content observation matches the exact Law7 norm identity",
      official_source_id: null,
      official_url: null,
      safety: null,
    };
  }

  const { candidate, observation } = exact[0];
  if (observation.actuality_status !== "verified") {
    return {
      status: "unknown_actuality",
      substantive_use_allowed: false,
      reason: "Official content identity is matched but actuality is not verified",
      official_source_id: candidate.source_id,
      official_url: candidate.official_url,
      safety: evaluateOfficialSourceSafety({
        officialUrl: candidate.official_url,
        identityVerified: true,
        contentVerified: true,
        actualityStatus: "unknown",
      }),
    };
  }

  const law7ArticleText = text(law7.metadata?.article_text);
  if (!law7ArticleText) {
    return {
      status: "no_content",
      substantive_use_allowed: false,
      reason: "Law7 source does not contain the full article text required for deterministic content verification",
      official_source_id: candidate.source_id,
      official_url: candidate.official_url,
      safety: evaluateOfficialSourceSafety({
        officialUrl: candidate.official_url,
        identityVerified: true,
        contentVerified: false,
        actualityStatus: "verified",
      }),
    };
  }

  if (normalizeText(observation.article_text) !== normalizeText(law7ArticleText)) {
    return {
      status: "content_mismatch",
      substantive_use_allowed: false,
      reason: "Official article text does not exactly match the Law7 article text after deterministic normalization",
      official_source_id: candidate.source_id,
      official_url: candidate.official_url,
      safety: evaluateOfficialSourceSafety({
        officialUrl: candidate.official_url,
        identityVerified: true,
        contentVerified: false,
        actualityStatus: "verified",
      }),
    };
  }

  const safety = evaluateOfficialSourceSafety({
    officialUrl: candidate.official_url,
    identityVerified: true,
    contentVerified: true,
    actualityStatus: "verified",
  });

  return {
    status: "verified",
    substantive_use_allowed: safety.substantive_use_allowed,
    reason: "Exact official norm identity, official article content and actuality verified",
    official_source_id: candidate.source_id,
    official_url: candidate.official_url,
    safety,
  };
}

export function applyLaw7OfficialVerification(
  law7: VerifiableLaw7Source,
  pravoCandidates: PravoVerificationCandidate[],
): VerifiableLaw7Source {
  const resolution = resolveLaw7OfficialVerification(law7, pravoCandidates);
  if (resolution.status !== "verified" || !resolution.safety?.substantive_use_allowed) {
    return {
      ...law7,
      metadata: {
        ...law7.metadata,
        official_verification_resolution: resolution,
        substantive_use_allowed: false,
      },
    };
  }

  return {
    ...law7,
    official_url: resolution.official_url,
    metadata: {
      ...law7.metadata,
      official_origin_verified: true,
      primary_source_verified: true,
      document_identity_verified: true,
      content_verified: true,
      actuality_status: "verified",
      verification_status: "substantive",
      substantive_use_allowed: true,
      official_verification_resolution: resolution,
    },
  };
}
