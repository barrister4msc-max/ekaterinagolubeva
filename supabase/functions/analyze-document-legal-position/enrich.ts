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
  // Phase B correction: was this source actually used in any conclusion?
  actually_used_in_generation: boolean;
  research_issue_ids?: string[];
  research_issue_texts?: string[];
  research_modes?: string[];
};

export type SourceWarning = {
  source_ref: string;
  warning_type:
    | "superseded_source"
    | "low_trust_source"
    | "low_trust_source_used"
    | "superseded_source_used"
    | "ekaterina_not_redacted"
    | "missing_official_url";
  superseded_by: string | null;
  message: string;
  affected_conclusions?: string[];
};

export type GenerationDecision = {
  draft: boolean;
  final: boolean;
  warnings: SourceWarning[];
  reasons: string[];
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
    // Deterministic generation quality gate. These fields live in
    // provenance because Generator and the frontend Quality Gate consume
    // them from conclusion.provenance.
    support_level: "strong" | "partial" | "unsupported";
    needs_source: boolean;
    use_in_generation: boolean;
    unsupported_reason: string | null;
  };
};

export type ProvenanceIndex = {
  source_to_conclusions: Record<string, string[]>; // source_ref → [conclusion_id]
  fact_to_conclusions: Record<string, string[]>; // fact_id → [conclusion_id]
  document_to_conclusions: Record<string, string[]>; // document_id → [conclusion_id]
};

export type EvidenceRelation =
  "DIRECTLY_RECORDS" | "SUPPORTS" | "PARTIALLY_SUPPORTS" | "MERELY_STATES" | "CONTRADICTS";

export type EvidenceMatrixEntry = {
  fact_id: string;
  fact_text: string;
  documents_used: string[];
  // P0-E4.2: additive per-pair evidentiary role. Same document may appear
  // with different relation values against different facts. `documents_used`
  // is preserved (= document_relations.map(d => d.document_id)) so existing
  // consumers (DocumentContext, Evidence Graph, UI) remain untouched.
  document_relations: Array<{ document_id: string; relation: EvidenceRelation }>;
  evidence_status: "proven" | "partial" | "missing" | "contradicted";
  evidence_strength: "high" | "medium" | "low";
  missing_evidence: string[];
  contradiction_notes: string | null;
  used_in_conclusions: string[];
  // P0-E4.2: provenance of the evidentiary link, for observability.
  //  - "canonical"      = from fact_to_evidence_mapping (authoritative)
  //  - "legacy_f2l"     = fell back to fact_to_law_mapping.documents_used
  //                       (only when canonical mapping is absent — legacy runs)
  //  - "none"           = fact was evaluated but no defensible link exists
  evidence_source: "canonical" | "legacy_f2l" | "none";
};

// P0-E4.2: optional per-fact semantic classification carried through from
// the model. Only classification of the proposition itself; legal / evaluative
// inference lives in `conclusions`, `counter_arguments`, `weak_points`, `risks`.
export type FactClaimType =
  | "documentary_observation"
  | "party_assertion"
  | "authority_finding"
  | "objective_proposition"
  | "relational_proposition";

export type FactRecord = { fact_id: string; fact_text: string; claim_type?: FactClaimType };

// ---------- hashing ---------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Stage 03A: deterministic identity for exact textual representations only.
// NFKC + whitespace normalization removes extraction-format noise without
// making any semantic claim that different text belongs to the same evidence.
export async function computeEvidenceIdentity(text: string): Promise<string | null> {
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return `sha256:${await sha256Hex(normalized)}`;
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

// P0-E4: canonical fact identity contract.
// Input may be:
//   - new shape: [{ fact_key: string, text: string }]
//   - legacy shape: string[]
// Returns canonical FactRecord[] (fact_id = djb2(text)) plus keyToId map that
// binds the model-emitted fact_key to the canonical fact_id within THIS run.
// keyToId is used later to transport identity through fact_to_law_mapping
// into Evidence Matrix without any text-based guessing.
export function buildFactRecords(facts: unknown): {
  records: FactRecord[];
  keyToId: Map<string, string>;
} {
  const records: FactRecord[] = [];
  const keyToId = new Map<string, string>();
  const seenIds = new Set<string>();
  if (!Array.isArray(facts)) return { records, keyToId };
  for (const f of facts) {
    let text = "";
    let key = "";
    let claim: FactClaimType | undefined;
    if (typeof f === "string") {
      text = f.trim();
    } else if (f && typeof f === "object") {
      const rec = f as Record<string, unknown>;
      text = typeof rec.text === "string" ? rec.text.trim() : "";
      key = typeof rec.fact_key === "string" ? rec.fact_key.trim() : "";
      const ct = typeof rec.claim_type === "string" ? rec.claim_type.trim() : "";
      if (
        ct === "documentary_observation" ||
        ct === "party_assertion" ||
        ct === "authority_finding" ||
        ct === "objective_proposition" ||
        ct === "relational_proposition"
      ) {
        claim = ct;
      }
    }
    if (!text) continue;
    const id = makeFactId(text);
    if (key && !keyToId.has(key)) keyToId.set(key, id);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    records.push({ fact_id: id, fact_text: text, ...(claim ? { claim_type: claim } : {}) });
  }
  return { records, keyToId };
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
    if (/конституц/.test(titleLc))
      return { score: 100, reason: "Конституция РФ", use_in_generation: true };
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
        reason:
          "Практика Екатерины подтверждена, но НЕ обезличена — нельзя использовать в генерации",
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
      actually_used_in_generation: false,
    };
  });
  return applyPriority(trusted);
}

