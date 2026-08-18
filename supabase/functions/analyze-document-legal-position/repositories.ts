// Layer 2: Repository Layer — unified search interface per source domain.

import type { ResearchQuery } from "./fact-extraction.ts";
import { buildResearchPlan, queryForQuestion, type ResearchPlan, type ResearchQuestion } from "./research-routing.ts";
import {
  buildCanonicalDocumentKey,
  searchOfficialLegalSources,
  type OfficialSourceDiagnostics,
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
    ...(query.metadata_terms ?? []),
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
    // metadata_terms are included because issue-specific temporal terms are
    // projected there by queryForQuestion().
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
): Promise<{ sources: RawSource[]; counts: Record<string, number>; researchPlan: ResearchPlan }> {
  const repos = {
    laws: new LawRepository(sb),
    court_practice: new CourtRepository(sb),
    fns_letters: new FNSRepository(sb),
    minfin_letters: new MinfinRepository(sb),
    ekaterina: new PracticeRepository(sb),
    manuals: new ManualRepository(sb),
  };
  const researchPlan = buildResearchPlan(query);

  const annotateQuestion = (source: RawSource, question: ResearchQuestion): RawSource => ({
    ...source,
    metadata: {
      ...(source.metadata ?? {}),
      research_issue_ids: [question.id],
      research_issue_texts: [question.issue],
      research_modes: question.modes,
    },
  });

  const mergeQuestionAnnotations = (sources: RawSource[]): RawSource[] => {
    const byIdentity = new Map<string, RawSource>();
    for (const source of sources) {
      const key = `${source.source_table}|${source.source_id}`;
      const existing = byIdentity.get(key);
      if (!existing) {
        byIdentity.set(key, source);
        continue;
      }
      const strings = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
      existing.metadata = {
        ...(existing.metadata ?? {}),
        ...(source.metadata ?? {}),
        research_issue_ids: Array.from(new Set([
          ...strings(existing.metadata?.research_issue_ids),
          ...strings(source.metadata?.research_issue_ids),
        ])),
        research_issue_texts: Array.from(new Set([
          ...strings(existing.metadata?.research_issue_texts),
          ...strings(source.metadata?.research_issue_texts),
        ])),
        research_modes: Array.from(new Set([
          ...strings(existing.metadata?.research_modes),
          ...strings(source.metadata?.research_modes),
        ])),
      };
    }
    return [...byIdentity.values()];
  };

  const searchPerIssue = async (bucket: Bucket): Promise<RawSource[]> => {
    const repository = repos[bucket];
    const questions = researchPlan.questions.filter((question) => question.buckets.includes(bucket));
    if (!repository || questions.length === 0) return [];
    const batches = await Promise.all(
      questions.map(async (question) => {
        const found = await repository.search(queryForQuestion(query, question), area);
        return found.map((source) => annotateQuestion(source, question));
      }),
    );
    return mergeQuestionAnnotations(batches.flat());
  };

  const searchOfficialPerIssue = async (): Promise<{
    sources: OfficialSourceResult[];
    diagnostics: OfficialSourceDiagnostics;
  }> => {
    const questions = researchPlan.questions.filter((question) => question.buckets.includes("laws"));
    const results = await Promise.all(
      questions.map(async (question) => ({
        question,
        result: await searchOfficialLegalSources(queryForQuestion(query, question)),
      })),
    );

    const annotated: OfficialSourceResult[] = [];
    const failures: string[] = [];
    let enabled = false;
    let pravoExactAttempted = 0;
    let pravoContextAttempted = 0;
    let pravoAmbiguous = 0;
    let registeredProviders = 0;

    for (const { question, result } of results) {
      enabled ||= result.diagnostics.enabled;
      pravoExactAttempted += result.diagnostics.pravo_exact_attempted;
      pravoContextAttempted += result.diagnostics.pravo_context_attempted;
      pravoAmbiguous += result.diagnostics.pravo_ambiguous;
      registeredProviders = Math.max(registeredProviders, result.diagnostics.registered_providers);
      failures.push(...result.diagnostics.failures.map((failure) => `${question.id}:${failure}`));
      for (const source of result.sources) {
        annotated.push({
          ...source,
          metadata: {
            ...(source.metadata ?? {}),
            research_issue_ids: [question.id],
            research_issue_texts: [question.issue],
            research_modes: question.modes,
          },
        });
      }
    }

    const merged = mergeQuestionAnnotations(annotated as RawSource[]) as OfficialSourceResult[];
    const identityVerified = merged.filter(
      (source) => ((source.metadata?.safety as OfficialSourceSafety | undefined)?.document_identity_verified ?? false),
    ).length;
    const substantiveUsable = merged.filter(
      (source) => ((source.metadata?.safety as OfficialSourceSafety | undefined)?.substantive_use_allowed ?? false),
    ).length;

    return {
      sources: merged,
      diagnostics: {
        enabled,
        pravo_exact_attempted: pravoExactAttempted,
        pravo_context_attempted: pravoContextAttempted,
        pravo_found: merged.length,
        pravo_identity_verified: identityVerified,
        pravo_ambiguous: pravoAmbiguous,
        substantive_usable: substantiveUsable,
        registered_providers: registeredProviders,
        failures,
      },
    };
  };

  const [laws, court, fns, minfin, ek, manuals, official] = await Promise.all([
    searchPerIssue("laws"),
    searchPerIssue("court_practice"),
    searchPerIssue("fns_letters"),
    searchPerIssue("minfin_letters"),
    searchPerIssue("ekaterina"),
    searchPerIssue("manuals"),
    searchOfficialPerIssue(),
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
    research_execution_units_count: researchPlan.questions.reduce((sum, question) => sum + question.buckets.length, 0),
  };
  return { sources, counts, researchPlan };
}

function isTemporalGap(gap: string): boolean {
  return /temporal applicability|temporal metadata|temporal research|не разрешена temporal applicability|не применимы к|историческ.{0,20}редакц|редакц.{0,20}период/iu.test(gap);
}

function gapPattern(value: string): string | null {
  const terms = value
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4)
    .slice(0, 4);
  return terms.length ? `%${terms.join("%")}%` : null;
}

