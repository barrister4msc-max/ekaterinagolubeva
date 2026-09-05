import type { Bucket, RawSource } from "./repositories.ts";

export type ExternalResearchProviderId = "bras_kad" | "vsrf" | "strizh" | "garant" | "consultant" | "other";

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
  court_document_kind?: "case_card" | "court_act" | "review" | "plenum" | "individual_act" | null;
  court_instance?: "first_instance" | "appeal" | "cassation" | "supervisory" | "unknown" | null;
  text_status?: "complete" | "redacted" | "incomplete" | "missing" | null;
  adverse?: boolean;
  later_act?: boolean;
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

export type ExternalResearchBatchDiagnostics = {
  imports_received: number;
  candidates_normalized: number;
  duplicates_removed: number;
  providers: ExternalResearchProviderId[];
  warnings: string[];
};

export type ExternalResearchImportResult = {
  sources: RawSource[];
  diagnostics: ExternalResearchImportDiagnostics;
};

export type ExternalResearchBatchResult = {
  sources: RawSource[];
  imports: ExternalResearchImportResult[];
  diagnostics: ExternalResearchBatchDiagnostics;
};

export type ExternalResearchLinkResult = {
  sources: RawSource[];
  linked: number;
  unresolved: number;
  unresolved_source_ids: string[];
};

export type ExternalResearchRunSnapshot = {
  imports_received: number;
  candidates_normalized: number;
  duplicates_removed: number;
  linked: number;
  unresolved: number;
  providers: ExternalResearchProviderId[];
  warnings: string[];
  references: Array<{
    source_id: string;
    provider_ids: string[];
    bucket: Bucket;
    citation: string | null;
    imported_url: string | null;
    document_number: string | null;
    document_date: string | null;
    research_issue_ids: string[];
    linked: boolean;
  }>;
};

const PROVIDERS = new Set<ExternalResearchProviderId>(["bras_kad", "vsrf", "strizh", "garant", "consultant", "other"]);
const MAX_IMPORTS = 20;
const MAX_LINKS_PER_IMPORT = 50;
const MAX_CANDIDATES_PER_IMPORT = 50;
const MAX_ISSUE_IDS_PER_IMPORT = 12;
const MAX_SNAPSHOT_REFERENCES = 100;

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

function isBrasKadUrl(value: unknown): boolean {
  const url = normalizeUrl(value);
  if (!url) return false;
  const hostname = new URL(url).hostname.toLowerCase();
  return hostname === "kad.arbitr.ru" || hostname.endsWith(".kad.arbitr.ru") ||
    hostname === "ras.arbitr.ru" || hostname.endsWith(".ras.arbitr.ru");
}
function isVsrfUrl(value: unknown): boolean {
  const url = normalizeUrl(value);
  if (!url) return false;
  const hostname = new URL(url).hostname.toLowerCase();
  return hostname === "vsrf.ru" || hostname === "www.vsrf.ru" ||
    hostname === "supcourt.ru" || hostname === "www.supcourt.ru";
}

