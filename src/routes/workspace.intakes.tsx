import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ClipboardList,
  History,
  Loader2,
  PlayCircle,
  Sparkles,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/workspace/intakes")({
  head: () => ({
    meta: [
      { title: "Мои опросники — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntakesPage,
});

type SessionRow = {
  id: string;
  title: string | null;
  template_code: string | null;
  status: string | null;
  generated_document_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type AnswerRow = {
  session_id: string;
  field_name: string;
  value_source: string | null;
};

const GLASS = "rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md";
const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-foreground/90 backdrop-blur transition hover:bg-white/15 disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/40 bg-emerald-400/20 px-3 py-1.5 text-xs text-emerald-50 backdrop-blur transition hover:bg-emerald-400/30 disabled:opacity-50";
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

function IntakesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: ["intake-sessions", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_sessions")
        .select(
          "id,title,template_code,status,generated_document_id,created_at,updated_at,archived_at",
        )
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);

  // answers — для подсчёта прогресса и AI-флага
  const { data: answers = [] } = useQuery({
    queryKey: ["intake-answers-bulk", sessionIds.join(",")],
    enabled: sessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_answers")
        .select("session_id,field_name,value_source")
        .in("session_id", sessionIds);
      if (error) throw error;
      return (data ?? []) as AnswerRow[];
    },
  });

  // schemas — для расчёта total fields по template_code
  const templateCodes = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.template_code).filter(Boolean))) as string[],
    [sessions],
  );

  const { data: schemas = [] } = useQuery({
    queryKey: ["intake-schemas-bulk", templateCodes.join(",")],
    enabled: templateCodes.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_schemas")
        .select("template_code,schema_json,required_fields")
        .in("template_code", templateCodes)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Array<{
        template_code: string;
        schema_json: any;
        required_fields: string[] | null;
      }>;
    },
  });

  const totalsByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of schemas) {
      const steps = s.schema_json?.steps ?? [];
      let count = 0;
      for (const step of steps) {
        for (const f of step?.fields ?? []) {
          if (f?.key || f?.name) count += 1;
        }
      }
      if (count === 0 && Array.isArray(s.required_fields)) count = s.required_fields.length;
      map.set(s.template_code, count);
    }
    return map;
  }, [schemas]);

  const statsBySession = useMemo(() => {
    const map = new Map<string, { answered: number; aiFilled: boolean }>();
    for (const a of answers) {
      const cur = map.get(a.session_id) ?? { answered: 0, aiFilled: false };
      cur.answered += 1;
      if (a.value_source === "ai") cur.aiFilled = true;
      map.set(a.session_id, cur);
    }
    return map;
  }, [answers]);

  // Кол-во связанных сгенерированных документов
  const { data: docsCount = new Map<string, number>() } = useQuery({
    queryKey: ["generated-docs-count", sessionIds.join(",")],
    enabled: sessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .select("intake_session_id")
        .in("intake_session_id", sessionIds);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of (data ?? []) as Array<{ intake_session_id: string }>) {
        m.set(r.intake_session_id, (m.get(r.intake_session_id) ?? 0) + 1);
      }
      return m;
    },
  });

  const archive = useMutation({
    mutationFn: async (sessionId: string) => {
      setArchivingId(sessionId);
      const { error } = await supabase.rpc("archive_document_intake_session" as any, {
        p_session_id: sessionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Опросник перемещён в архив");
      queryClient.invalidateQueries({ queryKey: ["intake-sessions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось архивировать"),
    onSettled: () => setArchivingId(null),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl text-white">Мои опросники</h1>
        <p className="text-sm text-white/70">
          Сохранённые анкеты по шаблонам. Сортировка — по последнему изменению.
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

      {!isLoading && !error && sessions.length === 0 && (
        <div className={`${GLASS} p-10 text-center text-sm text-foreground/80`}>
          Активных опросников пока нет.{" "}
          <Link to="/workspace/document-builder" className="underline">
            Открыть конструктор
          </Link>
          .
        </div>
      )}

      <div className="grid gap-4">
        {sessions.map((s) => {
          const stats = statsBySession.get(s.id) ?? { answered: 0, aiFilled: false };
          const total = (s.template_code && totalsByCode.get(s.template_code)) || 0;
          const progress = total > 0 ? Math.min(100, Math.round((stats.answered / total) * 100)) : 0;
          const ready = total > 0 && stats.answered >= total;
          const linkedDocs = docsCount.get(s.id) ?? 0;

          return (
            <article key={s.id} className={`${GLASS} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-foreground/60">
                    <ClipboardList size={12} />
                    {s.template_code ?? "—"}
                  </div>
                  <h2 className="mt-1 truncate font-display text-lg text-white">
                    {s.title || "Без названия"}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                      ready
                        ? "bg-emerald-500/20 text-emerald-100"
                        : "bg-amber-500/20 text-amber-100"
                    }`}
                  >
                    {ready ? "🟢 Готов к формированию" : "🟡 В работе"}
                  </span>
                  {stats.aiFilled && (
                    <span className={CHIP}>
                      <Sparkles size={11} /> AI-заполнение
                    </span>
                  )}
                  {linkedDocs > 0 && (
                    <span className={CHIP}>
                      <FileText size={11} /> документов: {linkedDocs}
                    </span>
                  )}
                </div>
              </div>

              {total > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-foreground/70">
                    <span>
                      Заполнено {stats.answered} из {total}
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-emerald-400/70 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-foreground/60">
                <span>создан: {fmt(s.created_at)}</span>
                <span>обновлён: {fmt(s.updated_at)}</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/workspace/document-builder",
                      search: { sessionId: s.id } as any,
                    })
                  }
                  className={BTN_PRIMARY}
                >
                  <PlayCircle size={12} /> Продолжить работу
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/workspace/document-drafts/$sessionId/ai-history",
                      params: { sessionId: s.id },
                    })
                  }
                  className={BTN}
                >
                  <History size={12} /> История AI заполнения
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Архивировать опросник?")) archive.mutate(s.id);
                  }}
                  disabled={archivingId === s.id}
                  className={BTN}
                >
                  {archivingId === s.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Archive size={12} />
                  )}
                  Архивировать
                </button>
              </div>

              {/* EVIDENCE_LAYER: здесь появится связка ответов опросника с фактами/доказательствами */}
            </article>
          );
        })}
      </div>
    </div>
  );
}
