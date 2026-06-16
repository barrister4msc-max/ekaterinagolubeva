import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
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
type RevisionMaterial = {
  document_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size: number | null;
  ocr_text: string | null;
  ocr_text_length: number;
};
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
  court_practice?: any;
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
  revision_analysis?: StructuredAnalysis;
  analysis?: StructuredAnalysis;
  result?: StructuredAnalysis;
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

function normalizeAnalysis(input: any): AnalysisResult | null {
  if (!input) return null;
  const obj = typeof input === "object" ? input : {};
  const nested =
    obj?.revision_analysis ??
    obj?.analysis?.revision_analysis ??
    obj?.result?.revision_analysis ??
    obj?.analysis ??
    obj?.result;
  const normalized = nested ?? obj;
  return normalized as AnalysisResult;
}

function normalizeCourtPractice(cp: any): { supporting: any[]; opposing: any[]; conflicting: any[] } {
  if (!cp) return { supporting: [], opposing: [], conflicting: [] };
  if (Array.isArray(cp)) return { supporting: cp, opposing: [], conflicting: [] };
  if (typeof cp === "object") {
    return {
      supporting: Array.isArray(cp.supporting) ? cp.supporting : [],
      opposing: Array.isArray(cp.opposing) ? cp.opposing : [],
      conflicting: Array.isArray(cp.conflicting) ? cp.conflicting : [],
    };
  }
  return { supporting: [], opposing: [], conflicting: [] };
}

const CHANGE_LEVEL_MAP: Record<string, { text: string; color: string }> = {
  none: { text: "Изменений не выявлено", color: "border-emerald-300/40 bg-emerald-400/20 text-emerald-50" },
  low: { text: "Незначительное влияние на позицию", color: "border-sky-300/40 bg-sky-400/20 text-sky-50" },
  medium: { text: "Требуется дополнительная юридическая оценка", color: "border-amber-300/40 bg-amber-400/20 text-amber-50" },
  high: { text: "Существенное изменение правовой позиции", color: "border-red-300/40 bg-red-400/20 text-red-50" },
};

const RECOMMENDED_ACTION_MAP: Record<string, string> = {
  keep_current_version: "Оставить текущую версию документа актуальной",
  create_new_version: "Создать новую юридическую версию документа",
  request_more_documents: "Запросить дополнительные материалы для анализа",
};

function summaryBorderClass(level?: string): string {
  switch (level) {
    case "none":
      return "border-l-4 border-l-emerald-400/60";
    case "low":
      return "border-l-4 border-l-sky-400/60";
    case "medium":
      return "border-l-4 border-l-amber-400/60";
    case "high":
      return "border-l-4 border-l-red-400/60";
    default:
      return "border-l-4 border-l-white/20";
  }
}

function ChangeLevelBadge({ level }: { level?: string }) {
  if (!level) return null;
  const mapped = CHANGE_LEVEL_MAP[level] ?? { text: level, color: "border-white/20 bg-white/10 text-foreground/80" };
  return <Badge className={`text-[11px] ${mapped.color}`}>{mapped.text}</Badge>;
}

