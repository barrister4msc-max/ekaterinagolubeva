// Layer 4: Deduplicate Engine — merge equivalent laws / cases / letters from different tables.

import type { ScoredSource } from "./ranking.ts";

export type MergedSource = ScoredSource & {
  merged_from: Array<{ source_table: string; source_id: string }>;
  appearances: number;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

function metaText(src: ScoredSource, key: string): string | null {
  const value = src.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function caseKeyFromTitle(title: string): string | null {
  const m = title.match(/[АA]\d+[-–]\d+\/\d+/i);
  return m ? norm(m[0]) : null;
}

function lawKey(src: ScoredSource): string | null {
  const code = norm(src.code) || norm(src.metadata?.code as string);
  const art = norm(src.article) || norm(src.metadata?.article as string);
  if (!code || !art) return null;
  const part = norm(src.part) || norm(src.metadata?.part as string);
  return `law|${code}|${art}|${part}`;
}

function courtKey(src: ScoredSource): string | null {
  const c = norm(src.case_number) || caseKeyFromTitle(src.title);
  return c ? `court|${c}` : null;
}

function letterKey(src: ScoredSource): string | null {
  const num = norm(src.letter_number) || norm(src.metadata?.document_number as string);
  const date = norm(src.letter_date) || norm(src.metadata?.publication_date as string);
  if (!num) return null;
  return `${src.bucket}|${num}|${date}`;
}

/**
 * Prefer canonical identities when they already exist, but preserve the
 * legacy key as a fail-safe for historical/local sources.
 *
 * Important: a case-level canonical_document_key is NOT enough to identify a
 * particular judicial act. Court sources only use canonical_court_act_key;
 * otherwise they retain the legacy behaviour until act-level identity exists.
 */
function canonicalDedupKey(src: ScoredSource): string | null {
  const version = metaText(src, "canonical_version_key");
  if (version) return `canonical-version|${version}`;

  if (src.bucket === "court_practice") {
    const courtAct = metaText(src, "canonical_court_act_key");
    return courtAct ? `canonical-court-act|${courtAct}` : null;
  }

  const document = metaText(src, "canonical_document_key");
  return document ? `canonical-document|${document}` : null;
}

function dedupKey(src: ScoredSource): string {
  const canonical = canonicalDedupKey(src);
  if (canonical) return canonical;

  switch (src.bucket) {
    case "laws":
      return lawKey(src) ?? `${src.source_table}|${src.source_id}`;
    case "court_practice":
      return courtKey(src) ?? `${src.source_table}|${src.source_id}`;
    case "fns_letters":
    case "minfin_letters":
      return letterKey(src) ?? `${src.source_table}|${src.source_id}`;
    default:
      return `${src.source_table}|${src.source_id}`;
  }
}

function hasCanonicalRegistryMatch(metadata: Record<string, unknown> | undefined): boolean {
  return typeof metadata?.legal_source_registry_id === "string" &&
    metadata.legal_source_registry_id.trim().length > 0;
}

/**
 * Merge metadata without creating a second source of truth.
 * A projection from legal_source_registry wins over an unregistered duplicate;
 * otherwise the source selected by relevance keeps precedence while missing
 * fields are filled from the duplicate.
 */
function mergeMetadata(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
  incomingWins: boolean,
): Record<string, unknown> {
  const a = existing ?? {};
  const b = incoming ?? {};
  const aCanonical = hasCanonicalRegistryMatch(a);
  const bCanonical = hasCanonicalRegistryMatch(b);

  const merged = aCanonical !== bCanonical
    ? (aCanonical ? { ...b, ...a } : { ...a, ...b })
    : (incomingWins ? { ...a, ...b } : { ...b, ...a });

  const mergeStringArray = (key: string) => {
    const left = Array.isArray(a[key]) ? a[key].filter((value): value is string => typeof value === "string") : [];
    const right = Array.isArray(b[key]) ? b[key].filter((value): value is string => typeof value === "string") : [];
    if (left.length || right.length) merged[key] = Array.from(new Set([...left, ...right]));
  };
  mergeStringArray("research_issue_ids");
  mergeStringArray("research_issue_texts");
  mergeStringArray("research_modes");
  return merged;
}

export function dedupe(sources: ScoredSource[]): MergedSource[] {
  const map = new Map<string, MergedSource>();
  for (const src of sources) {
    const key = dedupKey(src);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...src,
        merged_from: [{ source_table: src.source_table, source_id: src.source_id }],
        appearances: 1,
      });
      continue;
    }

    existing.merged_from.push({ source_table: src.source_table, source_id: src.source_id });
    existing.appearances += 1;

    // appearance bonus: +5% per extra appearance, capped at +20%
    const bonus = Math.min(0.2, 0.05 * (existing.appearances - 1));
    const incomingWins = src.scores.final > existing.scores.final;
    existing.metadata = mergeMetadata(existing.metadata, src.metadata, incomingWins);

    if (incomingWins) {
      existing.scores = src.scores;
      existing.title = src.title;
      existing.snippet = src.snippet;
      existing.official_url = src.official_url ?? existing.official_url;
      existing.citation = src.citation ?? existing.citation;
      existing.source_type = src.source_type;
      existing.code = src.code ?? existing.code;
      existing.article = src.article ?? existing.article;
      existing.part = src.part ?? existing.part;
      existing.case_number = src.case_number ?? existing.case_number;
      existing.letter_number = src.letter_number ?? existing.letter_number;
      existing.letter_date = src.letter_date ?? existing.letter_date;
      existing.source_id = src.source_id;
      existing.source_table = src.source_table;
    }

    existing.scores = {
      ...existing.scores,
      final: Math.min(1, existing.scores.final * (1 + bonus)),
    };
  }

  return [...map.values()].sort((a, b) => b.scores.final - a.scores.final);
}
