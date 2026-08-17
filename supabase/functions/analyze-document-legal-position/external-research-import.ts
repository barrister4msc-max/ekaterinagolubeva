import type { Bucket, RawSource } from "./repositories.ts";

export type ExternalResearchProviderId = "strizh" | "garant" | "consultant" | "other";

export type ExternalResearchCandidate = {
  title?: string | null;
  url?: string | null;
  citation?: string | null;
  excerpt?: string | null;
  source_type?: string | null;
  bucket?: Bucket | null;
  code?: string | null;
  article?: string | null;
  part?: string | null;
  case_number?: string | null;
  document_number?: string | null;
  document_date?: string | null;
  research_issue_ids?: string[];
};

export type ExternalResearchImportInput = {
  provider: ExternalResearchProviderId;
  answer_text?: string | null;
  links?: string[];
  candidates?: ExternalResearchCandidate[];
  research_issue_ids?: string[];
};

export type ExternalResearchImportDiagnostics = {
  provider_id: ExternalResearchProviderId;
  integration_mode: "manual_import";
  candidates_received: number;
  candidates_normalized: number;
  duplicates_removed: number;
  narrative_received: boolean;
  warnings: string[];
};

export type ExternalResearchImportResult = {
  sources: RawSource[];
  diagnostics: ExternalResearchImportDiagnostics;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniq(values: unknown[]): string[] {
  return [...new Set(values.map(text).filter((value): value is string => !!value))];
}

function normalizeUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function inferBucket(candidate: ExternalResearchCandidate): Bucket {
  if (candidate.bucket) return candidate.bucket;
  const haystack = [candidate.source_type, candidate.title, candidate.citation, candidate.url]
    .map((value) => text(value)?.toLowerCase() ?? "")
    .join(" ");

  if (/фнс|nalog\.gov|налогов.*орган|письмо\s+фнс/u.test(haystack)) return "fns_letters";
  if (/минфин|minfin\.gov|письмо\s+минфин/u.test(haystack)) return "minfin_letters";
  if (/суд|дел[оа]\s*[№n]|kad\.arbitr|sudact|vsrf|supcourt/u.test(haystack)) return "court_practice";
  if (/кодекс|федеральн.*закон|\bфз\b|publication\.pravo|pravo\.gov/u.test(haystack)) return "laws";
  return "manuals";
}

function inferSourceType(candidate: ExternalResearchCandidate, bucket: Bucket): string {
  const explicit = text(candidate.source_type);
  if (explicit) return explicit;
  if (bucket === "laws") return "law_external_reference";
  if (bucket === "court_practice") return "court_external_reference";
  if (bucket === "fns_letters") return "fns_external_reference";
  if (bucket === "minfin_letters") return "minfin_external_reference";
  return "external_research_reference";
}

function hash32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sourceIdentity(candidate: ExternalResearchCandidate): string {
  const normalizedUrl = normalizeUrl(candidate.url);
  const key = normalizedUrl ?? text(candidate.citation) ?? text(candidate.title) ?? JSON.stringify(candidate);
  return `external-import-${hash32(key)}`;
}

function normalizedCandidate(
  provider: ExternalResearchProviderId,
  candidate: ExternalResearchCandidate,
  inheritedIssueIds: string[],
): RawSource | null {
  const url = normalizeUrl(candidate.url);
  const citation = text(candidate.citation);
  const title = text(candidate.title) ?? citation ?? url;

  // A manual research answer is not a legal source by itself. We only admit
  // explicit document/link candidates. Narrative-only imports stay outside
  // the RawSource pool.
  if (!title || (!url && !citation && !text(candidate.document_number) && !text(candidate.case_number))) {
    return null;
  }

  const bucket = inferBucket(candidate);
  const issueIds = uniq([...(candidate.research_issue_ids ?? []), ...inheritedIssueIds]);
  const excerpt = text(candidate.excerpt);

  return {
    bucket,
    source_table: "external_legal_research_import",
    source_id: sourceIdentity(candidate),
    source_type: inferSourceType(candidate, bucket),
    title,
    official_url: url,
    citation,
    snippet: excerpt?.slice(0, 1800) ?? "",
    metadata: {
      provider_id: provider,
      provider_type: "research",
      provider_integration_mode: "manual_import",
      provider_source_class: "retrieval_intermediary",
      external_research_import: true,
      imported_reference_only: true,
      research_issue_ids: issueIds,
      // Manual import never self-certifies legal authority, official origin,
      // document identity, actuality or content. Existing source bridge / safety
      // contracts may upgrade these fields only after canonical verification.
      official_origin_verified: false,
      document_identity_verified: false,
      content_verified: false,
      verification_level: "unverified",
      verification_status: "needs_check",
      actuality_status: "requires_actuality_check",
      substantive_use_allowed: false,
      document_number: text(candidate.document_number),
      document_date: text(candidate.document_date),
      source_url: url,
    },
    code: text(candidate.code),
    article: text(candidate.article),
    part: text(candidate.part),
    case_number: text(candidate.case_number),
    letter_number: bucket === "fns_letters" || bucket === "minfin_letters"
      ? text(candidate.document_number)
      : null,
    letter_date: bucket === "fns_letters" || bucket === "minfin_letters"
      ? text(candidate.document_date)
      : null,
  };
}

function linkCandidate(url: string): ExternalResearchCandidate {
  return { url, title: url };
}

/**
 * Normalize user-assisted legal research into retrieval candidates only.
 *
 * Safety invariants:
 * - provider narrative is never turned into facts, conclusions or RawSource;
 * - a link/citation is reference-only until canonical/official verification;
 * - manual import cannot self-assign authority/is_official/current_status;
 * - duplicates are removed before entering ranking/dedupe;
 * - issue provenance is preserved for downstream GAP/coverage handling.
 */
export function normalizeExternalResearchImport(
  input: ExternalResearchImportInput,
): ExternalResearchImportResult {
  const inheritedIssueIds = uniq(input.research_issue_ids ?? []);
  const received = [
    ...(input.candidates ?? []),
    ...(input.links ?? []).map(linkCandidate),
  ];
  const normalized = received
    .map((candidate) => normalizedCandidate(input.provider, candidate, inheritedIssueIds))
    .filter((source): source is RawSource => !!source);

  const byIdentity = new Map<string, RawSource>();
  for (const source of normalized) {
    const existing = byIdentity.get(source.source_id);
    if (!existing) {
      byIdentity.set(source.source_id, source);
      continue;
    }
    const mergedIssues = uniq([
      ...((existing.metadata.research_issue_ids as string[] | undefined) ?? []),
      ...((source.metadata.research_issue_ids as string[] | undefined) ?? []),
    ]);
    existing.metadata.research_issue_ids = mergedIssues;
    if (!existing.snippet && source.snippet) existing.snippet = source.snippet;
  }

  const sources = [...byIdentity.values()];
  const warnings: string[] = [];
  if (text(input.answer_text) && sources.length === 0) {
    warnings.push("narrative_not_imported_without_explicit_source_candidates");
  }
  if (normalized.length < received.length) {
    warnings.push("invalid_or_unidentifiable_candidates_skipped");
  }

  return {
    sources,
    diagnostics: {
      provider_id: input.provider,
      integration_mode: "manual_import",
      candidates_received: received.length,
      candidates_normalized: sources.length,
      duplicates_removed: normalized.length - sources.length,
      narrative_received: !!text(input.answer_text),
      warnings,
    },
  };
}
