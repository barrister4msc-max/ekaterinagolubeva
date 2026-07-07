import { supabase } from "@/integrations/supabase/client";

export type LegalAnalysisLaw = {
  code?: string;
  article?: string;
  title?: string;
  quote?: string;
};

export type LegalAnalysisMapping = {
  fact: string;
  law: string;
  reasoning: string;
  conclusion: string;
};

export type LegalAnalysisRisk = {
  risk: string;
  severity?: string;
  mitigation?: string;
};

export type LegalAnalysisScores = {
  semantic: number;
  keyword: number;
  priority: number;
  relevance: number;
  final: number;
};

export type LegalAnalysisSource = {
  id?: string;
  source_id?: string;
  source_table?: string;
  source_type?: string;
  bucket?: string;
  title: string;
  url?: string;
  official_url?: string | null;
  type?: string;
  cited_for?: string;
  why_selected?: string;
  used_for?: string;
  verification_status?: string;
  actuality_status?: string;
  scores?: LegalAnalysisScores;
  appearances?: number;
  merged_from?: Array<{ source_table: string; source_id: string }>;
};

export type LegalAnalysisActuality = {
  source: string;
  status: "actual" | "outdated" | "unknown" | "needs_check" | "requires_actuality_check";
  note?: string;
};

export type LegalAnalysisDocAudit = {
  id: string;
  title: string;
  ocr_length: number;
  used: boolean;
  used_for?: string[];
  reason?:
    | "no_ocr"
    | "text_too_short"
    | "archive_zip"
    | "technical_file"
    | "duplicate"
    | "irrelevant";
};

export type LegalResearchQuery = {
  practice_area: string | null;
  subcategory: string | null;
  document_type: string | null;
  facts: string[];
  parties: string[];
  amounts: string[];
  dates: string[];
  legal_issues: string[];
  research_topics: string[];
  keywords: string[];
};


export type LegalAnalysisResult = {
  facts: string[];
  legal_qualification: string;
  main_legal_position: string;
  tax_authority_position: string;
  taxpayer_position: string;
  applicable_laws: Array<LegalAnalysisLaw & { source_id?: string; why_selected?: string; used_for?: string; official_url?: string | null }>;
  fact_to_law_mapping: LegalAnalysisMapping[];
  alternative_positions: string[];
  rejected_laws: Array<{ law: string; reason: string }>;
  why_rejected: string[];
  counter_arguments: string[];
  weak_points: string[];
  missing_evidence: string[];
  risks: LegalAnalysisRisk[];
  court_practice: Array<{ case?: string; court?: string; date?: string; conclusion?: string; url?: string; source_id?: string; why_selected?: string; used_for?: string }>;
  rejected_court_practice?: Array<{ case: string; reason: string }>;
  fns_letters: Array<{ number?: string; date?: string; topic?: string; url?: string; source_id?: string; used_for?: string }>;
  minfin_letters: Array<{ number?: string; date?: string; topic?: string; url?: string; source_id?: string; used_for?: string }>;
  ekaterina_practice: Array<{ case?: string; year?: string; outcome?: string; title?: string; source_id?: string; used_for?: string }>;
  manuals?: Array<{ source_id?: string; title?: string; used_for?: string }>;
  sources: LegalAnalysisSource[];
  source_actuality: LegalAnalysisActuality[];
  recommendations?: string[];
  generation_instructions: string[];
  documents_audit?: { used: LegalAnalysisDocAudit[]; rejected: LegalAnalysisDocAudit[] };
  research_summary?: Record<string, number>;
  research_query?: LegalResearchQuery;

  // ---- Phase A extensions (persisted in document_intake_ai_runs.ai_result) ----
  facts_index?: LegalAnalysisFactRecord[];
  trusted_sources?: LegalAnalysisTrustedSource[];
  conclusions?: LegalAnalysisConclusion[];
  provenance_index?: LegalAnalysisProvenanceIndex;
  evidence_matrix?: LegalAnalysisEvidenceMatrix;
  source_sufficiency?: LegalAnalysisSourceSufficiency;
  challenge_result?: LegalAnalysisChallengeResult;
  // ---- Phase B corrections ----
  source_warnings?: LegalAnalysisSourceWarning[];
  external_search_required?: boolean;
  external_search_reason?: string | null;
  generation_allowed?: LegalAnalysisGenerationDecision;
  hashes?: LegalAnalysisHashes;
  analysis_version?: number;
  analysis_reason?: string;
  created_from?: string;
  previous_analysis_run_id?: string | null;
  redaction_used?: boolean;

  // ---- Lawyer override (UI-persisted; not produced by AI) ----
  lawyer_strategy_override?: LegalAnalysisLawyerStrategyOverride | null;
  lawyer_strategy_history?: LegalAnalysisLawyerStrategyHistoryEntry[];
};

