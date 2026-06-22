/**
 * Document Context Builder
 *
 * Pure transformation layer between Legal Research Engine output (`LegalAnalysisResult`)
 * and the Document Generator. Does NOT perform DB or network calls.
 *
 * Responsibilities:
 *  - Aggregate analysis output into a single `DocumentContext` object;
 *  - For each section, record which source documents it was derived from
 *    (`derived_from_documents`) and which legal sources back its conclusions
 *    (`supporting_sources`);
 *  - Validate required sections (facts, legal_position, generation_instructions, sources);
 *  - Compute a `document_context_quality` score (0-100);
 *  - Produce a 5-10 sentence `document_context_summary` for the generator.
 *
 * This module deliberately does NOT modify generate-legal-document-v2.
 */

import type {
  LegalAnalysisActuality,
  LegalAnalysisDocAudit,
  LegalAnalysisLaw,
  LegalAnalysisMapping,
  LegalAnalysisResult,
  LegalAnalysisRisk,
  LegalAnalysisSource,
  LegalResearchQuery,
} from "@/lib/legal-analysis";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type DocumentRef = {
  id: string;
  title: string;
};

export type SourceRef = {
  source_id?: string;
  source_table?: string;
  title: string;
  kind: "law" | "court" | "fns_letter" | "minfin_letter" | "ekaterina_practice" | "manual" | "other";
  url?: string | null;
};

export type ContextSection<T> = {
  items: T;
  derived_from_documents: DocumentRef[];
  supporting_sources: SourceRef[];
};

export type DocumentContextLaw = LegalAnalysisLaw & {
  source_id?: string;
  why_selected?: string;
  used_for?: string;
  official_url?: string | null;
};

export type DocumentContextQualityBreakdown = {
  facts: number;
  sources: number;
  evidence: number;
  laws: number;
  court_practice: number;
  documents: number;
};

export type FactEvidenceLink = {
  fact: string;
  document_ids: string[];
  document_titles: string[];
  evidence: string[];
  supporting_laws: string[];
};

export type DocumentContext = {
  // Core narrative
  facts: ContextSection<string[]>;
  legal_position: ContextSection<string>;
  taxpayer_position: ContextSection<string>;
  opponent_position: ContextSection<string>;

  // Legal grounding
  applicable_laws: ContextSection<DocumentContextLaw[]>;
  court_practice: ContextSection<LegalAnalysisResult["court_practice"]>;
  fns_letters: ContextSection<LegalAnalysisResult["fns_letters"]>;
  minfin_letters: ContextSection<LegalAnalysisResult["minfin_letters"]>;
  ekaterina_practice: ContextSection<LegalAnalysisResult["ekaterina_practice"]>;

  // Strategy
  counter_arguments: ContextSection<string[]>;
  risks: ContextSection<LegalAnalysisRisk[]>;
  weak_points: ContextSection<string[]>;
  missing_evidence: ContextSection<string[]>;
  recommendations: ContextSection<string[]>;

  // Generator hand-off
  generation_instructions: string[];
  fact_to_law_mapping: LegalAnalysisMapping[];
  fact_to_evidence_mapping: FactEvidenceLink[];

  // Provenance
  documents_used: LegalAnalysisDocAudit[];
  documents_rejected: LegalAnalysisDocAudit[];
  sources: LegalAnalysisSource[];
  source_actuality: LegalAnalysisActuality[];
  research_query: LegalResearchQuery | null;
  research_summary: Record<string, number>;

  // Metadata
  document_context_quality: number;
  document_context_quality_breakdown: DocumentContextQualityBreakdown;
  document_context_summary: string;
};

