// Layer 2: Repository Layer — unified search interface per source domain.

import type { ResearchQuery } from "./fact-extraction.ts";
import { buildResearchPlan, queryForBucket } from "./research-routing.ts";
import {
  buildCanonicalDocumentKey,
  searchOfficialLegalSources,
  type OfficialSourceResult,
  type OfficialSourceSafety,
} from "./official-sources.ts";

export type Bucket =
  | "laws"
  | "court_practice"
  | "fns_letters"
  | "minfin_letters"
  | "ekaterina"
  | "manuals";

export type RawSource = {
  bucket: Bucket;
  source_table: string;
  source_id: string;
  source_type: string;
  title: string;
  official_url: string | null;
  citation: string | null;
  snippet: string;
  metadata: Record<string, unknown>;
  code?: string | null;
  article?: string | null;
  part?: string | null;
  case_number?: string | null;
  letter_number?: string | null;
  letter_date?: string | null;
};

type SbClient = any;

function s(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function uniqRows(rows: any[]): any[] {
  return [...new Map(rows.map((row) => [String(row.id), row])).values()];
}

function makeChunkSource(row: any, bucket: Bucket): RawSource {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const sourceType =
    s(meta.source_type) ??
    s(meta.source_kind) ??
    (row.source_type as string | null) ??
    "unknown";
  const title = (row.title as string) || s(meta.title) || sourceType;
  return {
    bucket,
    source_table: "legal_knowledge_chunks",
    source_id: row.id as string,
    source_type: sourceType,
    title,
    official_url: s(meta.official_url, meta.url, meta.source_url),
    citation: s(meta.citation, meta.document_number),
    snippet: ((row.content as string) ?? "").slice(0, 1800),
    metadata: meta,
    code: s(meta.code, meta.code_name),
    article: s(meta.article),
    part: s(meta.part),
    case_number: s(meta.case_number),
    letter_number: s(meta.letter_number, meta.document_number),
    letter_date: s(meta.letter_date, meta.publication_date),
  };
}

function contextualTerms(query: ResearchQuery): string[] {
  const raw = [
    ...(query.semantic_intents ?? []),
    ...(query.legal_concepts ?? []),
    ...(query.search_hypotheses ?? []),
    ...(query.research_topics ?? []),
    ...(query.legal_issues ?? []),
    ...(query.keywords ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const cleaned = String(value ?? "")
      .replace(/[%_]/g, " ")
      .replace(/[^\p{L}\p{N}.\-\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length < 4) continue;
    // Prefer a short phrase over a huge AI-generated sentence.
    const term = cleaned.split(" ").slice(0, 6).join(" ").slice(0, 120);
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= 4) break;
  }
  return out;
}

function articleNumbers(query: ResearchQuery): string[] {
  const out: string[] = [];
  for (const value of query.articles ?? []) {
    const match = value.match(/(?:ст\.?|статья|статьи|статьей)\s*(\d+(?:\.\d+)*)/iu);
    if (match?.[1] && !out.includes(match[1])) out.push(match[1]);
  }
  return out.slice(0, 6);
}

async function selectChunks(
  sb: SbClient,
  types: string[],
  practiceArea: string | null,
  limit: number,
  researchQuery?: ResearchQuery,
): Promise<any[]> {
  const fields = "id, title, content, metadata, category, source_type";
  const orMeta = types
    .flatMap((t) => [
      `metadata->>source_type.eq.${t}`,
      `metadata->>source_kind.eq.${t}`,
    ])
    .join(",");

  const collected: any[] = [];
  const add = (rows: any[] | null | undefined) => collected.push(...(rows ?? []));

  // 1) Metadata-exact search first (article numbers are high precision).
  if (researchQuery) {
    for (const article of articleNumbers(researchQuery)) {
      let q = sb
        .from("legal_knowledge_chunks")
        .select(fields)
        .eq("is_active", true)
        .or(orMeta)
        .filter("metadata->>article", "eq", article)
        .limit(Math.min(8, limit));
      if (practiceArea) q = q.eq("category", practiceArea);
      const { data } = await q;
      add(data);
    }

    // 2) Context/meaning search over content. The terms may be AI-expanded, but
    // they are search-only and never become facts or conclusions by themselves.
    for (const term of contextualTerms(researchQuery)) {
      let q = sb
        .from("legal_knowledge_chunks")
        .select(fields)
        .eq("is_active", true)
        .or(orMeta)
        .ilike("content", `%${term}%`)
        .limit(Math.min(10, limit));
      if (practiceArea) q = q.eq("category", practiceArea);
      const { data } = await q;
      add(data);
    }
  }

  let rows = uniqRows(collected).slice(0, limit);

  // 3) Preserve the legacy typed pool as a fallback/recall source.
  if (rows.length < limit) {
    let q = sb
      .from("legal_knowledge_chunks")
      .select(fields)
      .eq("is_active", true)
      .or(orMeta)
      .limit(limit);
    if (practiceArea) q = q.eq("category", practiceArea);
    const { data } = await q;
    rows = uniqRows([...rows, ...((data ?? []) as any[])]).slice(0, limit);
  }

  if (rows.length < limit) {
    let q2 = sb
      .from("legal_knowledge_chunks")
      .select(fields)
      .eq("is_active", true)
      .in("source_type", types)
      .limit(limit);
    if (practiceArea) q2 = q2.eq("category", practiceArea);
    const { data } = await q2;
    rows = uniqRows([...rows, ...((data ?? []) as any[])]).slice(0, limit);
  }

  if (rows.length === 0 && practiceArea) {
    const { data } = await sb
      .from("legal_knowledge_chunks")
      .select(fields)
      .eq("is_active", true)
      .or(orMeta)
      .limit(limit);
    rows = (data ?? []) as any[];
  }
  return rows;
}

function localCanonicalKey(source: RawSource): string | null {
  const meta = source.metadata ?? {};
  const explicit = s(meta.canonical_document_key);
  if (explicit) return explicit;
  return buildCanonicalDocumentKey({
    bucket: source.bucket,
    documentNumber: s(meta.document_number, meta.letter_number),
    documentDate: s(meta.document_date, meta.letter_date, meta.publication_date),
    caseNumber: source.case_number ?? s(meta.case_number),
    article: source.article ?? s(meta.article),
    code: source.code ?? s(meta.code, meta.code_name),
  });
}

function officialCanonicalKey(source: OfficialSourceResult): string | null {
  return s(source.metadata?.canonical_document_key) ??
    buildCanonicalDocumentKey({
      bucket: source.bucket,
      documentNumber: s(source.metadata?.document_number, source.letter_number),
      documentDate: s(source.metadata?.document_date, source.letter_date),
      caseNumber: source.case_number,
      article: source.article,
      code: source.code,
    });
}

/**
 * External discovery metadata may verify/annotate a local substantive source.
 * A discovery-only external result is NEVER injected into the substantive
 * source pool unless its Safety Contract explicitly allows it.
 */
export function mergeOfficialWithLocalSources(
  localSources: RawSource[],
  officialSources: OfficialSourceResult[],
): { sources: RawSource[]; linked: number; substantiveExternal: number } {
  const byCanonical = new Map<string, RawSource>();
  for (const source of localSources) {
    const key = localCanonicalKey(source);
    if (key) byCanonical.set(key, source);
  }

  let linked = 0;
  let substantiveExternal = 0;
  const standalone: RawSource[] = [];

  for (const official of officialSources) {
    const key = officialCanonicalKey(official);
    const local = key ? byCanonical.get(key) : undefined;
    const safety = official.metadata?.safety as OfficialSourceSafety | undefined;
    if (local && safety?.official_origin_verified) {
      linked++;
      local.official_url = official.official_url;
      local.metadata = {
        ...local.metadata,
        canonical_document_key: key,
        official_provider: official.metadata?.provider,
        official_retrieved_at: official.metadata?.retrieved_at,
        official_verification: safety,
        official_publication_url: official.official_url,
      };
      continue;
    }
    if (safety?.substantive_use_allowed === true) {
      standalone.push(official as RawSource);
      substantiveExternal++;
    }
  }

  return { sources: [...localSources, ...standalone], linked, substantiveExternal };
}

// ───── Repositories ─────

export class LawRepository {
  constructor(private sb: SbClient) {}
  async search(q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const rows = await selectChunks(
      this.sb,
      ["law_full_text", "federal_law", "law_full_text_placeholder"],
      area,
      30,
      q,
    );
    return rows.map((r) => makeChunkSource(r, "laws"));
  }
}

export class CourtRepository {
  constructor(private sb: SbClient) {}
  async search(q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const rows = await selectChunks(this.sb, ["court_practice", "vs_review"], area, 24, q);
    return rows.map((r) => makeChunkSource(r, "court_practice"));
  }
}

export class FNSRepository {
  constructor(private sb: SbClient) {}
  async search(q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const rows = await selectChunks(this.sb, ["fns_letter"], area, 18, q);
    return rows.map((r) => makeChunkSource(r, "fns_letters"));
  }
}

export class MinfinRepository {
  constructor(private sb: SbClient) {}
  async search(q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const rows = await selectChunks(this.sb, ["minfin_letter"], area, 18, q);
    return rows.map((r) => makeChunkSource(r, "minfin_letters"));
  }
}

export class PracticeRepository {
  constructor(private sb: SbClient) {}
  async search(q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const out: RawSource[] = [];

    const chunks = await selectChunks(this.sb, ["ekaterina_practice"], null, 12, q);
    for (const r of chunks) out.push(makeChunkSource(r, "ekaterina"));

    try {
      let dbq = this.sb
        .from("practice_document_legal_analysis")
        .select(
          "id, document_id, practice_area, document_type, legal_position, legal_reasoning, quality_level, use_in_rag",
        )
        .eq("use_in_rag", true)
        .limit(8);
      if (area) dbq = dbq.eq("practice_area", area);
      const { data } = await dbq;
      for (const r of (data ?? []) as any[]) {
        out.push({
          bucket: "ekaterina",
          source_table: "practice_document_legal_analysis",
          source_id: r.id as string,
          source_type: "ekaterina_practice",
          title:
            `Практика Екатерины — ${r.document_type ?? ""} ${r.practice_area ?? ""}`.trim() ||
            "Практика Екатерины",
          official_url: null,
          citation: null,
          snippet:
            ((r.legal_position as string) ?? "") +
            "\n" +
            ((r.legal_reasoning as string) ?? "").slice(0, 1200),
          metadata: { quality_level: r.quality_level, practice_area: r.practice_area },
        });
      }
    } catch (_) { /* table optional */ }

    try {
      const { data } = await this.sb
        .from("practice_legal_analysis_sources")
        .select("id, source_type, source_title, source_url, relevance_score, why_used, used_for")
        .order("relevance_score", { ascending: false })
        .limit(10);
      for (const r of (data ?? []) as any[]) {
        const url = (r.source_url as string | null) ?? null;
        out.push({
          bucket: "ekaterina",
          source_table: "practice_legal_analysis_sources",
          source_id: r.id as string,
          source_type: (r.source_type as string) ?? "ekaterina_practice",
          title: (r.source_title as string) ?? "Источник практики",
          official_url: url,
          citation: null,
          snippet: (r.why_used as string) ?? "",
          metadata: { relevance_score: r.relevance_score, used_for: r.used_for },
        });
      }
    } catch (_) { /* table optional */ }

    return out;
  }
}

export class ManualRepository {
  constructor(private sb: SbClient) {}
  async search(q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const rows = await selectChunks(this.sb, ["manual", "manual_seed", "template"], area, 10, q);
    return rows.map((r) => makeChunkSource(r, "manuals"));
  }
}

export async function runAllRepositories(
  sb: SbClient,
  query: ResearchQuery,
  area: string | null,
): Promise<{ sources: RawSource[]; counts: Record<string, number> }> {
  const repos = {
    laws: new LawRepository(sb),
    court_practice: new CourtRepository(sb),
    fns_letters: new FNSRepository(sb),
    minfin_letters: new MinfinRepository(sb),
    ekaterina: new PracticeRepository(sb),
    manuals: new ManualRepository(sb),
  };
  const researchPlan = buildResearchPlan(query);
  const routed = {
    laws: queryForBucket(query, researchPlan, "laws"),
    court_practice: queryForBucket(query, researchPlan, "court_practice"),
    fns_letters: queryForBucket(query, researchPlan, "fns_letters"),
    minfin_letters: queryForBucket(query, researchPlan, "minfin_letters"),
    ekaterina: queryForBucket(query, researchPlan, "ekaterina"),
    manuals: queryForBucket(query, researchPlan, "manuals"),
  };
  const routedBuckets = new Set(researchPlan.buckets);

  const [laws, court, fns, minfin, ek, manuals, official] = await Promise.all([
    routedBuckets.has("laws") ? repos.laws.search(routed.laws, area) : Promise.resolve([]),
    routedBuckets.has("court_practice") ? repos.court_practice.search(routed.court_practice, area) : Promise.resolve([]),
    routedBuckets.has("fns_letters") ? repos.fns_letters.search(routed.fns_letters, area) : Promise.resolve([]),
    routedBuckets.has("minfin_letters") ? repos.minfin_letters.search(routed.minfin_letters, area) : Promise.resolve([]),
    routedBuckets.has("ekaterina") ? repos.ekaterina.search(routed.ekaterina, area) : Promise.resolve([]),
    routedBuckets.has("manuals") ? repos.manuals.search(routed.manuals, area) : Promise.resolve([]),
    searchOfficialLegalSources(routed.laws),
  ]);

  const localSources = [...laws, ...court, ...fns, ...minfin, ...ek, ...manuals];
  const mergedOfficial = mergeOfficialWithLocalSources(localSources, official.sources);
  const sources = mergedOfficial.sources;
  const counts = {
    laws_found: laws.length,
    court_practice_found: court.length,
    fns_found: fns.length,
    minfin_found: minfin.length,
    ekaterina_found: ek.length,
    manuals_found: manuals.length,
    official_sources_discovered: official.sources.length,
    official_sources_linked_to_local: mergedOfficial.linked,
    official_sources_substantive_external: mergedOfficial.substantiveExternal,
    official_pravo_exact_attempted: official.diagnostics.pravo_exact_attempted,
    official_pravo_context_attempted: official.diagnostics.pravo_context_attempted,
    official_pravo_found: official.diagnostics.pravo_found,
    official_pravo_identity_verified: official.diagnostics.pravo_identity_verified,
    official_pravo_ambiguous: official.diagnostics.pravo_ambiguous,
    official_source_failures: official.diagnostics.failures.length,
    semantic_intents_count: query.semantic_intents?.length ?? 0,
    legal_concepts_count: query.legal_concepts?.length ?? 0,
    search_hypotheses_count: query.search_hypotheses?.length ?? 0,
    metadata_terms_count: query.metadata_terms?.length ?? 0,
    research_questions_count: researchPlan.questions.length,
    research_modes_count: researchPlan.all_modes.length,
    research_routed_buckets_count: researchPlan.buckets.length,
  };
  return { sources, counts };
}

/**
 * Gap-targeted retry: keyword search across legal_knowledge_chunks for
 * specific sufficiency gaps surfaced by enrich.evaluateSufficiency.
 */
export async function gapSearch(
  sb: SbClient,
  gaps: string[],
  practiceArea: string | null,
): Promise<RawSource[]> {
  if (!gaps.length) return [];
  const out: RawSource[] = [];
  for (const gap of gaps.slice(0, 5)) {
    const terms = gap
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4)
      .slice(0, 4);
    if (terms.length === 0) continue;
    const pattern = "%" + terms.join("%") + "%";
    let q = sb
      .from("legal_knowledge_chunks")
      .select("id, title, content, metadata, category, source_type")
      .eq("is_active", true)
      .ilike("content", pattern)
      .limit(6);
    if (practiceArea) q = q.eq("category", practiceArea);
    const { data } = await q;
    for (const r of (data ?? []) as any[]) {
      const st = ((r.source_type as string | null) ?? "").toLowerCase();
      let bucket: Bucket = "laws";
      if (st.includes("court")) bucket = "court_practice";
      else if (st.includes("fns")) bucket = "fns_letters";
      else if (st.includes("minfin")) bucket = "minfin_letters";
      else if (st.includes("ekaterina")) bucket = "ekaterina";
      else if (st.includes("manual") || st.includes("template")) bucket = "manuals";
      out.push(makeChunkSource(r, bucket));
    }
  }
  return out;
}