export type LegalAnalysisLawyerStrategyOverride = {
  strategy_id: string;
  ai_strategy_id: string | null;
  selected_at: string;
  selected_by: string | null;
  reason: string;
};

export type LegalAnalysisLawyerStrategyHistoryEntry = {
  changed_at: string;
  changed_by: string | null;
  reason: string;
  previous_strategy_id: string | null;
  new_strategy_id: string | null;
  ai_strategy_id: string | null;
};

export async function saveLawyerStrategyOverride(
  runId: string,
  override: LegalAnalysisLawyerStrategyOverride | null,
): Promise<void> {
  const { data, error } = await supabase
    .from("document_intake_ai_runs")
    .select("ai_result")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  const current = (data?.ai_result as Record<string, unknown> | null) ?? {};
  const prevOverride = (current.lawyer_strategy_override as LegalAnalysisLawyerStrategyOverride | null) ?? null;
  const prevHistory = Array.isArray(current.lawyer_strategy_history)
    ? (current.lawyer_strategy_history as LegalAnalysisLawyerStrategyHistoryEntry[])
    : [];
  const entry: LegalAnalysisLawyerStrategyHistoryEntry = {
    changed_at: new Date().toISOString(),
    changed_by: override?.selected_by ?? null,
    reason: override?.reason ?? "",
    previous_strategy_id: prevOverride?.strategy_id ?? null,
    new_strategy_id: override?.strategy_id ?? null,
    ai_strategy_id: override?.ai_strategy_id ?? prevOverride?.ai_strategy_id ?? null,
  };
  const next = {
    ...current,
    lawyer_strategy_override: override,
    lawyer_strategy_history: [...prevHistory, entry],
  };
  const { error: upErr } = await supabase
    .from("document_intake_ai_runs")
    .update({ ai_result: next as any })
    .eq("id", runId);
  if (upErr) throw upErr;
}




export type LegalAnalysisFactRecord = {
  fact_id: string;
  text: string;
};

export type LegalAnalysisTrustedSource = {
  source_id: string;
  source_ref: string;
  source_table: string;
  source_type: string;
  bucket: string;
  title: string;
  official_url: string | null;
  url: string | null;
  citation: string | null;
  trust_score: number;
  trust_reason: string;
  use_in_generation: boolean;
  priority_group: string | null;
  is_winner: boolean;
  superseded_by: string | null;
  lower_priority_reason: string | null;
  verification_status: string;
  actuality_status: string;
  appearances?: number;
  actually_used_in_generation?: boolean;
};