export class DocumentContextIncompleteError extends Error {
  code = "document_context_incomplete" as const;
  missing: string[];
  constructor(missing: string[]) {
    super(`document_context_incomplete: missing ${missing.join(", ")}`);
    this.missing = missing;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function toSourceRef(s: LegalAnalysisSource): SourceRef {
  const t = (s.source_type || s.type || "").toLowerCase();
  let kind: SourceRef["kind"] = "other";
  if (t.includes("law") || t.includes("kodeks") || t.includes("норм")) kind = "law";
  else if (t.includes("court") || t.includes("суд")) kind = "court";
  else if (t.includes("fns") || t.includes("фнс")) kind = "fns_letter";
  else if (t.includes("minfin") || t.includes("минфин")) kind = "minfin_letter";
  else if (t.includes("ekaterina") || t.includes("екатерин")) kind = "ekaterina_practice";
  else if (t.includes("manual") || t.includes("методичк")) kind = "manual";
  return {
    source_id: s.source_id ?? s.id,
    source_table: s.source_table,
    title: s.title,
    kind,
    url: s.url ?? s.official_url ?? null,
  };
}

function findSourcesByKind(
  sources: LegalAnalysisSource[],
  kind: SourceRef["kind"],
): SourceRef[] {
  return sources.map(toSourceRef).filter((r) => r.kind === kind);
}

function findSourcesForUsedFor(
  sources: LegalAnalysisSource[],
  tag: string,
): SourceRef[] {
  return sources
    .filter((s) => (s.used_for ?? "").toLowerCase().includes(tag))
    .map(toSourceRef);
}

function docsForUsedFor(
  audit: LegalAnalysisDocAudit[],
  tag: string,
): DocumentRef[] {
  return audit
    .filter((d) => d.used && (d.used_for ?? []).some((u) => u.toLowerCase().includes(tag)))
    .map((d) => ({ id: d.id, title: d.title }));
}

function allUsedDocs(audit: LegalAnalysisDocAudit[]): DocumentRef[] {
  return audit.filter((d) => d.used).map((d) => ({ id: d.id, title: d.title }));
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ──────────────────────────────────────────────────────────────────────────────
// Quality scoring
// ──────────────────────────────────────────────────────────────────────────────

function normalizeText(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().replace(/[«»"'.,;:()\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return normalizeText(s).split(" ").filter((t) => t.length >= 4);
}

function overlapScore(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = tokens(b);
  if (ta.size === 0 || tb.length === 0) return 0;
  let hits = 0;
  for (const t of tb) if (ta.has(t)) hits++;
  return hits / Math.max(ta.size, 1);
}

function isKeyLaw(law: { article?: string; title?: string; code?: string }): boolean {
  const blob = `${law.code ?? ""} ${law.article ?? ""} ${law.title ?? ""}`.toLowerCase();
  // Heuristic: core anti-avoidance / tax / GK articles
  return /(54\.1|169|171|172|252|346|45\.1|252\.1)/.test(blob) || /ст\.?\s*\d+/.test(blob);
}

function buildFactToEvidenceMapping(
  facts: string[],
  usedDocs: LegalAnalysisDocAudit[],
  mappings: LegalAnalysisMapping[],
  missingEvidence: string[],
): FactEvidenceLink[] {
  return facts.map((fact) => {
    // Match mappings whose `fact` text overlaps with this fact
    const linkedMappings = mappings.filter((m) => overlapScore(fact, m.fact) >= 0.25 || normalizeText(m.fact).includes(normalizeText(fact).slice(0, 40)));
    const supporting_laws = Array.from(
      new Set(linkedMappings.map((m) => m.law).filter(Boolean)),
    );
    // Match docs: title or used_for tag overlap
    const linkedDocs = usedDocs.filter((d) => {
      const blob = `${d.title} ${(d.used_for ?? []).join(" ")}`;
      return overlapScore(fact, blob) >= 0.15;
    });
    const docs = linkedDocs.length > 0 ? linkedDocs : usedDocs; // fallback: all used docs cover the fact
    const evidence: string[] = [];
    for (const m of linkedMappings) {
      if (m.reasoning) evidence.push(m.reasoning);
      if (m.conclusion) evidence.push(m.conclusion);
    }
    // Note known gaps for this fact
    for (const me of missingEvidence) {
      if (overlapScore(fact, me) >= 0.2) evidence.push(`[gap] ${me}`);
    }
    return {
      fact,
      document_ids: docs.map((d) => d.id),
      document_titles: docs.map((d) => d.title),
      evidence: Array.from(new Set(evidence)),
      supporting_laws,
    };
  });
}

function expandGenerationInstructions(a: LegalAnalysisResult): string[] {
  const base = Array.isArray(a.generation_instructions) ? [...a.generation_instructions] : [];
  const add = (s: string | undefined | null) => {
    const t = (s ?? "").trim();
    if (t && !base.some((b) => normalizeText(b) === normalizeText(t))) base.push(t);
  };

  if (a.legal_qualification?.trim()) add(`Опираться на юридическую квалификацию: ${a.legal_qualification.trim()}.`);
  if (a.main_legal_position?.trim()) add(`Изложить основную правовую позицию: ${a.main_legal_position.trim()}.`);
  if (a.taxpayer_position?.trim()) add(`Развернуть позицию налогоплательщика: ${a.taxpayer_position.trim()}.`);
  if (a.tax_authority_position?.trim()) add(`Опровергнуть позицию оппонента: ${a.tax_authority_position.trim()}.`);

  for (const law of a.applicable_laws ?? []) {
    const ref = [law.code, law.article, law.title].filter(Boolean).join(" ").trim();
    if (ref) add(`Сослаться на норму: ${ref}${law.why_selected ? ` — ${law.why_selected}` : ""}.`);
  }
  for (const m of a.fact_to_law_mapping ?? []) {
    if (m.fact && m.law) add(`Связать факт «${m.fact}» с нормой ${m.law}: ${m.conclusion ?? m.reasoning ?? ""}`.trim());
  }
  for (const cp of (a.court_practice ?? []).slice(0, 3)) {
    const ref = [cp.case, cp.court, cp.date].filter(Boolean).join(", ");
    if (ref) add(`Привести судебную практику: ${ref}${cp.conclusion ? ` — ${cp.conclusion}` : ""}.`);
  }
  for (const wp of a.weak_points ?? []) add(`Учесть слабое место позиции: ${wp}`);
  for (const ca of a.counter_arguments ?? []) add(`Подготовить контраргумент: ${ca}`);
  for (const me of a.missing_evidence ?? []) add(`Указать на необходимость доказательства: ${me}`);
  for (const r of a.recommendations ?? []) add(`Рекомендация: ${r}`);

  add("Структурировать документ: вводная часть, описательная часть, мотивировочная часть, просительная часть.");
  add("Ссылки на нормы и судебную практику оформлять точно по реквизитам из контекста; не выдумывать источники.");
  add("Соблюдать деловой юридический стиль; избегать оценочных суждений без подтверждения.");

  return base;
}

// ──────────────────────────────────────────────────────────────────────────────
// Quality scoring
// ──────────────────────────────────────────────────────────────────────────────

function computeQuality(
  a: LegalAnalysisResult,
  factEvidence: FactEvidenceLink[],
  instructionsCount: number,
): {
  score: number;
  breakdown: DocumentContextQualityBreakdown;
} {
  const factsCount = a.facts?.length ?? 0;
  const factsScore = clampScore((Math.min(factsCount, 8) / 8) * 100);
  const sourcesScore = clampScore((Math.min(a.sources?.length ?? 0, 10) / 10) * 100);

  // Evidence: positive — count facts that have document coverage + mapping/reasoning
  const usedDocs = a.documents_audit?.used?.length ?? 0;
  const factsWithEvidence = factEvidence.filter(
    (f) => f.document_ids.length > 0 && (f.evidence.length > 0 || f.supporting_laws.length > 0),
  ).length;
  const factsWithDocs = factEvidence.filter((f) => f.document_ids.length > 0).length;
  const mappingCount = a.fact_to_law_mapping?.length ?? 0;
  const coverage = factsCount > 0 ? factsWithEvidence / factsCount : 0;
  const docsTerm = (Math.min(usedDocs, 5) / 5) * 30;
  const mappingTerm = (Math.min(mappingCount, 5) / 5) * 20;
  const missingPenalty = Math.min((a.missing_evidence?.length ?? 0) * 5, 25);
  const evidenceScore = clampScore(coverage * 50 + docsTerm + mappingTerm - missingPenalty + (factsWithDocs > 0 ? 10 : 0));

  // Laws: weight key articles and mapping richness over raw count
  const laws = a.applicable_laws ?? [];
  const lawCountTerm = (Math.min(laws.length, 4) / 4) * 50;
  const keyLawBonus = laws.some(isKeyLaw) ? 30 : 0;
  const mappingBonus = (Math.min(mappingCount, 4) / 4) * 20;
  const lawsScore = clampScore(lawCountTerm + keyLawBonus + mappingBonus);

  const courtScore = clampScore(
    (Math.min(a.court_practice?.length ?? 0, 5) / 5) * 100,
  );
  const documentsScore = clampScore((Math.min(usedDocs, 5) / 5) * 100);

  const breakdown: DocumentContextQualityBreakdown = {
    facts: factsScore,
    sources: sourcesScore,
    evidence: evidenceScore,
    laws: lawsScore,
    court_practice: courtScore,
    documents: documentsScore,
  };

  // Slight bonus when generator has enough instructions (>=8)
  const instructionsBonus = instructionsCount >= 8 ? 5 : 0;

  const score = clampScore(
    factsScore * 0.2 +
      sourcesScore * 0.15 +
      evidenceScore * 0.2 +
      lawsScore * 0.2 +
      courtScore * 0.15 +
      documentsScore * 0.1 +
      instructionsBonus,
  );

  return { score, breakdown };
}

// ──────────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────────

function buildSummary(a: LegalAnalysisResult, quality: number): string {
  const sentences: string[] = [];

  const qual = a.legal_qualification?.trim();
  if (qual) sentences.push(`Юридическая квалификация: ${qual}.`);

  const pos = a.main_legal_position?.trim();
  if (pos) sentences.push(`Основная правовая позиция: ${pos}.`);

  sentences.push(
    `Установлено фактов: ${a.facts?.length ?? 0}; применимых норм: ${a.applicable_laws?.length ?? 0}; судебных актов: ${a.court_practice?.length ?? 0}.`,
  );

  const letters = (a.fns_letters?.length ?? 0) + (a.minfin_letters?.length ?? 0);
  if (letters > 0)
    sentences.push(`Подтверждающих писем ФНС/Минфина: ${letters}.`);

  if ((a.ekaterina_practice?.length ?? 0) > 0)
    sentences.push(
      `Практика Екатерины: ${a.ekaterina_practice.length} релевантных дел.`,
    );

  if ((a.risks?.length ?? 0) > 0)
    sentences.push(`Выявлено рисков: ${a.risks.length}.`);

  if ((a.weak_points?.length ?? 0) > 0)
    sentences.push(`Слабые места позиции: ${a.weak_points.length}.`);

  if ((a.missing_evidence?.length ?? 0) > 0)
    sentences.push(
      `Недостающие доказательства: ${a.missing_evidence.length} — требуется подтверждение.`,
    );

  sentences.push(`Качество подготовленного контекста: ${quality}/100.`);

  // Keep within 5-10 sentences
  return sentences.slice(0, 10).join(" ");
}

// ──────────────────────────────────────────────────────────────────────────────
// Builder
// ──────────────────────────────────────────────────────────────────────────────

export function buildDocumentContext(analysis: LegalAnalysisResult): DocumentContext {
  // Validate required sections
  const missing: string[] = [];
  if (!analysis.facts || analysis.facts.length === 0) missing.push("facts");
  if (!analysis.main_legal_position?.trim()) missing.push("legal_position");
  if (!analysis.generation_instructions || analysis.generation_instructions.length === 0)
    missing.push("generation_instructions");
  if (!analysis.sources || analysis.sources.length === 0) missing.push("sources");
  if (missing.length > 0) throw new DocumentContextIncompleteError(missing);

  const sources = analysis.sources;
  const usedAudit = analysis.documents_audit?.used ?? [];
  const rejectedAudit = analysis.documents_audit?.rejected ?? [];

  const { score, breakdown } = computeQuality(analysis);
  const summary = buildSummary(analysis, score);

  return {
    facts: {
      items: analysis.facts,
      derived_from_documents: docsForUsedFor(usedAudit, "fact").length
        ? docsForUsedFor(usedAudit, "fact")
        : allUsedDocs(usedAudit),
      supporting_sources: findSourcesForUsedFor(sources, "fact"),
    },
    legal_position: {
      items: analysis.main_legal_position,
      derived_from_documents: docsForUsedFor(usedAudit, "legal qualification").concat(
        docsForUsedFor(usedAudit, "taxpayer position"),
      ),
      supporting_sources: [
        ...findSourcesByKind(sources, "law"),
        ...findSourcesByKind(sources, "court"),
        ...findSourcesByKind(sources, "fns_letter"),
        ...findSourcesByKind(sources, "minfin_letter"),
        ...findSourcesByKind(sources, "ekaterina_practice"),
      ],
    },
    taxpayer_position: {
      items: analysis.taxpayer_position ?? "",
      derived_from_documents: docsForUsedFor(usedAudit, "taxpayer position"),
      supporting_sources: findSourcesForUsedFor(sources, "taxpayer"),
    },
    opponent_position: {
      items: analysis.tax_authority_position ?? "",
      derived_from_documents: docsForUsedFor(usedAudit, "legal qualification"),
      supporting_sources: findSourcesForUsedFor(sources, "opponent").concat(
        findSourcesForUsedFor(sources, "tax_authority"),
      ),
    },
    applicable_laws: {
      items: analysis.applicable_laws ?? [],
      derived_from_documents: [],
      supporting_sources: findSourcesByKind(sources, "law"),
    },
    court_practice: {
      items: analysis.court_practice ?? [],
      derived_from_documents: [],
      supporting_sources: findSourcesByKind(sources, "court"),
    },
    fns_letters: {
      items: analysis.fns_letters ?? [],
      derived_from_documents: [],
      supporting_sources: findSourcesByKind(sources, "fns_letter"),
    },
    minfin_letters: {
      items: analysis.minfin_letters ?? [],
      derived_from_documents: [],
      supporting_sources: findSourcesByKind(sources, "minfin_letter"),
    },
    ekaterina_practice: {
      items: analysis.ekaterina_practice ?? [],
      derived_from_documents: [],
      supporting_sources: findSourcesByKind(sources, "ekaterina_practice"),
    },
    counter_arguments: {
      items: analysis.counter_arguments ?? [],
      derived_from_documents: docsForUsedFor(usedAudit, "risks"),
      supporting_sources: findSourcesForUsedFor(sources, "counter"),
    },
    risks: {
      items: analysis.risks ?? [],
      derived_from_documents: docsForUsedFor(usedAudit, "risks"),
      supporting_sources: findSourcesForUsedFor(sources, "risk"),
    },
    weak_points: {
      items: analysis.weak_points ?? [],
      derived_from_documents: docsForUsedFor(usedAudit, "risks"),
      supporting_sources: [],
    },
    missing_evidence: {
      items: analysis.missing_evidence ?? [],
      derived_from_documents: allUsedDocs(usedAudit),
      supporting_sources: [],
    },
    recommendations: {
      items: analysis.recommendations ?? [],
      derived_from_documents: docsForUsedFor(usedAudit, "recommendations"),
      supporting_sources: findSourcesForUsedFor(sources, "recommendation"),
    },
    generation_instructions: analysis.generation_instructions,
    fact_to_law_mapping: analysis.fact_to_law_mapping ?? [],
    documents_used: usedAudit,
    documents_rejected: rejectedAudit,
    sources,
    source_actuality: analysis.source_actuality ?? [],
    research_query: analysis.research_query ?? null,
    research_summary: analysis.research_summary ?? {},
    document_context_quality: score,
    document_context_quality_breakdown: breakdown,
    document_context_summary: summary,
  };
}

export function tryBuildDocumentContext(
  analysis: LegalAnalysisResult | null | undefined,
):
  | { ok: true; context: DocumentContext }
  | { ok: false; error: "document_context_incomplete"; missing: string[] } {
  if (!analysis) {
    return { ok: false, error: "document_context_incomplete", missing: ["analysis"] };
  }
  try {
    return { ok: true, context: buildDocumentContext(analysis) };
  } catch (e) {
    if (e instanceof DocumentContextIncompleteError) {
      return { ok: false, error: "document_context_incomplete", missing: e.missing };
    }
    throw e;
  }
}
