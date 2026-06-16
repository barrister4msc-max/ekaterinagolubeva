import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileWarning,
  GitBranch,
  Loader2,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/workspace/generated-documents/$documentId/revise")({
  head: () => ({
    meta: [
      { title: "Пересмотр документа — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RevisePage,
});

const GLASS = "rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md";
const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-foreground/90 backdrop-blur transition hover:bg-white/15 disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex items-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-400/20 px-3 py-2 text-xs text-emerald-50 backdrop-blur transition hover:bg-emerald-400/30 disabled:opacity-50";
const BTN_NEUTRAL =
  "inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-foreground/90 backdrop-blur transition hover:bg-white/15 disabled:opacity-50";

type DocRow = {
  id: string;
  title: string | null;
  content: string | null;
  status: string | null;
  ai_review_status: string | null;
  version_number: number | null;
  parent_document_id: string | null;
  template_key: string | null;
  template_id: string | null;
  category: string | null;
  intake_session_id: string | null;
  lead_id: string | null;
  crm_lead_id: string | null;
  metadata: any;
};

type Step = "materials" | "analysis" | "decision";

type StructuredAnalysis = {
  run_type?: string;
  revision_summary?: {
    overall_change_level?: string;
    does_legal_position_change?: boolean;
    short_summary?: string;
    recommended_action?: string;
  };
  new_facts?: any[];
  changed_facts?: any[];
  contradictions?: any[];
  missing_evidence?: any[];
  legal_reassessment?: {
    previous_law_assumptions?: any[];
    still_applicable_laws?: any[];
    new_possible_laws?: any[];
    alternative_legal_approaches?: any[];
    why_position_changes_or_not?: string;
  };
  court_practice?: {
    supporting?: any[];
    opposing?: any[];
    conflicting?: any[];
  };
  risk_change?: {
    previous_risk_level?: string;
    new_risk_level?: string;
    reason?: string;
    risk_factors?: any[];
  };
  opponent_arguments?: any[];
  lawyer_decision_options?: Array<{ option?: string; label?: string; reason?: string }>;
  warnings?: any[];
  needs_lawyer_review?: boolean;
};

type AnalysisResult = StructuredAnalysis & {
  // legacy/fallback shape
  legal_assessment?: {
    previous_norms?: string[];
    previous_reasoning?: string;
    still_applicable?: boolean;
    new_norms?: string[];
    alternatives?: string[];
    rejected_reason?: string;
  };
  case_law?: {
    supporting?: string[];
    opposing?: string[];
    conflicting?: string[];
  };
  risks?: {
    before?: string;
    after?: string;
    reason?: string;
  };
  raw?: any;
};

function RevisePage() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("materials");
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["doc-for-revise", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .select(
          "id,title,content,status,ai_review_status,version_number,parent_document_id,template_key,template_id,category,intake_session_id,lead_id,crm_lead_id,metadata",
        )
        .eq("id", documentId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Документ не найден");
      return data as DocRow;
    },
  });

  const runAnalysis = async () => {
    if (!doc) return;
    setRunning(true);
    setAnalysis(null);
    try {
      // EVIDENCE_LAYER: сейчас передаём список имён файлов. В будущем — id из documents
      // c привязкой к фактам/нормам в Evidence-графе.
      const { data, error } = await supabase.functions.invoke(
        "review-generated-legal-document",
        {
          body: {
            document_id: doc.id,
            generated_document_id: doc.id,
            session_id: doc.intake_session_id,
            parent_document_id: doc.id,
            run_type: "revision_analysis",
            revision_materials: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.success === false) {
        throw new Error((data as any)?.error ?? "Ошибка AI-анализа");
      }
      const top = data as any;
      // structured contract: revision_analysis lives at top-level when run_type matches
      const structured =
        top?.run_type === "revision_analysis"
          ? top
          : top?.revision_analysis ?? top?.analysis ?? top?.result ?? top ?? {};
      setAnalysis({ ...structured, raw: data });
      setStep("analysis");
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось выполнить AI-анализ");
    } finally {
      setRunning(false);
    }
  };

  const keepCurrent = () => {
    toast.success("Текущая версия оставлена актуальной");
    navigate({ to: "/workspace/generated-documents" });
  };

  const createNewVersion = async () => {
    if (!doc) return;
    setCreating(true);
    try {
      const nextVersion = (doc.version_number ?? 1) + 1;
      const insertPayload: Record<string, any> = {
        title: doc.title,
        content: doc.content, // черновик — копия предыдущей версии; редактируется в дальнейшем шаге
        status: "draft",
        ai_review_status: "pending",
        parent_document_id: doc.id,
        version_number: nextVersion,
        template_key: doc.template_key,
        template_id: doc.template_id,
        category: doc.category,
        intake_session_id: doc.intake_session_id,
        lead_id: doc.lead_id,
        crm_lead_id: doc.crm_lead_id,
        metadata: {
          ...(doc.metadata ?? {}),
          revision_of: doc.id,
          revision_analysis: analysis ?? null,
          // EVIDENCE_LAYER: сюда будет вложен снимок Evidence-графа на момент пересмотра
        },
      };
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .insert(insertPayload as any)
        .select("id")
        .single();
      if (error) throw error;
      toast.success(`Создана новая версия v${nextVersion}`);
      navigate({
        to: "/workspace/generated-documents/$documentId/versions",
        params: { documentId: (data as any).id },
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось создать новую версию");
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`${GLASS} flex items-center gap-2 p-6 text-sm text-foreground/80`}>
        <Loader2 size={14} className="animate-spin" /> Загрузка…
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div className={`${GLASS} p-6 text-sm text-red-200`}>
        {(error as Error)?.message ?? "Документ не найден"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/workspace/generated-documents"
          className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white"
        >
          <ArrowLeft size={12} /> К документам
        </Link>
      </div>

      <header className={`${GLASS} p-5`}>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-foreground/60">
          <RefreshCcw size={12} /> Пересмотр документа
        </div>
        <h1 className="mt-1 font-display text-2xl text-white">
          {doc.title || "Без названия"} <span className="text-white/50">· v{doc.version_number ?? 1}</span>
        </h1>
        <p className="mt-2 text-sm text-white/70">
          История версий неизменна. Новые обстоятельства создают новый цикл анализа, а не
          переписывают прошлое.
        </p>
      </header>

      <StepBar step={step} />

      {step === "materials" && (
        <section className={`${GLASS} space-y-4 p-5`}>
          <h2 className="font-display text-lg text-white">Шаг 1. Новые материалы</h2>
          <p className="text-sm text-foreground/80">
            Загрузите дополнительные соглашения, переписку, судебные акты, новые доказательства.
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 bg-white/5 p-8 text-sm text-foreground/80 hover:bg-white/10">
            <Upload size={18} />
            <span>Перетащите файлы сюда или нажмите для выбора</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...list]);
              }}
            />
          </label>
          {files.length > 0 && (
            <ul className="space-y-1 text-xs text-foreground/80">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5"
                >
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    className="text-white/50 hover:text-white"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    удалить
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* EVIDENCE_LAYER: здесь появится привязка каждого загруженного файла к
              конкретному факту/норме/доказательству в Evidence-графе. */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={runAnalysis} disabled={running} className={BTN_PRIMARY}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Запустить AI-анализ изменений
            </button>
            <button
              type="button"
              onClick={() => setStep("analysis")}
              disabled={!analysis}
              className={BTN}
            >
              К результатам анализа
            </button>
          </div>
        </section>
      )}

      {step === "analysis" && (
        <section className="space-y-4">
          <AnalysisView analysis={analysis} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep("materials")} className={BTN}>
              <ArrowLeft size={12} /> Назад к материалам
            </button>
            <button type="button" onClick={() => setStep("decision")} className={BTN_PRIMARY}>
              К решению юриста
            </button>
          </div>
        </section>
      )}

      {step === "decision" && (
        <section className={`${GLASS} space-y-5 p-5`}>
          <h2 className="font-display text-lg text-white">Шаг 3. Решение юриста</h2>
          <p className="text-sm text-foreground/80">
            Только юрист принимает решение. AI — это инструмент анализа, а не источник истины.
          </p>
          {/* EVIDENCE_LAYER: обоснование выбора юриста уйдёт в Evidence-журнал. */}
          <div className="grid gap-3 md:grid-cols-2">
            <button type="button" onClick={keepCurrent} className={BTN_NEUTRAL}>
              <ShieldCheck size={14} />
              Оставить текущую версию актуальной
            </button>
            <button
              type="button"
              onClick={createNewVersion}
              disabled={creating}
              className={BTN_PRIMARY}
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
              Создать новую версию документа (v{(doc.version_number ?? 1) + 1})
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function StepBar({ step }: { step: Step }) {
  const steps: Array<{ id: Step; label: string }> = [
    { id: "materials", label: "1. Материалы" },
    { id: "analysis", label: "2. AI-анализ" },
    { id: "decision", label: "3. Решение юриста" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((s) => (
        <span
          key={s.id}
          className={`rounded-full border px-3 py-1 text-xs ${
            s.id === step
              ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-50"
              : "border-white/15 bg-white/5 text-foreground/80"
          }`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Section({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items?: string[] | null;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`${GLASS} p-4`}>
      <div className="flex items-center gap-2 text-sm text-white">
        {icon}
        <h3 className="font-display">{title}</h3>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/85">
        {items.map((s, i) => (
          <li key={i}>{String(s)}</li>
        ))}
      </ul>
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: AnalysisResult | null }) {
  if (!analysis) {
    return (
      <div className={`${GLASS} p-5 text-sm text-foreground/80`}>
        AI-анализ ещё не запущен.
      </div>
    );
  }
  const la = analysis.legal_assessment ?? {};
  const cl = analysis.case_law ?? {};
  const r = analysis.risks ?? {};
  const hasAny =
    (analysis.new_facts?.length ?? 0) +
      (analysis.changed_facts?.length ?? 0) +
      (analysis.contradictions?.length ?? 0) +
      (analysis.missing_evidence?.length ?? 0) +
      (la.new_norms?.length ?? 0) +
      (la.alternatives?.length ?? 0) +
      (cl.supporting?.length ?? 0) +
      (cl.opposing?.length ?? 0) +
      (cl.conflicting?.length ?? 0) >
    0;

  return (
    <div className="space-y-3">
      <Section
        icon={<Sparkles size={14} className="text-emerald-200" />}
        title="Новые факты"
        items={analysis.new_facts}
      />
      <Section
        icon={<RefreshCcw size={14} className="text-amber-200" />}
        title="Изменённые факты"
        items={analysis.changed_facts}
      />
      <Section
        icon={<AlertTriangle size={14} className="text-red-200" />}
        title="Противоречия"
        items={analysis.contradictions}
      />
      <Section
        icon={<FileWarning size={14} className="text-amber-200" />}
        title="Недостающие доказательства"
        items={analysis.missing_evidence}
      />

      {(la.previous_norms?.length || la.new_norms?.length || la.alternatives?.length) && (
        <div className={`${GLASS} space-y-2 p-4`}>
          <div className="flex items-center gap-2 text-sm text-white">
            <Scale size={14} /> <h3 className="font-display">Изменение правовой оценки</h3>
          </div>
          {la.previous_norms?.length ? (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Применялись ранее: </span>
              {la.previous_norms.join(", ")}
            </p>
          ) : null}
          {la.previous_reasoning && (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Обоснование: </span>
              {la.previous_reasoning}
            </p>
          )}
          {typeof la.still_applicable === "boolean" && (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Применимы сейчас: </span>
              {la.still_applicable ? "да" : "нет"}
            </p>
          )}
          {la.new_norms?.length ? (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Новые нормы: </span>
              {la.new_norms.join(", ")}
            </p>
          ) : null}
          {la.alternatives?.length ? (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Альтернативы: </span>
              {la.alternatives.join(", ")}
            </p>
          ) : null}
          {la.rejected_reason && (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Почему альтернативы отклонены: </span>
              {la.rejected_reason}
            </p>
          )}
        </div>
      )}

      <Section
        icon={<CheckCircle2 size={14} className="text-emerald-200" />}
        title="Судебная практика: за позицию"
        items={cl.supporting}
      />
      <Section
        icon={<AlertTriangle size={14} className="text-red-200" />}
        title="Судебная практика: против позиции"
        items={cl.opposing}
      />
      <Section
        icon={<FileWarning size={14} className="text-amber-200" />}
        title="Судебная практика: противоречивая"
        items={cl.conflicting}
      />

      {(r.before || r.after) && (
        <div className={`${GLASS} space-y-1 p-4`}>
          <div className="flex items-center gap-2 text-sm text-white">
            <AlertTriangle size={14} /> <h3 className="font-display">Риски</h3>
          </div>
          {r.before && (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Было: </span>
              {r.before}
            </p>
          )}
          {r.after && (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Стало: </span>
              {r.after}
            </p>
          )}
          {r.reason && (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Причина изменения: </span>
              {r.reason}
            </p>
          )}
        </div>
      )}

      {!hasAny && (
        <div className={`${GLASS} p-4 text-sm text-foreground/80`}>
          AI вернул ответ, но структурированных секций не обнаружено. Полный ответ:
          <pre className="mt-2 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] text-foreground/80">
            {JSON.stringify(analysis.raw ?? analysis, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
