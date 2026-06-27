// Phase A — enrichment for analyze-document-legal-position.
// Computes (all post-LLM, deterministic):
//   - stable IDs (fact_id, conclusion_id, source_ref)
//   - Source Trust Score + trust_reason
//   - Source Priority (winner/superseded_by within an issue group)
//   - Provenance per conclusion + provenance_index
//   - Evidence Matrix (fact ↔ documents ↔ status)
//   - Hashes for Matter Analysis Versioning (documents/answers/sources)
//
// NOTE: no new tables, no new edge functions. Everything is JSON.

import type { MergedSource } from "./dedupe.ts";

// ---------- types -----------------------------------------------------------

export type TrustedSource = {
  source_id: string;
  source_ref: string;
  source_table: string;
  source_type: string;
  bucket: string;
  title: string;
  official_url: string | null;
  url: string | null;
  citation: string | null;
  scores: unknown;
  appearances: number;
  merged_from: Array<{ source_table: string; source_id: string }>;
  // trust
  trust_score: number;
  trust_reason: string;
  use_in_generation: boolean;
  // priority
  priority_group: string | null;
  is_winner: boolean;
  superseded_by: string | null;
  lower_priority_reason: string | null;
  // actuality (kept compatible with previous shape)
  verification_status: string;
  actuality_status: string;
};

export type Conclusion = {
  conclusion_id: string;
  kind:
    | "qualification"
    | "main_position"
    | "client_position"
    | "opponent_position"
    | "fact_to_law"
    | "counter_argument"
    | "weak_point"
    | "risk"
    | "recommendation"
    | "generation_instruction";
  statement: string;
  provenance: {
    facts_used: string[];
    documents_used: string[];
    laws_used: string[];
    court_practice_used: string[];
    letters_used: string[];
    ekaterina_used: string[];
    manuals_used: string[];
    trust_summary: {
      min_trust_score: number;
      weighted_avg: number;
      lowest_source: string | null;
    };
    sufficiency: { status: "sufficient" | "partial" | "insufficient"; reason: string };
    derivation: "fact→law" | "law→fact" | "analogy" | "policy" | "ai_inference";
    confidence: number;
    reviewed_by_challenge: boolean;
    hallucinated_source: boolean;
    provenance_missing: boolean;
  };
};

export type ProvenanceIndex = {
  source_to_conclusions: Record<string, string[]>; // source_ref → [conclusion_id]
  fact_to_conclusions: Record<string, string[]>; // fact_id → [conclusion_id]
  document_to_conclusions: Record<string, string[]>; // document_id → [conclusion_id]
};

export type EvidenceMatrixEntry = {
  fact_id: string;
  fact_text: string;
  documents_used: string[];
  evidence_status: "proven" | "partial" | "missing" | "contradicted";
  evidence_strength: "high" | "medium" | "low";
  missing_evidence: string[];
  contradiction_notes: string | null;
  used_in_conclusions: string[];
};

export type FactRecord = { fact_id: string; fact_text: string };

// ---------- hashing ---------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

export async function computeHashes(input: {
  answers: Record<string, unknown>;
  documents: Array<{ id: string; ocr_length: number; redaction_status?: string | null }>;
  sources: TrustedSource[];
}): Promise<{
  answers_hash: string;
  documents_hash: string;
  used_sources_hash: string;
}> {
  const answersStr = stableStringify(input.answers ?? {});
  const docsStr = stableStringify(
    [...input.documents]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((d) => ({ id: d.id, len: d.ocr_length, red: d.redaction_status ?? null })),
  );
  const srcStr = stableStringify(
    [...input.sources]
      .sort((a, b) => a.source_ref.localeCompare(b.source_ref))
      .map((s) => ({ ref: s.source_ref, trust: s.trust_score, win: s.is_winner })),
  );
  const [answers_hash, documents_hash, used_sources_hash] = await Promise.all([
    sha256Hex(answersStr),
    sha256Hex(docsStr),
    sha256Hex(srcStr),
  ]);
  return { answers_hash, documents_hash, used_sources_hash };
}

export function shortHash(input: string): string {
  // synchronous non-crypto djb2 hash for stable IDs of short strings
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}

// ---------- stable IDs ------------------------------------------------------

