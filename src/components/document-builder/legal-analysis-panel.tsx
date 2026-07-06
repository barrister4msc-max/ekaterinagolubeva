import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, ExternalLink, FileText } from "lucide-react";
import {
  fetchLatestLegalAnalysis,
  runLegalAnalysis,
  saveLawyerStrategyOverride,
  type LegalAnalysisRun,
  type LegalAnalysisLawyerStrategyOverride,
} from "@/lib/legal-analysis";
import { buildCaseIntelligenceForSession } from "@/lib/case-intelligence";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";

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

const ARGUMENT_KIND_LABELS: Record<string, string> = {
  qualification: "Правовая квалификация",
  main_position: "Основная правовая позиция",
  client_position: "Позиция налогоплательщика",
  taxpayer_position: "Позиция налогоплательщика",
  opponent_position: "Позиция ФНС",
  tax_authority_position: "Позиция ФНС",
  fact_to_law: "Связь факта с нормой права",
  counter_argument: "Контраргумент",
  weak_point: "Слабое место позиции",
  recommendation: "Рекомендация",
  risk: "Юридический риск",
  generation_instruction: "Инструкция для формирования документа",
};

const EVIDENCE_STRENGTH_LABELS: Record<string, string> = {
  high: "Высокая",
  medium: "Средняя",
  low: "Низкая",
};

const SUPPORT_LEVEL_LABELS: Record<string, string> = {
  full: "Полное",
  strong: "Полное",
  partial: "Частичное",
  none: "Не подтверждено",
  unsupported: "Не подтверждено",
  weak: "Не подтверждено",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "Высокая",
  medium: "Средняя",
  low: "Низкая",
};

const HALLUCINATION_RISK_LABELS: Record<string, string> = {
  low: "низкий",
  medium: "средний",
  high: "высокий",
};

const STRATEGY_LABELS: Record<string, string> = {
  strategy_a_real_operation: "Полная защита реальности операции",
  strategy_b_tax_reconstruction: "Налоговая реконструкция",
  strategy_c_high_risk_collect_evidence: "Высокий риск: сбор доказательств",
  strategy_primary_defense: "Основная защита",
  strategy_c_risk_minimization: "Минимизация рисков",
  strategy_court: "Судебная защита",
  strategy_settlement: "Досудебное урегулирование",
};

