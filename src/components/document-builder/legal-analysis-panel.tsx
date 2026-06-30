import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, ExternalLink, FileText } from "lucide-react";
import {
  fetchLatestLegalAnalysis,
  runLegalAnalysis,
  type LegalAnalysisRun,
} from "@/lib/legal-analysis";
import { buildCaseIntelligenceForSession } from "@/lib/case-intelligence";
import { supabase } from "@/integrations/supabase/client";
const ANALYSIS_METRIC_LABELS: Record<string, string> = {
  fns_found: "Материалы ФНС",
  laws_found: "Нормы законодательства",
  minfin_found: "Материалы Минфина",
  manuals_found: "Методические материалы",
  documents_used: "Использовано документов",
  documents_total: "Всего документов",
  documents_rejected: "Отклонено документов",
  ekaterina_found: "Практика Екатерины",
  court_practice_found: "Судебная практика",
  sources_raw: "Найдено источников",
  sources_winners: "Отобрано источников",
  sources_after_caps: "После ограничения",
  sources_after_dedupe: "После удаления дублей",
  sources_after_enrich: "После обогащения",
  sources_after_ranking: "После ранжирования",
  sources_used_by_model: "Использовано ИИ",
  semantic_enabled: "Семантический поиск",
  gap_retry_used: "Повторный поиск пробелов",
};

const ANALYSIS_STATUS_LABELS: Record<string, string> = {
  actual: "Актуально",
  outdated: "Устарело",
  unknown: "Не определено",
  needs_check: "Требует проверки",
  requires_actuality_check: "Требует проверки актуальности",
  requires_manual_verification: "Требует ручной проверки",
  missing_url: "Нет ссылки",
  passed: "Проверено",
  partial: "Частично",
};
type Props = {
  sessionId: string | null;
  onEnsureSession: () => Promise<string>;
};

export function LegalAnalysisPanel({ sessionId, onEnsureSession }: Props) {
  const [run, setRun] = useState<LegalAnalysisRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDocuments, setHasDocuments] = useState<boolean | null>(null);
  const [checkingDocs, setCheckingDocs] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refreshHasDocuments = useCallback(async (sid: string) => {
    setCheckingDocs(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("id, ocr_text, metadata")
        .filter("metadata->>intake_session_id", "eq", sid)
        .filter("metadata->>extraction_status", "eq", "completed")
        .not("ocr_text", "is", null);
      if (error) throw error;
      const ok = (data ?? []).some((doc) => {
        const text = ((doc.ocr_text as string | null) ?? "").trim();
        return text.length > 50;
      });
      if (aliveRef.current) setHasDocuments(ok);
    } catch {
      if (aliveRef.current) setHasDocuments(false);
    } finally {
      if (aliveRef.current) setCheckingDocs(false);
    }
  }, []);

  // Initial load + on sessionId change: fetch latest analysis and check docs
  useEffect(() => {
    if (!sessionId) {
      setRun(null);
      setHasDocuments(null);
      return;
    }
    setLoading(true);
    fetchLatestLegalAnalysis(sessionId)
      .then((r) => aliveRef.current && setRun(r))
      .catch((e) => aliveRef.current && setError((e as Error).message))
      .finally(() => aliveRef.current && setLoading(false));

    void refreshHasDocuments(sessionId);
  }, [sessionId, refreshHasDocuments]);

  // Realtime: re-check when documents table changes
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`legal-analysis-docs-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        () => {
          void refreshHasDocuments(sessionId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, refreshHasDocuments]);

  // Fallback polling while docs not yet detected
  useEffect(() => {
    if (!sessionId || hasDocuments === true) return;
    const t = setInterval(() => {
      void refreshHasDocuments(sessionId);
    }, 4000);
    return () => clearInterval(t);
  }, [sessionId, hasDocuments, refreshHasDocuments]);

  // Refresh on window focus / visibility change
  useEffect(() => {
    if (!sessionId) return;
    const onFocus = () => void refreshHasDocuments(sessionId);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [sessionId, refreshHasDocuments]);

  // Listen to custom event so other parts of the form can trigger a recheck
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId?: string }>).detail;
      const sid = detail?.sessionId ?? sessionId;
      if (sid) void refreshHasDocuments(sid);
    };
    window.addEventListener("intake-documents-updated", handler as EventListener);
    return () => window.removeEventListener("intake-documents-updated", handler as EventListener);
  }, [sessionId, refreshHasDocuments]);

    const handleRun = async () => {
    setError(null);
    setRunning(true);

    try {
      const id = sessionId ?? (await onEnsureSession());

      await refreshHasDocuments(id);

      try {
        await buildCaseIntelligenceForSession(id);
      } catch (caseIntelligenceError) {
        console.warn(
          "[case-intelligence] build before legal analysis failed",
          caseIntelligenceError,
        );
      }

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

  const canRun = hasDocuments === true;

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
                        {ANALYSIS_STATUS_LABELS[act.status] ?? act.status}
                      </span>
                    )}
                  </div>
                );
              })}
              {(!a.sources || a.sources.length === 0) && <Empty />}
            </div>
          </div>

          {a.documents_audit && (
            <div>
              <div className="db-section-label">Документы исследования</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="db-subcard text-xs">
                  <div className="font-semibold text-emerald-200 mb-1">Использованы ({a.documents_audit.used.length})</div>
                  {a.documents_audit.used.length === 0 ? <Empty /> : (
                    <ul className="space-y-1">
                      {a.documents_audit.used.map((d) => (
                        <li key={d.id} className="text-white/80">
                          {d.title} <span className="text-white/45">({d.ocr_length} симв.)</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="db-subcard text-xs">
                  <div className="font-semibold text-amber-200 mb-1">Не использованы ({a.documents_audit.rejected.length})</div>
                  {a.documents_audit.rejected.length === 0 ? <Empty /> : (
                    <ul className="space-y-1">
                      {a.documents_audit.rejected.map((d) => (
                        <li key={d.id} className="text-white/80">
                          {d.title} <span className="text-white/55">— {d.reason ?? "не определено"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {((a.rejected_laws?.length ?? 0) > 0 || (a.rejected_court_practice?.length ?? 0) > 0) && (
            <div>
              <div className="db-section-label">Отклонённые нормы и практика</div>
              <div className="mt-2 space-y-2">
                {(a.rejected_laws ?? []).map((r, i) => (
                  <div key={`rl-${i}`} className="db-subcard text-xs">
                    <div className="font-semibold text-white/85">{r.law}</div>
                    <div className="text-white/65">{r.reason}</div>
                  </div>
                ))}
                {(a.rejected_court_practice ?? []).map((r, i) => (
                  <div key={`rc-${i}`} className="db-subcard text-xs">
                    <div className="font-semibold text-white/85">{r.case}</div>
                    <div className="text-white/65">{r.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {a.research_summary && Object.keys(a.research_summary).length > 0 && (
            <div>
              <div className="db-section-label">Сводка исследования</div>
              <div className="mt-2 db-subcard text-[13px] flex flex-wrap gap-2">
      {Object.entries(a.research_summary).map(([k, v]) => (
       <span key={k} className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-white/80">
      {ANALYSIS_METRIC_LABELS[k] ?? k}: {String(v)}
      </span>
      ))}
      </div>
            </div>
          )}

          <ListSection title="Рекомендации" items={a.recommendations ?? []} />
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