export function makeFactId(text: string): string {
  return "f_" + shortHash(text.trim().toLowerCase());
}

export function buildFactRecords(facts: unknown): FactRecord[] {
  const out: FactRecord[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(facts)) return out;
  for (const f of facts) {
    const t = typeof f === "string" ? f.trim() : "";
    if (!t) continue;
    const id = makeFactId(t);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ fact_id: id, fact_text: t });
  }
  return out;
}

export function makeSourceRef(s: MergedSource): string {
  const meta = (s.metadata ?? {}) as Record<string, unknown>;
  const get = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string).trim() : "");
  switch (s.bucket) {
    case "laws": {
      const code = get("code") || get("code_name") || s.code || "";
      const art = get("article") || s.article || "";
      const rev = get("revision") || get("publication_date") || "";
      if (code && art) return `law:${code}:${art}${rev ? ":" + rev : ""}`.toLowerCase();
      return `law:${s.source_id}`;
    }
    case "court_practice": {
      const cn = get("case_number") || s.case_number || "";
      if (cn) return `court:${cn}`.toLowerCase();
      return `court:${s.source_id}`;
    }
    case "fns_letters": {
      const num = get("document_number") || get("letter_number") || s.letter_number || "";
      if (num) return `fns:${num}`.toLowerCase();
      return `fns:${s.source_id}`;
    }
    case "minfin_letters": {
      const num = get("document_number") || get("letter_number") || s.letter_number || "";
      if (num) return `minfin:${num}`.toLowerCase();
      return `minfin:${s.source_id}`;
    }
    case "ekaterina":
      return `ekaterina:${s.source_id}`;
    case "manuals":
      return `manual:${s.source_id}`;
    default:
      return `${s.bucket}:${s.source_id}`;
  }
}

// ---------- Source Trust Score ---------------------------------------------

const RU_VS_RX = /\bвс\s*рф\b|верховн[а-я]+\s+суд/i;
const RU_KS_RX = /\bкс\s*рф\b|конституционн[а-я]+\s+суд/i;
const PLENUM_RX = /пленум/i;
const REVIEW_RX = /обзор/i;
const CASSATION_RX = /кассац/i;
const APPEAL_RX = /апелляц/i;
const FIRST_INST_RX = /первой\s+инстанц|арбитражный\s+суд\b(?!.+округ)/i;

function classifyCourtTier(title: string): {
  score: number;
  reason: string;
} {
  if (RU_KS_RX.test(title)) return { score: 100, reason: "Конституционный Суд РФ" };
  if (RU_VS_RX.test(title) && PLENUM_RX.test(title))
    return { score: 100, reason: "Постановление Пленума ВС РФ" };
  if (RU_VS_RX.test(title) && REVIEW_RX.test(title))
    return { score: 95, reason: "Обзор практики ВС РФ" };
  if (RU_VS_RX.test(title)) return { score: 95, reason: "Определение ВС РФ" };
  if (CASSATION_RX.test(title)) return { score: 90, reason: "Кассационная инстанция" };
  if (APPEAL_RX.test(title)) return { score: 80, reason: "Апелляционная инстанция" };
  if (FIRST_INST_RX.test(title)) return { score: 70, reason: "Первая инстанция" };
  return { score: 75, reason: "Судебная практика (инстанция не определена)" };
}

