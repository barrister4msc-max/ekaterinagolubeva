import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/workspace/document-drafts")({
  head: () => ({
    meta: [
      { title: "Мои черновики — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentDraftsPage,
});

type DraftRow = {
  session_id: string;
  title: string | null;
  template_code: string | null;
  template_title: string | null;
  status: string | null;
  generated_document_id: string | null;
  generated_document_title: string | null;
  generated_document_status: string | null;
  ai_review_status: string | null;
  version_number: number | null;
  ai_runs_count: number | null;
  last_ai_run_at: string | null;
  last_review_status: string | null;
  last_hallucination_risk: string | null;
  last_legal_accuracy_score: number | null;
  last_needs_lawyer_review: boolean | null;
  created_at: string;
  updated_at: string;
};

type AiRun = {
  id: string;
  run_type: string | null;
  status: string | null;
  review_status: string | null;
  hallucination_risk: string | null;
  legal_accuracy_score: number | null;
  needs_lawyer_review: boolean | null;
  model_name: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

const GLASS = "rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md";
const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-foreground/90 backdrop-blur transition hover:bg-white/15 disabled:opacity-50";
const CHIP =
  "inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-foreground/80";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function riskChipClass(risk: string | null) {
  if (risk === "high") return "bg-red-500/20 text-red-100";
  if (risk === "medium") return "bg-amber-500/20 text-amber-100";
  if (risk === "low") return "bg-emerald-500/15 text-emerald-100";
  return "bg-white/10 text-foreground/80";
}

function DocumentDraftsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [openHistoryFor, setOpenHistoryFor] = useState<string | null>(null);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  const { data: drafts = [], isLoading, error } = useQuery({
    queryKey: ["document-drafts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_document_drafts_dashboard" as any)
        .select("*")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DraftRow[];
    },
  });

  const archive = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.rpc("archive_document_intake_session" as any, {
        p_session_id: sessionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Черновик архивирован");
      queryClient.invalidateQueries({ queryKey: ["document-drafts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось архивировать"),
  });

  const openDocument = async (docId: string) => {
    setOpeningDocId(docId);
    try {
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .select("title, content")
        .eq("id", docId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.content) {
        toast.error("Содержимое документа недоступно");
        return;
      }
      const blob = new Blob([`# ${data.title ?? "Документ"}\n\n${data.content}`], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось открыть документ");
    } finally {
      setOpeningDocId(null);
    }
  };

  const rerunAi = async (draft: DraftRow) => {
  if (!draft.generated_document_id) {
    toast.error("У черновика нет связанного документа");
    return;
  }

  setRerunningId(draft.session_id);

  try {
    const { data, error } = await supabase.functions.invoke(
      "review-generated-legal-document",
      {
        body: {
          document_id: draft.generated_document_id,
          generated_document_id: draft.generated_document_id,
          session_id: draft.session_id,
          run_type: "manual_review",
        },
      },
    );

    if (error) throw error;

    if ((data as any)?.success === false) {
      throw new Error((data as any)?.error ?? "Ошибка AI-review");
    }

    toast.success("AI-review выполнен: результат сохранён");

    await queryClient.invalidateQueries({ queryKey: ["document-drafts"] });

    if (openHistoryFor === draft.session_id) {
      await queryClient.invalidateQueries({
        queryKey: ["ai-runs", draft.session_id],
      });
    }
  } catch (e: any) {
    toast.error(e?.message ?? "Не удалось выполнить AI-review");
  } finally {
    setRerunningId(null);
  }
};

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl text-white">Мои черновики</h1>
        <p className="text-sm text-white/70">
          Документы, созданные через конструктор. Сортировка — по последнему обновлению.
        </p>
      </header>

      {isLoading && (
        <div className={`${GLASS} flex items-center gap-2 p-6 text-sm text-foreground/80`}>
          <Loader2 size={14} className="animate-spin" /> Загрузка…
        </div>
      )}

      {error && (
        <div className={`${GLASS} p-6 text-sm text-red-200`}>
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && drafts.length === 0 && (
        <div className={`${GLASS} p-10 text-center text-sm text-foreground/80`}>
          Пока нет активных черновиков.
        </div>
      )}

      <div className="grid gap-4">
        {drafts.map((d) => {
          const noAi = !d.ai_runs_count || d.ai_runs_count === 0;
          const isOpenHistory = openHistoryFor === d.session_id;
          return (
            <article key={d.session_id} className={`${GLASS} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-foreground/60">
                    <FileText size={12} />
                    {d.template_code ?? "—"}
                  </div>
                  <h2 className="mt-1 truncate font-display text-lg text-white">
                    {d.title || d.generated_document_title || d.template_title || "Без названия"}
                  </h2>
                  {d.template_title && (
                    <div className="mt-0.5 truncate text-xs text-foreground/70">
                      Шаблон: {d.template_title}
                    </div>
                  )}
                  {d.generated_document_title && (
                    <div className="mt-0.5 truncate text-xs text-foreground/70">
                      Документ: {d.generated_document_title}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.status && <span className={CHIP}>статус: {d.status}</span>}
                  {d.generated_document_status && (
                    <span className={CHIP}>док: {d.generated_document_status}</span>
                  )}
                  {typeof d.version_number === "number" && (
                    <span className={CHIP}>v{d.version_number}</span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {noAi ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-100">
                    <AlertCircle size={11} /> AI-review ещё не выполнен
                  </span>
                ) : (
                  <>
                    <span className={CHIP}>
                      <Sparkles size={11} className="mr-1" />
                      AI-прогонов: {d.ai_runs_count}
                    </span>
                    {d.last_review_status && (
                      <span className={CHIP}>review: {d.last_review_status}</span>
                    )}
                    {d.last_hallucination_risk && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 ${riskChipClass(d.last_hallucination_risk)}`}
                      >
                        галлюцинации: {d.last_hallucination_risk}
                      </span>
                    )}
                    {d.last_legal_accuracy_score != null && (
                      <span className={CHIP}>
                        точность: {Number(d.last_legal_accuracy_score).toFixed(2)}
                      </span>
                    )}
                    {d.last_needs_lawyer_review && (
                      <span className="inline-flex items-center rounded-full bg-red-500/20 px-2 py-0.5 text-red-100">
                        нужна проверка юриста
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-foreground/60">
                <span>создан: {fmtDate(d.created_at)}</span>
                <span>обновлён: {fmtDate(d.updated_at)}</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => d.generated_document_id && openDocument(d.generated_document_id)}
                  disabled={!d.generated_document_id || openingDocId === d.generated_document_id}
                  className={BTN}
                >
                  {openingDocId === d.generated_document_id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ExternalLink size={12} />
                  )}
                  Открыть документ
                </button>
                <button
  type="button"
  onClick={() =>
    navigate({
      to: "/workspace/document-drafts/$sessionId/ai-history",
      params: {
        sessionId: d.session_id,
      },
    })
  }
  className={BTN}
>
  <History size={12} /> История AI
</button>
                <button
                  type="button"
                  onClick={() => rerunAi(d)}
                  disabled={rerunningId === d.session_id}
                  className={BTN}
                >
                  {rerunningId === d.session_id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  Повторный AI-анализ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Архивировать этот черновик?")) {
                      archive.mutate(d.session_id);
                    }
                  }}
                  disabled={archive.isPending}
                  className={BTN}
                >
                  <Archive size={12} /> Архивировать
                </button>
              </div>

              
            </article>
          );
        })}
      </div>
    </div>
  );
}