function RevisePage() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("materials");
  const [files, setFiles] = useState<File[]>([]);
  const [revisionMaterials, setRevisionMaterials] = useState<RevisionMaterial[]>([]);
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

  useEffect(() => {
    if (!doc) return;
    const saved = doc.metadata?.revision_analysis ?? doc.metadata?.ai_result;
    if (saved) {
      const normalized = normalizeAnalysis(saved);
      if (normalized) {
        setAnalysis(normalized);
      }
    }
  }, [doc]);

  const runAnalysis = async () => {
    if (!doc) return;
    setRunning(true);
    setAnalysis(null);
    try {
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
      const normalized = normalizeAnalysis(data);
      setAnalysis(normalized ?? (data as AnalysisResult));
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
        content: doc.content,
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

function itemToString(it: any): string {
  if (it == null) return "";
  if (typeof it === "string") return it;
  if (typeof it === "object") {
    const text =
      it.text ?? it.fact ?? it.description ?? it.title ?? it.summary ?? it.label ?? it.value;
    const src = it.source ?? it.citation ?? it.quote;
    const conf = it.confidence ?? it.verification_status;
    const parts = [text ?? JSON.stringify(it)];
    if (src) parts.push(`— ${typeof src === "string" ? src : JSON.stringify(src)}`);
    if (conf) parts.push(`(${conf})`);
    return parts.filter(Boolean).join(" ");
  }
  return String(it);
}

function Section({
  icon,
  title,
  items,
  emptyText,
}: {
  icon: React.ReactNode;
  title: string;
  items?: any[] | null;
  emptyText?: string;
}) {
  const hasItems = Array.isArray(items) && items.length > 0;
  return (
    <div className={`${GLASS} p-4`}>
      <div className="flex items-center gap-2 text-sm text-white">
        {icon}
        <h3 className="font-display">{title}</h3>
      </div>
      {hasItems ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/85">
          {items.map((s, i) => (
            <li key={i}>{itemToString(s)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-foreground/50">{emptyText ?? "Нет данных"}</p>
      )}
    </div>
  );
}

function RiskBadge({ level }: { level?: string }) {
  if (!level) return null;
  const color =
    level === "critical" || level === "high"
      ? "border-red-300/40 bg-red-400/20 text-red-50"
      : level === "medium"
        ? "border-amber-300/40 bg-amber-400/20 text-amber-50"
        : level === "low"
          ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-50"
          : "border-white/20 bg-white/10 text-foreground/80";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${color}`}>{level}</span>
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

  const normalized = normalizeAnalysis(analysis) ?? analysis;

  const sum = normalized.revision_summary ?? {};
  const lr = normalized.legal_reassessment ?? {};
  const cp = normalizeCourtPractice(normalized.court_practice);
  const rc = normalized.risk_change ?? {};
  const opts = normalized.lawyer_decision_options ?? [];
  const warns = normalized.warnings ?? [];

  const mappedAction = sum.recommended_action
    ? (RECOMMENDED_ACTION_MAP[sum.recommended_action] ?? sum.recommended_action)
    : null;

  return (
    <div className="space-y-3">
      <div className={`${GLASS} space-y-3 p-5 ${summaryBorderClass(sum.overall_change_level)}`}>
        <div className="flex items-center gap-2 text-base text-white">
          <Sparkles size={16} className="text-emerald-200" />
          <h3 className="font-display text-lg font-semibold">Итог пересмотра</h3>
          <ChangeLevelBadge level={sum.overall_change_level} />
        </div>
        {sum.short_summary && (
          <p className="text-sm leading-relaxed text-white/90">{sum.short_summary}</p>
        )}
        {typeof sum.does_legal_position_change === "boolean" && (
          <p className="text-sm text-white/90">
            <span className="font-medium text-white/70">Меняется ли правовая позиция: </span>
            {sum.does_legal_position_change ? "да" : "нет"}
          </p>
        )}
        {mappedAction && (
          <p className="text-sm text-white/90">
            <span className="font-medium text-white/70">Рекомендация AI: </span>
            {mappedAction}
          </p>
        )}
      </div>

      {warns.length > 0 && (
        <div className={`${GLASS} space-y-2 border-amber-300/30 p-5`}>
          <div className="flex items-center gap-2 text-sm font-medium text-amber-100">
            <AlertTriangle size={14} />
            <h3 className="font-display">Предупреждения AI</h3>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-50/90">
            {warns.map((w, i) => (
              <li key={i}>{itemToString(w)}</li>
            ))}
          </ul>
        </div>
      )}

      <Section
        icon={<Sparkles size={14} className="text-emerald-200" />}
        title="Новые факты"
        items={normalized.new_facts}
        emptyText="Новые факты не выявлены"
      />
      <Section
        icon={<RefreshCcw size={14} className="text-amber-200" />}
        title="Изменённые факты"
        items={normalized.changed_facts}
        emptyText="Изменённые факты не выявлены"
      />
      <Section
        icon={<AlertTriangle size={14} className="text-red-200" />}
        title="Противоречия"
        items={normalized.contradictions}
        emptyText="Противоречий между новой информацией и текущей юридической позицией не обнаружено."
      />
      <Section
        icon={<FileWarning size={14} className="text-amber-200" />}
        title="Недостающие доказательства"
        items={normalized.missing_evidence}
        emptyText="Дополнительных доказательств для пересмотра позиции не требуется."
      />

      {(lr.previous_law_assumptions?.length ||
        lr.still_applicable_laws?.length ||
        lr.new_possible_laws?.length ||
        lr.alternative_legal_approaches?.length ||
        lr.why_position_changes_or_not) && (
        <div className={`${GLASS} space-y-2 p-4`}>
          <div className="flex items-center gap-2 text-sm text-white">
            <Scale size={14} />
            <h3 className="font-display">Изменение правовой оценки</h3>
          </div>
          <Section
            icon={<Scale size={14} className="text-white/70" />}
            title="Применялись ранее"
            items={lr.previous_law_assumptions}
            emptyText="Ранее применяемые нормы не указаны"
          />
          <Section
            icon={<CheckCircle2 size={14} className="text-emerald-200" />}
            title="По-прежнему применимы"
            items={lr.still_applicable_laws}
            emptyText="Применимые нормы не указаны"
          />
          <Section
            icon={<Sparkles size={14} className="text-sky-200" />}
            title="Новые возможные нормы"
            items={lr.new_possible_laws}
            emptyText="Новые возможные нормы не указаны"
          />
          <Section
            icon={<RefreshCcw size={14} className="text-amber-200" />}
            title="Альтернативные правовые подходы"
            items={lr.alternative_legal_approaches}
            emptyText="Альтернативные подходы не указаны"
          />
          {lr.why_position_changes_or_not && (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Почему позиция меняется/не меняется: </span>
              {lr.why_position_changes_or_not}
            </p>
          )}
        </div>
      )}

      <Section
        icon={<CheckCircle2 size={14} className="text-emerald-200" />}
        title="Судебная практика: за позицию"
        items={cp.supporting}
        emptyText="Дополнительная релевантная судебная практика не выявлена."
      />
      <Section
        icon={<AlertTriangle size={14} className="text-red-200" />}
        title="Судебная практика: против позиции"
        items={cp.opposing}
        emptyText="Дополнительная релевантная судебная практика не выявлена."
      />
      <Section
        icon={<FileWarning size={14} className="text-amber-200" />}
        title="Судебная практика: противоречивая"
        items={cp.conflicting}
        emptyText="Дополнительная релевантная судебная практика не выявлена."
      />

      {(rc.previous_risk_level || rc.new_risk_level || rc.reason || rc.risk_factors?.length) && (
        <div className={`${GLASS} space-y-2 p-4`}>
          <div className="flex items-center gap-2 text-sm text-white">
            <AlertTriangle size={14} />
            <h3 className="font-display">Изменение рисков</h3>
            <RiskBadge level={rc.previous_risk_level} />
            <span className="text-white/50">→</span>
            <RiskBadge level={rc.new_risk_level} />
          </div>
          {rc.reason && (
            <p className="text-sm text-foreground/85">
              <span className="text-white/70">Причина: </span>
              {rc.reason}
            </p>
          )}
          {rc.risk_factors?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/85">
              {rc.risk_factors.map((f, i) => (
                <li key={i}>{itemToString(f)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <Section
        icon={<AlertTriangle size={14} className="text-red-200" />}
        title="Аргументы оппонента"
        items={normalized.opponent_arguments}
        emptyText="Аргументы оппонента не указаны"
      />

      {opts.length > 0 && (
        <div className={`${GLASS} space-y-2 p-4`}>
          <div className="flex items-center gap-2 text-sm text-white">
            <ShieldCheck size={14} />
            <h3 className="font-display">Варианты решения юриста</h3>
          </div>
          <ul className="space-y-2 text-sm text-foreground/85">
            {opts.map((o, i) => (
              <li
                key={i}
                className="rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div className="font-medium text-white">{o.label ?? o.option ?? "—"}</div>
                {o.reason && <div className="mt-1 text-foreground/80">{o.reason}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