export function computeTrust(s: MergedSource): {
  score: number;
  reason: string;
  use_in_generation: boolean;
} {
  const meta = (s.metadata ?? {}) as Record<string, unknown>;
  const titleLc = (s.title ?? "").toLowerCase();

  if (s.bucket === "laws") {
    const code = (s.code ?? (meta.code as string) ?? "").toLowerCase();
    if (/конституц/.test(titleLc)) return { score: 100, reason: "Конституция РФ", use_in_generation: true };
    if (code || /кодекс|федеральн.*закон/.test(titleLc))
      return { score: 100, reason: "Кодекс/Федеральный закон", use_in_generation: true };
    return { score: 95, reason: "Нормативный акт", use_in_generation: true };
  }

  if (s.bucket === "court_practice") {
    const t = classifyCourtTier(s.title ?? "");
    return { score: t.score, reason: t.reason, use_in_generation: true };
  }

  if (s.bucket === "fns_letters")
    return { score: 70, reason: "Письмо ФНС", use_in_generation: true };
  if (s.bucket === "minfin_letters")
    return { score: 70, reason: "Письмо Минфина", use_in_generation: true };

  if (s.bucket === "ekaterina") {
    const ql = String(meta.quality_level ?? "").toLowerCase();
    const confirmed = ql === "gold" || meta.confirmed === true || meta.use_in_rag === true;
    const redacted = meta.redacted === true || meta.anonymized === true;
    if (confirmed && redacted)
      return {
        score: 90,
        reason: "Практика Екатерины: подтверждена + обезличена",
        use_in_generation: true,
      };
    if (confirmed && !redacted)
      return {
        score: 0,
        reason: "Практика Екатерины подтверждена, но НЕ обезличена — нельзя использовать в генерации",
        use_in_generation: false,
      };
    return {
      score: 0,
      reason: "Практика Екатерины без подтверждения — нельзя использовать в генерации",
      use_in_generation: false,
    };
  }

  if (s.bucket === "manuals")
    return { score: 50, reason: "Методическое пособие/шаблон", use_in_generation: true };

  return { score: 50, reason: "Источник без классификации", use_in_generation: false };
}

// ---------- Priority / supersede --------------------------------------------

function priorityGroupKey(s: TrustedSource): string | null {
  // Group by underlying legal subject when possible.
  switch (s.bucket) {
    case "laws":
      return s.source_ref.split(":").slice(0, 3).join(":"); // law:CODE:ARTICLE
    case "court_practice": {
      // group by article cited in title, fallback to case_number itself
      const m = (s.title ?? "").match(/ст\.?\s*\d+(?:\.\d+)*\s*[А-ЯA-Z]{2,4}/i);
      return m ? `issue:${m[0].toLowerCase()}` : null;
    }
    case "fns_letters":
    case "minfin_letters": {
      const m = (s.title ?? "").match(/ст\.?\s*\d+(?:\.\d+)*\s*[А-ЯA-Z]{2,4}/i);
      return m ? `issue:${m[0].toLowerCase()}` : null;
    }
    default:
      return null;
  }
}

function tierRank(s: TrustedSource): number {
  // higher is stronger
  switch (s.bucket) {
    case "laws":
      return 100;
    case "court_practice":
      return s.trust_score; // already tiered
    case "fns_letters":
    case "minfin_letters":
      return 70;
    case "ekaterina":
      return s.use_in_generation ? 65 : 0;
    case "manuals":
      return 40;
    default:
      return 0;
  }
}

export function applyPriority(sources: TrustedSource[]): TrustedSource[] {
  const groups = new Map<string, TrustedSource[]>();
  for (const s of sources) {
    const key = priorityGroupKey(s);
    s.priority_group = key;
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }
  for (const [, arr] of groups) {
    arr.sort((a, b) => tierRank(b) - tierRank(a));
    const winner = arr[0];
    winner.is_winner = true;
    winner.superseded_by = null;
    winner.lower_priority_reason = null;
    for (let i = 1; i < arr.length; i++) {
      const s = arr[i];
      s.is_winner = false;
      s.superseded_by = winner.source_ref;
      s.use_in_generation = false;
      s.lower_priority_reason =
        s.bucket === "laws"
          ? "Более актуальная/специальная норма"
          : `Найден более авторитетный источник (${winner.trust_reason})`;
    }
  }
  // Singletons → winner by default
  for (const s of sources) {
    if (!s.priority_group) {
      s.is_winner = true;
      s.superseded_by = null;
      s.lower_priority_reason = null;
    }
  }
  return sources;
}

// ---------- Build trusted source set from merged registry -------------------

export function enrichSources(merged: MergedSource[]): TrustedSource[] {
  const trusted: TrustedSource[] = merged.map((s) => {
    const t = computeTrust(s);
    return {
      source_id: s.source_id,
      source_ref: makeSourceRef(s),
      source_table: s.source_table,
      source_type: s.source_type,
      bucket: s.bucket,
      title: s.title,
      official_url: s.official_url,
      url: s.official_url,
      citation: s.citation,
      scores: s.scores,
      appearances: s.appearances,
      merged_from: s.merged_from,
      trust_score: t.score,
      trust_reason: t.reason,
      use_in_generation: t.use_in_generation,
      priority_group: null,
      is_winner: false,
      superseded_by: null,
      lower_priority_reason: null,
      verification_status: s.official_url ? "needs_check" : "missing_url",
      actuality_status: s.official_url
        ? "requires_actuality_check"
        : "requires_manual_verification",
    };
  });
  return applyPriority(trusted);
}

