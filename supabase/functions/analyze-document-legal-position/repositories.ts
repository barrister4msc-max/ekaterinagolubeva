// Layer 2: Repository Layer — unified search interface per source domain.

import type { ResearchQuery } from "./fact-extraction.ts";

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
  // dedupe / scoring inputs
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

async function selectChunks(
  sb: SbClient,
  types: string[],
  practiceArea: string | null,
  limit: number,
): Promise<any[]> {
  const orMeta = types
    .flatMap((t) => [
      `metadata->>source_type.eq.${t}`,
      `metadata->>source_kind.eq.${t}`,
    ])
    .join(",");
  let q = sb
    .from("legal_knowledge_chunks")
    .select("id, title, content, metadata, category, source_type")
    .eq("is_active", true)
    .or(orMeta)
    .limit(limit);
  if (practiceArea) q = q.eq("category", practiceArea);
  const { data: a } = await q;
  let rows = (a ?? []) as any[];

  if (rows.length < limit) {
    let q2 = sb
      .from("legal_knowledge_chunks")
      .select("id, title, content, metadata, category, source_type")
      .eq("is_active", true)
      .in("source_type", types)
      .limit(limit);
    if (practiceArea) q2 = q2.eq("category", practiceArea);
    const { data: b } = await q2;
    const extra = ((b ?? []) as any[]).filter((r) => !rows.some((x) => x.id === r.id));
    rows = rows.concat(extra).slice(0, limit);
  }

  if (rows.length === 0 && practiceArea) {
    const { data: c } = await sb
      .from("legal_knowledge_chunks")
      .select("id, title, content, metadata, category, source_type")
      .eq("is_active", true)
      .or(orMeta)
      .limit(limit);
    rows = (c ?? []) as any[];
  }
  return rows;
}

// ───── Repositories ─────

export class LawRepository {
  constructor(private sb: SbClient) {}
  async search(_q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const rows = await selectChunks(
      this.sb,
      ["law_full_text", "federal_law", "law_full_text_placeholder"],
      area,
      30,
    );
    return rows.map((r) => makeChunkSource(r, "laws"));
  }
}

export class CourtRepository {
  constructor(private sb: SbClient) {}
  async search(_q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const rows = await selectChunks(this.sb, ["court_practice", "vs_review"], area, 24);
    return rows.map((r) => makeChunkSource(r, "court_practice"));
  }
}

export class FNSRepository {
  constructor(private sb: SbClient) {}
  async search(_q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const rows = await selectChunks(this.sb, ["fns_letter"], area, 18);
    return rows.map((r) => makeChunkSource(r, "fns_letters"));
  }
}

export class MinfinRepository {
  constructor(private sb: SbClient) {}
  async search(_q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const rows = await selectChunks(this.sb, ["minfin_letter"], area, 18);
    return rows.map((r) => makeChunkSource(r, "minfin_letters"));
  }
}

export class PracticeRepository {
  constructor(private sb: SbClient) {}
  async search(_q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const out: RawSource[] = [];

    // 1. chunks tagged as ekaterina_practice
    const chunks = await selectChunks(this.sb, ["ekaterina_practice"], area, 12);
    for (const r of chunks) out.push(makeChunkSource(r, "ekaterina"));

    // 2. practice_document_legal_analysis
    try {
      let q = this.sb
        .from("practice_document_legal_analysis")
        .select(
          "id, document_id, practice_area, document_type, legal_position, legal_reasoning, quality_level, use_in_rag",
        )
        .eq("use_in_rag", true)
        .limit(8);
      if (area) q = q.eq("practice_area", area);
      const { data } = await q;
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

    // 3. practice_legal_analysis_sources
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
  async search(_q: ResearchQuery, area: string | null): Promise<RawSource[]> {
    const rows = await selectChunks(this.sb, ["manual", "manual_seed", "template"], area, 10);
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
  const [laws, court, fns, minfin, ek, manuals] = await Promise.all([
    repos.laws.search(query, area),
    repos.court_practice.search(query, area),
    repos.fns_letters.search(query, area),
    repos.minfin_letters.search(query, area),
    repos.ekaterina.search(query, area),
    repos.manuals.search(query, area),
  ]);
  const sources = [...laws, ...court, ...fns, ...minfin, ...ek, ...manuals];
  const counts = {
    laws_found: laws.length,
    court_practice_found: court.length,
    fns_found: fns.length,
    minfin_found: minfin.length,
    ekaterina_found: ek.length,
    manuals_found: manuals.length,
  };
  return { sources, counts };
}

/**
 * Gap-targeted retry: keyword search across legal_knowledge_chunks for
 * specific sufficiency gaps surfaced by enrich.evaluateSufficiency.
 * Returns RawSource[] that can be merged with the first-pass set.
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

