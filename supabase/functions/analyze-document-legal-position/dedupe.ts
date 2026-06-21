// Layer 4: Deduplicate Engine — merge equivalent laws / cases / letters from different tables.

import type { ScoredSource } from "./ranking.ts";

export type MergedSource = ScoredSource & {
  merged_from: Array<{ source_table: string; source_id: string }>;
  appearances: number;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
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

function dedupKey(src: ScoredSource): string {
  switch (src.bucket) {
    case "laws":          return lawKey(src) ?? `${src.source_table}|${src.source_id}`;
    case "court_practice":return courtKey(src) ?? `${src.source_table}|${src.source_id}`;
    case "fns_letters":
    case "minfin_letters":return letterKey(src) ?? `${src.source_table}|${src.source_id}`;
    default:              return `${src.source_table}|${src.source_id}`;
  }
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
    if (src.scores.final > existing.scores.final) {
      existing.scores = src.scores;
      existing.title = src.title;
      existing.snippet = src.snippet;
      existing.official_url = src.official_url ?? existing.official_url;
      existing.source_id = src.source_id;
      existing.source_table = src.source_table;
    }
    existing.scores = {
      ...existing.scores,
      final: Math.min(1, existing.scores.final * (1 + bonus)),
    };
  }
  // sort back desc by final
  return [...map.values()].sort((a, b) => b.scores.final - a.scores.final);
}