// ---------- Provenance assembly --------------------------------------------

const TRUST_FALLBACK = 50;

function lookupSourceRef(
  ids: unknown,
  refIndex: Map<string, TrustedSource>,
): { refs: string[]; hallucinated: boolean } {
  const out: string[] = [];
  let hallucinated = false;
  if (!Array.isArray(ids)) return { refs: out, hallucinated };
  for (const raw of ids) {
    const id = typeof raw === "string" ? raw : (raw as { source_id?: string })?.source_id;
    if (!id) continue;
    const reg = refIndex.get(id);
    if (!reg) {
      hallucinated = true;
      continue;
    }
    out.push(reg.source_ref);
  }
  return { refs: Array.from(new Set(out)), hallucinated };
}

function provenanceFor(opts: {
  facts: string[]; // fact_ids
  documents: string[];
  laws: string[];
  court: string[];
  letters: string[];
  ekaterina: string[];
  manuals: string[];
  refIndex: Map<string, TrustedSource>;
  derivation: Conclusion["provenance"]["derivation"];
  hallucinated: boolean;
}): Conclusion["provenance"] {
  const allRefs = [
    ...opts.laws,
    ...opts.court,
    ...opts.letters,
    ...opts.ekaterina,
    ...opts.manuals,
  ];
  const refToSrc = new Map<string, TrustedSource>();
  for (const s of opts.refIndex.values()) refToSrc.set(s.source_ref, s);

  const trusts: Array<{ ref: string; score: number }> = [];
  for (const r of allRefs) {
    const t = refToSrc.get(r);
    trusts.push({ ref: r, score: t?.trust_score ?? TRUST_FALLBACK });
  }
  let min = trusts.length ? Math.min(...trusts.map((t) => t.score)) : 0;
  let avg =
    trusts.length > 0
      ? Math.round(trusts.reduce((s, t) => s + t.score, 0) / trusts.length)
      : 0;
  const lowest = trusts.sort((a, b) => a.score - b.score)[0]?.ref ?? null;

  let status: "sufficient" | "partial" | "insufficient";
  if (allRefs.length === 0) status = "insufficient";
  else if (min >= 90 && allRefs.length >= 2) status = "sufficient";
  else if (min >= 70) status = "partial";
  else status = "insufficient";

  const provenance_missing =
    allRefs.length === 0 && opts.facts.length === 0 && opts.documents.length === 0;

  return {
    facts_used: opts.facts,
    documents_used: opts.documents,
    laws_used: opts.laws,
    court_practice_used: opts.court,
    letters_used: opts.letters,
    ekaterina_used: opts.ekaterina,
    manuals_used: opts.manuals,
    trust_summary: { min_trust_score: min, weighted_avg: avg, lowest_source: lowest },
    sufficiency: {
      status,
      reason:
        status === "sufficient"
          ? "Источники достаточно авторитетны и подтверждают вывод"
          : status === "partial"
          ? "Источники подтверждают вывод, но требуют дополнительной проверки"
          : "Источники недостаточны или не найдены",
    },
    derivation: opts.derivation,
    confidence: status === "sufficient" ? 0.85 : status === "partial" ? 0.6 : 0.35,
    reviewed_by_challenge: false,
    hallucinated_source: opts.hallucinated,
    provenance_missing,
  };
}

