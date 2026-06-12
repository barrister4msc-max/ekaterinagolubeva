import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, AlertTriangle, Search, FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type DocumentAIAnalysisPanelProps = {
  documentId: string;
  sourceTable: "lead_documents" | "documents";
  matterId?: string;
  leadId?: string;
  enableExternalSearch?: boolean;
  enableStrategyGeneration?: boolean;
  enableDocumentRecommendations?: boolean;
  onAnalysisComplete?: () => void;
};

type AnyDoc = Record<string, any>;

const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидает анализа",
  processing: "AI анализирует...",
  completed: "AI-анализ готов",
  needs_review: "Нужен текст / OCR",
  failed: "Ошибка анализа",
};

const GLASS_PANEL =
  "rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md";
const GLASS_SUBPANEL =
  "rounded-xl border border-white/15 bg-white/[0.07] p-3 backdrop-blur-md";
const GLASS_WARN =
  "rounded-2xl border border-amber-300/40 bg-amber-100/15 p-4 backdrop-blur-md";

function toArr(v: any): any[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function renderItem(item: any, idx: number, danger = false) {
  const text =
    typeof item === "string"
      ? item
      : Object.entries(item || {})
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
          .join(" · ");
  return (
    <div
      key={idx}
      className={`rounded-lg px-2 py-1 text-xs leading-5 ${
        danger
          ? "bg-red-500/15 text-red-200"
          : "bg-white/[0.06] text-foreground/85"
      }`}
    >
      {text || "—"}
    </div>
  );
}

function Section({
  title,
  items,
  danger = false,
}: {
  title: string;
  items: any;
  danger?: boolean;
}) {
  const arr = toArr(items);
  if (arr.length === 0) return null;
  return (
    <div className={GLASS_SUBPANEL}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
        {title}
      </div>
      <div className="mt-2 space-y-1">{arr.map((it, i) => renderItem(it, i, danger))}</div>
    </div>
  );
}

export function DocumentAIAnalysisPanel({
  documentId,
  sourceTable,
  matterId,
  leadId,
  enableExternalSearch = true,
  enableStrategyGeneration = false,
  enableDocumentRecommendations = true,
  onAnalysisComplete,
}: DocumentAIAnalysisPanelProps) {
  const [doc, setDoc] = useState<AnyDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busyMissing, setBusyMissing] = useState<string | null>(null);

  const loadDoc = useCallback(async () => {
    const { data, error } = await supabase
      .from(sourceTable)
      .select("*")
      .eq("id", documentId)
      .maybeSingle();
    if (error) {
      console.error("[DocumentAIAnalysisPanel] load", error);
      return null;
    }
    setDoc(data as AnyDoc);
    return data as AnyDoc;
  }, [documentId, sourceTable]);

  useEffect(() => {
    setLoading(true);
    loadDoc().finally(() => setLoading(false));
  }, [loadDoc]);

  const status = (doc?.analysis_status as string) || "pending";

  const normalized = useMemo(() => {
    if (!doc) return null;
    const ed = doc.extracted_data || {};
    const sa = ed.structured_analysis || {};
    const md = doc.metadata || {};
    return {
      ai_summary: doc.ai_summary || sa.short_summary || ed.short_summary || "",
      document_type: doc.document_type || sa.document_type || ed.document_type || null,
      document_category: doc.document_category || sa.document_category || ed.document_category || null,
      document_purpose: doc.document_purpose || sa.document_purpose || ed.document_purpose || null,
      risk_level: doc.risk_level || sa.risk_level || ed.risk_level || null,
      facts: md.facts || sa.facts || ed.facts || [],
      entities:
        doc.ai_detected_entities ||
        ed.entities ||
        {
          parties: sa.parties,
          persons: sa.persons,
          companies: sa.companies,
          addresses: sa.addresses,
          amounts: sa.amounts,
          dates: sa.dates,
          cad_numbers: sa.cad_numbers,
        },
      risks: doc.ai_detected_risks || doc.ai_risks || sa.legal_risks || ed.legal_risks || [],
      recommended_actions:
        doc.recommended_actions || sa.recommended_actions || ed.recommended_actions || [],
      recommended_documents:
        doc.recommended_documents || sa.recommended_documents || ed.recommended_documents || [],
      missing_documents:
        doc.missing_documents || sa.missing_documents || ed.missing_documents || [],
      legal_basis: doc.legal_basis || sa.legal_basis || ed.legal_basis || [],
      missing_sources: md.missing_sources || ed.missing_sources || sa.missing_sources || [],
    };
  }, [doc]);

  const runAnalysis = async () => {
    if (running) return;
    setRunning(true);
    try {
      // Step 1. Ensure we have extracted text for `documents` rows.
      if (sourceTable === "documents") {
        const ocrLen = ((doc?.ocr_text as string) || "").length;
        const meta = (doc?.metadata as Record<string, any>) || {};
        const exStatus = meta.extraction_status as string | undefined;

        if (exStatus === "unsupported_spreadsheet") {
          toast.error("Таблица — нужен отдельный анализ");
          return;
        }
        if (exStatus === "unsupported_presentation") {
          toast.error("Презентация — нужен отдельный анализ");
          return;
        }

        if (ocrLen < 50) {
          const { data: ex, error: exErr } = await supabase.functions.invoke(
            "extract-document-text",
            { body: { document_id: documentId } },
          );
          if (exErr) {
            console.error("[extract-document-text]", exErr);
            toast.error(exErr.message || "Не удалось извлечь текст");
            return;
          }
          const status = (ex as any)?.extraction_status as string | undefined;
          const len = Number((ex as any)?.text_length || 0);
          await loadDoc();
          if (status === "ocr_required") {
            toast.error("Нужен OCR / скан");
            return;
          }
          if (status === "unsupported_spreadsheet") {
            toast.error("Таблица — нужен отдельный анализ");
            return;
          }
          if (status === "unsupported_presentation") {
            toast.error("Презентация — нужен отдельный анализ");
            return;
          }
          if (status === "failed" || len < 50) {
            toast.error("Текст не извлечён");
            return;
          }
        }
      }

      const fn = sourceTable === "lead_documents" ? "analyze-lead-document" : "analyze-matter-document";
      const { error } = await supabase.functions.invoke(fn, {
        body: { document_id: documentId },
      });
      if (error) {
        console.error("[DocumentAIAnalysisPanel] invoke", error);
        toast.error(error.message || "Ошибка анализа");
        return;
      }
      const fresh = await loadDoc();
      setExpanded(true);
      onAnalysisComplete?.();
      toast.success("AI-анализ готов");
      void fresh;
    } finally {
      setRunning(false);
    }
  };

  const createGapRequest = async (ms: any) => {
    const key = `gap-${ms?.query || ms?.title || JSON.stringify(ms)}`;
    setBusyMissing(key);
    try {
      const query =
        ms?.query || ms?.title || ms?.guessed_title || (typeof ms === "string" ? ms : JSON.stringify(ms));
      const contextParts = [
        `document_id=${documentId}`,
        sourceTable === "lead_documents" ? "source=lead_documents" : "source=documents",
        matterId ? `matter_id=${matterId}` : null,
        leadId ? `lead_id=${leadId}` : null,
        ms?.reason ? `reason=${ms.reason}` : null,
      ].filter(Boolean) as string[];
      const { error } = await supabase.from("legal_source_gap_requests").insert({
        query_text: String(query).slice(0, 2000),
        missing_source_type: ms?.source_type || ms?.type || "unknown",
        guessed_title: ms?.title || ms?.guessed_title || null,
        guessed_article: ms?.article || ms?.guessed_article || null,
        guessed_document_number: ms?.document_number || ms?.guessed_document_number || null,
        context: contextParts.join(" | "),
        priority: ms?.priority || "normal",
        status: "open",
        source_lead_id: leadId || null,
      });
      if (error) {
        console.error(error);
        toast.error(error.message);
        return;
      }
      toast.success("Gap-запрос создан");
    } finally {
      setBusyMissing(null);
    }
  };

  const queueExternalSearch = async (ms: any) => {
    const key = `ext-${ms?.query || ms?.title || JSON.stringify(ms)}`;
    setBusyMissing(key);
    try {
      const query =
        ms?.query || ms?.title || ms?.guessed_title || (typeof ms === "string" ? ms : JSON.stringify(ms));
      const refParts = [
        `document_id=${documentId}`,
        `source_table=${sourceTable}`,
        matterId ? `matter_id=${matterId}` : null,
        leadId ? `lead_id=${leadId}` : null,
        `query=${String(query).slice(0, 500)}`,
        ms?.source_type ? `source_type=${ms.source_type}` : null,
      ].filter(Boolean) as string[];
      const { error } = await supabase.from("legal_source_verification_logs").insert({
        source_kind: ms?.source_type || ms?.type || "external_search",
        source_ref: refParts.join(" | ").slice(0, 2000),
        source_title: ms?.title || ms?.guessed_title || String(query).slice(0, 300),
        status: "pending",
        result_summary: "Поиск внешнего источника поставлен в очередь",
      });
      if (error) {
        console.error(error);
        toast.error(error.message);
        return;
      }
      toast.success("Поиск внешнего источника поставлен в очередь");
    } finally {
      setBusyMissing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-foreground/70">
        <Loader2 size={14} className="animate-spin" /> Загрузка...
      </div>
    );
  }

  const canExpand = status === "completed" && normalized;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runAnalysis}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-foreground/90 backdrop-blur hover:bg-white/15 disabled:opacity-50"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {running ? "AI анализирует документ..." : status === "completed" ? "Повторить AI-анализ" : "AI-анализ"}
        </button>

        <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] uppercase tracking-wide text-foreground/80 backdrop-blur">
          {STATUS_LABEL[status] || status}
        </span>

        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-foreground/90 backdrop-blur hover:bg-white/15"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? "Скрыть результат" : "Показать результат"}
          </button>
        )}
      </div>

      {expanded && canExpand && normalized && (
        <div className={GLASS_PANEL}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
            Результат AI-анализа
          </div>

          {normalized.ai_summary && (
            <div className="mt-3 rounded-xl border border-white/15 bg-white/[0.08] p-3 text-sm leading-6 text-foreground/90 backdrop-blur">
              {normalized.ai_summary}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-foreground/80">
            {normalized.document_type && (
              <span className="rounded-full bg-white/10 px-2 py-1">тип: {normalized.document_type}</span>
            )}
            {normalized.document_category && (
              <span className="rounded-full bg-white/10 px-2 py-1">категория: {normalized.document_category}</span>
            )}
            {normalized.document_purpose && (
              <span className="rounded-full bg-white/10 px-2 py-1">назначение: {normalized.document_purpose}</span>
            )}
            {normalized.risk_level && (
              <span className="rounded-full bg-red-500/15 px-2 py-1 text-red-200">
                риск: {normalized.risk_level}
              </span>
            )}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Section title="Факты" items={normalized.facts} />
            {normalized.entities && typeof normalized.entities === "object" && !Array.isArray(normalized.entities) ? (
              <>
                <Section title="Стороны" items={normalized.entities.parties} />
                <Section title="Физлица" items={normalized.entities.persons} />
                <Section title="Компании" items={normalized.entities.companies} />
                <Section title="Адреса" items={normalized.entities.addresses} />
                <Section title="Суммы" items={normalized.entities.amounts} />
                <Section title="Даты" items={normalized.entities.dates} />
                <Section title="Кадастровые номера" items={normalized.entities.cad_numbers} />
              </>
            ) : (
              <Section title="Сущности" items={normalized.entities} />
            )}
          </div>

          <div className="mt-3 grid gap-3">
            <Section title="Риски" items={normalized.risks} danger />
            <Section title="Рекомендуемые действия" items={normalized.recommended_actions} />
            {enableDocumentRecommendations && (
              <>
                <Section title="Рекомендуемые документы" items={normalized.recommended_documents} />
                <Section title="Недостающие документы" items={normalized.missing_documents} />
              </>
            )}
            <Section title="Правовое основание" items={normalized.legal_basis} />
          </div>

          {toArr(normalized.missing_sources).length > 0 && (
            <div className={`mt-4 ${GLASS_WARN}`}>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
                <AlertTriangle size={14} /> Требуется внешний источник
              </div>
              <div className="mt-3 space-y-2">
                {toArr(normalized.missing_sources).map((ms: any, i: number) => {
                  const title =
                    ms?.title || ms?.guessed_title || ms?.query || (typeof ms === "string" ? ms : JSON.stringify(ms));
                  const reason = ms?.reason || ms?.why || ms?.purpose || null;
                  const verifyStatus = ms?.status || "не найден / требует проверки";
                  const extKey = `ext-${ms?.query || ms?.title || JSON.stringify(ms)}`;
                  const gapKey = `gap-${ms?.query || ms?.title || JSON.stringify(ms)}`;
                  return (
                    <div key={i} className="rounded-xl border border-amber-300/30 bg-white/[0.06] p-3 backdrop-blur">
                      <div className="text-sm text-foreground/90">{String(title)}</div>
                      {reason && (
                        <div className="mt-1 text-xs text-foreground/70">Зачем нужен: {String(reason)}</div>
                      )}
                      <div className="mt-1 text-[11px] uppercase tracking-wide text-amber-100/90">
                        статус: {String(verifyStatus)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyMissing === gapKey}
                          onClick={() => createGapRequest(ms)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-foreground/90 backdrop-blur hover:bg-white/15 disabled:opacity-50"
                        >
                          <FilePlus2 size={12} /> Создать gap-запрос
                        </button>
                        {enableExternalSearch && (
                          <button
                            type="button"
                            disabled={busyMissing === extKey}
                            onClick={() => queueExternalSearch(ms)}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-foreground/90 backdrop-blur hover:bg-white/15 disabled:opacity-50"
                          >
                            <Search size={12} /> Найти внешний источник
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DocumentAIAnalysisPanel;
