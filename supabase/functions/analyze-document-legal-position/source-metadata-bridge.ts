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

function dateOnly(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const ru = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  return ru ? `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}` : null;
}

function sourceDocumentNumber(source: RawSource): string | null {
  return text(
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

function registryDocumentDate(row: RegistryRow): string | null {
  return dateOnly(
    row.metadata?.document_date ??
      row.metadata?.letter_date ??
      row.publication_date,
  );
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
  const explicitId = text(meta.legal_source_registry_id ?? meta.registry_source_id);
  if (explicitId) {
    const row = rows.find((candidate) => candidate.id === explicitId);
    if (row) return { row, method: "registry_id" };
  }

  const canonical = sourceCanonicalKey(source);
  if (canonical) {
    const matches = rows.filter((candidate) => registryCanonicalKey(candidate) === canonical);
    if (matches.length === 1) return { row: matches[0], method: "canonical_document_key" };
  }

  const officialUrl = text(source.official_url ?? meta.official_url ?? meta.source_url);
  if (officialUrl) {
    const matches = rows.filter((candidate) => candidate.official_url === officialUrl);
    if (matches.length === 1) return { row: matches[0], method: "official_url" };
  }

  const externalId = text(meta.external_id ?? meta.eo_number);
  if (externalId) {
    const matches = rows.filter((candidate) => candidate.external_id === externalId);
    if (matches.length === 1) return { row: matches[0], method: "external_id" };
  }

  const number = sourceDocumentNumber(source);
  const date = sourceDocumentDate(source);
  if (number && date) {
    const matches = rows.filter(
      (candidate) =>
        candidate.document_number === number && registryDocumentDate(candidate) === date,
    );
    if (matches.length === 1) return { row: matches[0], method: "document_number_date" };
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

  return {
    ...source,
    official_url: row.official_url ?? source.official_url,
    citation: row.citation ?? source.citation,
    metadata: {
      ...source.metadata,
      legal_source_registry_id: row.id,
      registry_match_method: matchMethod,
      registry_match_attempted: true,
      authority_name: row.authority_name,
      authority_level: row.authority_level,
      jurisdiction: row.jurisdiction,
      practice_area: row.practice_area ?? source.metadata?.practice_area ?? null,
      publication_date: row.publication_date,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      revision_date: row.revision_date,
      is_official: row.is_official,
      current_status: row.current_status,
      verification_status: row.verification_status,
      last_checked_at: row.last_checked_at,
      registry_retrieved_at: row.retrieved_at,
      canonical_document_key: canonicalDocumentKey,
      // Keep provider-specific registry extensions additive; structured columns above win.
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
  "registry_match_method",
  "authority_name",
  "authority_level",
  "jurisdiction",
  "practice_area",
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
  "provider_id",
  "provider",
  "official_provider",
  "official_retrieved_at",
  "official_publication_url",
  "official_verification",
  "retrieval_method",
  "transport",
] as const;

/**
 * Additive runtime projection. Existing source_ref/trust/priority semantics stay intact.
 * Canonical registry verification_status wins when present; otherwise legacy value remains.
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
  }
}
