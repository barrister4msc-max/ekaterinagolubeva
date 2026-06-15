import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, ClipboardList, FileText, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/workspace/archive")({
  head: () => ({
    meta: [
      { title: "Архив — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ArchivePage,
});

const GLASS = "rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md";
const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-foreground/90 backdrop-blur transition hover:bg-white/15 disabled:opacity-50";

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

function ArchivePage() {
  const qc = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const sessionsQ = useQuery({
    queryKey: ["archive-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_sessions")
        .select("id,title,template_code,status,archived_at,updated_at")
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const docsQ = useQuery({
    queryKey: ["archive-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .select("id,title,template_key,status,version_number,archived_at,created_at")
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const restoreSession = useMutation({
    mutationFn: async (id: string) => {
      setRestoringId(id);
      const { error } = await supabase.rpc("restore_document_intake_session" as any, {
        p_session_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Опросник восстановлен");
      qc.invalidateQueries({ queryKey: ["archive-sessions"] });
      qc.invalidateQueries({ queryKey: ["intake-sessions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Ошибка"),
    onSettled: () => setRestoringId(null),
  });

  const restoreDoc = useMutation({
    mutationFn: async (id: string) => {
      setRestoringId(id);
      const { error } = await supabase
        .from("generated_legal_documents")
        .update({ archived_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Документ восстановлен");
      qc.invalidateQueries({ queryKey: ["archive-documents"] });
      qc.invalidateQueries({ queryKey: ["generated-documents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Ошибка"),
    onSettled: () => setRestoringId(null),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl text-white">Архив</h1>
        <p className="text-sm text-white/70">
          Архивированные опросники и сформированные документы.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-lg text-white flex items-center gap-2">
          <ClipboardList size={16} /> Опросники
        </h2>
        {sessionsQ.isLoading && (
          <div className={`${GLASS} p-4 text-sm text-foreground/80`}>
            <Loader2 size={14} className="inline animate-spin" /> Загрузка…
          </div>
        )}
        {sessionsQ.data?.length === 0 && (
          <div className={`${GLASS} p-6 text-sm text-foreground/70`}>Пусто.</div>
        )}
        <div className="grid gap-3">
          {(sessionsQ.data ?? []).map((s: any) => (
            <article key={s.id} className={`${GLASS} flex items-center justify-between gap-3 p-4`}>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-foreground/60">
                  {s.template_code ?? "—"}
                </div>
                <div className="truncate text-sm text-white">{s.title || "Без названия"}</div>
                <div className="text-[11px] text-foreground/60">
                  архивирован: {fmt(s.archived_at)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => restoreSession.mutate(s.id)}
                disabled={restoringId === s.id}
                className={BTN}
              >
                {restoringId === s.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RotateCcw size={12} />
                )}
                Восстановить
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg text-white flex items-center gap-2">
          <FileText size={16} /> Документы
        </h2>
        {docsQ.isLoading && (
          <div className={`${GLASS} p-4 text-sm text-foreground/80`}>
            <Loader2 size={14} className="inline animate-spin" /> Загрузка…
          </div>
        )}
        {docsQ.data?.length === 0 && (
          <div className={`${GLASS} p-6 text-sm text-foreground/70`}>Пусто.</div>
        )}
        <div className="grid gap-3">
          {(docsQ.data ?? []).map((d: any) => (
            <article key={d.id} className={`${GLASS} flex items-center justify-between gap-3 p-4`}>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-foreground/60">
                  {d.template_key ?? "—"} · v{d.version_number ?? 1}
                </div>
                <div className="truncate text-sm text-white">{d.title || "Без названия"}</div>
                <div className="text-[11px] text-foreground/60">
                  архивирован: {fmt(d.archived_at)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => restoreDoc.mutate(d.id)}
                disabled={restoringId === d.id}
                className={BTN}
              >
                {restoringId === d.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RotateCcw size={12} />
                )}
                Восстановить
              </button>
            </article>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-foreground/50">
        <Archive size={10} className="mr-1 inline" />
        История версий и доказательная база сохраняются вместе с архивными документами.
      </p>
    </div>
  );
}
