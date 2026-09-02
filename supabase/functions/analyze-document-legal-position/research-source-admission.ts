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
  | "official_safety_missing"
  | "official_origin_not_verified"
  | "document_identity_not_verified"
  | "content_not_verified"
  | "actuality_not_verified"
  | "substantive_use_not_allowed";

export type ResearchSourceUseDecision = {
  admission_version: "08E-v1";
  source_id: string;
  canonical_document_key: string | null;
  status: ResearchSourceAdmissionStatus;
  reason: ResearchSourceAdmissionReason;
  substantive_use_allowed: boolean;
  source_use_eligible: boolean;
  downstream_use_in_generation_authoritative: true;
};

export type ResearchSourceAdmissionResult = {
  substantive_sources: RawSource[];
  discovery_candidates: RawSource[];
  decisions: ResearchSourceUseDecision[];
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

function asSafety(metadata: Record<string, unknown>): OfficialSourceSafety | null {
  const raw = metadata.official_verification ?? metadata.safety;
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
  canonicalDocumentKey: string | null,
  status: ResearchSourceAdmissionStatus,
  reason: ResearchSourceAdmissionReason,
): ResearchSourceUseDecision {
  const allowed = status === "substantive_admitted";
  return {
    admission_version: "08E-v1",
    source_id: source.source_id,
    canonical_document_key: canonicalDocumentKey,
    status,
    reason,
    substantive_use_allowed: allowed,
    source_use_eligible: allowed,
    downstream_use_in_generation_authoritative: true,
  };
}

function cloneSource(source: RawSource): RawSource {
  return { ...source, metadata: { ...(source.metadata ?? {}) } };
}

/**
 * Prompt 08E: offline bridge from an 08D retrieval candidate into the existing
 * canonical/official-source admission path. Retrieval approval is necessary
 * but never sufficient for substantive use. Downstream `use_in_generation`
 * remains authoritative after ranking/trust validation.
 */
export function admitResearchRetrievalCandidates(
  localSources: RawSource[],
  retrievalCandidates: RawSource[],
): ResearchSourceAdmissionResult {
  const local = localSources.map(cloneSource);
  const localKeys = new Set(local.map(canonicalKey).filter((key): key is string => Boolean(key)));
  const decisions: ResearchSourceUseDecision[] = [];
  const discoveryCandidates: RawSource[] = [];
  const admissibleOfficial: OfficialSourceResult[] = [];

  for (const raw of retrievalCandidates) {
    const source = cloneSource(raw);
    const key = canonicalKey(source);

    if (source.metadata.retrieval_candidate_only !== true) {
      decisions.push(decision(source, key, "blocked", "retrieval_candidate_marker_missing"));
      discoveryCandidates.push(source);
      continue;
    }
    if (source.metadata.research_transport_status !== "approved_retrieval") {
      decisions.push(decision(source, key, "blocked", "transport_not_approved"));
      discoveryCandidates.push(source);
      continue;
    }
    if (!isSubstantiveLegalBucketType(source.source_type)) {
      decisions.push(decision(source, key, "blocked", "unsupported_source_family"));
      discoveryCandidates.push(source);
      continue;
    }
    if (!key || source.source_table !== "external_official_source" || !source.official_url) {
      decisions.push(decision(source, key, "discovery_only", "canonical_identity_missing"));
      discoveryCandidates.push(source);
      continue;
    }

    const safety = asSafety(source.metadata);
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
        official_verification: safety,
        source_use_admission_version: "08E-v1",
        retrieval_candidate_only: true,
      },
    };

    if (failure || familyMetadata.substantive_use_allowed !== true) {
      normalized.metadata.substantive_use_allowed = false;
      normalized.metadata.source_use_admission_status = "discovery_only";
      normalized.metadata.source_use_admission_reason = failure ?? "substantive_use_not_allowed";
      decisions.push(decision(normalized, key, "discovery_only", failure ?? "substantive_use_not_allowed"));
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
    decisions.push(decision(
      normalized,
      key,
      localKeys.has(key) ? "linked_to_canonical" : "substantive_admitted",
      localKeys.has(key) ? "linked_to_existing_canonical" : "fully_verified_official_source",
    ));
  }

  const merged = mergeOfficialWithLocalSources(local, admissibleOfficial);
  return {
    substantive_sources: merged.sources,
    discovery_candidates: discoveryCandidates,
    decisions,
  };
}