function isArbitrationCaseNumber(value: unknown): boolean {
  const raw = text(value)?.replace(/\s+/g, "").toUpperCase();
  return !!raw && /^А\d+-\d+\/\d{4}$/.test(raw);
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
  const importedUrl = normalizeUrl(candidate.url);
  const citation = text(candidate.citation);
  const title = text(candidate.title) ?? citation ?? importedUrl;

  // A provider answer/narrative is not legal authority. Admit only explicit
  // document/link candidates as discovery references.
  if (!title || (!importedUrl && !citation && !text(candidate.document_number) && !text(candidate.case_number))) {
    return null;
  }

  // BRAS/KAD is a manual discovery channel only. An arbitrary URL must not
  // acquire this official-source label; accept the official host or a
  // syntactically identifiable arbitration case number, never a narrative.
  if (
    provider === "bras_kad" &&
    ((candidate.url && !isBrasKadUrl(candidate.url)) ||
      (!candidate.url && !isArbitrationCaseNumber(candidate.case_number)))
  ) {
    return null;
  }

  if (
    provider === "vsrf" &&
    (!candidate.url || !isVsrfUrl(candidate.url) ||
      !candidate.court_document_kind || !candidate.text_status)
  ) {
    return null;
  }

  const bucket = provider === "bras_kad" || provider === "vsrf" ? "court_practice" : inferBucket(candidate);
  const issueIds = uniq([...(candidate.research_issue_ids ?? []), ...inheritedIssueIds]);
  const excerpt = text(candidate.excerpt);

  return {
    bucket,
    source_table: "external_legal_research_import",
    source_id: sourceIdentity(candidate),
    source_type: inferSourceType(candidate, bucket),
    title,
    // Imported URLs are references, not verified official URLs.
    official_url: null,
    citation,
    snippet: excerpt?.slice(0, 1800) ?? "",
    metadata: {
      provider_id: provider,
      discovered_via_providers: [provider],
      provider_type: "research",
      provider_integration_mode: "manual_import",
      provider_source_class: "retrieval_intermediary",
      source_family: provider === "bras_kad" ? "bras_kad" : provider === "vsrf" ? "vsrf" : undefined,
      court_document_kind: candidate.court_document_kind ?? null,
      court_instance: candidate.court_instance ?? null,
      text_status: candidate.text_status ?? null,
      adverse: candidate.adverse === true,
      later_act: candidate.later_act === true,
      external_research_import: true,
      imported_reference_only: true,
      imported_url: importedUrl,
      research_issue_ids: issueIds,
      // Manual import never self-certifies legal authority, official origin,
      // document identity, actuality or content.
      official_origin_verified: false,
      document_identity_verified: false,
      content_verified: false,
      verification_level: "unverified",
      verification_status: "needs_check",
      actuality_status: "requires_actuality_check",
      substantive_use_allowed: false,
      document_number: text(candidate.document_number),
      document_date: text(candidate.document_date),
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

function provider(value: unknown): ExternalResearchProviderId | null {
  const normalized = text(value)?.toLowerCase() as ExternalResearchProviderId | undefined;
  return normalized && PROVIDERS.has(normalized) ? normalized : null;
}

/** Parse session/request staging data without accepting arbitrary provider identities. */
export function parseExternalResearchImportInputs(value: unknown): ExternalResearchImportInput[] {
  const values = (Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [])
    .slice(0, MAX_IMPORTS);
  const out: ExternalResearchImportInput[] = [];
  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const p = provider(raw.provider);
    if (!p) continue;
    out.push({
      provider: p,
      answer_text: text(raw.answer_text),
      links: Array.isArray(raw.links)
        ? raw.links.filter((v): v is string => typeof v === "string").slice(0, MAX_LINKS_PER_IMPORT)
        : [],
      candidates: Array.isArray(raw.candidates)
        ? raw.candidates
          .filter((v): v is ExternalResearchCandidate => !!v && typeof v === "object")
          .slice(0, MAX_CANDIDATES_PER_IMPORT)
        : [],
      research_issue_ids: Array.isArray(raw.research_issue_ids)
        ? raw.research_issue_ids
          .filter((v): v is string => typeof v === "string")
          .slice(0, MAX_ISSUE_IDS_PER_IMPORT)
        : [],
    });
  }
  return out;
}

/**
 * Normalize user-assisted legal research into discovery candidates only.
 * Provider narrative is never converted to a fact, conclusion or source.
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
    existing.metadata.research_issue_ids = uniq([
      ...((existing.metadata.research_issue_ids as string[] | undefined) ?? []),
      ...((source.metadata.research_issue_ids as string[] | undefined) ?? []),
    ]);
    existing.metadata.discovered_via_providers = uniq([
      ...((existing.metadata.discovered_via_providers as string[] | undefined) ?? []),
      ...((source.metadata.discovered_via_providers as string[] | undefined) ?? []),
    ]);
    if (!existing.snippet && source.snippet) existing.snippet = source.snippet;
  }

  const sources = [...byIdentity.values()];
  const warnings: string[] = [];
  if (text(input.answer_text)) {
    warnings.push("external_research_narrative_not_imported_as_source");
    if (sources.length === 0) warnings.push("narrative_not_imported_without_explicit_source_candidates");
  }
  if (normalized.length < received.length) warnings.push("invalid_or_unidentifiable_candidates_skipped");

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

export function normalizeExternalResearchImports(
  inputs: ExternalResearchImportInput[],
): ExternalResearchBatchResult {
  const imports = inputs.map(normalizeExternalResearchImport);
  const byIdentity = new Map<string, RawSource>();
  let duplicatesRemoved = imports.reduce((sum, item) => sum + item.diagnostics.duplicates_removed, 0);

  for (const item of imports) {
    for (const source of item.sources) {
      const existing = byIdentity.get(source.source_id);
      if (!existing) {
        byIdentity.set(source.source_id, source);
        continue;
      }
      duplicatesRemoved += 1;
      existing.metadata.research_issue_ids = uniq([
        ...((existing.metadata.research_issue_ids as string[] | undefined) ?? []),
        ...((source.metadata.research_issue_ids as string[] | undefined) ?? []),
      ]);
      existing.metadata.discovered_via_providers = uniq([
        ...((existing.metadata.discovered_via_providers as string[] | undefined) ?? []),
        ...((source.metadata.discovered_via_providers as string[] | undefined) ?? []),
      ]);
    }
  }

  return {
    sources: [...byIdentity.values()],
    imports,
    diagnostics: {
      imports_received: inputs.length,
      candidates_normalized: byIdentity.size,
      duplicates_removed: duplicatesRemoved,
      providers: [...new Set(inputs.map((input) => input.provider))],
      warnings: uniq(imports.flatMap((item) => item.diagnostics.warnings)),
    },
  };
}

function canonicalIdentity(source: RawSource): string | null {
  const registryId = text(source.metadata?.legal_source_registry_id);
  if (registryId) return `registry:${registryId}`;
  const canonicalKey = text(source.metadata?.canonical_document_key);
  if (canonicalKey) return `canonical:${canonicalKey}`;
  return null;
}

/**
 * Discovery-only admission gate.
 *
 * Imported candidates NEVER enter the substantive source pool by themselves.
 * They may only transfer issue provenance/discovery audit metadata to an
 * already-existing local/canonical source with the same canonical identity.
 */
export function linkExternalResearchToLocalSources(
  localSources: RawSource[],
  importedSources: RawSource[],
): ExternalResearchLinkResult {
  const byCanonical = new Map<string, RawSource>();
  for (const local of localSources) {
    const identity = canonicalIdentity(local);
    if (identity) byCanonical.set(identity, local);
  }

  let linked = 0;
  const unresolved: string[] = [];

  for (const imported of importedSources) {
    const identity = canonicalIdentity(imported);
    const local = identity ? byCanonical.get(identity) : undefined;
    if (!local) {
      unresolved.push(imported.source_id);
      continue;
    }

    linked += 1;
    local.metadata = {
      ...(local.metadata ?? {}),
      research_issue_ids: uniq([
        ...((local.metadata?.research_issue_ids as string[] | undefined) ?? []),
        ...((imported.metadata?.research_issue_ids as string[] | undefined) ?? []),
      ]),
      external_research_discovery: [
        ...((Array.isArray(local.metadata?.external_research_discovery)
          ? local.metadata?.external_research_discovery
          : []) as unknown[]),
        {
          import_source_id: imported.source_id,
          provider_ids: uniq([
            ...((imported.metadata?.discovered_via_providers as string[] | undefined) ?? []),
            imported.metadata?.provider_id,
          ]),
          imported_url: imported.metadata?.imported_url ?? null,
          citation: imported.citation,
        },
      ],
    };
  }

  return {
    sources: localSources,
    linked,
    unresolved: unresolved.length,
    unresolved_source_ids: unresolved,
  };
}

/**
 * Immutable per-run audit snapshot. It intentionally excludes provider
 * narrative and excerpts; only reference metadata needed to reproduce the
 * retrieval admission decision is persisted.
 */
export function buildExternalResearchRunSnapshot(
  batch: ExternalResearchBatchResult,
  link: ExternalResearchLinkResult,
): ExternalResearchRunSnapshot {
  const unresolved = new Set(link.unresolved_source_ids);
  return {
    imports_received: batch.diagnostics.imports_received,
    candidates_normalized: batch.diagnostics.candidates_normalized,
    duplicates_removed: batch.diagnostics.duplicates_removed,
    linked: link.linked,
    unresolved: link.unresolved,
    providers: batch.diagnostics.providers,
    warnings: batch.diagnostics.warnings,
    references: batch.sources.slice(0, MAX_SNAPSHOT_REFERENCES).map((source) => ({
      source_id: source.source_id,
      provider_ids: uniq([
        ...((source.metadata?.discovered_via_providers as string[] | undefined) ?? []),
        source.metadata?.provider_id,
      ]),
      bucket: source.bucket,
      citation: source.citation,
      imported_url: text(source.metadata?.imported_url),
      document_number: text(source.metadata?.document_number),
      document_date: text(source.metadata?.document_date),
      research_issue_ids: uniq((source.metadata?.research_issue_ids as unknown[] | undefined) ?? []),
      linked: !unresolved.has(source.source_id),
    })),
  };
}
