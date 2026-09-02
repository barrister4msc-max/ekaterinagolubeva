import { normalizeTemporalDate } from "./temporal-date.ts";

/**
 * Legal Source Authority Contract — Пленум ВС РФ.
 *
 * This is an additive metadata/resolver layer on the existing source layer.
 * It classifies Plenum resolutions of the Supreme Court of the Russian
 * Federation as a distinct *judicial guidance* source: never ordinary
 * lower-court practice, never a statute, never evidence of fact.
 *
 * Authoritative temporal rule carried here as data, not as reasoning:
 * Federal Constitutional Law No. 3-FKZ of 2026-08-04 (officially published
 * 2026-08-04) makes the Supreme Court's explanations guiding from 2026-09-04.
 */

export const PLENUM_VS_RF_SOURCE_TYPE = "vsrf_plenum_resolution";

/** Guiding force starts on this date under FCL No. 3-FKZ of 2026-08-04. */
export const PLENUM_GUIDING_FORCE_FROM = "2026-09-04";

export const PLENUM_GUIDING_BASIS = {
  act: "Федеральный конституционный закон № 3-ФКЗ",
  act_date: "2026-08-04",
  official_publication_date: "2026-08-04",
  guiding_from: PLENUM_GUIDING_FORCE_FROM,
} as const;

export type PlenumGuidingStatus =
  | "pre_effective"
  | "guiding_in_force"
  | "not_applicable"
  | "superseded";

export type PlenumConflictSignal = {
  readonly kind: "later_legislation" | "constitutional_court_ruling" | "newer_plenum_clarification";
  readonly reference: string | null;
  readonly date: string | null;
};

export type PlenumAuthorityAssessment = {
  readonly is_plenum_vs_rf: boolean;
  readonly guiding_status: PlenumGuidingStatus;
  readonly guiding_status_reason: string;
  readonly citation_complete: boolean;
  readonly missing_metadata: readonly string[];
  readonly conflict_signals: readonly PlenumConflictSignal[];
  /** Fail-closed: substantive/material use is allowed only for verified, in-force, fully cited guidance. */
  readonly substantive_use_allowed: boolean;
  /** Guidance never proves a fact and never is a norm on its own. */
  readonly can_establish_norm: false;
  readonly can_prove_fact: false;
  readonly can_alone_support_conclusion: false;
};

const PLENUM_TYPE_ALIASES = new Set([
  PLENUM_VS_RF_SOURCE_TYPE,
  "vs_plenum_resolution",
  "plenum_vs_rf",
  "vsrf_plenum",
]);

const PLENUM_TITLE_RE =
  /постановлен\w*\s+пленума\s+(?:верховного\s+суда|вс)\s*(?:российской\s+федерации|рф)?/iu;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Detection is metadata/citation driven. Retrieval provenance (which provider
 * returned the document) never becomes legal authority on its own.
 */
export function isPlenumVsRfSource(
  sourceType: unknown,
  metadata: Record<string, unknown> = {},
  title: unknown = null,
): boolean {
  const normalized = (text(sourceType) ?? "").toLowerCase();
  if (PLENUM_TYPE_ALIASES.has(normalized)) return true;
  if (text(metadata.plenum_vs_rf) || bool(metadata.is_plenum_vs_rf)) return true;
  const actType = (text(metadata.act_type) ?? "").toLowerCase();
  const court = (text(metadata.court) ?? text(metadata.authority_name) ?? "").toLowerCase();
  if (actType.includes("пленум") && court.includes("верховн")) return true;
  const candidateTitle = text(title) ?? text(metadata.title) ?? text(metadata.citation) ?? "";
  return PLENUM_TITLE_RE.test(candidateTitle);
}

/** Exact citation metadata required before any material (substantive) use. */
const REQUIRED_CITATION_FIELDS: ReadonlyArray<{ key: string; read: (m: Record<string, unknown>) => string | null }> = [
  { key: "court", read: (m) => text(m.court) ?? text(m.authority_name) },
  { key: "act_type", read: (m) => text(m.act_type) },
  { key: "act_date", read: (m) => normalizeTemporalDate(text(m.act_date) ?? text(m.document_date) ?? text(m.publication_date)) },
  { key: "act_number", read: (m) => text(m.act_number) ?? text(m.document_number) },
  { key: "point", read: (m) => text(m.point) ?? text(m.paragraph) ?? text(m.item) },
  { key: "official_source", read: (m) => text(m.official_publication_url) ?? text(m.official_url) ?? text(m.official_source) },
  { key: "effective_date", read: (m) => normalizeTemporalDate(text(m.effective_from) ?? text(m.effective_date)) },
  { key: "checked_date", read: (m) => normalizeTemporalDate(text(m.last_checked_at) ?? text(m.checked_at)) },
];

function collectMissingMetadata(metadata: Record<string, unknown>): string[] {
  return REQUIRED_CITATION_FIELDS.filter((field) => !field.read(metadata)).map((field) => field.key);
}

function collectConflictSignals(metadata: Record<string, unknown>): PlenumConflictSignal[] {
  const signals: PlenumConflictSignal[] = [];
  const push = (kind: PlenumConflictSignal["kind"], raw: unknown) => {
    const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const entry of entries) {
      const item = typeof entry === "string" ? { reference: entry } : record(entry);
      signals.push({
        kind,
        reference: text(item.reference) ?? text(item.citation) ?? text(item.id),
        date: normalizeTemporalDate(text(item.date) ?? text(item.act_date)),
      });
    }
  };
  push("later_legislation", metadata.superseded_by_legislation ?? metadata.later_legislation);
  push("constitutional_court_ruling", metadata.constitutional_court_ruling ?? metadata.ksrf_ruling);
  push("newer_plenum_clarification", metadata.superseded_by_plenum ?? metadata.newer_plenum_clarification);
  return signals;
}

