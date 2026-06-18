import { createFileRoute, useNavigate, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  { id: "ai", label: "AI проверка" },
  { id: "risks", label: "Риски и рекомендации" },
  { id: "versions", label: "История версий" },
  { id: "revise", label: "Пересмотр" },
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
  // also look one level deeper in common nests
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

  const downloadMd = () => {
    if (!doc) return;
    const blob = new Blob([`# ${doc.title ?? "Документ"}\n\n${doc.content ?? ""}`], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(doc.title ?? "document").replace(/[^\w\-]+/g, "_")}_v${doc.version_number}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

  const legalScore = pickScalar(doc.metadata, "legal_accuracy_score", "accuracy_score", "score");
  const hallucinationRisk = pickScalar(doc.metadata, "hallucination_risk", "risk");
  const risks = pickArray(doc.metadata, "risks", "problems");
  const recs = pickArray(doc.metadata, "recommendations", "suggestions");
  const fixes = pickArray(doc.metadata, "required_fixes", "fixes");
  const notes = pickArray(doc.metadata, "quality_notes", "notes");
  const aiBlock = (doc.metadata as any)?.ai_review ?? (doc.metadata as any)?.review;

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
        <button type="button" onClick={downloadMd} className={BTN}>
          <Download size={12} /> Скачать .md
        </button>
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
        <section className="relative space-y-3 pb-24">
          {isApproved && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-400/10 p-3 text-xs text-amber-50">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Одобренную или финальную версию нельзя изменить напрямую. Создайте новую версию.
              </span>
            </div>
          )}
          <div className="mx-auto w-full max-w-[900px] rounded-3xl bg-slate-200/80 p-4 shadow-2xl ring-1 ring-white/20 sm:p-6">
  <div className="mx-auto min-h-[780px] w-full max-w-[794px] rounded-sm bg-white px-[64px] py-[72px] shadow-xl ring-1 ring-black/10">
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
        fontSize: "16px",
        lineHeight: 1.6,
      }}
      className="block min-h-[680px] w-full resize-none border-0 bg-white p-0 font-serif text-[16px] font-medium leading-relaxed text-black outline-none placeholder:text-slate-500"
      placeholder="Текст документа..."
    />
  </div>

  <p className="mt-4 text-center text-[11px] italic text-slate-700">
    Рабочий текст документа. Правки юриста сохраняются в соответствии со статусом версии.
  </p>
</div>
          <div className="sticky bottom-4 z-50 mx-auto mt-6 flex w-full max-w-[1000px] flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <button
              type="button"
              onClick={() => saveEdits.mutate()}
              disabled={isApproved || !dirty || saveEdits.isPending}
              className={BTN_PRIMARY}
            >
              {saveEdits.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Сохранить правки
            </button>
            <button
              type="button"
              onClick={() => createVersion.mutate()}
              disabled={createVersion.isPending || !edited}
              className={BTN_AMBER}
            >
              {createVersion.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <GitBranch size={12} />
              )}
              Создать новую версию из правок
            </button>
            {!isApproved && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("Одобрить документ?")) approve.mutate();
                }}
                disabled={approve.isPending}
                className={BTN_EMERALD}
              >
                {approve.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={12} />
                )}
                Одобрить документ
              </button>
            )}
          </div>
          {/* EVIDENCE_LAYER: связь правок с фактами и доказательствами */}
        </section>
      )}

      {tab === "ai" && (
        <section className={`${GLASS} p-5 space-y-3`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white/15 bg-white/5 p-3">
              <div className="text-[11px] uppercase text-foreground/60">AI статус</div>
              <div className="mt-1 text-sm text-white">{doc.ai_review_status ?? "—"}</div>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/5 p-3">
              <div className="text-[11px] uppercase text-foreground/60">Юридическая точность</div>
              <div className="mt-1 text-sm text-white">
                {legalScore !== undefined ? String(legalScore) : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/5 p-3">
              <div className="text-[11px] uppercase text-foreground/60">Риск галлюцинаций</div>
              <div className="mt-1 text-sm text-white">
                {hallucinationRisk !== undefined ? String(hallucinationRisk) : "—"}
              </div>
            </div>
          </div>
          {aiBlock ? (
            <pre className="overflow-auto rounded-lg border border-white/15 bg-black/40 p-3 text-[11px] text-foreground/80">
              {JSON.stringify(aiBlock, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-foreground/70">
              AI проверка есть, но структурированные данные пока отсутствуют.
            </p>
          )}
          {/* EVIDENCE_LAYER: связь AI выводов с нормами права и практикой */}
        </section>
      )}

      {tab === "risks" && (
        <section className={`${GLASS} p-5 space-y-4`}>
          <RiskList title="Риски" items={risks} />
          <RiskList title="Рекомендации" items={recs} />
          <RiskList title="Обязательные правки" items={fixes} />
          <RiskList title="Заметки по качеству" items={notes} />
          {risks.length + recs.length + fixes.length + notes.length === 0 && (
            <p className="text-sm text-foreground/70">Данных пока нет.</p>
          )}
        </section>
      )}

      {tab === "versions" && (
        <section className={`${GLASS} p-5 space-y-3`}>
          <p className="text-sm text-foreground/80">
            Полная история версий с цепочкой parent/child.
          </p>
          <Link
            to="/workspace/generated-documents/$documentId/versions"
            params={{ documentId: doc.id }}
            className={BTN}
          >
            <GitBranch size={12} /> Открыть историю версий
          </Link>
        </section>
      )}

      {tab === "revise" && (
        <section className={`${GLASS} p-5 space-y-3`}>
          <p className="text-sm text-foreground/80">
            Пересмотр запускает 3-шаговый цикл: материалы → анализ → решение.
          </p>
          <button
            type="button"
            onClick={() => {
              navigate({
                to: "/workspace/generated-documents/$documentId/revise",
                params: { documentId },
              });
            }}
            className={BTN_AMBER}
          >
            <RefreshCcw size={12} /> Начать пересмотр
          </button>
          {/* EVIDENCE_LAYER: новые обстоятельства не переписывают историю, создаётся новый цикл */}
        </section>
      )}
    </div>
  );
}

function RiskList({ title, items }: { title: string; items: any[] }) {
  if (!items.length) return null;
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
