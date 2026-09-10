import type { ResearchQuery } from "./fact-extraction.ts";
import {
  buildCanonicalDocumentKey,
  isOfficialLegalUrl,
  type OfficialSourceResult,
  type OfficialSourceSafety,
} from "./official-sources.ts";
import type { Bucket } from "./repositories.ts";

type SbClient = any;

type SupportedBucket = "court_practice" | "fns_letters" | "minfin_letters";

export type OfficialCollectorCoverageGap = {
  bucket: SupportedBucket;
  reason: "official_collector_result_missing" | "official_collector_identity_incomplete";
};

const TYPES: Record<SupportedBucket, string[]> = {
  court_practice: ["vsrf_plenum", "vsrf_review", "vsrf_case"],
  fns_letters: ["fns_letter"],
  minfin_letters: ["minfin_letter"],
};

const EXPECTED_PROVIDER: Record<SupportedBucket, string> = {
  court_practice: "vsrf",
  fns_letters: "fns",
  minfin_letters: "minfin",
};

function str(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

function registryId(meta: Record<string, unknown>): string | null {
  return str(meta.legal_source_registry_id, meta.source_registry_id);
}


function searchTerms(query: ResearchQuery): string[] {
  const raw = [
    ...(query.articles ?? []),
    ...(query.metadata_terms ?? []),
    ...(query.research_topics ?? []),
    ...(query.legal_issues ?? []),
    ...(query.keywords ?? []),
    ...(query.semantic_intents ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const value = String(item ?? "")
      .replace(/[%_]/g, " ")
      .replace(/[^\p{L}\p{N}.№\-\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 7)
      .join(" ")
      .slice(0, 140);
    const key = value.toLowerCase();
    if (value.length < 4 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 5) break;
  }
  return out;
}

function actuality(meta: Record<string, unknown>): OfficialSourceSafety["actuality_status"] {
  const freshness = str(meta.freshness_status)?.toLowerCase();
  if (bool(meta.temporal_verified) && (freshness === "current" || freshness === "verified")) {
    return "verified";
  }
  if (bool(meta.temporal_verified) && freshness === "not_applicable") return "not_applicable";
  return "unknown";
}

function safetyFor(
  bucket: SupportedBucket,
  registry: Record<string, unknown>,
  chunkMeta: Record<string, unknown>,
): OfficialSourceSafety {
  const registryMeta = (registry.metadata && typeof registry.metadata === "object")
    ? registry.metadata as Record<string, unknown>
    : {};
  const merged = { ...chunkMeta, ...registryMeta };
  const officialUrl = str(registry.official_url, merged.official_url) ?? "";
  const provider = str(merged.source_provider_id, merged.provider_id, merged.provider);
  const origin =
    provider === EXPECTED_PROVIDER[bucket] &&
    isOfficialLegalUrl(officialUrl) &&
    bool(merged.official_origin_verified);
  const identity =
    origin &&
    Boolean(str(registry.document_number, merged.document_number)) &&
    Boolean(str(registry.publication_date, merged.publication_date));
  const content = identity && bool(merged.content_verified);
  const actualityStatus = actuality(merged);
  const substantive = content && (actualityStatus === "verified" || actualityStatus === "not_applicable");
  return {
    official_origin_verified: origin,
    document_identity_verified: identity,
    content_verified: content,
    actuality_status: actualityStatus,
    substantive_use_allowed: substantive,
    verification_level: substantive
      ? "substantive"
      : content
        ? "content"
        : identity
          ? "identity"
          : origin
            ? "origin"
            : "discovery",
  };
}

function registryCanonicalKey(bucket: SupportedBucket, registry: Record<string, unknown>): string | null {
  const meta = (registry.metadata && typeof registry.metadata === "object")
    ? registry.metadata as Record<string, unknown>
    : {};
  return buildCanonicalDocumentKey({
    bucket,
    documentNumber: str(registry.document_number, meta.document_number),
    documentDate: str(registry.publication_date, meta.publication_date),
    caseNumber: str(meta.case_number),
  });
}

/**
 * Approved collector artifacts are independent official evidence already stored
 * in KATI. They are queried separately from ordinary Knowledge Base retrieval.
 * No artifact self-promotes: origin, identity, content and temporal freshness
 * must all be explicitly present before substantive_use_allowed can become true.
 */
export async function searchOfficialCollectorArtifacts(
  sb: SbClient,
  query: ResearchQuery,
  bucket: Bucket,
  limit = 12,
): Promise<{ sources: OfficialSourceResult[]; coverage_gaps: OfficialCollectorCoverageGap[] }> {
  if (!(bucket in TYPES)) return { sources: [], coverage_gaps: [] };
  const supported = bucket as SupportedBucket;
  const fields = "id, title, content, metadata, source_type";
  const collected: any[] = [];

  for (const term of searchTerms(query)) {
    const { data } = await sb
      .from("legal_knowledge_chunks")
      .select(fields)
      .eq("is_active", true)
      .filter("metadata->>source_namespace", "eq", "official_tax_core")
      .in("source_type", TYPES[supported])
      .ilike("content", `%${term}%`)
      .limit(Math.min(limit, 8));
    collected.push(...(data ?? []));
  }

  if (collected.length === 0) {
    const { data } = await sb
      .from("legal_knowledge_chunks")
      .select(fields)
      .eq("is_active", true)
      .filter("metadata->>source_namespace", "eq", "official_tax_core")
      .in("source_type", TYPES[supported])
      .limit(limit);
    collected.push(...(data ?? []));
  }

  const chunks = [...new Map(collected.map((row) => [String(row.id), row])).values()].slice(0, limit);
  if (chunks.length === 0) {
    return {
      sources: [],
      coverage_gaps: [{ bucket: supported, reason: "official_collector_result_missing" }],
    };
  }

  const registryIds = chunks
    .map((row) => registryId((row.metadata ?? {}) as Record<string, unknown>))
    .filter((value): value is string => Boolean(value));
  if (registryIds.length === 0) {
    return {
      sources: [],
      coverage_gaps: [{ bucket: supported, reason: "official_collector_identity_incomplete" }],
    };
  }

  const { data: registryRows } = await sb
    .from("legal_source_registry")
    .select("id, title, source_type, official_url, document_number, publication_date, citation, verification_status, current_status, metadata")
    .in("id", [...new Set(registryIds)]);
  const registryById = new Map((registryRows ?? []).map((row: any) => [String(row.id), row]));

  const sources: OfficialSourceResult[] = [];
  for (const chunk of chunks) {
    const chunkMeta = (chunk.metadata ?? {}) as Record<string, unknown>;
    const linkedRegistryId = registryId(chunkMeta);
    const registry = linkedRegistryId ? registryById.get(linkedRegistryId) as Record<string, unknown> | undefined : undefined;
    if (!registry) continue;
    const canonicalKey = registryCanonicalKey(supported, registry);
    if (!canonicalKey) continue;
    const officialUrl = str(registry.official_url, chunkMeta.official_url);
    if (!officialUrl) continue;
    const safety = safetyFor(supported, registry, chunkMeta);
    const documentNumber = str(registry.document_number, chunkMeta.document_number);
    const publicationDate = str(registry.publication_date, chunkMeta.publication_date);
    sources.push({
      bucket: supported,
      source_table: "external_official_source",
      source_id: `official_tax_core:${registryId}`,
      source_type: str(registry.source_type, chunk.source_type) ?? TYPES[supported][0],
      title: str(registry.title, chunk.title) ?? "Официальный источник",
      official_url: officialUrl,
      citation: str(registry.citation, documentNumber),
      snippet: String(chunk.content ?? "").slice(0, 1800),
      metadata: {
        provider: EXPECTED_PROVIDER[supported],
        provider_id: EXPECTED_PROVIDER[supported],
        collector_artifact: true,
        source_namespace: "official_tax_core",
        legal_source_registry_id: linkedRegistryId,
        canonical_document_key: canonicalKey,
        document_number: documentNumber,
        document_date: publicationDate,
        publication_date: publicationDate,
        retrieved_at: new Date().toISOString(),
        safety,
      },
      case_number: str((registry.metadata as Record<string, unknown> | undefined)?.case_number),
      letter_number: supported === "fns_letters" || supported === "minfin_letters" ? documentNumber : null,
      letter_date: supported === "fns_letters" || supported === "minfin_letters" ? publicationDate : null,
    });
  }

  return {
    sources,
    coverage_gaps: sources.length > 0
      ? []
      : [{ bucket: supported, reason: "official_collector_identity_incomplete" }],
  };
}