// ---------- Phase B correction: mark actually-used sources ------------------

export function setActuallyUsedInGeneration(
  trusted: TrustedSource[],
  conclusions: Conclusion[],
): TrustedSource[] {
  const used = new Set<string>();
  for (const c of conclusions) {
    // Defence in depth: a blocked conclusion can never make a source look
    // as if it participated in generation, even if a caller accidentally
    // passes the full conclusion set.
    if (c.provenance.use_in_generation === false) continue;
    for (const r of [
      ...c.provenance.laws_used,
      ...c.provenance.court_practice_used,
      ...c.provenance.letters_used,
      ...c.provenance.ekaterina_used,
      ...c.provenance.manuals_used,
    ])
      used.add(r);
  }
  for (const s of trusted) s.actually_used_in_generation = used.has(s.source_ref);
  return trusted;
}

// ---------- Phase B correction: source warnings (not blockers) --------------

export function buildSourceWarnings(
  trusted: TrustedSource[],
  conclusions: Conclusion[],
): SourceWarning[] {
  const out: SourceWarning[] = [];
  const refToConclusions = new Map<string, string[]>();
  for (const c of conclusions) {
    for (const r of [
      ...c.provenance.laws_used,
      ...c.provenance.court_practice_used,
      ...c.provenance.letters_used,
      ...c.provenance.ekaterina_used,
      ...c.provenance.manuals_used,
    ]) {
      const arr = refToConclusions.get(r) ?? [];
      if (!arr.includes(c.conclusion_id)) arr.push(c.conclusion_id);
      refToConclusions.set(r, arr);
    }
  }
  for (const s of trusted) {
    const affected = refToConclusions.get(s.source_ref) ?? [];
    if (s.superseded_by) {
      out.push({
        source_ref: s.source_ref,
        warning_type: s.actually_used_in_generation
          ? "superseded_source_used"
          : "superseded_source",
        superseded_by: s.superseded_by,
        message: s.actually_used_in_generation
          ? `Источник ${s.source_ref} вытеснен более авторитетным ${s.superseded_by}, но всё ещё используется в выводах.`
          : `Источник ${s.source_ref} вытеснен более авторитетным ${s.superseded_by} (${s.lower_priority_reason ?? "приоритет"}). Не использовать в генерации.`,
        affected_conclusions: affected,
      });
    } else if (!s.use_in_generation && s.bucket === "ekaterina") {
      out.push({
        source_ref: s.source_ref,
        warning_type: "ekaterina_not_redacted",
        superseded_by: null,
        message: s.trust_reason,
        affected_conclusions: affected,
      });
    } else if (!s.use_in_generation) {
      out.push({
        source_ref: s.source_ref,
        warning_type: s.actually_used_in_generation ? "low_trust_source_used" : "low_trust_source",
        superseded_by: null,
        message: `Источник ${s.source_ref} помечен use_in_generation=false (${s.trust_reason}).`,
        affected_conclusions: affected,
      });
    }
    if (!s.official_url) {
      out.push({
        source_ref: s.source_ref,
        warning_type: "missing_official_url",
        superseded_by: null,
        message: `У источника ${s.source_ref} нет official_url — требуется ручная проверка ссылки.`,
        affected_conclusions: affected,
      });
    }
  }
  return out;
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
  kind: Conclusion["kind"];
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
    trusts.length > 0 ? Math.round(trusts.reduce((s, t) => s + t.score, 0) / trusts.length) : 0;
  const lowest = trusts.sort((a, b) => a.score - b.score)[0]?.ref ?? null;

  // A pure legal thesis may be sufficiently grounded in one high-trust primary
  // source. A mixed fact-to-law thesis, on the other hand, cannot enter
  // generation merely because its legal source is highly trusted: it also
  // needs a structurally linked fact and document. This is deliberately a
  // small eligibility gate, not a universal score or a two-source rule.
  const needsFactualBasis =
    opts.kind === "fact_to_law" || opts.facts.length > 0 || opts.documents.length > 0;
  const hasCompleteFactualBasis = opts.facts.length > 0 && opts.documents.length > 0;

  let status: "sufficient" | "partial" | "insufficient";
  if (allRefs.length === 0) status = "insufficient";
  else if (needsFactualBasis && !hasCompleteFactualBasis) status = "insufficient";
  else if (min >= 90) status = "sufficient";
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
    support_level:
      status === "sufficient" ? "strong" : status === "partial" ? "partial" : "unsupported",
    needs_source: status === "insufficient",
    use_in_generation: status !== "insufficient" && !opts.hallucinated,
    unsupported_reason: status === "insufficient" ? "Источники недостаточны или не найдены" : null,
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
    const t = refIndex.get(
      [...refIndex.entries()].find(([, s]) => s.source_ref === ref)?.[0] ?? "",
    );
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
  // Legacy fuzzy fact→text resolver — retained ONLY for non-evidentiary
  // conclusion attribution (weak_points, counter_arguments etc). NOT used in
  // fact_to_law_mapping evidentiary path (P0-E4).
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

  // B-FULL: explicit model-emitted conclusion -> source links. The key space
  // is fixed by prompt.ts and resolved only through registry source_id values.
  // No text, title, URL, position, or run-wide source fallback is allowed.
  const sourceIdsByConclusionKey = new Map<string, string[]>();
  for (const raw of Array.isArray(parsed.conclusion_source_links)
    ? parsed.conclusion_source_links
    : []) {
    if (!raw || typeof raw !== "object") continue;
    const key = typeof raw.conclusion_key === "string" ? raw.conclusion_key.trim() : "";
    if (!key) continue;
    const sourceIds = Array.isArray(raw.source_ids)
      ? raw.source_ids
          .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
      : [];
    sourceIdsByConclusionKey.set(key, Array.from(new Set(sourceIds)));
  }

  const linkedSourcesFor = (
    conclusionKey: string,
  ): {
    laws: string[];
    court: string[];
    letters: string[];
    ekaterina: string[];
    manuals: string[];
    hallucinated: boolean;
  } => {
    const buckets = {
      laws: [] as string[],
      court: [] as string[],
      letters: [] as string[],
      ekaterina: [] as string[],
      manuals: [] as string[],
    };
    let hallucinated = false;
    for (const sourceId of sourceIdsByConclusionKey.get(conclusionKey) ?? []) {
      const source = refIndex.get(sourceId);
      if (!source) {
        hallucinated = true;
        continue;
      }
      if (source.bucket === "laws") buckets.laws.push(source.source_ref);
      else if (source.bucket === "court_practice") buckets.court.push(source.source_ref);
      else if (source.bucket === "fns_letters" || source.bucket === "minfin_letters")
        buckets.letters.push(source.source_ref);
      else if (source.bucket === "ekaterina") buckets.ekaterina.push(source.source_ref);
      else if (source.bucket === "manuals") buckets.manuals.push(source.source_ref);
    }
    return {
      laws: Array.from(new Set(buckets.laws)),
      court: Array.from(new Set(buckets.court)),
      letters: Array.from(new Set(buckets.letters)),
      ekaterina: Array.from(new Set(buckets.ekaterina)),
      manuals: Array.from(new Set(buckets.manuals)),
      hallucinated,
    };
  };

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
        kind,
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

  // B-CONSERVATIVE: run-wide blanket attribution removed. The prior code
  // assigned every conclusion the full run-level union of facts/documents/
  // source refs, which manufactured precision downstream (source_warnings
  // affected_conclusions, provenance_missing, hallucination scoping). We
  // now emit ONLY explicit / structurally traceable provenance for each
  // conclusion. Empty arrays mean "precise provenance not established" —
  // NOT "no factual/legal basis". No conclusion validator is introduced
  // here; consumers continue to fail-open on absent per-conclusion fields.
  //
  // extractRefs()/allLaws/allCourt/... are intentionally not computed here
  // anymore because there is no per-conclusion structural link from the
  // top-level parsed.applicable_laws / court_practice / letters arrays to
  // a specific conclusion statement. Restoring a run-wide hallucination
  // flag on every conclusion would itself be blanket attribution. Any
  // future per-conclusion source attribution belongs to B-FULL with an
  // explicit contract.

  if (parsed.legal_qualification) {
    pushConclusion("qualification", String(parsed.legal_qualification), {
      ...linkedSourcesFor("legal_qualification"),
      derivation: "fact→law",
    });
  }
  if (parsed.main_legal_position) {
    pushConclusion("main_position", String(parsed.main_legal_position), {
      ...linkedSourcesFor("main_legal_position"),
      derivation: "fact→law",
    });
  }
  if (parsed.taxpayer_position) {
    pushConclusion("client_position", String(parsed.taxpayer_position), {
      ...linkedSourcesFor("taxpayer_position"),
      derivation: "fact→law",
    });
  }
  if (parsed.tax_authority_position) {
    pushConclusion("opponent_position", String(parsed.tax_authority_position), {
      ...linkedSourcesFor("tax_authority_position"),
      derivation: "law→fact",
    });
  }

  // fact_to_law_mapping → per-row conclusion.
  // matchFactIds is LEGACY / NON-CANONICAL identity reconstruction; it is
  // preserved unchanged (P0-E4.1 canonical identity remains authoritative
  // elsewhere). No new law/court refs are attached — the row carries only
  // free-text m.law with no structural link to a source_ref.
  if (Array.isArray(parsed.fact_to_law_mapping)) {
    for (const m of parsed.fact_to_law_mapping as Array<{
      fact_key?: string;
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
        ...linkedSourcesFor(`fact_to_law:${String(m.fact_key ?? "").trim()}`),
        facts: matchFactIds(m.fact),
        derivation: "fact→law",
      });
    }
  }

  for (const [index, ca] of ((parsed.counter_arguments ?? []) as unknown[]).entries()) {
    pushConclusion("counter_argument", String(ca ?? ""), {
      ...linkedSourcesFor(`counter_argument:${index}`),
      derivation: "law→fact",
    });
  }
  for (const [index, wp] of ((parsed.weak_points ?? []) as unknown[]).entries()) {
    pushConclusion("weak_point", String(wp ?? ""), {
      ...linkedSourcesFor(`weak_point:${index}`),
      derivation: "ai_inference",
    });
  }
  for (const [index, r] of ((parsed.risks ?? []) as Array<{ risk?: string }>).entries()) {
    pushConclusion("risk", String(r?.risk ?? ""), {
      ...linkedSourcesFor(`risk:${index}`),
      derivation: "policy",
    });
  }
  for (const [index, rec] of ((parsed.recommendations ?? []) as unknown[]).entries()) {
    pushConclusion("recommendation", String(rec ?? ""), {
      ...linkedSourcesFor(`recommendation:${index}`),
      derivation: "policy",
    });
  }
  for (const [index, gi] of ((parsed.generation_instructions ?? []) as unknown[]).entries()) {
    pushConclusion("generation_instruction", String(gi ?? ""), {
      ...linkedSourcesFor(`generation_instruction:${index}`),
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

// ---------- Conclusion quality gate ---------------------------------------

// Every substantive legal conclusion needs an explicit, structurally linked
// source. A generation instruction is operational metadata rather than a
// legal proposition and therefore may remain usable without its own source.
const SOURCE_REQUIRED_CONCLUSION_KINDS: ReadonlySet<Conclusion["kind"]> = new Set([
  "qualification",
  "main_position",
  "client_position",
  "opponent_position",
  "fact_to_law",
  "counter_argument",
  "weak_point",
  "risk",
  "recommendation",
]);

function conclusionSourceRefs(conclusion: Conclusion): string[] {
  return Array.from(
    new Set([
      ...conclusion.provenance.laws_used,
      ...conclusion.provenance.court_practice_used,
      ...conclusion.provenance.letters_used,
      ...conclusion.provenance.ekaterina_used,
      ...conclusion.provenance.manuals_used,
    ]),
  );
}

function needsCompleteFactualEvidence(conclusion: Conclusion): boolean {
  return (
    conclusion.kind === "fact_to_law" ||
    conclusion.provenance.facts_used.length > 0 ||
    conclusion.provenance.documents_used.length > 0
  );
}

function hasCompleteFactualEvidence(conclusion: Conclusion): boolean {
  return (
    conclusion.provenance.facts_used.length > 0 &&
    conclusion.provenance.documents_used.length > 0
  );
}

/**
 * Deterministic post-LLM gate for Analyzer -> Generator.
 *
 * The function never invents or repairs provenance. It only classifies the
 * provenance already built by buildConclusionsAndIndex and blocks a legal
 * conclusion when its source link cannot be defended.
 */
export function validateConclusions(
  conclusions: Conclusion[],
  trusted: TrustedSource[],
): Conclusion[] {
  const sourcesByRef = new Map(trusted.map((source) => [source.source_ref, source]));

  return conclusions.map((conclusion) => {
    const refs = conclusionSourceRefs(conclusion);
    const unresolvedRefs = refs.filter((ref) => !sourcesByRef.has(ref));
    const ineligibleRefs = refs.filter((ref) => {
      const source = sourcesByRef.get(ref);
      return !!source && (!source.use_in_generation || !!source.superseded_by);
    });
    const sourceRequired = SOURCE_REQUIRED_CONCLUSION_KINDS.has(conclusion.kind);

    let supportLevel: Conclusion["provenance"]["support_level"];
    let unsupportedReason: string | null = null;

    if (conclusion.provenance.hallucinated_source || unresolvedRefs.length > 0) {
      supportLevel = "unsupported";
      unsupportedReason = "Вывод содержит ссылку на источник вне доверенного реестра";
    } else if (ineligibleRefs.length > 0) {
      supportLevel = "unsupported";
      unsupportedReason = "Вывод опирается на источник, запрещённый для генерации";
    } else if (sourceRequired && refs.length === 0) {
      supportLevel = "unsupported";
      unsupportedReason = "Для юридического вывода не установлен источник";
    } else if (
      needsCompleteFactualEvidence(conclusion) &&
      !hasCompleteFactualEvidence(conclusion)
    ) {
      supportLevel = "unsupported";
      unsupportedReason = "Для смешанного вывода не установлены связанный факт и документ";
    } else if (conclusion.kind === "opponent_position") {
      // This records the opponent's position; it never converts that position
      // into an accepted factual or legal conclusion of the system.
      supportLevel = "partial";
    } else if (conclusion.provenance.sufficiency.status === "sufficient") {
      supportLevel = "strong";
    } else {
      supportLevel = "partial";
    }

    const useInGeneration = supportLevel !== "unsupported";
    const confidence = useInGeneration
      ? conclusion.provenance.confidence
      : Math.min(conclusion.provenance.confidence, 0.35);

    return {
      ...conclusion,
      provenance: {
        ...conclusion.provenance,
        confidence,
        support_level: supportLevel,
        needs_source: supportLevel === "unsupported",
        use_in_generation: useInGeneration,
        unsupported_reason: unsupportedReason,
      },
    };
  });
}

// ---------- Evidence Matrix -------------------------------------------------

export function buildEvidenceMatrix(opts: {
  facts: FactRecord[];
  parsed: any;
  conclusions: Conclusion[];
  documents: Array<{
    id: string;
    title: string;
    ocr_length: number;
    evidence_identity?: string | null;
  }>;
  factKeyToId: Map<string, string>;
}): EvidenceMatrixEntry[] {
  const missing: string[] = Array.isArray(opts.parsed.missing_evidence)
    ? (opts.parsed.missing_evidence as unknown[]).map((x) => String(x ?? "")).filter(Boolean)
    : [];
  const weak: string[] = Array.isArray(opts.parsed.weak_points)
    ? (opts.parsed.weak_points as unknown[]).map((x) => String(x ?? "")).filter(Boolean)
    : [];

  // Allowed client document UUIDs — the ONLY defensible universe for links.
  const allowedDocIds = new Set(opts.documents.map((d) => d.id));
  // Representation identity affects only independent-support counting.
  // Provenance remains document-id based so every uploaded representation is retained.
  const evidenceIdentityByDocId = new Map(
    opts.documents.map((d) => [
      d.id,
      typeof d.evidence_identity === "string" && d.evidence_identity.trim()
        ? d.evidence_identity.trim()
        : `document:${d.id}`,
    ]),
  );

  // Canonical fact identity universe (from facts_index built this run).
  const validFactIds = new Set(opts.facts.map((f) => f.fact_id));

  // P0-E4: identity is resolved ONLY through explicit structured keys.
  //   1. fact_to_law_mapping[].fact_key → factKeyToId (canonical)
  //   2. explicit fact_id echo (must exist in facts_index)
  // No fuzzy / substring / prefix / keyword / title / filename / embedding
  // / semantic-only resolution is permitted in the evidentiary path.
  const resolveFactId = (row: any): string | null => {
    if (row && typeof row === "object") {
      const key = typeof row.fact_key === "string" ? row.fact_key.trim() : "";
      if (key) {
        const id = opts.factKeyToId.get(key);
        if (id && validFactIds.has(id)) return id;
      }
      const explicit = typeof row.fact_id === "string" ? row.fact_id.trim() : "";
      if (explicit && validFactIds.has(explicit)) return explicit;
    }
    return null;
  };

  // P0-E4.2 — ONE authoritative Fact→Evidence producer.
  //
  //  Authoritative source:  parsed.fact_to_evidence_mapping[]
  //    shape: { fact_key, documents: [{ doc_id, relation }] }
  //    - one entry per canonical fact_key (empty documents=[] is valid and
  //      means "fact was evaluated and no defensible link was established").
  //    - relation is proposition-specific; the same doc may appear against
  //      different facts with different relations.
  //
  //  Legacy fallback (ONLY when canonical mapping is entirely absent — i.e.
  //  historical runs and back-compat model output):
  //    parsed.fact_to_law_mapping[].documents_used → relation = "SUPPORTS".
  //    Never mixed with canonical output for the same run.
  //
  //  Legacy shapes fact_to_evidence_mapping[].document_ids /
  //  .documents[].document_id / evidence_mapping[]... are also accepted and
  //  count as "canonical" for provenance purposes (they carry no relation,
  //  default to "SUPPORTS").
  //
  //  Forbidden inputs (per P0-E4.2 safety matrix): documents_audit.used,
  //  document_usage.used_for, filename / title / keyword / substring / prefix
  //  / fuzzy / embedding-only / semantic-only / all-doc fallback.

  const ALLOWED_RELATIONS: ReadonlySet<EvidenceRelation> = new Set([
    "DIRECTLY_RECORDS",
    "SUPPORTS",
    "PARTIALLY_SUPPORTS",
    "MERELY_STATES",
    "CONTRADICTS",
  ]);
  const normalizeRelation = (raw: unknown): EvidenceRelation | null => {
    if (typeof raw !== "string") return null;
    const v = raw.trim().toUpperCase();
    return ALLOWED_RELATIONS.has(v as EvidenceRelation) ? (v as EvidenceRelation) : null;
  };

  // Canonical producer output: fact_id → (doc_id → set of relations).
  // Preserve conflicting relations; conflict resolution requires an explicit
  // reasoned decision and must not happen through aggregation precedence.
  const canonicalByFact = new Map<string, Map<string, Set<EvidenceRelation>>>();
  const addCanonical = (factId: string | null, docId: unknown, relation: EvidenceRelation) => {
    if (!factId) return;
    const id = typeof docId === "string" ? docId.trim() : "";
    if (!id || !allowedDocIds.has(id)) return;
    let m = canonicalByFact.get(factId);
    if (!m) {
      m = new Map();
      canonicalByFact.set(factId, m);
    }
    let relationsForDoc = m.get(id);
    if (!relationsForDoc) {
      relationsForDoc = new Set<EvidenceRelation>();
      m.set(id, relationsForDoc);
    }
    relationsForDoc.add(relation);
  };

  const rawCanonical: any[] = Array.isArray(opts.parsed.fact_to_evidence_mapping)
    ? opts.parsed.fact_to_evidence_mapping
    : Array.isArray(opts.parsed.evidence_mapping)
      ? opts.parsed.evidence_mapping
      : [];
  const canonicalFactIdsSeen = new Set<string>();
  for (const row of rawCanonical) {
    const factId = resolveFactId(row);
    if (factId) canonicalFactIdsSeen.add(factId);
    // Preferred shape: { documents: [{ doc_id, relation }] }
    const docsField: any[] = Array.isArray(row?.documents)
      ? row.documents
      : Array.isArray(row?.evidence)
        ? row.evidence
        : [];
    for (const d of docsField) {
      if (d && typeof d === "object") {
        // Preferred canonical shape is fail-closed: a doc_id without a
        // recognized relation is malformed and must not become SUPPORTS.
        if (Object.prototype.hasOwnProperty.call(d, "doc_id")) {
          const rel = normalizeRelation(d.relation);
          if (rel) addCanonical(factId, d.doc_id, rel);
          continue;
        }

        // Explicitly recognized legacy object shapes carried no relation.
        // Keep their historical SUPPORTS semantics isolated here only.
        addCanonical(factId, d.document_id ?? d.id, "SUPPORTS");
      } else if (typeof d === "string") {
        addCanonical(factId, d, "SUPPORTS");
      }
    }
    // Legacy nested shape: { document_ids: [uuid, ...] } (no per-pair relation).
    const direct: unknown[] = Array.isArray(row?.document_ids) ? row.document_ids : [];
    for (const d of direct) addCanonical(factId, d, "SUPPORTS");
  }

  // Legacy fallback: only if the model emitted NO canonical mapping at all
  // for this run (protects historical runs and back-compat outputs). The
  // legacy path never overrides canonical output when both are present.
  const canonicalPresent = rawCanonical.length > 0;
  const legacyByFact = new Map<string, Set<string>>();
  if (!canonicalPresent && Array.isArray(opts.parsed.fact_to_law_mapping)) {
    for (const m of opts.parsed.fact_to_law_mapping as any[]) {
      const factId = resolveFactId(m);
      if (!factId) continue;
      const docs = Array.isArray(m?.documents_used) ? m.documents_used : [];
      for (const d of docs) {
        const id = typeof d === "string" ? d.trim() : "";
        if (!id || !allowedDocIds.has(id)) continue;
        if (!legacyByFact.has(factId)) legacyByFact.set(factId, new Set());
        legacyByFact.get(factId)!.add(id);
      }
    }
  }

  const out: EvidenceMatrixEntry[] = [];
  for (const f of opts.facts) {
    // Emit exactly one row per canonical fact — even with empty relations —
    // so "no defensible link" is explicit, not an omission by the producer.
    const canonicalMap = canonicalByFact.get(f.fact_id);
    let relations: Array<{ document_id: string; relation: EvidenceRelation }> = [];
    let evidenceSource: EvidenceMatrixEntry["evidence_source"];
    if (canonicalMap && canonicalMap.size > 0) {
      relations = Array.from(canonicalMap.entries()).flatMap(([document_id, relationSet]) =>
        Array.from(relationSet).map((relation) => ({ document_id, relation })),
      );
      evidenceSource = "canonical";
    } else if (!canonicalPresent && legacyByFact.has(f.fact_id)) {
      relations = Array.from(legacyByFact.get(f.fact_id)!).map((document_id) => ({
        document_id,
        relation: "SUPPORTS" as EvidenceRelation,
      }));
      evidenceSource = "legacy_f2l";
    } else {
      evidenceSource = "none";
    }
    const docs = Array.from(new Set(relations.map((r) => r.document_id)));

    const used_in_conclusions = opts.conclusions
      .filter((c) => c.provenance.facts_used.includes(f.fact_id))
      .map((c) => c.conclusion_id);
    const missingForFact = missing.filter((m) =>
      m.toLowerCase().includes(f.fact_text.toLowerCase().slice(0, 24)),
    );
    const weakForFact = weak.filter((w) =>
      w.toLowerCase().includes(f.fact_text.toLowerCase().slice(0, 24)),
    );

    // Aggregate status is a separate question from per-pair relation.
    // If ALL defensible links for this fact are CONTRADICTS, aggregate is
    // "contradicted"; otherwise existing rules apply. document_relations is
    // additive — legacy consumers keep reading documents_used unchanged.
    const nonContradictSupport = relations.some(
      (r) => r.relation !== "CONTRADICTS" && r.relation !== "MERELY_STATES",
    );
    const hasContradiction = relations.some((r) => r.relation === "CONTRADICTS");
    const allContradict =
      relations.length > 0 && relations.every((r) => r.relation === "CONTRADICTS");
    const mixedContradiction = hasContradiction && !allContradict;

    let status: EvidenceMatrixEntry["evidence_status"];
    let strength: EvidenceMatrixEntry["evidence_strength"];
    if (allContradict) {
      status = "contradicted";
      strength = "low";
    } else if (mixedContradiction) {
      status = "partial";
      strength = "low";
    } else if (missingForFact.length > 0 && !nonContradictSupport) {
      status = "missing";
      strength = "low";
    } else if (!nonContradictSupport) {
      status = "partial";
      strength = "low";
    } else if (weakForFact.length > 0) {
      status = "partial";
      strength = "medium";
    } else {
      const supporting = new Set(
        relations
          .filter((r) => r.relation === "DIRECTLY_RECORDS" || r.relation === "SUPPORTS")
          .map(
            (r) => evidenceIdentityByDocId.get(r.document_id) ?? `document:${r.document_id}`,
          ),
      ).size;
      if (supporting === 0) {
        // A-CONSERVATIVE: PARTIALLY_SUPPORTS-only evidence (no
        // DIRECTLY_RECORDS and no SUPPORTS) must NOT auto-upgrade to
        // PROVEN. Without explicit subclaim/coverage semantics we cannot
        // prove that a set of partial relations covers the full fact.
        // Preserve uncertainty as PARTIAL/medium.
        status = "partial";
        strength = "medium";
      } else {
        status = "proven";
        strength = supporting >= 2 ? "high" : "medium";
      }
    }

    out.push({
      fact_id: f.fact_id,
      fact_text: f.fact_text,
      documents_used: docs,
      document_relations: relations,
      evidence_status: status,
      evidence_strength: strength,
      missing_evidence: missingForFact,
      contradiction_notes: mixedContradiction
        ? "Обнаружены одновременно подтверждающие и противоречащие связи; требуется мотивированное разрешение конфликта"
        : null,
      used_in_conclusions,
      evidence_source: evidenceSource,
    });
  }
  // Silence unused-var lint from earlier canonical fact-id bookkeeping.
  void canonicalFactIdsSeen;
  return out;
}

// ---------- Source sufficiency aggregate ------------------------------------

export function evaluateSufficiency(opts: {
  trusted: TrustedSource[];
  conclusions: Conclusion[];
  researchCoverageGaps?: string[];
}): {
  status: "sufficient" | "partial" | "insufficient_critical";
  gaps: string[];
  rationale: string;
} {
  const winners = opts.trusted.filter((s) => s.is_winner && s.use_in_generation);
  const hasLaws = winners.some((s) => s.bucket === "laws" && s.trust_score >= 95);
  const hasHighCourt = winners.some((s) => s.bucket === "court_practice" && s.trust_score >= 90);
  const gaps: string[] = [];
  if (!hasLaws) gaps.push("Нет актуальной редакции нормы (Кодекс/ФЗ)");
  if (!hasHighCourt) gaps.push("Нет практики ВС РФ / кассации по вопросу");
  for (const gap of opts.researchCoverageGaps ?? []) {
    if (gap && !gaps.includes(gap)) gaps.push(gap);
  }

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

// ---------- Phase B correction: external_search + generation decision -------

export function evaluateExternalSearch(opts: {
  sufficiency: { status: string; gaps: string[] };
  trusted: TrustedSource[];
}): { required: boolean; reason: string | null } {
  const winners = opts.trusted.filter((s) => s.is_winner && s.use_in_generation);
  const hasLaws = winners.some((s) => s.bucket === "laws");
  const hasCourt = winners.some((s) => s.bucket === "court_practice");
  if (opts.sufficiency.status === "insufficient_critical") {
    return {
      required: true,
      reason: !hasLaws
        ? "Не найдена применимая норма в локальной базе — нужен внешний поиск."
        : "Критически недостаточно источников — нужен внешний поиск.",
    };
  }
  if (opts.sufficiency.status === "partial" && !hasCourt) {
    return {
      required: true,
      reason: "Нет авторитетной судебной практики — рекомендован внешний поиск.",
    };
  }
  return { required: false, reason: null };
}

export function decideGeneration(opts: {
  sufficiency: { status: string };
  challenge: { status: string; issues: Array<{ kind: string; description?: string }> };
  warnings: SourceWarning[];
  conclusions: Conclusion[];
  trusted: TrustedSource[];
}): GenerationDecision {
  const reasons: string[] = [];
  const criticalKinds = new Set([
    "hallucinated_source",
    "missing_applicable_norm",
    "outdated_law_without_replacement",
    "critical_missing_evidence",
    "critical_legal_contradiction",
  ]);
  const criticalIssues = opts.challenge.issues.filter(
    (i) =>
      criticalKinds.has(i.kind) ||
      // use_in_generation=false AND actually_used_in_generation=true
      (i.kind === "low_trust_source_used" && lowTrustActuallyUsed(opts.trusted)) ||
      (i.kind === "newer_norm_revision" && lowTrustActuallyUsed(opts.trusted, true)),
  );

  const hallucinated = opts.conclusions.some((c) => c.provenance.hallucinated_source);
  const unsupportedCritical = opts.conclusions.filter(
    (c) =>
      c.provenance.use_in_generation === false &&
      ["qualification", "main_position", "recommendation"].includes(c.kind),
  );
  if (hallucinated) reasons.push("hallucinated_source");
  if (unsupportedCritical.length > 0) reasons.push("unsupported_critical_conclusions");
  if (opts.sufficiency.status === "insufficient_critical")
    reasons.push("source_sufficiency_insufficient_critical");
  for (const i of criticalIssues) reasons.push(`challenge:${i.kind}`);
  // critical evidence gap heuristic: any provenance_missing
  if (opts.conclusions.some((c) => c.provenance.provenance_missing))
    reasons.push("provenance_missing");

  const blockDraft =
    hallucinated ||
    unsupportedCritical.length > 0 ||
    opts.sufficiency.status === "insufficient_critical" ||
    criticalIssues.length > 0 ||
    opts.conclusions.some((c) => c.provenance.provenance_missing);

  // Final is stricter: also blocks on partial sufficiency without high court,
  // and on any low-trust/superseded source that actually leaked into generation.
  const finalBlockingWarnings = opts.warnings.filter(
    (w) =>
      w.warning_type === "low_trust_source_used" || w.warning_type === "superseded_source_used",
  );
  const blockFinal =
    blockDraft || opts.sufficiency.status !== "sufficient" || finalBlockingWarnings.length > 0;
  if (finalBlockingWarnings.length > 0) reasons.push("low_trust_or_superseded_used_in_generation");
  if (!blockDraft && opts.sufficiency.status !== "sufficient")
    reasons.push("final_requires_sufficient_sources");

  return {
    draft: !blockDraft,
    final: !blockFinal,
    warnings: opts.warnings,
    reasons: Array.from(new Set(reasons)),
  };
}

function lowTrustActuallyUsed(trusted: TrustedSource[], supersededOnly = false): boolean {
  return trusted.some(
    (s) =>
      s.actually_used_in_generation && (supersededOnly ? !!s.superseded_by : !s.use_in_generation),
  );
}