function extractRefs(
  list: unknown,
  bucket: TrustedSource["bucket"],
  refIndex: Map<string, TrustedSource>,
): { refs: string[]; hallucinated: boolean } {
  // Items shaped { source_id, ... } produced by the LLM
  const ids: unknown[] = Array.isArray(list)
    ? list.map((x) => (x as { source_id?: string })?.source_id)
    : [];
  const r = lookupSourceRef(ids, refIndex);
  // also filter to bucket
  const filtered = r.refs.filter((ref) => {
    const t = refIndex.get([...refIndex.entries()].find(([, s]) => s.source_ref === ref)?.[0] ?? "");
    return t?.bucket === bucket;
  });
  // simpler: map directly by source_ref
  const out: string[] = [];
  for (const ref of r.refs) {
    for (const s of refIndex.values()) {
      if (s.source_ref === ref && s.bucket === bucket) {
        out.push(ref);
        break;
      }
    }
  }
  return { refs: Array.from(new Set([...out, ...filtered])), hallucinated: r.hallucinated };
}

export function buildConclusionsAndIndex(
  parsed: any,
  trusted: TrustedSource[],
  facts: FactRecord[],
): { conclusions: Conclusion[]; provenance_index: ProvenanceIndex } {
  // index by both raw source_id (from registry rows) and merged ids
  const refIndex = new Map<string, TrustedSource>();
  for (const s of trusted) {
    refIndex.set(s.source_id, s);
    for (const m of s.merged_from ?? []) refIndex.set(m.source_id, s);
  }

  const factTextToId = new Map<string, string>();
  for (const f of facts) factTextToId.set(f.fact_text.toLowerCase(), f.fact_id);
  const matchFactIds = (txt: unknown): string[] => {
    if (typeof txt !== "string" || !txt.trim()) return [];
    const lc = txt.toLowerCase();
    const hits: string[] = [];
    for (const f of facts) {
      if (lc.includes(f.fact_text.toLowerCase().slice(0, 40))) hits.push(f.fact_id);
    }
    return Array.from(new Set(hits));
  };

  const docIds: string[] = Array.isArray(parsed.document_usage)
    ? (parsed.document_usage as Array<{ doc_id: string }>).map((d) => d.doc_id).filter(Boolean)
    : [];

  const conclusions: Conclusion[] = [];

  const pushConclusion = (
    kind: Conclusion["kind"],
    statement: string,
    extra: {
      facts?: string[];
      documents?: string[];
      laws?: string[];
      court?: string[];
      letters?: string[];
      ekaterina?: string[];
      manuals?: string[];
      derivation?: Conclusion["provenance"]["derivation"];
      hallucinated?: boolean;
    } = {},
  ) => {
    if (!statement || typeof statement !== "string") return;
    const trimmed = statement.trim();
    if (!trimmed) return;
    const id = "c_" + shortHash(kind + "|" + trimmed);
    conclusions.push({
      conclusion_id: id,
      kind,
      statement: trimmed,
      provenance: provenanceFor({
        facts: extra.facts ?? [],
        documents: extra.documents ?? [],
        laws: extra.laws ?? [],
        court: extra.court ?? [],
        letters: extra.letters ?? [],
        ekaterina: extra.ekaterina ?? [],
        manuals: extra.manuals ?? [],
        refIndex,
        derivation: extra.derivation ?? "ai_inference",
        hallucinated: !!extra.hallucinated,
      }),
    });
  };

  const allLaws = extractRefs(parsed.applicable_laws, "laws", refIndex);
  const allCourt = extractRefs(parsed.court_practice, "court_practice", refIndex);
  const allFns = extractRefs(parsed.fns_letters, "fns_letters", refIndex);
  const allMinfin = extractRefs(parsed.minfin_letters, "minfin_letters", refIndex);
  const allEk = extractRefs(parsed.ekaterina_practice, "ekaterina", refIndex);
  const allManuals = extractRefs(parsed.manuals, "manuals", refIndex);
  const allLetters = [...allFns.refs, ...allMinfin.refs];
  const lettersHallucinated = allFns.hallucinated || allMinfin.hallucinated;

  if (parsed.legal_qualification) {
    pushConclusion("qualification", String(parsed.legal_qualification), {
      facts: facts.map((f) => f.fact_id),
      documents: docIds,
      laws: allLaws.refs,
      court: allCourt.refs,
      letters: allLetters,
      ekaterina: allEk.refs,
      manuals: allManuals.refs,
      derivation: "fact→law",
      hallucinated: allLaws.hallucinated,
    });
  }
  if (parsed.main_legal_position) {
    pushConclusion("main_position", String(parsed.main_legal_position), {
      facts: facts.map((f) => f.fact_id),
      documents: docIds,
      laws: allLaws.refs,
      court: allCourt.refs,
      letters: allLetters,
      ekaterina: allEk.refs,
      derivation: "fact→law",
      hallucinated: allLaws.hallucinated || allCourt.hallucinated,
    });
  }
  if (parsed.taxpayer_position) {
    pushConclusion("client_position", String(parsed.taxpayer_position), {
      facts: facts.map((f) => f.fact_id),
      laws: allLaws.refs,
      court: allCourt.refs,
      derivation: "fact→law",
    });
  }
  if (parsed.tax_authority_position) {
    pushConclusion("opponent_position", String(parsed.tax_authority_position), {
      laws: allLaws.refs,
      letters: allLetters,
      derivation: "law→fact",
      hallucinated: lettersHallucinated,
    });
  }

  // fact_to_law_mapping → per-row conclusion
  if (Array.isArray(parsed.fact_to_law_mapping)) {
    for (const m of parsed.fact_to_law_mapping as Array<{
      fact?: string;
      law?: string;
      reasoning?: string;
      conclusion?: string;
    }>) {
      const statement = [m.fact, m.law, m.conclusion ?? m.reasoning]
        .filter((x) => typeof x === "string" && x.trim())
        .join(" → ");
      if (!statement) continue;
      pushConclusion("fact_to_law", statement, {
        facts: matchFactIds(m.fact),
        laws: allLaws.refs,
        court: allCourt.refs,
        derivation: "fact→law",
      });
    }
  }

  for (const ca of (parsed.counter_arguments ?? []) as unknown[]) {
    pushConclusion("counter_argument", String(ca ?? ""), {
      laws: allLaws.refs,
      court: allCourt.refs,
      derivation: "law→fact",
    });
  }
  for (const wp of (parsed.weak_points ?? []) as unknown[]) {
    pushConclusion("weak_point", String(wp ?? ""), {
      facts: facts.map((f) => f.fact_id),
      documents: docIds,
      derivation: "ai_inference",
    });
  }
  for (const r of (parsed.risks ?? []) as Array<{ risk?: string }>) {
    pushConclusion("risk", String(r?.risk ?? ""), {
      laws: allLaws.refs,
      court: allCourt.refs,
      letters: allLetters,
      derivation: "policy",
      hallucinated: lettersHallucinated,
    });
  }
  for (const rec of (parsed.recommendations ?? []) as unknown[]) {
    pushConclusion("recommendation", String(rec ?? ""), {
      laws: allLaws.refs,
      court: allCourt.refs,
      derivation: "policy",
    });
  }
  for (const gi of (parsed.generation_instructions ?? []) as unknown[]) {
    pushConclusion("generation_instruction", String(gi ?? ""), {
      laws: allLaws.refs,
      court: allCourt.refs,
      ekaterina: allEk.refs,
      derivation: "policy",
    });
  }

  // provenance_index
  const src2c: Record<string, string[]> = {};
  const fact2c: Record<string, string[]> = {};
  const doc2c: Record<string, string[]> = {};
  for (const c of conclusions) {
    const refs = [
      ...c.provenance.laws_used,
      ...c.provenance.court_practice_used,
      ...c.provenance.letters_used,
      ...c.provenance.ekaterina_used,
      ...c.provenance.manuals_used,
    ];
    for (const r of refs) (src2c[r] ??= []).push(c.conclusion_id);
    for (const f of c.provenance.facts_used) (fact2c[f] ??= []).push(c.conclusion_id);
    for (const d of c.provenance.documents_used) (doc2c[d] ??= []).push(c.conclusion_id);
  }
  // dedupe
  const dedup = (m: Record<string, string[]>) => {
    for (const k of Object.keys(m)) m[k] = Array.from(new Set(m[k]));
  };
  dedup(src2c);
  dedup(fact2c);
  dedup(doc2c);

  return {
    conclusions,
    provenance_index: {
      source_to_conclusions: src2c,
      fact_to_conclusions: fact2c,
      document_to_conclusions: doc2c,
    },
  };
}

