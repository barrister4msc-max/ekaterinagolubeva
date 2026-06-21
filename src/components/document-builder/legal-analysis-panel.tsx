import { useEffect, useState } from "react";
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, ExternalLink, FileText } from "lucide-react";
import {
  fetchLatestLegalAnalysis,
  runLegalAnalysis,
  hasSessionDocumentsWithText,
  type LegalAnalysisRun,
} from "@/lib/legal-analysis";

type Props = {
  sessionId: string | null;
  onEnsureSession: () => Promise<string>;
};

export function LegalAnalysisPanel({ sessionId, onEnsureSession }: Props) {
  const [run, setRun] = useState<LegalAnalysisRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDocs, setHasDocs] = useState<boolean | null>(null);
  const [checkingDocs, setCheckingDocs] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!sessionId) {
      setRun(null);
      setHasDocs(null);
      return;
    }
    setLoading(true);
    fetchLatestLegalAnalysis(sessionId)
      .then((r) => alive && setRun(r))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));

    setCheckingDocs(true);
    hasSessionDocumentsWithText(sessionId)
      .then((ok) => alive && setHasDocs(ok))
      .catch(() => alive && setHasDocs(false))
      .finally(() => alive && setCheckingDocs(false));

    return () => {
      alive = false;
    };
  }, [sessionId]);

  const handleRun = async () => {
    setError(null);
    setRunning(true);
    try {
      const id = sessionId ?? (await onEnsureSession());
      const result = await runLegalAnalysis(id);
      setRun(result);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "no_documents") {
        setError(
          "Сначала прикрепите документы. После извлечения текста запустите AI правовой анализ.",
        );
      } else {
        setError(msg);
      }
    } finally {
      setRunning(false);
    }
  };

  const a = run?.analysis;

  const canRun = hasDocs === true;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="db-section-label">Правовой анализ</div>
        <button
          type="button"
          onClick={handleRun}
          disabled={running || !canRun}
          className="db-cta"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {running ? "Анализ…" : run ? "Перезапустить AI правовой анализ" : "AI правовой анализ"}
        </button>
      </div>

      {!canRun && !checkingDocs && (
        <div className="mt-2 flex items-start gap-2 text-xs text-white/60">
          <FileText size={14} className="mt-0.5 shrink-0" />
          <span>Для правового анализа прикрепите документы с извлеченным текстом.</span>
        </div>
      )}

      {error && (
        <div className="db-warning mt-3 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {loading && !run && (
        <div className="mt-3 flex items-center gap-2 text-xs text-white/70">
          <Loader2 size={12} className="animate-spin" /> Загрузка предыдущего анализа…
        </div>
      )}

      {a && (
        <div className="mt-3 space-y-4">
          <div className="db-subcard">
            <div className="flex flex-wrap gap-2 text-[11px]">
              {run?.hallucination_risk && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${run.hallucination_risk === "low" ? "bg-white/10 text-white/80" : "bg-amber-500/20 text-amber-100"}`}>
                  риск: {run.hallucination_risk}
                </span>
              )}
              {run?.legal_accuracy_score != null && (
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-white/80">точность: {run.legal_accuracy_score}</span>
              )}
              {run?.source_verification_status && (
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-white/80">источники: {run.source_verification_status}</span>
              )}
              {run?.needs_lawyer_review && (
                <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-100">требуется проверка юриста</span>
              )}
              {run?.model_name && <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-white/80">{run.model_name}</span>}
            </div>
          </div>

          <Section title="Правовая квалификация" text={a.legal_qualification} />
          <Section title="Основная правовая позиция" text={a.main_legal_position} />

          <div className="grid gap-3 md:grid-cols-2">
            <Section title="Позиция клиента (налогоплательщика)" text={a.taxpayer_position} />
            <Section title="Позиция ФНС / оппонента" text={a.tax_authority_position} />
          </div>

          <ListSection title="Факты" items={a.facts} />

          <div>
            <div className="db-section-label">Применимые нормы</div>
            <div className="mt-2 space-y-2">
              {(a.applicable_laws ?? []).map((l, i) => (
                <div key={i} className="db-subcard text-xs">
                  <div className="font-semibold text-white/90">
                    {[l.code, l.article].filter(Boolean).join(" ")} {l.title ? `— ${l.title}` : ""}
                  </div>
                  {l.quote && <div className="mt-1 text-white/75">«{l.quote}»</div>}
                </div>
              ))}
              {(!a.applicable_laws || a.applicable_laws.length === 0) && <Empty />}
            </div>
          </div>

          <div>
            <div className="db-section-label">Факт → Норма → Вывод</div>
            <div className="mt-2 space-y-2">
              {(a.fact_to_law_mapping ?? []).map((m, i) => (
                <div key={i} className="db-subcard text-xs space-y-1">
                  <div><span className="text-white/55">Факт:</span> {m.fact}</div>
                  <div><span className="text-white/55">Норма:</span> {m.law}</div>
                  <div><span className="text-white/55">Обоснование:</span> {m.reasoning}</div>
                  <div><span className="text-white/55">Вывод:</span> {m.conclusion}</div>
                </div>
              ))}
              {(!a.fact_to_law_mapping || a.fact_to_law_mapping.length === 0) && <Empty />}
            </div>
          </div>

          <ListSection title="Контраргументы" items={a.counter_arguments} />
          <ListSection title="Слабые места" items={a.weak_points} />
          <ListSection title="Недостающие доказательства" items={a.missing_evidence} warn />

          <div>
            <div className="db-section-label">Риски</div>
            <div className="mt-2 space-y-2">
              {(a.risks ?? []).map((r, i) => (
                <div key={i} className="db-subcard text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={12} className="mt-0.5 text-amber-300" />
                    <div>
                      <div className="font-semibold text-white/90">
                        {r.risk}{" "}
                        {r.severity && <span className="text-white/55">[{r.severity}]</span>}
                      </div>
                      {r.mitigation && (
                        <div className="text-white/70">Смягчение: {r.mitigation}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(!a.risks || a.risks.length === 0) && <Empty />}
            </div>
          </div>

          <div>
            <div className="db-section-label">Источники</div>
            <div className="mt-2 space-y-2">
              {(a.sources ?? []).map((s, i) => {
                const act = a.source_actuality?.find((x) => x.source === s.title);
                return (
                  <div key={i} className="db-subcard text-xs flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-white/90">{s.title}</div>
                      {s.cited_for && <div className="text-white/65">для: {s.cited_for}</div>}
                      {s.url && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                        >
                          <ExternalLink size={10} /> {s.url}
                        </a>
                      )}
                    </div>
                    {act && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${act.status === "actual" ? "bg-emerald-500/20 text-emerald-100" : act.status === "outdated" ? "bg-amber-500/20 text-amber-100" : "bg-white/10 text-white/70"}`}
                      >
                        {act.status === "actual" ? (
                          <CheckCircle2 size={10} />
                        ) : (
                          <AlertTriangle size={10} />
                        )}{" "}
                        {act.status}
                      </span>
                    )}
                  </div>
                );
              })}
              {(!a.sources || a.sources.length === 0) && <Empty />}
            </div>
          </div>

          <ListSection title="Инструкции для генерации документа" items={a.generation_instructions} />
        </div>
      )}
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <div className="db-section-label">{title}</div>
      <div className="mt-2 db-subcard text-xs text-white/85 whitespace-pre-wrap">{text}</div>
    </div>
  );
}

function ListSection({ title, items, warn }: { title: string; items: string[]; warn?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="db-section-label">{title}</div>
      <ul className={`mt-2 list-disc pl-5 space-y-1 text-xs ${warn ? "text-amber-200" : "text-white/85"}`}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-white/55">—</div>;
}
