import {
  buildCanonicalDocumentKey,
  type OfficialSourceResult,
  type OfficialSourceSafety,
} from "./official-sources.ts";
import {
  mergeOfficialWithLocalSources,
  type RawSource,
} from "./repositories.ts";
import {
  isSubstantiveLegalBucketType,
  sourceFamilyMetadataForType,
} from "./source-family-contract.ts";

export type ResearchSourceAdmissionStatus =
  | "substantive_admitted"
  | "linked_to_canonical"
  | "discovery_only"
  | "blocked";

export type ResearchSourceAdmissionReason =
  | "fully_verified_official_source"
  | "linked_to_existing_canonical"
  | "retrieval_candidate_marker_missing"
  | "transport_not_approved"
  | "unsupported_source_family"
  | "canonical_identity_missing"
  | "verification_observation_missing"
  | "verification_observation_mismatch"
  | "official_safety_missing"
  | "official_origin_not_verified"
  | "document_identity_not_verified"
  | "content_not_verified"
  | "actuality_not_verified"
  | "substantive_use_not_allowed";

export type ResearchSourceUseDecision = {
  admission_version: "08J-v1";
  source_id: string;
  research_issue_id: string | null;
  proposition_id: string | null;
  canonical_document_key: string | null;
  status: ResearchSourceAdmissionStatus;
  reason: ResearchSourceAdmissionReason;
  substantive_use_allowed: boolean;
  source_use_eligible: boolean;
  actually_used_in_generation: false;
  downstream_use_in_generation_authoritative: true;
};

/** An immutable normalized provider candidate, not a verified legal source. */
export type RawSourceCandidate = {
  candidate_version: "08J-v1";
  candidate_id: string;
  source: RawSource;
  canonical_identity: {
    canonical_document_key: string | null;
    status: "resolved" | "missing";
  };
  research_issue_ids: readonly string[];
};

/**
 * Verification is intentionally a separate input from a provider candidate.
 * An adapter cannot promote its own payload by writing safety fields into
 * candidate metadata.
 */
export type VerificationObservation = {
  observation_version: "08J-v1";
  candidate_id: string;
  canonical_document_key: string;
  verifier: "official_verification_gate";
  safety: OfficialSourceSafety;
};

export type ResearchSourceCoverageGap = {
  candidate_id: string;
  research_issue_id: string | null;
  reason: ResearchSourceAdmissionReason;
};

export type ResearchSourceAdmissionResult = {
  substantive_sources: RawSource[];
  discovery_candidates: RawSource[];
  decisions: ResearchSourceUseDecision[];
  coverage_gaps: ResearchSourceCoverageGap[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function canonicalKey(source: RawSource): string | null {
  const metadata = source.metadata ?? {};
  return text(metadata.canonical_document_key) ?? buildCanonicalDocumentKey({
    bucket: source.bucket,
    documentNumber: text(metadata.document_number) ?? text(metadata.letter_number),
    documentDate: text(metadata.document_date) ?? text(metadata.letter_date) ?? text(metadata.publication_date),
    caseNumber: source.case_number ?? text(metadata.case_number),
    article: source.article ?? text(metadata.article),
    code: source.code ?? text(metadata.code) ?? text(metadata.code_name),
  });
}

function asSafety(raw: unknown): OfficialSourceSafety | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<OfficialSourceSafety>;
  if (
    typeof value.official_origin_verified !== "boolean" ||
    typeof value.document_identity_verified !== "boolean" ||
    typeof value.content_verified !== "boolean" ||
    !["verified", "not_applicable", "unknown"].includes(String(value.actuality_status)) ||
    typeof value.substantive_use_allowed !== "boolean" ||
    !["discovery", "origin", "identity", "content", "substantive"].includes(String(value.verification_level))
  ) return null;
  return value as OfficialSourceSafety;
}

function safetyFailure(safety: OfficialSourceSafety | null): ResearchSourceAdmissionReason | null {
  if (!safety) return "official_safety_missing";
  if (!safety.official_origin_verified) return "official_origin_not_verified";
  if (!safety.document_identity_verified) return "document_identity_not_verified";
  if (!safety.content_verified) return "content_not_verified";
  if (safety.actuality_status !== "verified" && safety.actuality_status !== "not_applicable") {
    return "actuality_not_verified";
  }
  if (!safety.substantive_use_allowed) return "substantive_use_not_allowed";
  return null;
}

function decision(
  source: RawSource,
  researchIssueId: string | null,
  canonicalDocumentKey: string | null,
  status: ResearchSourceAdmissionStatus,
  reason: ResearchSourceAdmissionReason,
): ResearchSourceUseDecision {
  const allowed = status === "substantive_admitted";
  return {
    admission_version: "08J-v1",
    source_id: source.source_id,
    research_issue_id: researchIssueId,
    proposition_id: null,
    canonical_document_key: canonicalDocumentKey,
    status,
    reason,
    substantive_use_allowed: allowed,
    source_use_eligible: allowed,
    actually_used_in_generation: false,
    downstream_use_in_generation_authoritative: true,
  };
}

function cloneSource(source: RawSource): RawSource {
  return { ...source, metadata: { ...(source.metadata ?? {}) } };
}

function candidateId(source: RawSource): string {
  return `${source.source_table}:${source.source_id}`;
}

function issueIds(source: RawSource): string[] {
  const values = source.metadata?.research_issue_ids;
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()))];
}

export function normalizeRawSourceCandidate(raw: RawSource): RawSourceCandidate {
  const source = cloneSource(raw);
  const key = canonicalKey(source);
  return {
    candidate_version: "08J-v1",
    candidate_id: candidateId(source),
    source,
    canonical_identity: { canonical_document_key: key, status: key ? "resolved" : "missing" },
    research_issue_ids: issueIds(source),
  };
}