// ---------- Evidence Matrix -------------------------------------------------

export function buildEvidenceMatrix(opts: {
  facts: FactRecord[];
  parsed: any;
  conclusions: Conclusion[];
  documents: Array<{ id: string; title: string; ocr_length: number }>;
}): EvidenceMatrixEntry[] {
  const missing: string[] = Array.isArray(opts.parsed.missing_evidence)
    ? (opts.parsed.missing_evidence as unknown[]).map((x) => String(x ?? "")).filter(Boolean)
    : [];
  const weak: string[] = Array.isArray(opts.parsed.weak_points)
    ? (opts.parsed.weak_points as unknown[]).map((x) => String(x ?? "")).filter(Boolean)
    : [];
  const docByText = (factText: string): string[] => {
    const out: string[] = [];
    const lc = factText.toLowerCase();
    for (const d of opts.documents) {
      const tlc = (d.title ?? "").toLowerCase();
      // crude heuristic: title token overlap
      const tokens = lc.split(/\s+/).filter((t) => t.length > 3);
      if (tokens.some((t) => tlc.includes(t))) out.push(d.id);
    }
    return out;
  };

  const out: EvidenceMatrixEntry[] = [];
  for (const f of opts.facts) {
    const docs = docByText(f.fact_text);
    const used_in_conclusions = opts.conclusions
      .filter((c) => c.provenance.facts_used.includes(f.fact_id))
      .map((c) => c.conclusion_id);
    const missingForFact = missing.filter((m) =>
      m.toLowerCase().includes(f.fact_text.toLowerCase().slice(0, 24)),
    );
    const weakForFact = weak.filter((w) =>
      w.toLowerCase().includes(f.fact_text.toLowerCase().slice(0, 24)),
    );

    let status: EvidenceMatrixEntry["evidence_status"];
    let strength: EvidenceMatrixEntry["evidence_strength"];
    if (missingForFact.length > 0 && docs.length === 0) {
      status = "missing";
      strength = "low";
    } else if (docs.length === 0) {
      status = "partial";
      strength = "low";
    } else if (weakForFact.length > 0) {
      status = "partial";
      strength = "medium";
    } else {
      status = "proven";
      strength = docs.length >= 2 ? "high" : "medium";
    }

    out.push({
      fact_id: f.fact_id,
      fact_text: f.fact_text,
      documents_used: docs,
      evidence_status: status,
      evidence_strength: strength,
      missing_evidence: missingForFact,
      contradiction_notes: null,
      used_in_conclusions,
    });
  }
  return out;
}

