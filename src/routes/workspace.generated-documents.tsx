import { createFileRoute, useNavigate, Outlet, useRouterState, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ExternalLink,
  FileText,
  GitBranch,
  Loader2,
  RefreshCcw,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/workspace/generated-documents")({
  head: () => ({
    meta: [
      { title: "Мои сформированные документы — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GeneratedDocumentsPage,
});

type DocRow = {
  id: string;
  title: string | null;
  status: string | null;
  ai_review_status: string | null;
  version_number: number | null;
  parent_document_id: string | null;
  lawyer_approved_at: string | null;
  lawyer_approved_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string | null;
  intake_session_id: string | null;
  template_key: string | null;
};

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "ai_draft", label: "AI черновики" },
  { id: "in_review", label: "На проверке" },
  { id: "approved", label: "Одобренные" },
  { id: "final", label: "Финальные" },
  { id: "needs_revision", label: "Требующие пересмотра" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

const GLASS = "rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md";
const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-foreground/90 backdrop-blur transition hover:bg-white/15 disabled:opacity-50";
const BTN_AMBER =
  "inline-flex items-center gap-1.5 rounded-lg border border-amber-300/40 bg-amber-400/20 px-3 py-1.5 text-xs text-amber-50 backdrop-blur transition hover:bg-amber-400/30 disabled:opacity-50";
const CHIP =
  "inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-foreground/80";

function fmt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function matchesFilter(d: DocRow, f: FilterId) {
  if (f === "all") return true;
  const s = (d.status ?? "").toLowerCase();
  const ai = (d.ai_review_status ?? "").toLowerCase();
  if (f === "ai_draft") return s === "draft" || s === "ai_draft" || ai === "draft";
  if (f === "in_review") return s === "in_review" || s === "review" || ai === "in_review";
  if (f === "approved") return s === "approved" || Boolean(d.lawyer_approved_at);
  if (f === "final") return s === "final" || s === "finalized";
  if (f === "needs_revision")
    return s === "needs_revision" || ai === "needs_revision" || ai === "rejected";
  return true;
}

function GeneratedDocumentsPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDetail = /\/workspace\/generated-documents\/[^/]+(\/(versions|revise))?$/.test(pathname);
  if (isDetail) return <Outlet />;
  return <DocumentsList />;
}

function DocumentsList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterId>("all");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const { data: docs = [], isLoading, error } = useQuery({
    queryKey: ["generated-documents", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .select(
          "id,title,status,ai_review_status,version_number,parent_document_id,lawyer_approved_at,lawyer_approved_by,archived_at,created_at,updated_at,intake_session_id,template_key",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
  });

  // Группируем по корневому документу: показываем последнюю версию в цепочке
  const latestPerChain = useMemo(() => {
    const byId = new Map<string, DocRow>();
    docs.forEach((d) => byId.set(d.id, d));
    const rootOf = (d: DocRow): string => {
      let cur = d;
      const seen = new Set<string>();
      while (cur.parent_document_id && byId.has(cur.parent_document_id) && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = byId.get(cur.parent_document_id)!;
      }
      return cur.id;
    };
    const latest = new Map<string, DocRow>();
    for (const d of docs) {
      const root = rootOf(d);
      const prev = latest.get(root);
      if (!prev || (d.version_number ?? 1) > (prev.version_number ?? 1)) {
        latest.set(root, d);
      }
    }
    return Array.from(latest.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [docs]);

  const filtered = useMemo(
    () => latestPerChain.filter((d) => matchesFilter(d, filter)),
    [latestPerChain, filter],
  );

  const openDoc = async (id: string) => {
    setOpeningId(id);
    try {
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .select("title,content")
        .eq("id", id)
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
      setOpeningId(null);
    }
  };

  const archive = useMutation({
    mutationFn: async (id: string) => {
      setArchivingId(id);
      const { error } = await supabase
        .from("generated_legal_documents")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Документ перемещён в архив");
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось архивировать"),
    onSettled: () => setArchivingId(null),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl text-white">Мои сформированные документы</h1>
        <p className="text-sm text-white/70">
          История юридических позиций. Каждая версия — это отдельная оценка фактов и норм.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              filter === f.id
                ? "border-white/40 bg-white/20 text-white"
                : "border-white/15 bg-white/5 text-foreground/80 hover:bg-white/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className={`${GLASS} flex items-center gap-2 p-6 text-sm text-foreground/80`}>
          <Loader2 size={14} className="animate-spin" /> Загрузка…
        </div>
      )}

      {error && (
        <div className={`${GLASS} p-6 text-sm text-red-200`}>{(error as Error).message}</div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className={`${GLASS} p-10 text-center text-sm text-foreground/80`}>
          Документов в этом фильтре пока нет.{" "}
          <Link to="/workspace/document-builder" className="underline">
            Создать документ
          </Link>
          .
        </div>
      )}

      <div className="grid gap-4">
        {filtered.map((d) => (
          <article key={d.id} className={`${GLASS} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-foreground/60">
                  <FileText size={12} />
                  {d.template_key ?? "—"}
                </div>
                <h2 className="mt-1 truncate font-display text-lg text-white">
                  {d.title || "Без названия"}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={CHIP}>v{d.version_number ?? 1}</span>
                {d.status && <span className={CHIP}>статус: {d.status}</span>}
                {d.ai_review_status && (
                  <span className={CHIP}>
                    <Sparkles size={11} /> AI: {d.ai_review_status}
                  </span>
                )}
                {d.lawyer_approved_at && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-100">
                    <ShieldCheck size={11} /> Одобрен {fmt(d.lawyer_approved_at)}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-foreground/60">
              <span>создан: {fmt(d.created_at)}</span>
              {d.updated_at && <span>обновлён: {fmt(d.updated_at)}</span>}
              {d.lawyer_approved_by && (
                <span>одобрил: {d.lawyer_approved_by.slice(0, 8)}…</span>
              )}
            </div>

            {/* EVIDENCE_LAYER: блок «Доказательная база версии» — факты, документы, нормы, практика */}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/workspace/generated-documents/$documentId",
                    params: { documentId: d.id },
                  })
                }
                className={BTN}
              >
                <ExternalLink size={12} />
                Открыть документ
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/workspace/generated-documents/$documentId/versions",
                    params: { documentId: d.id },
                  })
                }
                className={BTN}
              >
                <GitBranch size={12} /> История версий
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/workspace/generated-documents/$documentId/revise",
                    params: { documentId: d.id },
                  })
                }
                className={BTN_AMBER}
              >
                <RefreshCcw size={12} /> Пересмотреть документ
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Архивировать документ?")) archive.mutate(d.id);
                }}
                disabled={archivingId === d.id}
                className={BTN}
              >
                {archivingId === d.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Archive size={12} />
                )}
                Архивировать
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