function decisionsFor(
  source: RawSource,
  candidate: RawSourceCandidate,
  status: ResearchSourceAdmissionStatus,
  reason: ResearchSourceAdmissionReason,
): ResearchSourceUseDecision[] {
  const ids = candidate.research_issue_ids.length ? candidate.research_issue_ids : [null];
  return ids.map((researchIssueId) => decision(source, researchIssueId, candidate.canonical_identity.canonical_document_key, status, reason));
}

function observationFor(
  candidate: RawSourceCandidate,
  observations: readonly VerificationObservation[],
): { safety: OfficialSourceSafety | null; reason: ResearchSourceAdmissionReason | null } {
  const observation = observations.find((item) => item.candidate_id === candidate.candidate_id);
  if (!observation) return { safety: null, reason: "verification_observation_missing" };
  if (
    observation.observation_version !== "08J-v1" ||
    observation.verifier !== "official_verification_gate" ||
    !candidate.canonical_identity.canonical_document_key ||
    observation.canonical_document_key !== candidate.canonical_identity.canonical_document_key
  ) return { safety: null, reason: "verification_observation_mismatch" };
  const safety = asSafety(observation.safety);
  return safety ? { safety, reason: null } : { safety: null, reason: "verification_observation_mismatch" };
}

/**
 * Prompt 08J: universal, offline admission boundary. Retrieval approval is
 * necessary but never sufficient for substantive use; independent verification
 * evidence is mandatory. Downstream generation remains separately authoritative.
 */
export function admitResearchRetrievalCandidates(
  localSources: RawSource[],
  retrievalCandidates: RawSource[],
  verificationObservations: readonly VerificationObservation[] = [],
): ResearchSourceAdmissionResult {
  const local = localSources.map(cloneSource);
  const localKeys = new Set(local.map(canonicalKey).filter((key): key is string => Boolean(key)));
  const decisions: ResearchSourceUseDecision[] = [];
  const discoveryCandidates: RawSource[] = [];
  const coverageGaps: ResearchSourceCoverageGap[] = [];
  const admissibleOfficial: OfficialSourceResult[] = [];

  for (const raw of retrievalCandidates) {
    const candidate = normalizeRawSourceCandidate(raw);
    const source = candidate.source;
    const key = candidate.canonical_identity.canonical_document_key;
    const addDecision = (status: ResearchSourceAdmissionStatus, reason: ResearchSourceAdmissionReason) => {
      const sourceDecisions = decisionsFor(source, candidate, status, reason);
      decisions.push(...sourceDecisions);
      if (status !== "substantive_admitted" && status !== "linked_to_canonical") {
        coverageGaps.push(...sourceDecisions.map((item) => ({
          candidate_id: candidate.candidate_id,
          research_issue_id: item.research_issue_id,
          reason,
        })));
      }
    };

    if (source.metadata.retrieval_candidate_only !== true) {
      addDecision("blocked", "retrieval_candidate_marker_missing");
      discoveryCandidates.push(source);
      continue;
    }
    if (source.metadata.research_transport_status !== "approved_retrieval") {
      addDecision("blocked", "transport_not_approved");
      discoveryCandidates.push(source);
      continue;
    }
    if (!isSubstantiveLegalBucketType(source.source_type)) {
      addDecision("blocked", "unsupported_source_family");
      discoveryCandidates.push(source);
      continue;
    }
    if (!key || source.source_table !== "external_official_source" || !source.official_url) {
      addDecision("discovery_only", "canonical_identity_missing");
      discoveryCandidates.push(source);
      continue;
    }

    const observation = observationFor(candidate, verificationObservations);
    if (observation.reason) {
      addDecision("discovery_only", observation.reason);
      discoveryCandidates.push(source);
      continue;
    }
    const safety = observation.safety;
    const failure = safetyFailure(safety);
    const familyMetadata = sourceFamilyMetadataForType(source.source_type, {
      ...source.metadata,
      official_verification: safety,
    });
    const normalized: RawSource = {
      ...source,
      metadata: {
        ...source.metadata,
        ...familyMetadata,
        canonical_document_key: key,
        // Replace, rather than preserve, the provider payload's safety field.
        // `safety` below originates exclusively in VerificationObservation.
        safety,
        official_verification: safety,
        source_use_admission_version: "08J-v1",
        retrieval_candidate_only: true,
      },
    };

    if (failure || familyMetadata.substantive_use_allowed !== true) {
      normalized.metadata.substantive_use_allowed = false;
      normalized.metadata.source_use_admission_status = "discovery_only";
      normalized.metadata.source_use_admission_reason = failure ?? "substantive_use_not_allowed";
      addDecision("discovery_only", failure ?? "substantive_use_not_allowed");
      discoveryCandidates.push(normalized);
      continue;
    }

    normalized.metadata.substantive_use_allowed = true;
    normalized.metadata.source_use_admission_status = localKeys.has(key)
      ? "linked_to_canonical"
      : "substantive_admitted";
    normalized.metadata.source_use_admission_reason = localKeys.has(key)
      ? "linked_to_existing_canonical"
      : "fully_verified_official_source";
    normalized.metadata.retrieval_candidate_only = false;
    admissibleOfficial.push(normalized as OfficialSourceResult);
    addDecision(
      localKeys.has(key) ? "linked_to_canonical" : "substantive_admitted",
      localKeys.has(key) ? "linked_to_existing_canonical" : "fully_verified_official_source",
    );
  }

  const merged = mergeOfficialWithLocalSources(local, admissibleOfficial);
  return {
    substantive_sources: merged.sources,
    discovery_candidates: discoveryCandidates,
    decisions,
    coverage_gaps: coverageGaps,
  };
}