function AiRunsHistory({ sessionId }: { sessionId: string }) {
  const { data: runs = [], isLoading, error } = useQuery({
    queryKey: ["ai-runs", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_ai_runs" as any)
        .select(
          "id, run_type, status, review_status, hallucination_risk, legal_accuracy_score, needs_lawyer_review, model_name, error_message, created_at, completed_at",
        )
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as AiRun[];
    },
  });

  return (
    <div className="mt-4 rounded-xl border border-white/15 bg-white/[0.06] p-3 backdrop-blur">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
        История AI-прогонов
      </div>
      {isLoading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-foreground/70">
          <Loader2 size={12} className="animate-spin" /> Загрузка…
        </div>
      )}
      {error && (
        <div className="mt-2 text-xs text-red-200">{(error as Error).message}</div>
      )}
      {!isLoading && runs.length === 0 && (
        <div className="mt-2 text-xs text-foreground/70">Прогонов пока нет.</div>
      )}
      <div className="mt-2 space-y-2">
        {runs.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-white/10 bg-white/[0.05] p-2.5 text-xs text-foreground/85"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.run_type ?? "run"}</span>
              {r.status && <span className={CHIP}>{r.status}</span>}
              {r.review_status && <span className={CHIP}>{r.review_status}</span>}
              {r.hallucination_risk && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 ${riskChipClass(r.hallucination_risk)}`}
                >
                  риск: {r.hallucination_risk}
                </span>
              )}
              {r.legal_accuracy_score != null && (
                <span className={CHIP}>
                  точность: {Number(r.legal_accuracy_score).toFixed(2)}
                </span>
              )}
              {r.needs_lawyer_review && (
                <span className="inline-flex items-center rounded-full bg-red-500/20 px-2 py-0.5 text-red-100">
                  нужна проверка юриста
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-foreground/60">
              {r.model_name && <span>модель: {r.model_name}</span>}
              <span>создан: {fmtDate(r.created_at)}</span>
              {r.completed_at && <span>завершён: {fmtDate(r.completed_at)}</span>}
            </div>
            {r.error_message && (
              <div className="mt-1 text-[11px] text-red-200">
                Ошибка: {r.error_message}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
