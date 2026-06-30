// Provenance Explorer — двусторонняя трассировка по matter_snapshot,
// записанному в generated_legal_documents.metadata.matter_snapshot.
//
// Не делает сетевых вызовов и не создаёт таблиц/Edge Functions.
// Использует существующие структуры:
//   - matter_snapshot.conclusions       (LegalAnalysisConclusion[])
//   - matter_snapshot.provenance_index  (source_to_conclusions, fact_to_conclusions)
//   - matter_snapshot.evidence_matrix   (per-fact)
//   - matter_snapshot.trusted_sources   (LegalAnalysisTrustedSource[])
//   - matter_snapshot.documents         (id/title/used)
//   - matter_snapshot.facts_index       (fact_id → text)
//   - matter_snapshot.source_warnings   (для отображения review_status)
//
// Reverse index: source_ref → conclusion_ids и document_id → conclusion_ids
// строятся локально из conclusion.provenance.*_used полей. Это исключает
// зависимость от полноты analysis.provenance_index.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trCaseLabel } from "@/lib/case-intelligence-i18n";
import {
  Network,
  FileText,
  BookOpen,
  Quote,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";
import type {
  LegalAnalysisConclusion,
  LegalAnalysisEvidenceMatrix,
  LegalAnalysisProvenanceIndex,
  LegalAnalysisTrustedSource,
  LegalAnalysisFactRecord,
  LegalAnalysisSourceWarning,
} from "@/lib/legal-analysis";
import { loadReviewMap, warningKey } from "@/lib/source-warning-reviews";

export type ProvenanceSnapshotInput = {
  legal_analysis_run_id?: string | null;
  conclusions?: LegalAnalysisConclusion[] | null;
  provenance_index?: LegalAnalysisProvenanceIndex | null;
  evidence_matrix?: LegalAnalysisEvidenceMatrix | null;
  trusted_sources?: LegalAnalysisTrustedSource[] | null;
  documents?: Array<{ id: string; title: string; used: boolean }> | null;
  facts_index?: LegalAnalysisFactRecord[] | null;
  source_warnings?: LegalAnalysisSourceWarning[] | null;
};

type Mode = "conclusions" | "facts" | "sources";

const MODE_LABEL: Record<Mode, string> = {
  conclusions: "Выводы",
  facts: "Факты",
  sources: "Источники / документы",
};

const PANEL = "rounded-xl border border-white/10 bg-slate-900/40";
const SUBPANEL = "rounded-lg border border-white/10 bg-slate-950/40 p-3";
const CHIP_BUTTON =
  "inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100 hover:bg-emerald-500/20";

function buildReverseIndices(conclusions: LegalAnalysisConclusion[]) {
  const sourceToConclusions = new Map<string, Set<string>>();
  const documentToConclusions = new Map<string, Set<string>>();
  const factToConclusions = new Map<string, Set<string>>();

  const push = (m: Map<string, Set<string>>, key: string, v: string) => {
    if (!key) return;
    let set = m.get(key);
    if (!set) {
      set = new Set();
      m.set(key, set);
    }
    set.add(v);
  };

  for (const c of conclusions) {
    const cid = c.conclusion_id;
    const p = c.provenance;
    for (const f of p?.facts_used ?? []) push(factToConclusions, f, cid);
    for (const d of p?.documents_used ?? []) push(documentToConclusions, d, cid);
    for (const s of p?.laws_used ?? []) push(sourceToConclusions, s, cid);
    for (const s of p?.court_practice_used ?? []) push(sourceToConclusions, s, cid);
    for (const s of p?.letters_used ?? []) push(sourceToConclusions, s, cid);
    for (const s of p?.ekaterina_used ?? []) push(sourceToConclusions, s, cid);
    for (const s of p?.manuals_used ?? []) push(sourceToConclusions, s, cid);
  }
  const toRecord = (m: Map<string, Set<string>>) =>
    Object.fromEntries([...m.entries()].map(([k, v]) => [k, [...v]]));
  return {
    sourceToConclusions: toRecord(sourceToConclusions),
    documentToConclusions: toRecord(documentToConclusions),
    factToConclusions: toRecord(factToConclusions),
  };
}

export function ProvenanceExplorer({ snapshot }: { snapshot: ProvenanceSnapshotInput | null }) {
  const [mode, setMode] = useState<Mode>("conclusions");
  const [selectedConclusion, setSelectedConclusion] = useState<string | null>(null);
  const [selectedFact, setSelectedFact] = useState<string | null>(null);
  const [selectedSourceRef, setSelectedSourceRef] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  const runId = snapshot?.legal_analysis_run_id ?? null;
  const reviewsQuery = useQuery({
    queryKey: ["source-warning-reviews", runId],
    queryFn: async () => (runId ? loadReviewMap(runId) : {}),
    enabled: !!runId,
  });
  const reviews = reviewsQuery.data ?? {};

  const conclusions = snapshot?.conclusions ?? [];
  const evidenceMatrix = snapshot?.evidence_matrix ?? [];
  const trustedSources = snapshot?.trusted_sources ?? [];
  const documents = snapshot?.documents ?? [];
  const factsIndex = snapshot?.facts_index ?? [];
  const sourceWarnings = snapshot?.source_warnings ?? [];

  const factTextById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of factsIndex) m.set(f.fact_id, f.text);
    for (const e of evidenceMatrix) if (!m.has(e.fact_id)) m.set(e.fact_id, e.fact_text);
    return m;
  }, [factsIndex, evidenceMatrix]);

  const sourceByRef = useMemo(() => {
    const m = new Map<string, LegalAnalysisTrustedSource>();
    for (const s of trustedSources) m.set(s.source_ref, s);
    return m;
  }, [trustedSources]);

  const documentById = useMemo(() => {
    const m = new Map<string, { id: string; title: string; used: boolean }>();
    for (const d of documents) m.set(d.id, d);
    return m;
  }, [documents]);

  const conclusionById = useMemo(() => {
    const m = new Map<string, LegalAnalysisConclusion>();
    for (const c of conclusions) m.set(c.conclusion_id, c);
    return m;
  }, [conclusions]);

  const reverse = useMemo(() => buildReverseIndices(conclusions), [conclusions]);

  // Prefer analysis.provenance_index for fact/source reverse maps when present.
  const sourceToConclusions = useMemo(() => {
    const fromIndex = snapshot?.provenance_index?.source_to_conclusions ?? {};
    return Object.keys(fromIndex).length > 0 ? fromIndex : reverse.sourceToConclusions;
  }, [snapshot, reverse]);
  const factToConclusions = useMemo(() => {
    const fromIndex = snapshot?.provenance_index?.fact_to_conclusions ?? {};
    return Object.keys(fromIndex).length > 0 ? fromIndex : reverse.factToConclusions;
  }, [snapshot, reverse]);
  const documentToConclusions = reverse.documentToConclusions;

  const warningBySourceRef = useMemo(() => {
    const m = new Map<string, LegalAnalysisSourceWarning[]>();
    for (const w of sourceWarnings) {
      const arr = m.get(w.source_ref) ?? [];
      arr.push(w);
      m.set(w.source_ref, arr);
    }
    return m;
  }, [sourceWarnings]);

  const jumpToConclusion = (cid: string) => {
    setMode("conclusions");
    setSelectedConclusion(cid);
    setSelectedFact(null);
    setSelectedSourceRef(null);
    setSelectedDocumentId(null);
  };
  const jumpToFact = (fid: string) => {
    setMode("facts");
    setSelectedFact(fid);
    setSelectedConclusion(null);
  };
  const jumpToSource = (ref: string) => {
    setMode("sources");
    setSelectedSourceRef(ref);
    setSelectedDocumentId(null);
  };
  const jumpToDocument = (id: string) => {
    setMode("sources");
    setSelectedDocumentId(id);
    setSelectedSourceRef(null);
  };

  if (!snapshot || (conclusions.length === 0 && evidenceMatrix.length === 0 && trustedSources.length === 0)) {
    return (
      <section className={`${PANEL} p-5`}>
        <div className="flex items-center gap-2 text-white">
          <Network size={16} />
          <h2 className="font-display text-lg">Происхождение выводов</h2>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Для этого документа нет Matter Snapshot / provenance_index. Сформируйте
          документ через новый AI-анализ.
        </p>
      </section>
    );
  }

  return (
    <section className={`${PANEL} p-5 space-y-3 text-sm text-slate-100`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-white">
          <Network size={16} />
          <h2 className="font-display text-lg">Происхождение выводов</h2>
        </div>
        <div className="flex items-center gap-1">
          {(["conclusions", "facts", "sources"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                mode === m
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {mode === "conclusions" && (
        <ConclusionsMode
          conclusions={conclusions}
          selectedConclusion={selectedConclusion}
          onSelectConclusion={setSelectedConclusion}
          factTextById={factTextById}
          sourceByRef={sourceByRef}
          documentById={documentById}
          onJumpFact={jumpToFact}
          onJumpSource={jumpToSource}
          onJumpDocument={jumpToDocument}
        />
      )}

      {mode === "facts" && (
        <FactsMode
          evidenceMatrix={evidenceMatrix}
          factsIndex={factsIndex}
          selectedFact={selectedFact}
          onSelectFact={setSelectedFact}
          factToConclusions={factToConclusions}
          conclusionById={conclusionById}
          documentById={documentById}
          onJumpConclusion={jumpToConclusion}
          onJumpDocument={jumpToDocument}
        />
      )}

      {mode === "sources" && (
        <SourcesMode
          trustedSources={trustedSources}
          documents={documents}
          selectedSourceRef={selectedSourceRef}
          selectedDocumentId={selectedDocumentId}
          onSelectSource={setSelectedSourceRef}
          onSelectDocument={setSelectedDocumentId}
          sourceToConclusions={sourceToConclusions}
          documentToConclusions={documentToConclusions}
          conclusionById={conclusionById}
          warningBySourceRef={warningBySourceRef}
          reviews={reviews}
          onJumpConclusion={jumpToConclusion}
        />
      )}
    </section>
  );
}

// ---------------- Conclusions Mode ----------------

function ConclusionsMode({
  conclusions,
  selectedConclusion,
  onSelectConclusion,
  factTextById,
  sourceByRef,
  documentById,
  onJumpFact,
  onJumpSource,
  onJumpDocument,
}: {
  conclusions: LegalAnalysisConclusion[];
  selectedConclusion: string | null;
  onSelectConclusion: (id: string) => void;
  factTextById: Map<string, string>;
  sourceByRef: Map<string, LegalAnalysisTrustedSource>;
  documentById: Map<string, { id: string; title: string; used: boolean }>;
  onJumpFact: (fid: string) => void;
  onJumpSource: (ref: string) => void;
  onJumpDocument: (id: string) => void;
}) {
  const current = conclusions.find((c) => c.conclusion_id === selectedConclusion) ?? conclusions[0];

  return (
    <div className="grid gap-3 md:grid-cols-[260px_1fr]">
      <div className="space-y-1.5">
        <div className="text-[14px] uppercase tracking-[0.18em] text-slate-400">Список выводов</div>
        <div className="space-y-1">
          {conclusions.map((c) => (
            <button
              key={c.conclusion_id}
              type="button"
              onClick={() => onSelectConclusion(c.conclusion_id)}
              className={`block w-full rounded-md border px-2 py-1.5 text-left text-[14px] ${
                current?.conclusion_id === c.conclusion_id
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-50"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              <div className="opacity-70">{c.kind}</div>
              <div className="line-clamp-2 break-words">{c.statement || c.conclusion_id}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {!current ? (
          <div className="text-slate-300 text-[14px]">Нет conclusion для отображения.</div>
        ) : (
          <ConclusionCard
            c={current}
            factTextById={factTextById}
            sourceByRef={sourceByRef}
            documentById={documentById}
            onJumpFact={onJumpFact}
            onJumpSource={onJumpSource}
            onJumpDocument={onJumpDocument}
          />
        )}
      </div>
    </div>
  );
}

function ConclusionCard({
  c,
  factTextById,
  sourceByRef,
  documentById,
  onJumpFact,
  onJumpSource,
  onJumpDocument,
}: {
  c: LegalAnalysisConclusion;
  factTextById: Map<string, string>;
  sourceByRef: Map<string, LegalAnalysisTrustedSource>;
  documentById: Map<string, { id: string; title: string; used: boolean }>;
  onJumpFact: (fid: string) => void;
  onJumpSource: (ref: string) => void;
  onJumpDocument: (id: string) => void;
}) {
  const p = c.provenance;
  return (
    <div className={SUBPANEL}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] uppercase tracking-[0.18em] text-slate-400">
  {trCaseLabel(c.kind)}
</div>
          <div className="text-sm text-white">{c.statement}</div>
        </div>
        <div className="text-right text-[14px] text-slate-400">
          <div>conf. {(p?.confidence ?? 0).toFixed(2)}</div>
          <div>{c.conclusion_id}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Section title={`Факты · ${p?.facts_used?.length ?? 0}`} icon={<Quote size={12} />}>
          {(p?.facts_used ?? []).map((fid) => (
            <button key={fid} type="button" className={CHIP_BUTTON} onClick={() => onJumpFact(fid)}>
              <ChevronRight size={10} /> {factTextById.get(fid)?.slice(0, 80) ?? fid}
            </button>
          ))}
        </Section>
        <Section title={`Документы · ${p?.documents_used?.length ?? 0}`} icon={<FileText size={12} />}>
          {(p?.documents_used ?? []).map((did) => (
            <button key={did} type="button" className={CHIP_BUTTON} onClick={() => onJumpDocument(did)}>
              <ChevronRight size={10} /> {documentById.get(did)?.title ?? did}
            </button>
          ))}
        </Section>
        <Section title={`Законы · ${p?.laws_used?.length ?? 0}`} icon={<BookOpen size={12} />}>
          {(p?.laws_used ?? []).map((ref) => (
            <SourceChip key={ref} ref_={ref} source={sourceByRef.get(ref)} onClick={() => onJumpSource(ref)} />
          ))}
        </Section>
        <Section title={`Практика · ${p?.court_practice_used?.length ?? 0}`} icon={<BookOpen size={12} />}>
          {(p?.court_practice_used ?? []).map((ref) => (
            <SourceChip key={ref} ref_={ref} source={sourceByRef.get(ref)} onClick={() => onJumpSource(ref)} />
          ))}
        </Section>
        <Section title={`Письма · ${p?.letters_used?.length ?? 0}`} icon={<BookOpen size={12} />}>
          {(p?.letters_used ?? []).map((ref) => (
            <SourceChip key={ref} ref_={ref} source={sourceByRef.get(ref)} onClick={() => onJumpSource(ref)} />
          ))}
        </Section>
        <Section title={`Екатерина · ${p?.ekaterina_used?.length ?? 0}`} icon={<BookOpen size={12} />}>
          {(p?.ekaterina_used ?? []).map((ref) => (
            <SourceChip key={ref} ref_={ref} source={sourceByRef.get(ref)} onClick={() => onJumpSource(ref)} />
          ))}
        </Section>
        <Section title={`Методички · ${p?.manuals_used?.length ?? 0}`} icon={<BookOpen size={12} />}>
          {(p?.manuals_used ?? []).map((ref) => (
            <SourceChip key={ref} ref_={ref} source={sourceByRef.get(ref)} onClick={() => onJumpSource(ref)} />
          ))}
        </Section>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 text-[14px] text-slate-300">
        <div className={SUBPANEL}>
          <div className="text-slate-400">Trust summary</div>
          <div>min: {p?.trust_summary?.min_trust_score ?? "—"}</div>
          <div>avg (weighted): {p?.trust_summary?.weighted_avg ?? "—"}</div>
          <div>lowest: {p?.trust_summary?.lowest_source ?? "—"}</div>
        </div>
        <div className={SUBPANEL}>
          <div className="text-slate-400">Sufficiency</div>
          <div>Статус: {trCaseLabel(p?.sufficiency?.status ?? "—")}</div>
          <div className="opacity-80">{p?.sufficiency?.reason ?? ""}</div>
          <div className="mt-1">derivation: {p?.derivation ?? "—"}</div>
          {p?.provenance_missing && (
            <div className="mt-1 text-rose-200">⚠ provenance_missing</div>
          )}
          {p?.hallucinated_source && (
            <div className="mt-1 text-rose-200">⚠ hallucinated_source</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={SUBPANEL}>
      <div className="mb-1 flex items-center gap-1 text-[14px] uppercase tracking-[0.18em] text-slate-400">
        {icon} {title}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function SourceChip({
  ref_,
  source,
  onClick,
}: {
  ref_: string;
  source: LegalAnalysisTrustedSource | undefined;
  onClick: () => void;
}) {
  return (
    <button type="button" className={CHIP_BUTTON} onClick={onClick} title={ref_}>
      <ChevronRight size={10} />
      {source?.title ?? ref_}
      {source && (
        <span className="ml-1 opacity-70">[{source.trust_score}]</span>
      )}
    </button>
  );
}

// ---------------- Facts Mode ----------------

function FactsMode({
  evidenceMatrix,
  factsIndex,
  selectedFact,
  onSelectFact,
  factToConclusions,
  conclusionById,
  documentById,
  onJumpConclusion,
  onJumpDocument,
}: {
  evidenceMatrix: LegalAnalysisEvidenceMatrix;
  factsIndex: LegalAnalysisFactRecord[];
  selectedFact: string | null;
  onSelectFact: (fid: string) => void;
  factToConclusions: Record<string, string[]>;
  conclusionById: Map<string, LegalAnalysisConclusion>;
  documentById: Map<string, { id: string; title: string; used: boolean }>;
  onJumpConclusion: (cid: string) => void;
  onJumpDocument: (id: string) => void;
}) {
  const facts = useMemo(() => {
    if (evidenceMatrix.length > 0) return evidenceMatrix;
    return factsIndex.map((f) => ({
      fact_id: f.fact_id,
      fact_text: f.text,
      documents: [] as string[],
      conclusions: factToConclusions[f.fact_id] ?? [],
      evidence_status: "missing" as const,
      evidence_strength: 0,
    }));
  }, [evidenceMatrix, factsIndex, factToConclusions]);

  const current = facts.find((f) => f.fact_id === selectedFact) ?? facts[0];

  if (!current) {
    return <div className="text-[14px] text-slate-300">Факты отсутствуют в snapshot.</div>;
  }

  const usedInConclusions = current.conclusions?.length
    ? current.conclusions
    : factToConclusions[current.fact_id] ?? [];

  return (
    <div className="grid gap-3 md:grid-cols-[260px_1fr]">
      <div className="space-y-1.5">
        <div className="text-[14px] uppercase tracking-[0.18em] text-slate-400">Список фактов</div>
        <div className="space-y-1">
          {facts.map((f) => (
            <button
              key={f.fact_id}
              type="button"
              onClick={() => onSelectFact(f.fact_id)}
              className={`block w-full rounded-md border px-2 py-1.5 text-left text-[14px] ${
                current.fact_id === f.fact_id
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-50"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              <div className="opacity-70">{f.fact_id}</div>
              <div className="line-clamp-2 break-words">{f.fact_text}</div>
              <div className="mt-1 opacity-60">
                Доказательство: {trCaseLabel(f.evidence_status)} · Сила: {f.evidence_strength}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={`${SUBPANEL} space-y-3`}>
        <div>
          <div className="text-[14px] uppercase tracking-[0.18em] text-slate-400">{current.fact_id}</div>
          <div className="text-sm text-white">{current.fact_text}</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 text-[11px] text-slate-300">
          <div className={SUBPANEL}>
            <div className="text-slate-400">Evidence</div>
            <div>status: {current.evidence_status}</div>
            <div>Статус: {trCaseLabel(current.evidence_status)}</div>
          </div>
          <div className={SUBPANEL}>
            <div className="text-slate-400">Документы</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(current.documents ?? []).length === 0 && <span className="opacity-60">—</span>}
              {(current.documents ?? []).map((did) => (
                <button key={did} type="button" className={CHIP_BUTTON} onClick={() => onJumpDocument(did)}>
                  <ChevronRight size={10} /> {documentById.get(did)?.title ?? did}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Section title={`Используется в выводах · ${usedInConclusions.length}`}>
          {usedInConclusions.length === 0 && <span className="text-[11px] text-slate-400">—</span>}
          {usedInConclusions.map((cid) => (
            <button key={cid} type="button" className={CHIP_BUTTON} onClick={() => onJumpConclusion(cid)}>
              <ChevronRight size={10} />
              {conclusionById.get(cid)?.statement?.slice(0, 80) ?? cid}
            </button>
          ))}
        </Section>
      </div>
    </div>
  );
}

// ---------------- Sources Mode ----------------

function SourcesMode({
  trustedSources,
  documents,
  selectedSourceRef,
  selectedDocumentId,
  onSelectSource,
  onSelectDocument,
  sourceToConclusions,
  documentToConclusions,
  conclusionById,
  warningBySourceRef,
  reviews,
  onJumpConclusion,
}: {
  trustedSources: LegalAnalysisTrustedSource[];
  documents: Array<{ id: string; title: string; used: boolean }>;
  selectedSourceRef: string | null;
  selectedDocumentId: string | null;
  onSelectSource: (ref: string) => void;
  onSelectDocument: (id: string) => void;
  sourceToConclusions: Record<string, string[]>;
  documentToConclusions: Record<string, string[]>;
  conclusionById: Map<string, LegalAnalysisConclusion>;
  warningBySourceRef: Map<string, LegalAnalysisSourceWarning[]>;
  reviews: Record<string, { status: string; comment: string }>;
  onJumpConclusion: (cid: string) => void;
}) {
  const currentSourceRef = selectedSourceRef ?? trustedSources[0]?.source_ref ?? null;
  const currentDocId = selectedDocumentId;
  const currentSource = trustedSources.find((s) => s.source_ref === currentSourceRef) ?? null;
  const currentDoc = documents.find((d) => d.id === currentDocId) ?? null;

  return (
    <div className="grid gap-3 md:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <div>
          <div className="text-[14px] uppercase tracking-[0.18em] text-slate-400">Источники</div>
          <div className="mt-1 space-y-1 max-h-[320px] overflow-y-auto pr-1">
            {trustedSources.map((s) => (
              <button
                key={s.source_ref}
                type="button"
                onClick={() => {
                  onSelectSource(s.source_ref);
                  onSelectDocument("");
                }}
                className={`block w-full rounded-md border px-2 py-1.5 text-left text-[14px] ${
                  currentSourceRef === s.source_ref && !currentDocId
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-50"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <div className="line-clamp-2 break-words">{s.title || s.source_ref}</div>
                <div className="mt-0.5 opacity-60">
                  {s.source_type} · trust {s.trust_score}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[14px] uppercase tracking-[0.18em] text-slate-400">Документы клиента</div>
          <div className="mt-1 space-y-1 max-h-[200px] overflow-y-auto pr-1">
            {documents.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  onSelectDocument(d.id);
                  onSelectSource("");
                }}
                className={`block w-full rounded-md border px-2 py-1.5 text-left text-[14px] ${
                  currentDocId === d.id
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-50"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <div className="line-clamp-2 break-words">{d.title}</div>
                <div className="mt-0.5 opacity-60">{d.used ? "used" : "rejected"}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`${SUBPANEL} space-y-3`}>
        {currentDoc ? (
          <DocumentCard
            doc={currentDoc}
            conclusionIds={documentToConclusions[currentDoc.id] ?? []}
            conclusionById={conclusionById}
            onJumpConclusion={onJumpConclusion}
          />
        ) : currentSource ? (
          <SourceCard
            source={currentSource}
            conclusionIds={sourceToConclusions[currentSource.source_ref] ?? []}
            conclusionById={conclusionById}
            warnings={warningBySourceRef.get(currentSource.source_ref) ?? []}
            reviews={reviews}
            onJumpConclusion={onJumpConclusion}
          />
        ) : (
          <div className="text-[14px] text-slate-300">Выберите источник или документ слева.</div>
        )}
      </div>
    </div>
  );
}

function SourceCard({
  source,
  conclusionIds,
  conclusionById,
  warnings,
  reviews,
  onJumpConclusion,
}: {
  source: LegalAnalysisTrustedSource;
  conclusionIds: string[];
  conclusionById: Map<string, LegalAnalysisConclusion>;
  warnings: LegalAnalysisSourceWarning[];
  reviews: Record<string, { status: string; comment: string }>;
  onJumpConclusion: (cid: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[14px] uppercase tracking-[0.18em] text-slate-400">
          {source.source_type} · {source.bucket}
        </div>
        <div className="text-sm text-white">{source.title}</div>
        <div className="mt-0.5 break-all text-[14px] text-slate-400">{source.source_ref}</div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-[14px] text-slate-300">
        <div className={SUBPANEL}>
          <Row label="trust_score" value={source.trust_score} />
          <Row label="trust_reason" value={source.trust_reason} />
          <Row label="use_in_generation" value={source.use_in_generation ? "yes" : "no"} />
          <Row label="actually_used" value={source.actually_used_in_generation ? "yes" : "no"} />
        </div>
        <div className={SUBPANEL}>
          <Row label="is_winner" value={source.is_winner ? "yes" : "no"} />
          <Row label="superseded_by" value={source.superseded_by ?? "—"} />
          <Row label="lower_priority_reason" value={source.lower_priority_reason ?? "—"} />
          <Row
  label={trCaseLabel("actuality_status")}
  value={trCaseLabel(source.actuality_status)}
/>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className={`${SUBPANEL} space-y-1`}>
          <div className="text-[14px] uppercase tracking-[0.18em] text-slate-400">
            Предупреждения по источнику · Статус проверки
          </div>
          {warnings.map((w) => {
            const rev = reviews[warningKey(w)];
            const Icon =
              rev?.status === "accepted" ? CheckCircle2 : rev?.status === "rejected" ? XCircle : AlertTriangle;
            const color =
              rev?.status === "accepted"
                ? "text-emerald-300"
                : rev?.status === "rejected"
                  ? "text-rose-300"
                  : "text-amber-300";
            return (
              <div key={`${w.source_ref}::${w.warning_type}`} className="flex items-start gap-2 text-[14px]">
                <Icon size={12} className={`${color} mt-0.5`} />
                <div className="flex-1">
                  <div>
                    <span className="opacity-70">{w.warning_type}: </span>
                    {w.message}
                  </div>
                  <div className="opacity-70">
                    Статус проверки:
<span className={color}>
  {trCaseLabel(rev?.status ?? "pending")}
</span>
                    {rev?.comment && <> · «{rev.comment}»</>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Section title={`Используется в выводах · ${conclusionIds.length}`}>
        {conclusionIds.length === 0 && <span className="text-[11px] text-slate-400">—</span>}
        {conclusionIds.map((cid) => (
          <button key={cid} type="button" className={CHIP_BUTTON} onClick={() => onJumpConclusion(cid)}>
            <ChevronRight size={10} />
            {conclusionById.get(cid)?.statement?.slice(0, 80) ?? cid}
          </button>
        ))}
      </Section>
    </div>
  );
}

function DocumentCard({
  doc,
  conclusionIds,
  conclusionById,
  onJumpConclusion,
}: {
  doc: { id: string; title: string; used: boolean };
  conclusionIds: string[];
  conclusionById: Map<string, LegalAnalysisConclusion>;
  onJumpConclusion: (cid: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[14px] uppercase tracking-[0.18em] text-slate-400">
          Документ клиента · {doc.used ? "used" : "rejected"}
        </div>
        <div className="text-sm text-white">{doc.title}</div>
        <div className="mt-0.5 break-all text-[14px] text-slate-400">{doc.id}</div>
      </div>
      <Section title={`Используется в выводах · ${conclusionIds.length}`}>
        {conclusionIds.length === 0 && <span className="text-[11px] text-slate-400">—</span>}
        {conclusionIds.map((cid) => (
          <button key={cid} type="button" className={CHIP_BUTTON} onClick={() => onJumpConclusion(cid)}>
            <ChevronRight size={10} />
            {conclusionById.get(cid)?.statement?.slice(0, 80) ?? cid}
          </button>
        ))}
      </Section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="opacity-70">{label}</span>
      <span className="text-right break-all">{String(value)}</span>
    </div>
  );
}
