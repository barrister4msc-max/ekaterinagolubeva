import { createFileRoute, useNavigate, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Loader2,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Download,
  Copy,
  FileText,
  Printer,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";

export const Route = createFileRoute("/workspace/generated-documents/$documentId")({
  head: () => ({
    meta: [
      { title: "Документ — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentDetailPage,
});

type DocRow = {
  id: string;
  title: string | null;
  template_key: string | null;
  status: string;
  ai_review_status: string | null;
  version_number: number;
  parent_document_id: string | null;
  lawyer_approved_at: string | null;
  lawyer_approved_by: string | null;
  created_at: string;
  updated_at: string;
  content: string | null;
  metadata: Record<string, any> | null;
  intake_session_id: string | null;
};

const GLASS = "rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md";
const BTN =
  "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg border border-sky-300/40 bg-sky-400/20 px-3 py-1.5 text-xs text-sky-50 backdrop-blur transition hover:bg-sky-400/30 disabled:opacity-50";
const BTN_AMBER =
  "inline-flex items-center gap-2 rounded-lg border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-600 disabled:opacity-50";
const BTN_EMERALD =
  "inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50";
const CHIP =
  "inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-foreground/80";

const TABS = [
  { id: "document", label: "Документ" },
  { id: "reasoning", label: "Обоснование" },
  { id: "analysis", label: "AI правовой анализ" },
  { id: "sources", label: "Источники" },
  { id: "review", label: "AI Review" },
  { id: "history", label: "История" },
  { id: "export", label: "Экспорт" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function fmt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
}

const APPROVED_STATUSES = new Set(["approved", "final", "finalized"]);

function pickArray(meta: any, ...keys: string[]): any[] {
  if (!meta || typeof meta !== "object") return [];
  for (const k of keys) {
    const v = meta[k];
    if (Array.isArray(v) && v.length) return v;
  }
  for (const nestKey of ["ai_review", "review", "analysis"]) {
    const nested = meta[nestKey];
    if (nested && typeof nested === "object") {
      for (const k of keys) {
        const v = (nested as any)[k];
        if (Array.isArray(v) && v.length) return v;
      }
    }
  }
  return [];
}

function pickScalar(meta: any, ...keys: string[]): any {
  if (!meta || typeof meta !== "object") return undefined;
  for (const k of keys) {
    if (meta[k] !== undefined && meta[k] !== null) return meta[k];
  }
  for (const nestKey of ["ai_review", "review", "analysis"]) {
    const nested = meta[nestKey];
    if (nested && typeof nested === "object") {
      for (const k of keys) {
        if ((nested as any)[k] !== undefined && (nested as any)[k] !== null)
          return (nested as any)[k];
      }
    }
  }
  return undefined;
}

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isNestedRoute = /\/workspace\/generated-documents\/[^/]+\/(revise|versions)$/.test(pathname);

  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("document");
  const [edited, setEdited] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["generated-document", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .select(
          "id,title,template_key,status,ai_review_status,version_number,parent_document_id,lawyer_approved_at,lawyer_approved_by,created_at,updated_at,content,metadata,intake_session_id",
        )
        .eq("id", documentId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Документ не найден");
      return data as unknown as DocRow;
    },
  });

  useEffect(() => {
    if (doc) {
      setEdited(doc.content ?? "");
      setDirty(false);
    }
  }, [doc?.id]);

  const meta = (doc?.metadata ?? {}) as Record<string, any>;
  const legalAnalysisRunId: string | null =
    meta?.legal_analysis_run_id ?? meta?.legal_analysis?.run_id ?? null;
  const usedContext: boolean = Boolean(
    meta?.generation_used_document_context ?? meta?.used_document_context,
  );
  const contextQuality: number | null =
    meta?.document_context_quality ?? meta?.context_quality ?? null;
  const contextSummary = meta?.document_context_summary ?? null;
  const generationModel = meta?.model ?? meta?.generation_model ?? null;
  const generationMode = meta?.generation_mode ?? meta?.mode ?? null;
  const language = meta?.language ?? null;
  const jurisdiction = meta?.jurisdiction ?? null;

  // Load legal_analysis run (ai_result)
  const { data: analysisRun } = useQuery({
    queryKey: ["legal-analysis-run", legalAnalysisRunId],
    enabled: !!legalAnalysisRunId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_ai_runs")
        .select("id,run_type,status,ai_result,created_at")
        .eq("id", legalAnalysisRunId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Load last review run for this generated document
  const { data: reviewRun } = useQuery({
    queryKey: ["review-run", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_ai_runs")
        .select("id,run_type,status,ai_result,created_at")
        .eq("generated_document_id" as any, documentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        // column may not exist or no rows — fail silently
        return null;
      }
      return data;
    },
  });

  // Related session documents
  const { data: sessionDocs } = useQuery({
    queryKey: ["session-documents", doc?.intake_session_id],
    enabled: !!doc?.intake_session_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_documents")
        .select("id,file_name,created_at")
        .eq("intake_session_id" as any, doc!.intake_session_id!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return data ?? [];
    },
  });

  const isApproved = useMemo(
    () => (doc ? APPROVED_STATUSES.has((doc.status ?? "").toLowerCase()) || Boolean(doc.lawyer_approved_at) : false),
    [doc],
  );

  const saveEdits = useMutation({
    mutationFn: async () => {
      if (!doc) return;
      if (isApproved) throw new Error("Одобренную или финальную версию нельзя изменить напрямую.");
      const { error } = await supabase
        .from("generated_legal_documents")
        .update({ content: edited, updated_at: new Date().toISOString() })
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Правки сохранены");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["generated-document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось сохранить"),
  });

  const createVersion = useMutation({
    mutationFn: async () => {
      if (!doc) return null;
      const insert = {
        title: doc.title ?? "Без названия",
        template_key: doc.template_key ?? "unknown",
        parent_document_id: doc.id,
        version_number: (doc.version_number ?? 1) + 1,
        content: edited,
        status: "lawyer_review",
        ai_review_status: null,
        intake_session_id: doc.intake_session_id,
        metadata: { created_from_version: doc.version_number, created_via: "manual_edit" },
      };
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .insert(insert as any)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    onSuccess: (newId) => {
      toast.success("Создана новая версия");
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });
      if (newId)
        navigate({
          to: "/workspace/generated-documents/$documentId",
          params: { documentId: newId },
        });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось создать новую версию"),
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!doc) return;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("generated_legal_documents")
        .update({
          status: "approved",
          lawyer_approved_at: new Date().toISOString(),
          lawyer_approved_by: u.user?.id ?? null,
        })
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Документ одобрен");
      queryClient.invalidateQueries({ queryKey: ["generated-document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось одобрить"),
  });

  const getSafeFileName = () =>
    `${(doc?.title ?? "document").replace(/[^\wа-яА-ЯёЁ\-]+/g, "_")}_v${doc?.version_number ?? 1}`;

  const downloadDocx = async () => {
    if (!doc) return;
    const text = edited || doc.content || "";
    const paragraphs = text.split("\n").map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line, size: 28, font: "Times New Roman" })],
          spacing: { after: 160, line: 360 },
        }),
    );
    const wordDoc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
    const blob = await Packer.toBlob(wordDoc);
    saveAs(blob, `${getSafeFileName()}.docx`);
  };

  const downloadPdf = () => window.print();

  const downloadMarkdown = () => {
    if (!doc) return;
    const text = edited || doc.content || "";
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, `${getSafeFileName()}.md`);
  };

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(edited || doc?.content || "");
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  if (isNestedRoute) {
    return <Outlet />;
  }
  if (isLoading) {
    return (
      <div className={`${GLASS} flex items-center gap-2 p-6 text-sm text-foreground/80`}>
        <Loader2 size={14} className="animate-spin" /> Загрузка документа…
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div className={`${GLASS} p-6 text-sm text-red-200`}>
        {(error as Error)?.message ?? "Документ не найден"}
        <div className="mt-3">
          <Link to="/workspace/generated-documents" className="underline text-foreground/80">
            ← К списку
          </Link>
        </div>
      </div>
    );
  }

  const analysis = (analysisRun?.ai_result ?? {}) as Record<string, any>;
  const review = (reviewRun?.ai_result ?? {}) as Record<string, any>;
  const sources: any[] =
    (Array.isArray(analysis?.sources) && analysis.sources) ||
    pickArray(meta, "sources") ||
    [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/workspace/generated-documents" })}
          className={BTN}
        >
          <ArrowLeft size={12} /> К списку
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={downloadDocx} className={BTN}>
            <Download size={12} /> DOCX
          </button>
          <button type="button" onClick={downloadPdf} className={BTN}>
            <Download size={12} /> PDF
          </button>
        </div>
      </div>

      <header className={`${GLASS} p-5`}>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-foreground/60">
          {doc.template_key ?? "—"}
        </div>
        <h1 className="mt-1 font-display text-2xl text-white">{doc.title || "Без названия"}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={CHIP}>v{doc.version_number}</span>
          <span className={CHIP}>статус: {doc.status}</span>
          {doc.ai_review_status && (
            <span className={CHIP}>
              <Sparkles size={11} /> AI: {doc.ai_review_status}
            </span>
          )}
          {usedContext && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-100">
              DocumentContext{contextQuality != null ? ` · ${contextQuality}` : ""}
            </span>
          )}
          {doc.lawyer_approved_at && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-100">
              <ShieldCheck size={11} /> Одобрен {fmt(doc.lawyer_approved_at)}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-foreground/60">
          <span>создан: {fmt(doc.created_at)}</span>
          <span>обновлён: {fmt(doc.updated_at)}</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          {/* Tabs */}
          <div className="sticky top-3 z-40 flex flex-wrap gap-2 rounded-2xl border border-white/15 bg-slate-950/75 p-3 shadow-2xl backdrop-blur-xl">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                  tab === t.id
                    ? "border-emerald-300/60 bg-emerald-500/30 text-white"
                    : "border-white/20 bg-black/40 text-white/85 hover:border-white/35 hover:bg-white/15"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "document" && (
            <section className="relative space-y-0 pb-10">
              {isApproved && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-400/10 p-3 text-xs text-amber-50">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Одобренную или финальную версию нельзя изменить напрямую. Создайте новую версию.</span>
                </div>
              )}

              <div
                className="mx-auto w-full max-w-[900px] px-[60px] py-[70px] shadow-[0_10px_40px_rgba(0,0,0,0.25)] ring-1 ring-black/10"
                style={{ backgroundColor: "#ffffff" }}
              >
                {editMode ? (
                  <textarea
                    value={edited}
                    onChange={(e) => {
                      setEdited(e.target.value);
                      setDirty(true);
                    }}
                    readOnly={isApproved}
                    spellCheck={false}
                    style={{
                      fontFamily: '"Times New Roman", Times, serif',
                      fontSize: "18px",
                      lineHeight: 1.9,
                      backgroundColor: "#ffffff",
                      color: "#111827",
                    }}
                    className="block min-h-[900px] w-full resize-none border-0 p-0 outline-none placeholder:text-slate-500"
                    placeholder="Текст документа..."
                  />
                ) : (
                  <div
                    className="doc-prose min-h-[900px]"
                    style={{
                      fontFamily: '"Times New Roman", Times, serif',
                      fontSize: "18px",
                      lineHeight: 1.9,
                      color: "#111827",
                    }}
                  >
                    {edited ? (
                      <ReactMarkdown>{edited}</ReactMarkdown>
                    ) : (
                      <span className="text-slate-500">Документ пуст</span>
                    )}
                  </div>
                )}

                <p className="mt-8 border-t border-slate-200 pt-3 text-center text-[11px] italic text-slate-500">
                  Рабочий текст документа. Правки юриста сохраняются в соответствии со статусом версии.
                </p>
              </div>

              <div className="mx-auto flex w-full max-w-[900px] flex-nowrap items-center gap-3 overflow-x-auto border-t border-slate-200 bg-white px-[60px] py-6">
                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  className={`${BTN} whitespace-nowrap`}
                >
                  {editMode ? "Закрыть" : "Редактировать"}
                </button>
                <button type="button" onClick={copyContent} className={`${BTN} whitespace-nowrap`}>
                  <Copy size={12} /> Скопировать
                </button>
                <button
                  type="button"
                  onClick={() => saveEdits.mutate()}
                  disabled={isApproved || !editMode || !dirty || saveEdits.isPending}
                  className={`${BTN_PRIMARY} whitespace-nowrap`}
                >
                  {saveEdits.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => createVersion.mutate()}
                  disabled={createVersion.isPending || !edited}
                  className={`${BTN_AMBER} whitespace-nowrap`}
                >
                  {createVersion.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <GitBranch size={12} />
                  )}
                  Создать версию
                </button>
                {!isApproved && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Одобрить документ?")) approve.mutate();
                    }}
                    disabled={approve.isPending}
                    className={`${BTN_EMERALD} whitespace-nowrap`}
                  >
                    {approve.isPending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    Одобрить
                  </button>
                )}
              </div>

              <style>{`
                .doc-prose h1 { font-size: 24px; font-weight: 700; margin: 16px 0 12px; }
                .doc-prose h2 { font-size: 21px; font-weight: 700; margin: 14px 0 10px; }
                .doc-prose h3 { font-size: 19px; font-weight: 600; margin: 12px 0 8px; }
                .doc-prose p { margin: 8px 0; }
                .doc-prose ul { list-style: disc; padding-left: 28px; margin: 8px 0; }
                .doc-prose ol { list-style: decimal; padding-left: 28px; margin: 8px 0; }
                .doc-prose li { margin: 4px 0; }
                .doc-prose strong { font-weight: 700; }
                .doc-prose em { font-style: italic; }
                .doc-prose blockquote { border-left: 3px solid #d1d5db; padding-left: 12px; color: #374151; margin: 10px 0; }
                .doc-prose hr { border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0; }
                .doc-prose code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
              `}</style>
            </section>
          )}

          {tab === "reasoning" && (
            <ReasoningTab analysis={analysis} meta={meta} />
          )}

          {tab === "analysis" && (

            <section className={`${GLASS} p-5 space-y-4 text-sm text-foreground/85`}>
              {!analysisRun && (
                <p className="text-foreground/70">Правовой анализ не привязан к документу.</p>
              )}
              {analysisRun && (
                <>
                  <AnalysisField label="Правовая квалификация" value={analysis?.legal_qualification ?? analysis?.qualification} />
                  <AnalysisField label="Основная позиция" value={analysis?.main_position ?? analysis?.position} />
                  <AnalysisField label="Позиция клиента" value={analysis?.client_position} />
                  <AnalysisField label="Позиция ФНС / оппонента" value={analysis?.opponent_position ?? analysis?.fns_position} />
                  <AnalysisList label="Факты" items={analysis?.facts} />
                  <AnalysisList label="Контраргументы" items={analysis?.counter_arguments} />
                  <AnalysisList label="Слабые места" items={analysis?.weak_points} />
                  <AnalysisList label="Недостающие доказательства" items={analysis?.missing_evidence} />
                  <AnalysisList label="Инструкции для генератора" items={analysis?.generation_instructions} />
                  <div className="rounded-lg border border-white/15 bg-white/5 p-3 text-xs">
                    document_context_quality:{" "}
                    <span className="text-white">{contextQuality ?? "—"}</span>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "sources" && (
            <section className={`${GLASS} p-5 space-y-3`}>
              {sources.length === 0 && (
                <p className="text-sm text-foreground/70">Источники не указаны.</p>
              )}
              <ul className="space-y-2">
                {sources.map((s: any, i: number) => (
                  <li key={i} className="rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-foreground/85">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-white">{s.title ?? s.name ?? s.source_id ?? "Источник"}</div>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-200 hover:underline">
                          <ExternalLink size={11} /> ссылка
                        </a>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-foreground/65">
                      {s.type && <span className={CHIP}>type: {String(s.type)}</span>}
                      {s.kind && <span className={CHIP}>kind: {String(s.kind)}</span>}
                      {s.source_id && <span className={CHIP}>id: {String(s.source_id)}</span>}
                      {s.verification_status && <span className={CHIP}>verif: {String(s.verification_status)}</span>}
                      {s.actuality_status && <span className={CHIP}>actuality: {String(s.actuality_status)}</span>}
                    </div>
                    {(s.used_for || s.why_selected) && (
                      <p className="mt-2 text-foreground/75">{s.used_for ?? s.why_selected}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "review" && (
            <section className={`${GLASS} p-5 space-y-3`}>
              {!reviewRun && (
                <p className="text-sm text-foreground/70">AI Review для этого документа не найден.</p>
              )}
              {reviewRun && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat label="Юридическая точность" value={review?.legal_accuracy_score ?? pickScalar(meta, "legal_accuracy_score")} />
                    <Stat label="Риск галлюцинаций" value={review?.hallucination_risk ?? pickScalar(meta, "hallucination_risk")} />
                    <Stat label="Нужен юрист" value={String(review?.needs_lawyer_review ?? "—")} />
                  </div>
                  <RiskList title="Обязательные правки" items={review?.required_fixes ?? pickArray(meta, "required_fixes")} />
                  <RiskList title="Рекомендации" items={review?.recommendations ?? pickArray(meta, "recommendations")} />
                  <RiskList title="Проблемы" items={review?.problems ?? pickArray(meta, "problems")} />
                </>
              )}
            </section>
          )}

          {tab === "history" && (
            <section className={`${GLASS} p-5 space-y-3 text-sm text-foreground/85`}>
              <Row label="Создан" value={fmt(doc.created_at)} />
              <Row label="Обновлён" value={fmt(doc.updated_at)} />
              <Row label="Версия" value={String(doc.version_number)} />
              <Row label="Режим генерации" value={generationMode ?? "—"} />
              <Row label="Модель" value={generationModel ?? "—"} />
              <Row label="legal_analysis_run_id" value={legalAnalysisRunId ?? "—"} />
              <Row label="document_context_quality" value={contextQuality != null ? String(contextQuality) : "—"} />
              <Row label="generation_used_document_context" value={String(usedContext)} />
              {sessionDocs && sessionDocs.length > 0 && (
                <div>
                  <div className="mt-3 text-[11px] uppercase text-foreground/60">Документы сессии</div>
                  <ul className="mt-2 space-y-1">
                    {sessionDocs.map((d: any) => (
                      <li key={d.id} className="text-xs text-foreground/75">
                        {d.file_name} <span className="text-foreground/50">· {fmt(d.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Link
                  to="/workspace/generated-documents/$documentId/versions"
                  params={{ documentId: doc.id }}
                  className={BTN}
                >
                  <GitBranch size={12} /> История версий
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/workspace/generated-documents/$documentId/revise",
                      params: { documentId },
                    })
                  }
                  className={BTN_AMBER}
                >
                  <RefreshCcw size={12} /> Пересмотр
                </button>
              </div>
            </section>
          )}

          {tab === "export" && (
            <section className={`${GLASS} p-5 space-y-3`}>
              <p className="text-sm text-foreground/80">Скачайте документ или отправьте на печать.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={downloadDocx} className={BTN}>
                  <Download size={12} /> DOCX
                </button>
                <button type="button" onClick={downloadPdf} className={BTN}>
                  <FileText size={12} /> PDF
                </button>
                <button type="button" onClick={downloadMarkdown} className={BTN}>
                  <Download size={12} /> Markdown
                </button>
                <button type="button" onClick={() => window.print()} className={BTN}>
                  <Printer size={12} /> Печать
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className={`${GLASS} h-fit space-y-3 p-4 text-xs text-foreground/85 lg:sticky lg:top-3`}>
          <SideRow label="Статус" value={doc.status} />
          <SideRow label="Шаблон" value={doc.template_key ?? "—"} />
          <SideRow label="Язык" value={language ?? "—"} />
          <SideRow label="Юрисдикция" value={jurisdiction ?? "—"} />
          <SideRow label="used_context" value={String(usedContext)} />
          <SideRow label="context_quality" value={contextQuality != null ? String(contextQuality) : "—"} />
          <SideRow label="legal_analysis_run_id" value={legalAnalysisRunId ? `${legalAnalysisRunId.slice(0, 8)}…` : "—"} />
          <SideRow label="created_at" value={fmt(doc.created_at)} />
          {contextSummary && (
            <div className="rounded-lg border border-white/15 bg-white/5 p-2 text-foreground/75">
              {String(contextSummary)}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-1.5">
      <span className="text-[11px] uppercase text-foreground/55">{label}</span>
      <span className="text-foreground/90">{value}</span>
    </div>
  );
}

function SideRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-foreground/55">{label}</div>
      <div className="text-foreground/90">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/5 p-3">
      <div className="text-[11px] uppercase text-foreground/60">{label}</div>
      <div className="mt-1 text-sm text-white">{value != null && value !== "" ? String(value) : "—"}</div>
    </div>
  );
}

function AnalysisField({ label, value }: { label: string; value: any }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <div className="text-[11px] uppercase text-foreground/60">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-foreground/90">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </div>
    </div>
  );
}

function AnalysisList({ label, items }: { label: string; items: any }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase text-foreground/60">{label} · {items.length}</div>
      <ul className="mt-1 space-y-1.5">
        {items.map((it: any, i: number) => (
          <li key={i} className="rounded-lg border border-white/15 bg-white/5 p-2 text-xs text-foreground/85">
            {typeof it === "string" ? it : JSON.stringify(it)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RiskList({ title, items }: { title: string; items: any[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="rounded-lg border border-white/15 bg-white/5 p-2.5 text-xs text-foreground/80"
          >
            {typeof it === "string" ? it : JSON.stringify(it)}
          </li>
        ))}
      </ul>
    </div>
  );
}
