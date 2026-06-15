import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, GitBranch, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/workspace/generated-documents/$documentId/versions")({
  head: () => ({
    meta: [
      { title: "История версий документа — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VersionsPage,
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
  created_at: string;
  template_key: string | null;
};

const GLASS = "rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md";
const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-foreground/90 backdrop-blur transition hover:bg-white/15";
const CHIP =
  "inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-foreground/80";

function fmt(iso: string | null) {
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

function VersionsPage() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();

  // Загружаем стартовый документ, потом поднимаемся к корню и тянем всю цепочку
  const { data, isLoading, error } = useQuery({
    queryKey: ["doc-version-chain", documentId],
    queryFn: async () => {
      const seen = new Set<string>();
      const chain: DocRow[] = [];

      // 1) поднимаемся к корню
      let currentId: string | null = documentId;
      let rootId = documentId;
      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const { data: row, error } = await supabase
          .from("generated_legal_documents")
          .select(
            "id,title,status,ai_review_status,version_number,parent_document_id,lawyer_approved_at,lawyer_approved_by,created_at,template_key",
          )
          .eq("id", currentId)
          .maybeSingle();
        if (error) throw error;
        if (!row) break;
        rootId = row.id;
        currentId = row.parent_document_id;
      }

      // 2) BFS вниз от корня — все потомки
      const queue: string[] = [rootId];
      const collected = new Set<string>();
      while (queue.length) {
        const parentIds = queue.splice(0, queue.length);
        const { data: rows, error } = await supabase
          .from("generated_legal_documents")
          .select(
            "id,title,status,ai_review_status,version_number,parent_document_id,lawyer_approved_at,lawyer_approved_by,created_at,template_key",
          )
          .or(`id.in.(${parentIds.join(",")}),parent_document_id.in.(${parentIds.join(",")})`);
        if (error) throw error;
        for (const r of (rows ?? []) as DocRow[]) {
          if (!collected.has(r.id)) {
            collected.add(r.id);
            chain.push(r);
            queue.push(r.id);
          }
        }
      }

      return chain;
    },
  });

  const sorted = useMemo(
    () =>
      (data ?? [])
        .slice()
        .sort((a, b) => (b.version_number ?? 1) - (a.version_number ?? 1)),
    [data],
  );

  const openDoc = async (id: string) => {
    const { data, error } = await supabase
      .from("generated_legal_documents")
      .select("title,content")
      .eq("id", id)
      .maybeSingle();
    if (error) return toast.error(error.message);
    if (!data?.content) return toast.error("Содержимое недоступно");
    const blob = new Blob([`# ${data.title ?? "Документ"}\n\n${data.content}`], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/workspace/generated-documents"
          className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white"
        >
          <ArrowLeft size={12} /> Назад к документам
        </Link>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl text-white">История версий</h1>
        <p className="text-sm text-white/70">
          Каждая версия — отдельная юридическая позиция. История неизменна.
        </p>
      </header>

      {isLoading && (
        <div className={`${GLASS} flex items-center gap-2 p-6 text-sm text-foreground/80`}>
          <Loader2 size={14} className="animate-spin" /> Загрузка…
        </div>
      )}

      {error && (
        <div className={`${GLASS} p-6 text-sm text-red-200`}>{(error as Error).message}</div>
      )}

      <div className="grid gap-3">
        {sorted.map((d) => (
          <article key={d.id} className={`${GLASS} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-foreground/60">
                  <GitBranch size={12} /> v{d.version_number ?? 1}
                </div>
                <h2 className="mt-1 truncate text-sm text-white">{d.title || "Без названия"}</h2>
                <div className="mt-1 text-[11px] text-foreground/60">
                  создан: {fmt(d.created_at)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.status && <span className={CHIP}>{d.status}</span>}
                {d.ai_review_status && (
                  <span className={CHIP}>
                    <Sparkles size={11} /> {d.ai_review_status}
                  </span>
                )}
                {d.lawyer_approved_at && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-100">
                    <ShieldCheck size={11} /> {fmt(d.lawyer_approved_at)}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => openDoc(d.id)} className={BTN}>
                <ExternalLink size={12} /> Открыть
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/workspace/generated-documents/$documentId/revise",
                    params: { documentId: d.id },
                  })
                }
                className={BTN}
              >
                Пересмотреть от этой версии
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
