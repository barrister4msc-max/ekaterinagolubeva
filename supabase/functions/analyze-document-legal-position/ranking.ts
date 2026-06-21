// Layer 3: Ranking Engine

import type { ResearchQuery } from "./fact-extraction.ts";
import type { Bucket, RawSource } from "./repositories.ts";

export type ScoredSource = RawSource & {
  scores: {
    semantic: number;
    keyword: number;
    priority: number;
    relevance: number;
    final: number;
  };
};

const BUCKET_WEIGHT: Record<Bucket, number> = {
  laws: 1.0,
  court_practice: 0.9,
  ekaterina: 0.85,
  fns_letters: 0.8,
  minfin_letters: 0.8,
  manuals: 0.6,
};

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.3,
};

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function keywordScore(src: RawSource, terms: string[]): number {
  if (terms.length === 0) return 0;
  const hay = (src.title + " " + src.snippet).toLowerCase();
  let hits = 0;
  const seen = new Set<string>();
  for (const t of terms) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (hay.includes(t)) hits++;
  }
  return hits / seen.size;
}

function priorityScore(src: RawSource): number {
  const p = (src.metadata?.priority as string | undefined)?.toLowerCase();
  if (p && p in PRIORITY_WEIGHT) return PRIORITY_WEIGHT[p];
  // practice_legal_analysis_sources brings relevance_score as 0..1 (sometimes 0..100)
  const rel = src.metadata?.relevance_score as number | undefined;
  if (typeof rel === "number") return rel > 1 ? Math.min(1, rel / 100) : Math.max(0, Math.min(1, rel));
  const ql = (src.metadata?.quality_level as string | undefined)?.toLowerCase();
  if (ql === "gold") return 0.9;
  if (ql === "silver") return 0.7;
  if (ql === "bronze") return 0.5;
  return 0.5;
}

async function semanticScoreMap(
  sb: any,
  queryEmbedding: number[] | null,
  practiceArea: string | null,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!queryEmbedding) return map;
  try {
    const { data } = await sb.rpc("match_legal_knowledge", {
      query_embedding: queryEmbedding,
      match_count: 60,
      category_filter: practiceArea,
    });
    for (const row of (data ?? []) as any[]) {
      const sim = Number(row.similarity ?? 0);
      if (Number.isFinite(sim)) map.set(row.id as string, Math.max(0, Math.min(1, sim)));
    }
  } catch (_) { /* RPC optional */ }
  return map;
}

const BUCKET_LIMITS: Record<Bucket, number> = {
  laws: 10,
  court_practice: 8,
  fns_letters: 6,
  minfin_letters: 6,
  ekaterina: 8,
  manuals: 4,
};

export async function rankSources(opts: {
  sb: any;
  sources: RawSource[];
  query: ResearchQuery;
  queryEmbedding: number[] | null;
  practiceArea: string | null;
}): Promise<ScoredSource[]> {
  const { sb, sources, query, queryEmbedding, practiceArea } = opts;

  const terms = [
    ...query.legal_issues,
    ...query.research_topics,
    ...query.keywords,
    ...(query.subcategory ? [query.subcategory] : []),
  ]
    .flatMap((t) => tokenize(t));

  const semMap = await semanticScoreMap(sb, queryEmbedding, practiceArea);

  const scored: ScoredSource[] = sources.map((src) => {
    const semantic = src.source_table === "legal_knowledge_chunks"
      ? (semMap.get(src.source_id) ?? 0)
      : 0;
    const keyword = keywordScore(src, terms);
    const priority = priorityScore(src);
    const relevance = BUCKET_WEIGHT[src.bucket] ?? 0.5;
    const final = 0.45 * semantic + 0.25 * keyword + 0.15 * priority + 0.15 * relevance;
    return { ...src, scores: { semantic, keyword, priority, relevance, final } };
  });

  // sort + trim per bucket
  const byBucket = new Map<Bucket, ScoredSource[]>();
  for (const s of scored) {
    const arr = byBucket.get(s.bucket) ?? [];
    arr.push(s);
    byBucket.set(s.bucket, arr);
  }
  const out: ScoredSource[] = [];
  for (const [bucket, arr] of byBucket) {
    arr.sort((a, b) => b.scores.final - a.scores.final);
    out.push(...arr.slice(0, BUCKET_LIMITS[bucket]));
  }
  return out;
}
