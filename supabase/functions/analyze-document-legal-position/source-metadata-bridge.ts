import type { RawSource } from "./repositories.ts";

type SbClient = any;

type RegistryRow = {
  id: string;
  source_type: string;
  official_url: string | null;
  external_id: string | null;
  authority_name: string | null;
  authority_level: string;
  jurisdiction: string;
  practice_area: string | null;
  citation: string | null;
  document_number: string | null;
  publication_date: string | null;
  effective_from: string | null;
  effective_to: string | null;
  revision_date: string | null;
  is_official: boolean;
  is_active: boolean;
  current_status: string;
  verification_status: string;
  last_checked_at: string | null;
  retrieved_at: string | null;
  metadata: Record<string, unknown> | null;
};

const REGISTRY_FIELDS = [
  "id",
  "source_type",
  "official_url",
  "external_id",
  "authority_name",
  "authority_level",
  "jurisdiction",
  "practice_area",
  "citation",
  "document_number",
  "publication_date",
  "effective_from",
  "effective_to",
  "revision_date",
  "is_official",
  "is_active",
  "current_status",
  "verification_status",
  "last_checked_at",
  "retrieved_at",
  "metadata",
].join(",");

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function dateOnly(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const ru = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  return ru ? `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}` : null;
}

function normalizedNumber(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return raw
    .replace(/^[№N]\s*/iu, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizedArticle(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return raw
    .toLowerCase()
    .replace(/^(?:ст\.?|статья)\s*/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceDocumentNumber(source: RawSource): string | null {
  return normalizedNumber(
    source.metadata?.document_number ??
      source.metadata?.letter_number ??
      source.letter_number,
  );
}

function sourceDocumentDate(source: RawSource): string | null {
  return dateOnly(
    source.metadata?.document_date ??
      source.metadata?.letter_date ??
      source.metadata?.publication_date ??
      source.letter_date,
  );
}

function sourceArticle(source: RawSource): string | null {
  return normalizedArticle(source.article ?? source.metadata?.article);
}

function registryDocumentNumber(row: RegistryRow): string | null {
  return normalizedNumber(row.document_number ?? row.metadata?.document_number ?? row.metadata?.letter_number);
}

function registryDocumentDate(row: RegistryRow): string | null {
  return dateOnly(
    row.metadata?.document_date ??
      row.metadata?.letter_date ??
      row.publication_date,
  );
}

function registryArticle(row: RegistryRow): string | null {
  return normalizedArticle(row.metadata?.article);
}

function registrySourceGroupId(row: RegistryRow): string | null {
  return text(row.metadata?.source_group_id);
}

function isRegistrySourceHead(row: RegistryRow): boolean {
  return bool(row.metadata?.is_source_head) === true;
}

function registryCanonicalKey(row: RegistryRow): string | null {
  return text(row.metadata?.canonical_document_key);
}

function sourceCanonicalKey(source: RawSource): string | null {
  return text(source.metadata?.canonical_document_key);
}

function uniq(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function canonicalRowFor(row: RegistryRow, rows: RegistryRow[]): RegistryRow {
  if (isRegistrySourceHead(row)) return row;
  const groupId = registrySourceGroupId(row);
  if (!groupId) return row;
  return rows.find(
    (candidate) => registrySourceGroupId(candidate) === groupId && isRegistrySourceHead(candidate),
  ) ?? row;
}

function canonicalCandidates(rows: RegistryRow[]): RegistryRow[] {
  const byGroup = new Map<string, RegistryRow>();
  const ungrouped: RegistryRow[] = [];
  for (const row of rows) {
    const canonical = canonicalRowFor(row, rows);
    const groupId = registrySourceGroupId(canonical);
    if (groupId) {
      const existing = byGroup.get(groupId);
      if (!existing || (isRegistrySourceHead(canonical) && !isRegistrySourceHead(existing))) {
        byGroup.set(groupId, canonical);
      }
    } else {
      ungrouped.push(canonical);
    }
  }
  return [...new Map([...byGroup.values(), ...ungrouped].map((row) => [row.id, row])).values()];
}

async function rowsForIn(
  sb: SbClient,
  column: string,
  values: string[],
): Promise<RegistryRow[]> {
  if (!values.length) return [];
  try {
    const { data, error } = await sb
      .from("legal_source_registry")
      .select(REGISTRY_FIELDS)
      .eq("is_active", true)
      .in(column, values);
    if (error) {
      console.warn("source_metadata_bridge_registry_lookup_failed", { column, error: error.message });
      return [];
    }
    return (data ?? []) as RegistryRow[];
  } catch (error) {
    console.warn("source_metadata_bridge_registry_lookup_failed", {
      column,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export function chooseCanonicalRegistryMatch(
  source: RawSource,
  rows: RegistryRow[],
): { row: RegistryRow; method: string } | null {
  if (!rows.length) return null;
  const meta = source.metadata ?? {};
  const candidates = canonicalCandidates(rows);

  const explicitId = text(meta.legal_source_registry_id ?? meta.registry_source_id);
  if (explicitId) {
    const exact = rows.find((candidate) => candidate.id === explicitId);
    if (exact) {
      const row = canonicalRowFor(exact, rows);
      return { row, method: row.id === exact.id ? "registry_id" : "registry_id_source_head" };
    }
  }

  const canonical = sourceCanonicalKey(source);
  if (canonical) {
    const matches = candidates.filter((candidate) => registryCanonicalKey(candidate) === canonical);
    if (matches.length === 1) return { row: matches[0], method: "canonical_document_key" };
  }

  const officialUrl = text(source.official_url ?? meta.official_url ?? meta.source_url);
  if (officialUrl) {
    const matches = candidates.filter((candidate) => candidate.official_url === officialUrl);
    if (matches.length === 1) return { row: matches[0], method: "official_url_source_head" };
  }

  const externalId = text(meta.external_id ?? meta.eo_number);
  if (externalId) {
    const matches = candidates.filter((candidate) => candidate.external_id === externalId);
    if (matches.length === 1) return { row: matches[0], method: "external_id_source_head" };
  }

  const number = sourceDocumentNumber(source);
  const date = sourceDocumentDate(source);
  if (number && date) {
    let matches = candidates.filter(
      (candidate) =>
        registryDocumentNumber(candidate) === number && registryDocumentDate(candidate) === date,
    );
    const article = sourceArticle(source);
    if (matches.length > 1 && article) {
      matches = matches.filter((candidate) => registryArticle(candidate) === article);
    }
    if (matches.length === 1) return { row: matches[0], method: "document_number_date_source_head" };
  }

  return null;
}

export function projectRegistryMetadata(
  source: RawSource,
  row: RegistryRow,
  matchMethod: string,
): RawSource {
  const registryMeta = row.metadata ?? {};
  const canonicalDocumentKey =
    registryCanonicalKey(row) ?? sourceCanonicalKey(source) ?? null;
  const documentNumber = registryDocumentNumber(row) ?? sourceDocumentNumber(source);
  const documentDate = registryDocumentDate(row) ?? sourceDocumentDate(source);
  const publicationDate =
    dateOnly(row.publication_date) ??
    dateOnly(registryMeta.publication_date) ??
    dateOnly(source.metadata?.publication_date);
  const effectiveFrom =
    dateOnly(row.effective_from) ??
    dateOnly(registryMeta.effective_from) ??
    dateOnly(source.metadata?.effective_from);
  const effectiveTo =
    dateOnly(row.effective_to) ??
    dateOnly(registryMeta.effective_to) ??
    dateOnly(source.metadata?.effective_to);
  const revisionDate =
    dateOnly(row.revision_date) ??
    dateOnly(registryMeta.revision_date) ??
    dateOnly(registryMeta.edition_date) ??
    dateOnly(source.metadata?.revision_date) ??
    dateOnly(source.metadata?.edition_date);

  return {
    ...source,
    official_url: row.official_url ?? source.official_url,
    citation: row.citation ?? source.citation,
    metadata: {
      ...source.metadata,
      legal_source_registry_id: row.id,
      registry_source_group_id: registrySourceGroupId(row),
      registry_match_method: matchMethod,
      registry_match_attempted: true,
      authority_name: row.authority_name ?? text(registryMeta.authority) ?? source.metadata?.authority_name ?? null,
      authority_level: row.authority_level,
      jurisdiction: row.jurisdiction,
      practice_area: row.practice_area ?? source.metadata?.practice_area ?? null,
      document_number: documentNumber,
      document_date: documentDate,
      publication_date: publicationDate,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      revision_date: revisionDate,
      is_official: row.is_official,
      current_status: row.current_status,
      verification_status: row.verification_status,
      last_checked_at: row.last_checked_at,
      registry_retrieved_at: row.retrieved_at,
      canonical_document_key: canonicalDocumentKey,
      // Diagnostic legacy fields are transported, not interpreted as legal truth.
      registry_official_status: text(registryMeta.official_status),
      registry_trust_level: text(registryMeta.trust_level),
      registry_legacy_verification_status: text(registryMeta.verification_status),
      // Existing Safety Contract remains the only source of official-origin/content permission.
      registry_metadata: registryMeta,
    },
  };
}

export async function attachCanonicalRegistryMetadata(
  sb: SbClient,
  sources: RawSource[],
): Promise<RawSource[]> {
  if (!sources.length) return sources;

  const pending = sources.filter((source) => source.metadata?.registry_match_attempted !== true);
  if (!pending.length) return sources;

  const registryIds = uniq(
    pending.map((source) =>
      text(source.metadata?.legal_source_registry_id ?? source.metadata?.registry_source_id),
    ),
  );
  const officialUrls = uniq(
    pending.map((source) =>
      text(source.official_url ?? source.metadata?.official_url ?? source.metadata?.source_url),
    ),
  );
  const externalIds = uniq(
    pending.map((source) => text(source.metadata?.external_id ?? source.metadata?.eo_number)),
  );
  const documentNumbers = uniq(pending.map(sourceDocumentNumber));

  const batches = await Promise.all([
    rowsForIn(sb, "id", registryIds),
    rowsForIn(sb, "official_url", officialUrls),
    rowsForIn(sb, "external_id", externalIds),
    // Structured document_number is retained for forward compatibility once legacy data is normalized.
    rowsForIn(sb, "document_number", documentNumbers),
  ]);
  const rows = [...new Map(batches.flat().map((row) => [row.id, row])).values()];

  return sources.map((source) => {
    if (source.metadata?.registry_match_attempted === true) return source;
    const match = chooseCanonicalRegistryMatch(source, rows);
    if (match) return projectRegistryMetadata(source, match.row, match.method);
    return {
      ...source,
      metadata: { ...source.metadata, registry_match_attempted: true },
    };
  });
}

const TRUSTED_METADATA_KEYS = [
  "legal_source_registry_id",
  "registry_source_group_id",
  "registry_match_method",
  "authority_name",
  "authority_level",
  "jurisdiction",
  "practice_area",
  "document_number",
  "document_date",
  "publication_date",
  "effective_from",
  "effective_to",
  "revision_date",
  "is_official",
  "current_status",
  "verification_status",
  "last_checked_at",
  "registry_retrieved_at",
  "canonical_document_key",
  "registry_official_status",
  "registry_trust_level",
  "registry_legacy_verification_status",
  "provider_id",
  "provider_type",
  "provider_integration_mode",
  "provider_source_class",
  "provider",
  "official_provider",
  "official_retrieved_at",
  "official_publication_url",
  "official_verification",
  "official_origin_verified",
  "document_identity_verified",
  "content_verified",
  "actuality_status",
  "substantive_use_allowed",
  "legal_authority_class",
  "guiding_status",
  "guiding_status_reason",
  "guiding_force_from",
  "guiding_basis",
  "plenum_citation_complete",
  "plenum_missing_metadata",
  "plenum_conflict_signals",
  "can_establish_norm",
  "can_prove_fact",
  "can_alone_support_conclusion",
  "verification_level",
  "retrieval_method",
  "transport",
  "research_issue_ids",
  "research_issue_texts",
  "research_modes",
] as const;

/**
 * Additive runtime projection. Existing source_ref/trust/priority semantics stay intact.
 * Canonical registry verification_status wins when present; otherwise legacy value remains.
 *
 * Provider Safety Contract is fail-closed only when the provider explicitly emits
 * substantive_use_allowed=false. Legacy sources that do not carry this field retain
 * their pre-existing behavior. This lets retrieval intermediaries (for example Law7)
 * participate in research/ranking while preventing them from being promoted into
 * generation merely because they belong to the `laws` bucket.
 */
export function carryCanonicalMetadataToTrusted(
  trustedSources: Array<Record<string, any>>,
  mergedSources: Array<{ source_id: string; metadata?: Record<string, unknown> }>,
): void {
  const byId = new Map(mergedSources.map((source) => [source.source_id, source.metadata ?? {}]));
  for (const trusted of trustedSources) {
    const meta = byId.get(String(trusted.source_id));
    if (!meta) continue;
    for (const key of TRUSTED_METADATA_KEYS) {
      const value = meta[key];
      if (value !== undefined && value !== null) trusted[key] = value;
    }
    const registryVerification = text(meta.verification_status);
    if (registryVerification) trusted.verification_status = registryVerification;

    if (bool(meta.substantive_use_allowed) === false) {
      trusted.use_in_generation = false;
      const reason = text(trusted.trust_reason);
      const safetyReason = "Provider Safety Contract: substantive_use_allowed=false";
      trusted.trust_reason = reason ? `${reason}; ${safetyReason}` : safetyReason;
    }
  }
}
