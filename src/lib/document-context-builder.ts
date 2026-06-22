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

function computeQuality(a: LegalAnalysisResult): {
  score: number;
  breakdown: DocumentContextQualityBreakdown;
} {
  const factsScore = clampScore((Math.min(a.facts?.length ?? 0, 8) / 8) * 100);
  const sourcesScore = clampScore((Math.min(a.sources?.length ?? 0, 10) / 10) * 100);
  const evidenceScore = clampScore(
    100 - Math.min((a.missing_evidence?.length ?? 0) * 20, 100),
  );
  const lawsScore = clampScore((Math.min(a.applicable_laws?.length ?? 0, 6) / 6) * 100);
  const courtScore = clampScore(
    (Math.min(a.court_practice?.length ?? 0, 5) / 5) * 100,
  );
  const usedDocs = a.documents_audit?.used?.length ?? 0;
  const documentsScore = clampScore((Math.min(usedDocs, 5) / 5) * 100);

  const breakdown: DocumentContextQualityBreakdown = {
    facts: factsScore,
    sources: sourcesScore,
    evidence: evidenceScore,
    laws: lawsScore,
    court_practice: courtScore,
    documents: documentsScore,
  };

  // Weighted average
  const score = clampScore(
    factsScore * 0.2 +
      sourcesScore * 0.2 +
      evidenceScore * 0.15 +
      lawsScore * 0.2 +
      courtScore * 0.15 +
      documentsScore * 0.1,
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