function humanize(v: string): string {
  return v
    .replace(/^strategy_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function labelStrategy(id: string): string {
  return STRATEGY_LABELS[id] ?? humanize(id);
}

function labelArgumentKind(k: string): string {
  return ARGUMENT_KIND_LABELS[k] ?? humanize(k);
}

function labelEvidence(s: string | null | undefined): string {
  if (!s) return "—";
  return EVIDENCE_STRENGTH_LABELS[s] ?? humanize(s);
}

function labelSupport(s: string | null | undefined): string {
  if (!s) return "—";
  return SUPPORT_LEVEL_LABELS[s] ?? humanize(s);
}

function labelConfidence(s: string | null | undefined): string {
  if (!s) return "—";
  return CONFIDENCE_LABELS[s] ?? humanize(s);
}

const GREEN = "bg-emerald-500/20 text-emerald-100";
const YELLOW = "bg-amber-500/20 text-amber-100";
const RED = "bg-red-500/20 text-red-200";
const NEUTRAL = "bg-white/10 text-white/80";

function evidenceTone(s: string | null | undefined): string {
  if (s === "high") return GREEN;
  if (s === "medium") return YELLOW;
  if (s === "low") return RED;
  return NEUTRAL;
}

function supportTone(s: string | null | undefined): string {
  if (s === "full" || s === "strong") return GREEN;
  if (s === "partial") return YELLOW;
  if (s === "none" || s === "unsupported" || s === "weak") return RED;
  return NEUTRAL;
}
type Props = {
  sessionId: string | null;
  onEnsureSession: () => Promise<string>;
};

export function LegalAnalysisPanel({ sessionId, onEnsureSession }: Props) {
  const { user } = useAuth();
  const [run, setRun] = useState<LegalAnalysisRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDocuments, setHasDocuments] = useState<boolean | null>(null);
  const [checkingDocs, setCheckingDocs] = useState(false);
  const [selectedStrategyOverrideId, setSelectedStrategyOverrideId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideSavedAt, setOverrideSavedAt] = useState<string | null>(null);
  const [overrideSavedBy, setOverrideSavedBy] = useState<string | null>(null);
  const [savedOverrideId, setSavedOverrideId] = useState<string | null>(null);
  const [savedOverrideReason, setSavedOverrideReason] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
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
      .then((r) => {
        if (!aliveRef.current) return;
        setRun(r);
        const ov = (r?.analysis as any)?.lawyer_strategy_override as
          | LegalAnalysisLawyerStrategyOverride
          | null
          | undefined;
        if (ov && ov.strategy_id) {
          setSelectedStrategyOverrideId(ov.strategy_id);
          setSavedOverrideId(ov.strategy_id);
          setOverrideReason(ov.reason ?? "");
          setSavedOverrideReason(ov.reason ?? "");
          setOverrideSavedAt(ov.selected_at ?? null);
          setOverrideSavedBy(ov.selected_by ?? null);
        } else {
          setSelectedStrategyOverrideId(null);
          setSavedOverrideId(null);
          setOverrideReason("");
          setSavedOverrideReason("");
          setOverrideSavedAt(null);
          setOverrideSavedBy(null);
        }
      })
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
                  риск: {HALLUCINATION_RISK_LABELS[run.hallucination_risk] ?? run.hallucination_risk}
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
          {(() => {
            const argMap = (a as unknown as { argument_map?: Array<Record<string, any>> }).argument_map;
            if (!argMap?.length) return null;
            return (
              <div>
                <div className="db-section-label">Аргументация и доказательная база</div>
                <div className="mt-2 db-subcard space-y-3">
                  {argMap.slice(0, 12).map((arg, idx) => {
                    const allowed = !!arg.use_in_generation;
                    return (
                      <div
                        key={arg.argument_id ?? idx}
                        className="rounded-lg border border-white/10 bg-white/5 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-white font-semibold">
                            {labelArgumentKind(String(arg.kind ?? ""))}
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${allowed ? GREEN : RED}`}
                          >
                            {allowed ? "Разрешено к использованию" : "Запрещено к использованию"}
                          </span>
                        </div>

                        {arg.argument && (
                          <div className="mt-2 text-sm text-white/85 whitespace-pre-wrap">
                            {arg.argument}
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 ${evidenceTone(arg.evidence_strength)}`}
                          >
                            Доказательная сила: {labelEvidence(arg.evidence_strength)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 ${supportTone(arg.support_level)}`}
                          >
                            Подтверждение: {labelSupport(arg.support_level)}
                          </span>
                        </div>

                        {!allowed && arg.blocked_reason && (
                          <div className="mt-2 text-xs text-red-200">
                            <span className="font-semibold">Причина блокировки:</span>{" "}
                            {arg.blocked_reason}
                          </div>
                        )}

                        <div className="mt-3 text-[11px] text-white/60">
                          <div className="font-semibold text-white/70 mb-1">Основано на:</div>
                          <div className="flex flex-wrap gap-3">
                            <span>Фактов: {arg.facts_used?.length ?? 0}</span>
                            <span>Документов: {arg.documents_used?.length ?? 0}</span>
                            <span>Юридических источников: {arg.sources_used?.length ?? 0}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
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
          {(() => {
            const re = (a as unknown as {
              reasoning_engine?: {
                selected_strategy_id?: string;
                strategy_summary?: string;
                reasoning_quality?: string;
                explanation?: string;
                considered_positions?: Array<Record<string, any>>;
              };
            }).reasoning_engine;
            if (!re) return null;
            const aiSelectedId = String(re.selected_strategy_id ?? "");
            const positions = re.considered_positions ?? [];
            const aiPosition = positions.find((p) => String(p.id) === aiSelectedId);
            const overrideId = selectedStrategyOverrideId;
            const overridePosition = overrideId
              ? positions.find((p) => String(p.id) === overrideId)
              : null;
            const activeId = overrideId ?? aiSelectedId;

            const AI_BADGE = "bg-indigo-500/25 text-indigo-100 border border-indigo-300/30";
            const LAWYER_BADGE = "bg-emerald-500/25 text-emerald-100 border border-emerald-300/30";
            const ALT_BADGE = "bg-white/10 text-white/70 border border-white/15";

            return (
              <div>
                <div className="db-section-label">Логика выбора правовой позиции</div>
                <div className="mt-2 db-subcard space-y-5">
                  {/* Выбор AI */}
                  <div className="rounded-lg border border-indigo-300/20 bg-indigo-500/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-white font-semibold">Выбор AI</div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${AI_BADGE}`}>
                        Выбрано AI
                      </span>
                    </div>
                    <div className="mt-2 text-indigo-100">
                      {labelStrategy(aiSelectedId)}
                    </div>
                    {aiPosition?.why_selected && (
                      <div className="mt-2 text-sm text-white/80">
                        <span className="font-semibold">Причина выбора:</span> {aiPosition.why_selected}
                      </div>
                    )}
                    {!aiPosition?.why_selected && re.explanation && (
                      <div className="mt-2 text-sm text-white/80 whitespace-pre-wrap">
                        <span className="font-semibold">Причина выбора:</span> {re.explanation}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/70">
                      {typeof aiPosition?.score === "number" && (
                        <span>Оценка: {(aiPosition.score * 100).toFixed(0)}%</span>
                      )}
                      {aiPosition?.confidence && (
                        <span>Уверенность: {labelConfidence(aiPosition.confidence)}</span>
                      )}
                    </div>
                  </div>

                  {/* Warning: AI reran and changed strategy after lawyer override */}
                  {savedOverrideId && savedOverrideId !== aiSelectedId && (
                    <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100 flex items-start gap-2">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <div>
                        Юрист ранее изменил стратегию вручную ({labelStrategy(savedOverrideId)}).
                        AI сейчас предлагает: {labelStrategy(aiSelectedId)}. Проверьте актуальность выбора.
                      </div>
                    </div>
                  )}

                  {/* Выбор юриста */}
                  <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-white font-semibold">Выбор юриста</div>
                      {overridePosition && (
                        <button
                          type="button"
                          onClick={() => setSelectedStrategyOverrideId(null)}
                          className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-white/85 hover:bg-white/15"
                        >
                          Сбросить к выбору AI
                        </button>
                      )}
                    </div>
                    {overridePosition ? (
                      <div className="mt-2">
                        <div className="text-emerald-100">Юрист выбрал другую стратегию.</div>
                        <div className="mt-1 text-white font-medium">
                          {overridePosition.title ?? labelStrategy(String(overridePosition.id ?? ""))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-white/75 text-sm">
                        Юрист пока не изменял стратегию. Используется стратегия AI.
                      </div>
                    )}

                    <div className="mt-3 space-y-1">
                      <label className="text-[11px] text-white/70">
                        Причина изменения стратегии (необязательно)
                      </label>
                      <Textarea
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Например: выбрана судебная защита вместо налоговой реконструкции, поскольку получены новые доказательства."
                        rows={3}
                        className="bg-white/5 border-white/15 text-white/90 placeholder:text-white/40"
                      />
                    </div>

                    {(() => {
                      const dirty =
                        (selectedStrategyOverrideId ?? null) !== (savedOverrideId ?? null) ||
                        overrideReason.trim() !== savedOverrideReason.trim();
                      if (!dirty) {
                        return savedOverrideId ? (
                          <div className="mt-3 text-[11px] text-white/60">
                            Сохранено{overrideSavedAt ? ` • ${new Date(overrideSavedAt).toLocaleString("ru-RU")}` : ""}
                            {overrideSavedBy ? ` • юрист ${overrideSavedBy.slice(0, 8)}` : ""}
                          </div>
                        ) : null;
                      }
                      return (
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={savingOverride || !run?.id}
                            onClick={async () => {
                              if (!run?.id) return;
                              setSaveError(null);
                              setSavingOverride(true);
                              try {
                                const nextOverride: LegalAnalysisLawyerStrategyOverride | null =
                                  selectedStrategyOverrideId
                                    ? {
                                        strategy_id: selectedStrategyOverrideId,
                                        ai_strategy_id: aiSelectedId || null,
                                        selected_at: new Date().toISOString(),
                                        selected_by: user?.id ?? null,
                                        reason: overrideReason.trim(),
                                      }
                                    : null;
                                await saveLawyerStrategyOverride(run.id, nextOverride);
                                setSavedOverrideId(nextOverride?.strategy_id ?? null);
                                setSavedOverrideReason(nextOverride?.reason ?? "");
                                setOverrideSavedAt(nextOverride?.selected_at ?? null);
                                setOverrideSavedBy(nextOverride?.selected_by ?? null);
                                // Reflect in-memory analysis so downstream reads see it
                                setRun((prev) =>
                                  prev && prev.analysis
                                    ? {
                                        ...prev,
                                        analysis: {
                                          ...prev.analysis,
                                          lawyer_strategy_override: nextOverride,
                                        } as any,
                                      }
                                    : prev,
                                );
                              } catch (e) {
                                setSaveError((e as Error).message);
                              } finally {
                                setSavingOverride(false);
                              }
                            }}
                            className="db-cta"
                          >
                            {savingOverride ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {savingOverride ? "Сохранение…" : "Сохранить выбор юриста"}
                          </button>
                          {saveError && (
                            <span className="text-[11px] text-red-300">{saveError}</span>
                          )}
                        </div>
                      );
                    })()}

                    <div className="mt-3 text-[11px] text-white/55">
                      Ручной выбор стратегии не меняет исходный AI-анализ. Выбор юриста сохраняется в деле и используется при генерации документа.
                    </div>
                  </div>

                  {/* История изменений стратегии */}
                  {(() => {
                    const history = ((a as any).lawyer_strategy_history ?? []) as Array<{
                      changed_at: string;
                      changed_by: string | null;
                      reason: string;
                      previous_strategy_id: string | null;
                      new_strategy_id: string | null;
                    }>;
                    if (history.length === 0) return null;
                    return (
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-white font-semibold text-sm">История изменений стратегии</div>
                        <ol className="mt-2 space-y-2 text-xs text-white/80">
                          {[...history].reverse().map((h, i) => (
                            <li key={i} className="rounded-md border border-white/10 bg-white/5 p-2">
                              <div className="flex flex-wrap gap-2 text-[11px] text-white/60">
                                <span>{new Date(h.changed_at).toLocaleString("ru-RU")}</span>
                                {h.changed_by && <span>• юрист {h.changed_by.slice(0, 8)}</span>}
                              </div>
                              <div className="mt-1">
                                {h.previous_strategy_id ? labelStrategy(h.previous_strategy_id) : "—"}
                                {" → "}
                                <span className="text-emerald-200">
                                  {h.new_strategy_id ? labelStrategy(h.new_strategy_id) : "сброшено к AI"}
                                </span>
                              </div>
                              {h.reason && (
                                <div className="mt-1 text-white/75 whitespace-pre-wrap">
                                  <span className="text-white/55">Причина: </span>
                                  {h.reason}
                                </div>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  })()}




                  {/* Выбранная стратегия (итог) */}
                  <div>
                    <div className="text-white font-semibold">Выбранная стратегия</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-emerald-300">
                        {labelStrategy(String(activeId))}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${overrideId ? LAWYER_BADGE : AI_BADGE}`}
                      >
                        {overrideId ? "Выбрано юристом" : "Выбрано AI"}
                      </span>
                    </div>
                    {overrideId && (
                      <div className="mt-1 text-xs text-white/60">
                        Первоначальный выбор AI: {labelStrategy(aiSelectedId)}
                      </div>
                    )}
                    {re.strategy_summary && !overrideId && (
                      <div className="mt-2 text-white/80 whitespace-pre-wrap">
                        {re.strategy_summary}
                      </div>
                    )}
                    {re.reasoning_quality && (
                      <div className="mt-2 text-xs text-white/60">
                        Качество рассуждений: {labelConfidence(re.reasoning_quality)}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {positions.map((p, idx) => {
                      const pid = String(p.id ?? "");
                      const isAi = pid === aiSelectedId;
                      const isLawyer = !!overrideId && pid === overrideId;
                      const badgeCls = isLawyer ? LAWYER_BADGE : isAi ? AI_BADGE : ALT_BADGE;
                      const badgeText = isLawyer
                        ? "Выбрано юристом"
                        : isAi
                          ? "Выбрано AI"
                          : "Альтернативная стратегия";
                      return (
                        <div
                          key={p.id ?? idx}
                          className="rounded-lg border border-white/10 p-3 bg-white/5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-white">
                              {p.title ?? labelStrategy(pid)}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${badgeCls}`}>
                                {badgeText}
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/70">
                            <span>Уверенность модели: {labelConfidence(p.confidence)}</span>
                            <span>Подтверждённых аргументов: {p.argument_count ?? 0}</span>
                            <span>Неподтверждённых выводов: {p.blocked_argument_count ?? 0}</span>
                          </div>

                          {isAi
                            ? p.why_selected && (
                                <div className="mt-3 text-sm text-emerald-200">
                                  <span className="font-semibold">Основание выбора:</span>{" "}
                                  {p.why_selected}
                                </div>
                              )
                            : p.why_not_selected && (
                                <div className="mt-3 text-sm text-amber-200">
                                  <span className="font-semibold">Причина отклонения:</span>{" "}
                                  {p.why_not_selected}
                                </div>
                              )}

                          <div className="mt-3">
                            {isLawyer ? (
                              <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] ${LAWYER_BADGE}`}>
                                Выбрано юристом
                              </span>
                            ) : isAi && !overrideId ? (
                              <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] ${AI_BADGE}`}>
                                Используется AI
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSelectedStrategyOverrideId(pid)}
                                className="inline-flex items-center rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] text-white/90 hover:bg-white/15"
                              >
                                Выбрать эту стратегию
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {(() => {
            const argMap = ((a as any).argument_map ?? []) as Array<Record<string, any>>;
            if (!argMap.length) return null;

            const factsIndex = ((a as any).facts_index ?? []) as Array<{ fact_id: string; text: string }>;
            const factById = new Map(factsIndex.map((f) => [f.fact_id, f.text]));

            const evidenceMatrix = ((a as any).evidence_matrix ?? []) as Array<{
              fact_id: string;
              fact_text: string;
              documents: string[];
              evidence_status: string;
              evidence_strength: number;
            }>;
            const evByFact = new Map(evidenceMatrix.map((e) => [e.fact_id, e]));

            const trustedSources = ((a as any).trusted_sources ?? []) as Array<{
              source_id: string;
              source_ref: string;
              title: string;
              url: string | null;
              official_url: string | null;
            }>;
            const legacySources = (a.sources ?? []) as Array<{ id?: string; title?: string; url?: string; cited_for?: string }>;
            const sourceById = new Map<string, { title: string; url: string | null }>();
            for (const s of trustedSources) {
              sourceById.set(s.source_id, { title: s.title, url: s.official_url ?? s.url });
              if (s.source_ref) sourceById.set(s.source_ref, { title: s.title, url: s.official_url ?? s.url });
            }
            for (const s of legacySources) {
              if (s.id && !sourceById.has(String(s.id))) sourceById.set(String(s.id), { title: s.title ?? String(s.id), url: s.url ?? null });
            }

            const re = ((a as any).reasoning_engine ?? {}) as { selected_strategy_id?: string };
            const selectedStrategyId = re.selected_strategy_id ?? "";

            const evidenceStatusLabel = (st?: string) =>
              st === "proven" ? "Доказано" : st === "partial" ? "Частично доказано" : st === "missing" ? "Не доказано" : "—";

            return (
              <div>
                <div className="db-section-label">Ход юридического мышления AI</div>
                <div className="mt-2 db-subcard space-y-3">
                  <div className="text-xs text-white/60">
                    Показан путь рассуждения AI по каждому ключевому аргументу: от факта дела до влияния на выбранную стратегию.
                  </div>
                  {argMap.slice(0, 12).map((arg, idx) => {
                    const allowed = !!arg.use_in_generation;
                    const unsupported = String(arg.support_level ?? "") === "unsupported"
                      || String(arg.support_level ?? "") === "none"
                      || String(arg.support_level ?? "") === "weak";
                    const factsUsed: string[] = Array.isArray(arg.facts_used) ? arg.facts_used : [];
                    const docsUsed: string[] = Array.isArray(arg.documents_used) ? arg.documents_used : [];
                    const sourcesUsed: string[] = Array.isArray(arg.sources_used) ? arg.sources_used : [];

                    return (
                      <div
                        key={`chain-${arg.argument_id ?? idx}`}
                        className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-white font-semibold text-sm">
                            {labelArgumentKind(String(arg.kind ?? ""))}
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px]">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${evidenceTone(arg.evidence_strength)}`}>
                              Доказательная сила: {labelEvidence(arg.evidence_strength)}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${allowed ? GREEN : RED}`}>
                              {allowed ? "Используется при генерации" : "Вывод заблокирован и не используется при генерации"}
                            </span>
                          </div>
                        </div>

                        <div className="text-[11px] text-white/55">
                          Факт → Доказательство → Юридический источник → Аргумент → Влияние на стратегию
                        </div>

                        {/* 1. Факт */}
                        <details className="rounded-lg border border-white/10 bg-white/5 group" open>
                          <summary className="cursor-pointer list-none px-3 py-2 text-[12px] text-white/85 flex items-center justify-between">
                            <span><span className="text-white/50 mr-1">1.</span> Факт</span>
                            <span className="text-white/40 text-[11px] group-open:hidden">развернуть</span>
                          </summary>
                          <div className="px-3 pb-3 space-y-2 text-[12px] text-white/80">
                            {factsUsed.length === 0 && <div className="text-white/55">Факты не указаны.</div>}
                            {factsUsed.map((fid) => {
                              const text = factById.get(fid) ?? evByFact.get(fid)?.fact_text ?? "—";
                              return (
                                <div key={fid} className="rounded-md border border-white/10 bg-white/5 p-2">
                                  {text}
                                </div>
                              );
                            })}
                          </div>
                        </details>

                        {/* 2. Документы */}
                        <details className="rounded-lg border border-white/10 bg-white/5 group">
                          <summary className="cursor-pointer list-none px-3 py-2 text-[12px] text-white/85 flex items-center justify-between">
                            <span><span className="text-white/50 mr-1">2.</span> Документы</span>
                            <span className="text-white/40 text-[11px]">{docsUsed.length}</span>
                          </summary>
                          <div className="px-3 pb-3 space-y-2 text-[12px] text-white/80">
                            {docsUsed.length === 0 && <div className="text-white/55">Документы не привязаны к аргументу.</div>}
                            {factsUsed.map((fid) => {
                              const ev = evByFact.get(fid);
                              if (!ev) return null;
                              return (
                                <div key={`ev-${fid}`} className="rounded-md border border-white/10 bg-white/5 p-2">
                                  <div className="text-white/60 text-[11px]">
                                    Статус доказательства: {evidenceStatusLabel(ev.evidence_status)}
                                  </div>
                                  {ev.documents?.length ? (
                                    <ul className="mt-1 list-disc pl-4">
                                      {ev.documents.map((d, i) => (
                                        <li key={i}>{d}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="text-white/55 mt-1">Документы по этому факту не найдены.</div>
                                  )}
                                </div>
                              );
                            })}
                            {docsUsed.length > 0 && (
                              <div className="rounded-md border border-white/10 bg-white/5 p-2">
                                <div className="text-white/60 text-[11px] mb-1">Использованные документы:</div>
                                <ul className="list-disc pl-4">
                                  {docsUsed.map((d, i) => (
                                    <li key={i}>{d}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </details>

                        {/* 3. Источники права */}
                        <details className="rounded-lg border border-white/10 bg-white/5 group">
                          <summary className="cursor-pointer list-none px-3 py-2 text-[12px] text-white/85 flex items-center justify-between">
                            <span><span className="text-white/50 mr-1">3.</span> Источники права</span>
                            <span className="text-white/40 text-[11px]">{sourcesUsed.length}</span>
                          </summary>
                          <div className="px-3 pb-3 space-y-2 text-[12px] text-white/80">
                            {unsupported && (
                              <div className="text-red-200">Не подтверждено юридическим источником</div>
                            )}
                            {sourcesUsed.length === 0 && !unsupported && (
                              <div className="text-white/55">Источники права не указаны.</div>
                            )}
                            {sourcesUsed.map((sid) => {
                              const s = sourceById.get(sid);
                              return (
                                <div key={sid} className="rounded-md border border-white/10 bg-white/5 p-2">
                                  <div className="text-white/90">{s?.title ?? sid}</div>
                                  {s?.url && (
                                    <a
                                      href={s.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-1 inline-flex items-center gap-1 text-sky-300 hover:underline text-[11px]"
                                    >
                                      <ExternalLink size={10} /> Открыть источник
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </details>

                        {/* 4. Аргумент */}
                        <details className="rounded-lg border border-white/10 bg-white/5 group" open>
                          <summary className="cursor-pointer list-none px-3 py-2 text-[12px] text-white/85 flex items-center justify-between">
                            <span><span className="text-white/50 mr-1">4.</span> Аргумент</span>
                          </summary>
                          <div className="px-3 pb-3 text-[13px] text-white/85 whitespace-pre-wrap">
                            {arg.argument || "—"}
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${supportTone(arg.support_level)}`}>
                                Подтверждение: {labelSupport(arg.support_level)}
                              </span>
                            </div>
                          </div>
                        </details>

                        {/* 5. Статус использования / Влияние на стратегию */}
                        <details className="rounded-lg border border-white/10 bg-white/5 group" open>
                          <summary className="cursor-pointer list-none px-3 py-2 text-[12px] text-white/85 flex items-center justify-between">
                            <span><span className="text-white/50 mr-1">5.</span> Статус использования</span>
                          </summary>
                          <div className="px-3 pb-3 text-[12px] text-white/85 space-y-2">
                            {allowed ? (
                              <div className="text-emerald-200">
                                Аргумент учитывается при выборе стратегии
                                {selectedStrategyId ? <> «{labelStrategy(selectedStrategyId)}»</> : null}
                                {" "}и используется при генерации документа.
                              </div>
                            ) : (
                              <div className="text-red-200">
                                Вывод заблокирован и не используется при генерации.
                                {arg.blocked_reason ? (
                                  <div className="mt-1 text-white/70">
                                    <span className="text-white/55">Причина: </span>
                                    {arg.blocked_reason}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {(() => {
            const missingEvidence = (a.missing_evidence ?? []) as string[];
            const argMap = ((a as any).argument_map ?? []) as Array<Record<string, any>>;
            const blockedArgs = argMap.filter((x) => x.use_in_generation === false);
            const supportedArgs = argMap.filter((x) => x.use_in_generation !== false);
            const re = ((a as any).reasoning_engine ?? {}) as {
              selected_strategy_id?: string;
              considered_positions?: Array<Record<string, any>>;
            };
            const selectedId = re.selected_strategy_id ?? "";
            const positions = re.considered_positions ?? [];
            const selectedPos = positions.find((p) => String(p.id ?? "") === selectedId);
            const alternatives = positions.filter((p) => String(p.id ?? "") !== selectedId);
            const challenge = ((a as any).challenge_result ?? {}) as {
              unresolved_risks?: string[];
              required_changes?: string[];
              issues?: Array<{ description: string }>;
            };
            const unresolved = challenge.unresolved_risks ?? [];
            const requiredChanges = challenge.required_changes ?? [];
            const conclusions = ((a as any).conclusions ?? []) as Array<{ statement: string; provenance?: { sufficiency?: { status?: string; reason?: string } } }>;
            const blockedConclusions = conclusions.filter(
              (c) => c.provenance?.sufficiency?.status && c.provenance.sufficiency.status !== "sufficient",
            );

            const nothingToShow =
              missingEvidence.length === 0 &&
              blockedArgs.length === 0 &&
              blockedConclusions.length === 0 &&
              alternatives.length === 0 &&
              unresolved.length === 0 &&
              requiredChanges.length === 0;
            if (nothingToShow) return null;

            return (
              <div>
                <div className="db-section-label">Что может изменить стратегию</div>
                <div className="mt-2 db-subcard space-y-4">
                  <div className="text-xs text-white/60">
                    Ниже указаны обстоятельства, при появлении или устранении которых правовая позиция и выбранная стратегия защиты могут быть пересмотрены.
                  </div>

                  {/* 1. Отсутствующие доказательства */}
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-white font-semibold text-sm">1. Отсутствующие доказательства</div>
                    <div className="text-[11px] text-white/55 mt-0.5">Доказательства, которых сейчас не хватает в материалах дела.</div>
                    {missingEvidence.length === 0 ? (
                      <div className="mt-2 text-[12px] text-white/70">Пробелов в доказательственной базе не выявлено.</div>
                    ) : (
                      <ul className="mt-2 list-disc pl-5 space-y-1 text-[13px] text-amber-200">
                        {missingEvidence.map((it, i) => (
                          <li key={i}>{it}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* 2. Заблокированные выводы */}
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-white font-semibold text-sm">
                      2. Выводы, заблокированные из-за нехватки источников
                    </div>
                    <div className="text-[11px] text-white/55 mt-0.5">
                      Правовые выводы, которые AI не может использовать при генерации до подтверждения надлежащими источниками.
                    </div>
                    {blockedArgs.length === 0 && blockedConclusions.length === 0 ? (
                      <div className="mt-2 text-[12px] text-white/70">Заблокированных выводов нет.</div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {blockedArgs.map((arg, i) => (
                          <div key={`ba-${i}`} className="rounded-md border border-white/10 bg-white/5 p-2 text-[12px] text-white/85">
                            <div className="text-white/60 text-[11px]">
                              {labelArgumentKind(String(arg.kind ?? ""))}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap">{arg.argument ?? "—"}</div>
                            {arg.blocked_reason && (
                              <div className="mt-1 text-red-200">
                                <span className="text-white/55">Причина: </span>
                                {arg.blocked_reason}
                              </div>
                            )}
                          </div>
                        ))}
                        {blockedConclusions.map((c, i) => (
                          <div key={`bc-${i}`} className="rounded-md border border-white/10 bg-white/5 p-2 text-[12px] text-white/85">
                            <div className="whitespace-pre-wrap">{c.statement}</div>
                            {c.provenance?.sufficiency?.reason && (
                              <div className="mt-1 text-red-200">
                                <span className="text-white/55">Причина: </span>
                                {c.provenance.sufficiency.reason}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Что усилит выбранную стратегию */}
                  <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-3">
                    <div className="text-white font-semibold text-sm">
                      3. Что может усилить выбранную стратегию
                    </div>
                    <div className="text-[11px] text-white/55 mt-0.5">
                      Доказательства и источники, устранение или получение которых укрепит позицию
                      {selectedId ? <> «{labelStrategy(selectedId)}»</> : null}.
                    </div>
                    {(() => {
                      const items: string[] = [];
                      // arguments already used in selected strategy that lack support → strengthening them helps
                      for (const arg of supportedArgs) {
                        const sup = String(arg.support_level ?? "");
                        const ev = String(arg.evidence_strength ?? "");
                        if (sup === "partial" || sup === "weak" || sup === "unsupported" || sup === "none" || ev === "low" || ev === "medium") {
                          const kind = labelArgumentKind(String(arg.kind ?? ""));
                          items.push(
                            `Дополнительное подтверждение аргумента «${kind}»: ${String(arg.argument ?? "").slice(0, 220)}`,
                          );
                        }
                      }
                      // missing evidence items directly strengthen selected strategy
                      for (const m of missingEvidence) items.push(`Получить доказательство: ${m}`);
                      // required_changes from challenge indicate what to fix
                      for (const r of requiredChanges) items.push(r);

                      if (items.length === 0) {
                        return (
                          <div className="mt-2 text-[12px] text-white/70">
                            Выбранная стратегия обеспечена имеющимися доказательствами; дополнительных мер не требуется.
                          </div>
                        );
                      }
                      return (
                        <ul className="mt-2 list-disc pl-5 space-y-1 text-[13px] text-emerald-100">
                          {items.slice(0, 12).map((it, i) => (
                            <li key={i}>{it}</li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>

                  {/* 4. Что сделает альтернативную стратегию предпочтительной */}
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-white font-semibold text-sm">
                      4. Что может сделать альтернативную стратегию предпочтительной
                    </div>
                    <div className="text-[11px] text-white/55 mt-0.5">
                      Обстоятельства, при появлении которых целесообразно рассмотреть иную правовую позицию.
                    </div>
                    {alternatives.length === 0 ? (
                      <div className="mt-2 text-[12px] text-white/70">Альтернативные стратегии не рассматривались.</div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {alternatives.map((p, i) => {
                          const pid = String(p.id ?? "");
                          const conditions: string[] = [];
                          if (Array.isArray(p.required_evidence)) {
                            for (const r of p.required_evidence) conditions.push(String(r));
                          }
                          if (Array.isArray(p.trigger_conditions)) {
                            for (const r of p.trigger_conditions) conditions.push(String(r));
                          }
                          if (typeof p.why_not_selected === "string" && p.why_not_selected) {
                            conditions.push(`Устранение причины отклонения: ${p.why_not_selected}`);
                          }
                          return (
                            <div key={`alt-${i}`} className="rounded-md border border-white/10 bg-white/5 p-2 text-[12px] text-white/85">
                              <div className="text-white font-medium">
                                {p.title ?? labelStrategy(pid)}
                              </div>
                              {conditions.length > 0 ? (
                                <ul className="mt-1 list-disc pl-4 text-white/80">
                                  {conditions.map((c, j) => (
                                    <li key={j}>{c}</li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="mt-1 text-white/60">
                                  Условия перехода на эту стратегию AI не сформулировал.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 5. Риски, которые останутся */}
                  <div className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-3">
                    <div className="text-white font-semibold text-sm">
                      5. Риски, которые останутся даже после сбора доказательств
                    </div>
                    <div className="text-[11px] text-white/55 mt-0.5">
                      Обстоятельства, которые невозможно устранить только доказательственными средствами.
                    </div>
                    {unresolved.length === 0 ? (
                      <div className="mt-2 text-[12px] text-white/70">Неустранимых рисков не выявлено.</div>
                    ) : (
                      <ul className="mt-2 list-disc pl-5 space-y-1 text-[13px] text-amber-200">
                        {unresolved.map((it, i) => (
                          <li key={i}>{it}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {(() => {
            const re = ((a as any).reasoning_engine ?? {}) as {
              selected_strategy_id?: string;
              considered_positions?: Array<Record<string, any>>;
            };
            const selectedId = re.selected_strategy_id ?? "";
            const selectedPos = (re.considered_positions ?? []).find(
              (p) => String(p.id ?? "") === selectedId,
            );
            const missingEvidence = (a.missing_evidence ?? []) as string[];
            const argMap = ((a as any).argument_map ?? []) as Array<Record<string, any>>;
            const blockedArgs = argMap.filter((x) => x.use_in_generation === false);
            const conclusions = ((a as any).conclusions ?? []) as Array<{
              statement: string;
              provenance?: { sufficiency?: { status?: string; reason?: string } };
            }>;
            const insufficientConclusions = conclusions.filter(
              (c) => c.provenance?.sufficiency?.status && c.provenance.sufficiency.status !== "sufficient",
            );
            const challenge = ((a as any).challenge_result ?? {}) as {
              required_changes?: string[];
              unresolved_risks?: string[];
            };
            const requiredChanges = challenge.required_changes ?? [];
            const recommendations = (a.recommendations ?? []) as string[];
            const risks = (a.risks ?? []) as Array<{ risk: string; severity?: string; mitigation?: string }>;

            // ---- Detect practice area from existing fields (no backend changes) ----
            const rq = ((a as any).research_query ?? {}) as { practice_area?: string | null; subcategory?: string | null; document_type?: string | null };
            const rawArea = String(rq.practice_area ?? (a as any).practice_area ?? (a as any).category ?? (a as any).template ?? "").toLowerCase();
            const detectArea = (): "tax" | "real_estate" | "contracts" | "court" | "corporate" | "bankruptcy" | "inheritance" | "civil" | "unknown" => {
              const s = rawArea + " " + String(rq.subcategory ?? "").toLowerCase() + " " + String(rq.document_type ?? "").toLowerCase();
              if (/tax|налог|фнс|ндс|ндфл|усн|прибыл/.test(s)) return "tax";
              if (/real_?estate|недвижим|егрн|росреестр|земел|аренд/.test(s)) return "real_estate";
              if (/contract|договор|поставк|подряд|услуг/.test(s)) return "contracts";
              if (/court|суд|иск|арбитраж|апелляц|кассац/.test(s)) return "court";
              if (/corporate|корпорат|егрюл|устав|учредител|акционер|участник/.test(s)) return "corporate";
              if (/bankrupt|банкрот|несостоятельн/.test(s)) return "bankruptcy";
              if (/inherit|наследств|завещан/.test(s)) return "inheritance";
              if (/civil|граждан|деликт|возмещен|моральн/.test(s)) return "civil";
              return "unknown";
            };
            const area = detectArea();
            const areaLabel = {
              tax: "Налоговый спор",
              real_estate: "Недвижимость",
              contracts: "Договорная работа",
              court: "Судебный спор",
              corporate: "Корпоративное право",
              bankruptcy: "Банкротство",
              inheritance: "Наследственное право",
              civil: "Гражданский спор",
              unknown: "Юридическое дело",
            }[area];

            const severityLabel = (s?: string) => {
              const v = String(s ?? "").toLowerCase();
              if (v === "high" || v === "critical" || v === "высокий") return "Высокий";
              if (v === "medium" || v === "средний") return "Средний";
              if (v === "low" || v === "низкий") return "Низкий";
              return "Не определён";
            };
            const severityBucket = (s?: string) => {
              const v = String(s ?? "").toLowerCase();
              if (v === "high" || v === "critical") return "high";
              if (v === "medium") return "medium";
              if (v === "low") return "low";
              return "other";
            };
            const highRisks = risks.filter((r) => severityBucket(r.severity) === "high");
            const mediumRisks = risks.filter((r) => severityBucket(r.severity) === "medium");
            const lowRisks = risks.filter((r) => severityBucket(r.severity) === "low");
            const otherRisks = risks.filter((r) => severityBucket(r.severity) === "other");

            // ---- Evidence bucket dictionaries by practice area ----
            type BucketKey = string;
            type BucketDef = { key: BucketKey; title: string; match: RegExp };
            const commonBuckets: BucketDef[] = [
              { key: "documents", title: "Документы и первичные материалы", match: /(договор|акт|соглашен|приложен|документ|справк|выписк|расписк|протокол)/ },
              { key: "explanations", title: "Пояснения и свидетельские показания", match: /(поясн|объяснен|допрос|свидетел|показани|интервью)/ },
              { key: "counterparty", title: "Запросы контрагентам и третьим лицам", match: /(контрагент|поставщик|покупател|запрос|встречн|третьи? лиц)/ },
              { key: "official", title: "Запросы в государственные органы", match: /(росреестр|егрн|егрюл|фнс|мвд|загс|нотариус|орган)/ },
              { key: "expert", title: "Заключения экспертов и специалистов", match: /(эксперт|оценк|заключен|специалист|техническ|строительн)/ },
            ];
            const areaBuckets: Record<string, BucketDef[]> = {
              tax: [
                { key: "transport", title: "Транспортные и логистические документы", match: /(транспорт|ттн|тн|перевоз|путев|логист|доставк)/ },
                { key: "price", title: "Подтверждение рыночности цены", match: /(цен|рыноч|прайс|тариф|котировк|стоимост)/ },
                { key: "accounting", title: "Регистры бухгалтерского и налогового учёта", match: /(регистр|учёт|учет|бухгалтер|налогов.*учёт|первичк)/ },
              ],
              real_estate: [
                { key: "title", title: "Правоустанавливающие документы", match: /(правоустанав|титул|свидетельств|основани.*прав)/ },
                { key: "registry", title: "Сведения ЕГРН и кадастра", match: /(егрн|кадастр|росреестр|обременен)/ },
                { key: "tech", title: "Техническая документация на объект", match: /(технич|план|обмер|инвентариз|бти)/ },
              ],
              contracts: [
                { key: "performance", title: "Доказательства исполнения обязательств", match: /(исполнен|акт.*вып|накладн|отгруз|приём|приемк)/ },
                { key: "correspondence", title: "Переписка сторон", match: /(переписк|претензи|уведомлен|письм|email|электронн)/ },
              ],
              court: [
                { key: "procedural", title: "Процессуальные документы по делу", match: /(иск|отзыв|ходатайств|определен|решен|постановлен)/ },
                { key: "practice", title: "Судебная практика по аналогичным делам", match: /(практик|прецедент|аналогичн|верховн)/ },
              ],
              corporate: [
                { key: "charter", title: "Учредительные и корпоративные документы", match: /(устав|учредительн|решен.*участник|протокол.*собран|егрюл)/ },
                { key: "authority", title: "Документы, подтверждающие полномочия", match: /(доверен|полномочи|назначен|приказ)/ },
              ],
              bankruptcy: [
                { key: "claims", title: "Требования кредиторов и реестр", match: /(требован|кредитор|реестр|очерёдност|очередност)/ },
                { key: "assets", title: "Сведения об имуществе и сделках должника", match: /(имуществ|актив|сделк|отчужден|оспарив)/ },
              ],
              inheritance: [
                { key: "family", title: "Документы о родстве и семейном статусе", match: /(родств|свидетельств.*рожд|брак|загс)/ },
                { key: "will", title: "Завещание и наследственное дело", match: /(завещан|наследств|нотариус)/ },
              ],
              civil: [
                { key: "damages", title: "Доказательства причинения вреда и убытков", match: /(вред|убыт|ущерб|повреж|расчёт|расчет)/ },
              ],
              unknown: [],
            };
            const buckets: BucketDef[] = [...commonBuckets, ...(areaBuckets[area] ?? [])];
            const grouped: Record<BucketKey, string[]> = {};
            const other: string[] = [];
            for (const b of buckets) grouped[b.key] = [];
            for (const raw of missingEvidence) {
              const t = raw.toLowerCase();
              const hit = buckets.find((b) => b.match.test(t));
              if (hit) grouped[hit.key].push(raw);
              else other.push(raw);
            }

            // ---- Procedural / working steps by area ----
            const proceduralByArea: Record<string, string[]> = {
              tax: [
                "Подготовить пояснения по спорным эпизодам для представления в налоговый орган.",
                "Подготовить возражения на акт налоговой проверки в установленный законом срок.",
                "Проверить и зафиксировать процессуальные сроки обжалования актов налогового органа.",
              ],
              real_estate: [
                "Проверить актуальные сведения ЕГРН и наличие обременений в отношении объекта.",
                "Согласовать проект договора и порядок расчётов между сторонами сделки.",
                "Подготовить документы для государственной регистрации перехода прав.",
              ],
              contracts: [
                "Подготовить редакцию договора с учётом выявленных правовых рисков.",
                "Сформулировать протокол разногласий и позицию по спорным условиям.",
                "Подготовить претензию либо ответ на претензию контрагента.",
              ],
              court: [
                "Подготовить процессуальную позицию (иск, отзыв, возражения) по существу спора.",
                "Сформировать перечень ходатайств: об истребовании доказательств, о назначении экспертизы, о вызове свидетелей.",
                "Проверить и соблюсти процессуальные сроки подачи документов и обжалования.",
              ],
              corporate: [
                "Проверить полномочия лиц, участвующих в принятии корпоративного решения.",
                "Подготовить проекты решений органов управления и корпоративных документов.",
                "Подготовить документы для внесения изменений в ЕГРЮЛ.",
              ],
              bankruptcy: [
                "Подготовить заявление о включении требований в реестр требований кредиторов.",
                "Проверить основания для оспаривания сделок должника.",
                "Соблюсти сроки предъявления требований и обжалования судебных актов.",
              ],
              inheritance: [
                "Подготовить документы для нотариуса в рамках наследственного дела.",
                "Проверить наличие завещания и круг наследников по закону.",
                "Оценить необходимость судебного установления юридически значимых фактов.",
              ],
              civil: [
                "Сформировать доказательственную базу по обстоятельствам причинения вреда и его размеру.",
                "Подготовить претензионное письмо и, при необходимости, исковое заявление.",
              ],
              unknown: [
                "Подготовить пояснения и правовую позицию по существу дела.",
                "Проверить и зафиксировать процессуальные и материальные сроки.",
              ],
            };
            const procedural: string[] = [
              "Подготовить письменную правовую позицию по существу дела.",
              ...(proceduralByArea[area] ?? proceduralByArea.unknown),
            ];
            if (missingEvidence.length > 0 || blockedArgs.length > 0) {
              procedural.push("Сформировать пакет подтверждающих документов по каждому спорному эпизоду.");
            }

            // ---- Next document suggestion by area ----
            const nextDoc = (() => {
              if (insufficientConclusions.length > 0 || blockedArgs.length > 0 || missingEvidence.length > 3) {
                return {
                  title: "Запрос дополнительных доказательств у доверителя и иных лиц",
                  reason: "Правовая позиция не обеспечена полным объёмом доказательств.",
                };
              }
              const sid = selectedId.toLowerCase();
              if (sid.includes("court") || sid.includes("судеб")) {
                return { title: "Процессуальные документы для судебной защиты", reason: "Выбрана судебная линия защиты интересов доверителя." };
              }
              if (sid.includes("settlement") || sid.includes("досуд") || sid.includes("mediation")) {
                return { title: "Документы досудебного урегулирования спора", reason: "Выбран досудебный порядок разрешения спора." };
              }
              const byArea: Record<string, { title: string; reason: string }> = {
                tax: {
                  title: highRisks.length > 0 ? "Возражения на акт налогового органа" : "Пояснения в налоговый орган",
                  reason: highRisks.length > 0 ? "Имеются существенные риски, требующие письменной правовой позиции." : "Требуется представить обоснованную позицию по спорным эпизодам.",
                },
                real_estate: { title: "Проект договора и пакет документов для сделки", reason: "Материалы дела достаточны для оформления сделки с недвижимостью." },
                contracts: { title: "Редакция договора либо протокол разногласий", reason: "Основные правовые риски по договору определены." },
                court: { title: highRisks.length > 0 ? "Исковое заявление / отзыв на иск" : "Процессуальный документ по существу спора", reason: "Позиция по делу сформирована." },
                corporate: { title: "Проект корпоративного решения и сопроводительных документов", reason: "Материалы позволяют оформить корпоративную процедуру." },
                bankruptcy: { title: "Заявление в рамках дела о банкротстве", reason: "Позиция по делу о банкротстве определена." },
                inheritance: { title: "Заявление и документы для нотариального оформления наследства", reason: "Круг наследников и наследственная масса установлены." },
                civil: { title: "Претензия либо исковое заявление", reason: "Основания и размер требований определены." },
                unknown: { title: "Правовое заключение по делу", reason: "Материалы дела достаточны для оформления итоговой правовой позиции." },
              };
              return byArea[area];
            })();

            // ---- Urgent actions ----
            const urgent: string[] = [];
            if (blockedArgs.length > 0) urgent.push("Устранить основания, по которым выводы AI не могут быть использованы при подготовке документа.");
            if (insufficientConclusions.length > 0) urgent.push("Подтвердить надлежащими источниками выводы, обеспеченность которых признана недостаточной.");
            if (missingEvidence.length > 0) urgent.push("Организовать сбор недостающих доказательств по делу.");
            if (highRisks.length > 0) urgent.push("Проработать меры по снижению рисков высокой степени.");
            for (const r of requiredChanges.slice(0, 3)) urgent.push(r);
            if (urgent.length === 0) urgent.push("Срочных действий не требуется: правовая позиция обеспечена, критических пробелов не выявлено.");

            const nothing =
              urgent.length === 0 && missingEvidence.length === 0 && risks.length === 0 && recommendations.length === 0;
            if (nothing) return null;

            const RiskList = ({ items, tone }: { items: typeof risks; tone: string }) => (
              <ul className={`mt-2 list-disc pl-5 space-y-1 text-[13px] ${tone}`}>
                {items.map((r, i) => (
                  <li key={i}>
                    {r.risk}
                    {r.mitigation ? <div className="text-white/60 text-[11px] mt-0.5">Меры: {r.mitigation}</div> : null}
                  </li>
                ))}
              </ul>
            );

            const Bucket = ({ title, items }: { title: string; items: string[] }) =>
              items.length === 0 ? null : (
                <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="text-white/85 text-[12px] font-medium">{title}</div>
                  <ul className="mt-1 list-disc pl-4 text-[12px] text-white/80 space-y-0.5">
                    {items.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                </div>
              );

            return (
              <div>
                <div className="db-section-label">План действий юриста</div>
                <div className="mt-2 db-subcard space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                    <span>Практические шаги по ведению дела с учётом выбранной правовой позиции.</span>
                    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/75">
                      Область права: {areaLabel}
                    </span>
                  </div>

                  {/* 1. Срочные действия */}
                  <div className="rounded-lg border border-red-300/20 bg-red-500/5 p-3">
                    <div className="text-white font-semibold text-sm">1. Срочные действия</div>
                    <ul className="mt-2 list-disc pl-5 space-y-1 text-[13px] text-red-100">
                      {urgent.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                  </div>

                  {/* 2. Доказательства к сбору */}
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-white font-semibold text-sm">2. Доказательства, которые необходимо собрать</div>
                    {missingEvidence.length === 0 ? (
                      <div className="mt-2 text-[12px] text-white/70">
                        Пробелов в доказательственной базе не выявлено — дополнительного сбора не требуется.
                      </div>
                    ) : (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {buckets.map((b) => (
                          <Bucket key={b.key} title={b.title} items={grouped[b.key] ?? []} />
                        ))}
                        <Bucket title="Иные доказательства" items={other} />
                      </div>
                    )}
                  </div>

                  {/* 3. Процессуальные / рабочие шаги */}
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-white font-semibold text-sm">3. Процессуальные и рабочие шаги</div>
                    <ul className="mt-2 list-disc pl-5 space-y-1 text-[13px] text-white/85">
                      {procedural.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                    {recommendations.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[11px] text-white/55">Рекомендации AI:</div>
                        <ul className="mt-1 list-disc pl-5 space-y-1 text-[12px] text-white/75">
                          {recommendations.slice(0, 8).map((it, i) => (
                            <li key={i}>{it}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* 4. Риски к контролю */}
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-white font-semibold text-sm">4. Риски, которые необходимо контролировать</div>
                    {risks.length === 0 ? (
                      <div className="mt-2 text-[12px] text-white/70">Существенных рисков не выявлено.</div>
                    ) : (
                      <div className="mt-2 space-y-3">
                        {highRisks.length > 0 && (
                          <div>
                            <div className="text-[12px] font-medium text-red-200">Высокий уровень риска</div>
                            <RiskList items={highRisks} tone="text-red-100" />
                          </div>
                        )}
                        {mediumRisks.length > 0 && (
                          <div>
                            <div className="text-[12px] font-medium text-amber-200">Средний уровень риска</div>
                            <RiskList items={mediumRisks} tone="text-amber-100" />
                          </div>
                        )}
                        {lowRisks.length > 0 && (
                          <div>
                            <div className="text-[12px] font-medium text-emerald-200">Низкий уровень риска</div>
                            <RiskList items={lowRisks} tone="text-emerald-100" />
                          </div>
                        )}
                        {otherRisks.length > 0 && (
                          <div>
                            <div className="text-[12px] font-medium text-white/70">Уровень риска не определён</div>
                            <RiskList items={otherRisks} tone="text-white/80" />
                          </div>
                        )}
                      </div>
                    )}
                    {(challenge.unresolved_risks ?? []).length > 0 && (
                      <div className="mt-3 text-[11px] text-white/55">
                        Отдельно контролировать неустранимые обстоятельства, указанные в разделе «Что может изменить стратегию».
                      </div>
                    )}
                  </div>

                  {/* 5. Следующий документ */}
                  <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-3">
                    <div className="text-white font-semibold text-sm">5. Следующий документ к подготовке</div>
                    <div className="mt-2 text-emerald-100 text-[14px] font-medium">{nextDoc.title}</div>
                    <div className="mt-1 text-[12px] text-white/70">{nextDoc.reason}</div>
                    {selectedPos?.title && (
                      <div className="mt-2 text-[11px] text-white/55">Правовая позиция: {selectedPos.title}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

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
      <div className="mt-2 db-subcard text-[13px] text-white/85 whitespace-pre-wrap">{text}</div>
    </div>
  );
}

function ListSection({ title, items, warn }: { title: string; items: string[]; warn?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="db-section-label">{title}</div>
      <ul className={`mt-2 list-disc pl-5 space-y-1 text-[13px] ${warn ? "text-amber-200" : "text-white/85"}`}>
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