function hasVerifiedOfficialSafety(metadata: Record<string, unknown>): boolean {
  const safety = record(metadata.official_verification);
  const actuality = text(safety.actuality_status) ?? "";
  return bool(safety.official_origin_verified) &&
    bool(safety.document_identity_verified) &&
    bool(safety.content_verified) &&
    (actuality === "verified" || actuality === "not_applicable") &&
    bool(safety.substantive_use_allowed);
}

function subjectApplicabilityContradicted(metadata: Record<string, unknown>): boolean {
  const applicability = record(metadata.applicability);
  const verdicts = [
    text(metadata.subject_applicability) ?? text(applicability.subject),
    text(metadata.process_applicability) ?? text(applicability.process),
    text(metadata.time_applicability) ?? text(applicability.time),
  ];
  return verdicts.some((value) => value === "contradicted" || value === "not_applicable");
}

/**
 * Resolver. Purely metadata based, fail-closed, never invents values:
 * anything that is missing is reported through `missing_metadata`.
 */
export function assessPlenumAuthority(
  sourceType: unknown,
  metadata: Record<string, unknown> = {},
  title: unknown = null,
): PlenumAuthorityAssessment {
  const base = {
    can_establish_norm: false,
    can_prove_fact: false,
    can_alone_support_conclusion: false,
  } as const;

  if (!isPlenumVsRfSource(sourceType, metadata, title)) {
    return {
      is_plenum_vs_rf: false,
      guiding_status: "not_applicable",
      guiding_status_reason: "Source is not a Plenum resolution of the Supreme Court of the Russian Federation.",
      citation_complete: false,
      missing_metadata: [],
      conflict_signals: [],
      substantive_use_allowed: false,
      ...base,
    };
  }

  const missing_metadata = collectMissingMetadata(metadata);
  const citation_complete = missing_metadata.length === 0;
  const conflict_signals = collectConflictSignals(metadata);
  const authentic = hasVerifiedOfficialSafety(metadata);
  const actDate = normalizeTemporalDate(
    text(metadata.act_date) ?? text(metadata.document_date) ?? text(metadata.publication_date),
  );

  let guiding_status: PlenumGuidingStatus;
  let guiding_status_reason: string;

  if (conflict_signals.length > 0) {
    guiding_status = "superseded";
    guiding_status_reason =
      "Later legislation, a Constitutional Court ruling, or a newer Plenum clarification is recorded as a supersession/conflict signal.";
  } else if (subjectApplicabilityContradicted(metadata)) {
    guiding_status = "not_applicable";
    guiding_status_reason = "Subject/process/time applicability metadata contradicts use of this guidance.";
  } else if (!actDate) {
    guiding_status = "not_applicable";
    guiding_status_reason = "Resolution date is missing, so guiding force cannot be established.";
  } else if (actDate < PLENUM_GUIDING_FORCE_FROM) {
    guiding_status = "pre_effective";
    guiding_status_reason =
      `Resolution predates ${PLENUM_GUIDING_FORCE_FROM}, the date from which explanations of the Supreme Court became guiding under ${PLENUM_GUIDING_BASIS.act} of ${PLENUM_GUIDING_BASIS.act_date}.`;
  } else if (!authentic) {
    guiding_status = "not_applicable";
    guiding_status_reason = "Authenticity of the Plenum resolution is not verified by the Official Source Safety Contract.";
  } else if (!citation_complete) {
    guiding_status = "not_applicable";
    guiding_status_reason = `Exact citation metadata is incomplete: ${missing_metadata.join(", ")}.`;
  } else {
    guiding_status = "guiding_in_force";
    guiding_status_reason =
      `Authentic Plenum resolution dated on/after ${PLENUM_GUIDING_FORCE_FROM} with exact resolution and point supplied and no contradicting applicability metadata.`;
  }

  return {
    is_plenum_vs_rf: true,
    guiding_status,
    guiding_status_reason,
    citation_complete,
    missing_metadata,
    conflict_signals,
    substantive_use_allowed: guiding_status === "guiding_in_force" && authentic && citation_complete,
    ...base,
  };
}

/**
 * Additive metadata projection merged into the existing source metadata.
 * Retrieval/temporal/provenance metadata already present is preserved.
 */
export function plenumAuthorityMetadata(
  sourceType: unknown,
  metadata: Record<string, unknown> = {},
  title: unknown = null,
): Record<string, unknown> {
  const assessment = assessPlenumAuthority(sourceType, metadata, title);
  if (!assessment.is_plenum_vs_rf) return {};
  return {
    source_family: "judicial_guidance",
    legal_authority_class: "judicial_guidance_plenum_vs_rf",
    guiding_status: assessment.guiding_status,
    guiding_status_reason: assessment.guiding_status_reason,
    guiding_force_from: PLENUM_GUIDING_FORCE_FROM,
    guiding_basis: PLENUM_GUIDING_BASIS,
    plenum_citation_complete: assessment.citation_complete,
    plenum_missing_metadata: assessment.missing_metadata,
    plenum_conflict_signals: assessment.conflict_signals,
    can_establish_norm: false,
    can_prove_fact: false,
    can_alone_support_conclusion: false,
    substantive_use_allowed: assessment.substantive_use_allowed,
  };
}