/**
 * Build bounded retry patterns. Temporal gaps keep the ordinary issue query,
 * but also add date/period/revision hints from the exact issue anchors. These
 * hints remain retrieval-only and never become facts or applicability verdicts.
 */
export function buildGapSearchPatterns(
  gap: string,
  issue: ResearchQuestion | null,
): string[] {
  const patterns: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const pattern = gapPattern(value);
    if (!pattern || seen.has(pattern)) return;
    seen.add(pattern);
    patterns.push(pattern);
  };

  add(issue?.issue ?? gap);

  if (issue && isTemporalGap(gap)) {
    for (const hint of issue.temporal_terms) {
      if (!/\d{4}|дат|период|редакц|действ|вступ|утрат/iu.test(hint)) continue;
      add(hint);
      if (patterns.length >= 4) break;
    }
  }

  return patterns.slice(0, 4);
}

/**
 * Gap-targeted retry: keyword search across legal_knowledge_chunks for
 * specific sufficiency gaps surfaced by enrich.evaluateSufficiency.
 */
export async function gapSearch(
  sb: SbClient,
  gaps: string[],
  practiceArea: string | null,
  researchPlan?: ResearchPlan,
): Promise<RawSource[]> {
  if (!gaps.length) return [];
  const out: RawSource[] = [];
  for (const gap of gaps.slice(0, 5)) {
    const issueId = gap.match(/^\[(issue-\d+)\]/)?.[1] ?? null;
    const issue = issueId ? researchPlan?.questions.find((question) => question.id === issueId) ?? null : null;
    const expectedBucket: Bucket | null = /позиция ФНС/iu.test(gap)
      ? "fns_letters"
      : /позиция Минфина/iu.test(gap)
        ? "minfin_letters"
        : null;
    const patterns = buildGapSearchPatterns(gap, issue);
    if (patterns.length === 0) continue;

    const rows: any[] = [];
    for (const pattern of patterns) {
      let q = sb
        .from("legal_knowledge_chunks")
        .select("id, title, content, metadata, category, source_type")
        .eq("is_active", true)
        .ilike("content", pattern)
        .limit(6);
      if (practiceArea) q = q.eq("category", practiceArea);
      const { data } = await q;
      rows.push(...((data ?? []) as any[]));
    }

    for (const r of uniqRows(rows)) {
      const st = ((r.source_type as string | null) ?? "").toLowerCase();
      let bucket: Bucket = "laws";
      if (st.includes("court")) bucket = "court_practice";
      else if (st.includes("fns")) bucket = "fns_letters";
      else if (st.includes("minfin")) bucket = "minfin_letters";
      else if (st.includes("ekaterina")) bucket = "ekaterina";
      else if (st.includes("manual") || st.includes("template")) bucket = "manuals";
      if (expectedBucket && bucket !== expectedBucket) continue;
      const source = makeChunkSource(r, bucket);
      out.push(issue ? {
        ...source,
        metadata: {
          ...(source.metadata ?? {}),
          research_issue_ids: [issue.id],
          research_issue_texts: [issue.issue],
          research_modes: issue.modes,
        },
      } : source);
    }
  }
  return out;
}