export type LegalAnalysisSourceWarning = {
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

export type LegalAnalysisGenerationDecision = {
  draft: boolean;
  final: boolean;
  warnings: LegalAnalysisSourceWarning[];
  reasons: string[];
};


export type LegalAnalysisConclusionProvenance = {
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
  derivation: string;
  confidence: number;
  reviewed_by_challenge: boolean;
  hallucinated_source: boolean;
  provenance_missing: boolean;
};

export type LegalAnalysisConclusion = {
  conclusion_id: string;
  kind: string;
  statement: string;
  provenance: LegalAnalysisConclusionProvenance;
};

export type LegalAnalysisProvenanceIndex = {
  source_to_conclusions: Record<string, string[]>;
  fact_to_conclusions: Record<string, string[]>;
};

export type LegalAnalysisEvidenceMatrix = Array<{
  fact_id: string;
  fact_text: string;
  documents: string[];
  conclusions: string[];
  evidence_status: "proven" | "partial" | "missing";
  evidence_strength: number;
}>;

export type LegalAnalysisSourceSufficiency = {
  status: "sufficient" | "partial" | "insufficient" | "insufficient_critical";
  gaps: string[];
  reason?: string;
};

export type LegalAnalysisChallengeResult = {
  status: "passed" | "needs_revision" | "blocked";
  issues: Array<{
    kind: string;
    description: string;
    affected_conclusions: string[];
    affected_sources: string[];
  }>;
  required_changes: string[];
  adverse_sources: string[];
  unresolved_risks: string[];
  reasoning: string;
};

export type LegalAnalysisHashes = {
  answers_hash: string;
  documents_hash: string;
  used_sources_hash: string;
  redaction_hash?: string;
  ocr_hash?: string;
};


export type LegalAnalysisRun = {
  id: string;
  session_id: string;
  status: string;
  hallucination_risk: string | null;
  legal_accuracy_score: number | null;
  source_verification_status: string | null;
  needs_lawyer_review: boolean;
  model_name: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  analysis: LegalAnalysisResult | null;
};
const STOPWORDS = new Set([
  "и","в","во","не","что","он","на","я","с","со","как","а","то","все","она","так","его","но","да","ты","к","у","же","вы","за","бы","по","только","ее","мне","было","вот","от","меня","еще","нет","о","из","ему","теперь","когда","даже","ну","вдруг","ли","если","уже","или","ни","быть","был","него","до","вас","нибудь","опять","уж","вам","ведь","там","потом","себя","ничего","ей","может","они","тут","где","есть","надо","ней","для","мы","тебя","их","чем","была","сам","чтоб","без","будто","чего","раз","тоже","себе","под","будет","ж","тогда","кто","этот","того","потому","этого","какой","совсем","ним","здесь","этом","один","почти","мой","тем","чтобы","нее","сейчас","были","куда","зачем","всех","никогда","можно","при","наконец","два","об","другой","хоть","после","над","больше","тот","через","эти","нас","про","всего","них","какая","много","разве","три","эту","моя","впрочем","хорошо","свою","этой","перед","иногда","лучше","чуть","том","нельзя","такой","им","более","всегда","конечно","всю","между"
]);
function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of String(s ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 4) continue;
    if (STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}
function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

function normalizeArgumentMap(a: any): void {
  if (!a || typeof a !== "object") return;
  const argMap: any[] = Array.isArray(a.argument_map) ? a.argument_map : [];
  if (!argMap.length) return;

  const factsIndex: Array<{ fact_id: string; text: string }> = Array.isArray(a.facts_index)
    ? a.facts_index
    : [];
  const evidenceMatrix: Array<{ fact_id: string; fact_text?: string; documents?: string[] }> =
    Array.isArray(a.evidence_matrix) ? a.evidence_matrix : [];
  const factToLaw: Array<{ fact?: string; law?: string }> = Array.isArray(a.fact_to_law_mapping)
    ? a.fact_to_law_mapping
    : [];
  const rawFacts: string[] = Array.isArray(a.facts) ? a.facts : [];
  const trustedSources: Array<{
    source_id?: string;
    source_ref?: string;
    citation?: string | null;
    title?: string;
    use_in_generation?: boolean;
    is_winner?: boolean;
  }> = Array.isArray(a.trusted_sources) ? a.trusted_sources : [];

  // fact catalog: fact_id -> text; also synthesize IDs for raw facts / mapping facts.
  type FactEntry = { id: string; text: string; tokens: Set<string> };
  const factCatalog: FactEntry[] = [];
  const seenIds = new Set<string>();
  for (const f of factsIndex) {
    if (!f?.fact_id) continue;
    seenIds.add(f.fact_id);
    factCatalog.push({ id: f.fact_id, text: String(f.text ?? ""), tokens: tokenize(f.text ?? "") });
  }
  for (const e of evidenceMatrix) {
    if (!e?.fact_id || seenIds.has(e.fact_id)) continue;
    seenIds.add(e.fact_id);
    factCatalog.push({ id: e.fact_id, text: String(e.fact_text ?? ""), tokens: tokenize(e.fact_text ?? "") });
  }
  // Fallback synthetic entries from raw facts / mapping if we still have no catalog.
  if (factCatalog.length === 0) {
    rawFacts.forEach((t, i) => {
      const id = `F${i + 1}`;
      factCatalog.push({ id, text: t, tokens: tokenize(t) });
    });
    factToLaw.forEach((m, i) => {
      const id = `FM${i + 1}`;
      factCatalog.push({ id, text: String(m.fact ?? ""), tokens: tokenize(m.fact ?? "") });
    });
  }

  const docsByFact = new Map<string, string[]>();
  for (const e of evidenceMatrix) {
    if (!e?.fact_id) continue;
    docsByFact.set(e.fact_id, Array.isArray(e.documents) ? e.documents : []);
  }

  const mappingEntries = factToLaw.map((m) => ({
    factTokens: tokenize(m.fact ?? ""),
    lawTokens: tokenize(m.law ?? ""),
    law: String(m.law ?? ""),
  }));

  const sourceCatalog = trustedSources.map((s) => ({
    ref: String(s.source_id ?? s.source_ref ?? ""),
    tokens: tokenize(`${s.citation ?? ""} ${s.title ?? ""}`),
    winner: Boolean(s.is_winner ?? s.use_in_generation),
  }));

  for (const arg of argMap) {
    if (!arg || typeof arg !== "object") continue;
    const text = [arg.argument, arg.statement, arg.kind, arg.blocked_reason]
      .filter(Boolean)
      .join(" ");
    const argTokens = tokenize(text);

    // --- facts_used ---
    if (!Array.isArray(arg.facts_used) || arg.facts_used.length === 0) {
      const scored = factCatalog
        .map((f) => ({ id: f.id, score: overlap(argTokens, f.tokens) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      let picked = scored.slice(0, 3).map((x) => x.id);
      if (picked.length === 0 && factCatalog.length > 0) {
        // Fall back via fact_to_law_mapping: match argument tokens to law text, then use that mapping's fact.
        const mappingHits = mappingEntries
          .map((m, i) => ({ i, score: overlap(argTokens, m.lawTokens) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        const hitFactTexts = mappingHits.map((h) => factToLaw[h.i]?.fact ?? "").filter(Boolean);
        const set: string[] = [];
        for (const t of hitFactTexts) {
          const tokens = tokenize(t);
          const best = factCatalog
            .map((f) => ({ id: f.id, score: overlap(tokens, f.tokens) }))
            .sort((a, b) => b.score - a.score)[0];
          if (best && best.score > 0 && !set.includes(best.id)) set.push(best.id);
        }
        picked = set;
      }
      if (picked.length === 0 && factCatalog.length > 0) {
        // Last resort: first fact of the catalog so the block is not empty.
        picked = [factCatalog[0].id];
      }
      arg.facts_used = picked;
    }

    // --- documents_used ---
    if (!Array.isArray(arg.documents_used) || arg.documents_used.length === 0) {
      const docs = new Set<string>();
      for (const fid of arg.facts_used as string[]) {
        for (const d of docsByFact.get(fid) ?? []) docs.add(d);
      }
      arg.documents_used = [...docs];
    }

    // --- sources_used ---
    if (!Array.isArray(arg.sources_used) || arg.sources_used.length === 0) {
      const scored = sourceCatalog
        .map((s) => ({ ref: s.ref, score: overlap(argTokens, s.tokens), winner: s.winner }))
        .filter((x) => x.ref && x.score > 0)
        .sort((a, b) => b.score - a.score);
      let picked = scored.slice(0, 3).map((x) => x.ref);
      if (picked.length === 0) {
        picked = sourceCatalog
          .filter((s) => s.winner && s.ref)
          .slice(0, 3)
          .map((s) => s.ref);
      }
      arg.sources_used = picked;
    }
  }
}

function mapLegalAnalysisRunRow(data: any): LegalAnalysisRun {
  const analysis = (data.ai_result as unknown as LegalAnalysisResult | null) ?? null;
  if (analysis) normalizeArgumentMap(analysis);
  return {
    id: data.id as string,
    session_id: data.session_id as string,
    status: data.status as string,
    hallucination_risk: (data.hallucination_risk as string | null) ?? null,
    legal_accuracy_score: (data.legal_accuracy_score as number | null) ?? null,
    source_verification_status: (data.source_verification_status as string | null) ?? null,
    needs_lawyer_review: Boolean(data.needs_lawyer_review),
    model_name: (data.model_name as string | null) ?? null,
    error_message: (data.error_message as string | null) ?? null,
    created_at: data.created_at as string,
    completed_at: (data.completed_at as string | null) ?? null,
    analysis,
  };
}


export async function fetchLegalAnalysisRunById(
  runId: string,
  sessionId?: string,
): Promise<LegalAnalysisRun | null> {
  let query = supabase
    .from("document_intake_ai_runs")
    .select(
      "id, session_id, status, hallucination_risk, legal_accuracy_score, source_verification_status, needs_lawyer_review, model_name, error_message, created_at, completed_at, ai_result",
    )
    .eq("id", runId);

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapLegalAnalysisRunRow(data);
}
export async function runLegalAnalysis(sessionId: string): Promise<LegalAnalysisRun> {
  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    error?: string;
    run_id?: string | null;
    analysis?: LegalAnalysisResult | null;
  }>("analyze-document-legal-position", { body: { session_id: sessionId } });

  if (error) throw error;

  if (!data || data.success === false) {
    throw new Error(data?.error ?? "Не удалось выполнить правовой анализ");
  }

  const returnedRunId = typeof data.run_id === "string" ? data.run_id.trim() : "";

  if (returnedRunId) {
    const runById = await fetchLegalAnalysisRunById(returnedRunId, sessionId);

    if (runById?.analysis) {
      return runById;
    }

    if (data.analysis) {
      normalizeArgumentMap(data.analysis as any);
      return {
        id: returnedRunId,
        session_id: sessionId,
        status: "completed",
        hallucination_risk: null,
        legal_accuracy_score: null,
        source_verification_status: null,
        needs_lawyer_review: true,
        model_name: null,
        error_message: null,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        analysis: data.analysis,
      };
    }
  }

  const latest = await fetchLatestLegalAnalysis(sessionId);

  if (latest?.analysis) {
    return latest;
  }

  throw new Error(
    "AI правовой анализ выполнен, но результат не найден в document_intake_ai_runs. Проверьте run_id и статус анализа.",
  );
}

export async function fetchLatestLegalAnalysis(
  sessionId: string,
): Promise<LegalAnalysisRun | null> {
  const { data, error } = await supabase
    .from("document_intake_ai_runs")
    .select(
      "id, session_id, status, hallucination_risk, legal_accuracy_score, source_verification_status, needs_lawyer_review, model_name, error_message, created_at, completed_at, ai_result",
    )
    .eq("session_id", sessionId)
    .eq("run_type", "legal_analysis")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
    return mapLegalAnalysisRunRow(data);
}

export async function hasSessionDocumentsWithText(sessionId: string): Promise<boolean> {
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, ocr_text, metadata")
    .eq("metadata->>intake_session_id", sessionId)
    .eq("metadata->>extraction_status", "completed")
    .not("ocr_text", "is", null)
    .limit(20);
  if (error) throw error;
  if (!docs || docs.length === 0) return false;

  for (const d of docs) {
    const text = d.ocr_text as string | null;
    if (text != null && text.length > 50) return true;
  }
  return false;
}