// ---------- Source sufficiency aggregate ------------------------------------

export function evaluateSufficiency(opts: {
  trusted: TrustedSource[];
  conclusions: Conclusion[];
}): {
  status: "sufficient" | "partial" | "insufficient_critical";
  gaps: string[];
  rationale: string;
} {
  const winners = opts.trusted.filter((s) => s.is_winner && s.use_in_generation);
  const hasLaws = winners.some((s) => s.bucket === "laws" && s.trust_score >= 95);
  const hasHighCourt = winners.some(
    (s) => s.bucket === "court_practice" && s.trust_score >= 90,
  );
  const gaps: string[] = [];
  if (!hasLaws) gaps.push("Нет актуальной редакции нормы (Кодекс/ФЗ)");
  if (!hasHighCourt) gaps.push("Нет практики ВС РФ / кассации по вопросу");

  const insufficientConclusions = opts.conclusions.filter(
    (c) => c.provenance.sufficiency.status === "insufficient",
  );
  if (insufficientConclusions.length > 0)
    gaps.push(`Выводы без достаточных источников: ${insufficientConclusions.length}`);

  const hallucinated = opts.conclusions.some((c) => c.provenance.hallucinated_source);
  if (hallucinated) gaps.push("Обнаружены ссылки на источники вне реестра (риск галлюцинации)");

  let status: "sufficient" | "partial" | "insufficient_critical";
  if (!hasLaws) status = "insufficient_critical";
  else if (gaps.length === 0) status = "sufficient";
  else status = "partial";

  const rationale =
    status === "sufficient"
      ? "Найдена авторитетная норма и практика; источники не противоречат."
      : status === "partial"
      ? "Часть выводов опирается на источники второго эшелона или требует дополнительной практики."
      : "Не найдено авторитетной нормы; правовая позиция не может быть построена.";

  return { status, gaps, rationale };
}
