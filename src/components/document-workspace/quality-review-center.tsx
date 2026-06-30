// Quality Review Center — единый чек-лист готовности документа к юр. проверке.
// Читает metadata + source_warning_reviews + последний AI Review run и
// записывает результаты обратно в generated_legal_documents.metadata.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  computeQualityReview,
  loadReviewInputs,
  persistQualityReview,
  type QualityCheck,
  type QualityCheckStatus,
  type QualityReviewResult,
} from "@/lib/quality-review";
import { trCaseLabel } from "@/lib/case-intelligence-i18n";
const PANEL = "rounded-xl border border-white/10 bg-slate-900/40";

export function QualityReviewCenter({
  documentId,
  meta,
}: {
  documentId: string | null;
  meta: Record<string, any> | null;
}) {
  const qc = useQueryClient();
  const legalAnalysisRunId: string | null =
    (meta?.legal_analysis_run_id as string | null) ??
    (meta?.matter_snapshot?.legal_analysis_run_id as string | null) ??
    null;

  const inputsQuery = useQuery({
    queryKey: ["quality-review-inputs", documentId, legalAnalysisRunId],
    queryFn: () =>
      loadReviewInputs({ documentId: documentId ?? "", legalAnalysisRunId }),
    enabled: !!documentId,
  });

  const live: QualityReviewResult | null = useMemo(() => {
    if (!documentId) return null;
    if (!inputsQuery.data) return null;
    return computeQualityReview({
      meta,
      reviews: inputsQuery.data.reviews,
      reviewRun: inputsQuery.data.reviewRun,
    });
  }, [documentId, inputsQuery.data, meta]);

  const persisted = (meta?.quality_review ?? null) as
    | (Omit<QualityReviewResult, "checks"> & { checks: QualityCheck[] })
    | null;

  const display = live ?? (persisted as QualityReviewResult | null);

  const recompute = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error("Нет documentId");
      const fresh = await loadReviewInputs({
        documentId,
        legalAnalysisRunId,
      });
      const result = computeQualityReview({
        meta,
        reviews: fresh.reviews,
        reviewRun: fresh.reviewRun,
      });
      await persistQualityReview(documentId, result);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["generated-document", documentId] });
      qc.invalidateQueries({ queryKey: ["quality-review-inputs", documentId, legalAnalysisRunId] });
    },
  });

  if (!documentId) {
    return (
      <section className={`${PANEL} p-5`}>
        <Header status="unknown" title="Контроль качества" subtitle="Документ ещё не сохранён." />
      </section>
    );
  }

  if (inputsQuery.isLoading || !display) {
    return (
      <section className={`${PANEL} p-5`}>
        <Header status="unknown" title="Контроль качества" subtitle="Загрузка данных…" />
      </section>
    );
  }

  const headline =
    display.status === "ready_for_lawyer"
      ? "Документ готов к юридической проверке"
      : display.status === "ready_with_warnings"
        ? "Документ готов с предупреждениями"
        : display.status === "blocked"
          ? "Документ требует исправлений"
          : "Статус неизвестен";

  return (
    <section className={`${PANEL} p-5 space-y-4 text-sm text-slate-100`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Header
          status={
            display.status === "blocked"
              ? "blocked"
              : display.status === "ready_with_warnings"
                ? "warning"
                : display.status === "ready_for_lawyer"
                  ? "success"
                  : "unknown"
          }
          title="Контроль качества"
          subtitle={headline}
        />
        <div className="flex items-center gap-3">
          <Counts counts={display.counts} />
          <button
            type="button"
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-[14px] text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {recompute.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Пересчитать
          </button>
        </div>
      </div>

      {persisted && (
        <div className="text-[14px] leading-6 text-slate-400">
          Последнее сохранение: {new Date(persisted.checked_at).toLocaleString("ru-RU")} ·{" "}
          Готово для проверки юристом:{" "}
          <span className={persisted.ready_for_lawyer ? "text-emerald-200" : "text-rose-200"}>
            {persisted.ready_for_lawyer ? "Да" : "Нет"}
          </span>
          {live && live.checked_at !== persisted.checked_at && (
            <span className="ml-2 text-amber-200/80">
              · текущий расчёт отличается, нажмите «Пересчитать» для сохранения
            </span>
          )}
        </div>
      )}

      {recompute.isError && (
        <div className="text-[14px] leading-6 text-rose-200">
          Ошибка сохранения: {String((recompute.error as Error).message)}
        </div>
      )}

      <ul className="space-y-1.5">
        {display.checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>

      <TimelineBlock events={(meta?.review_timeline as any[]) ?? []} />
    </section>
  );
}

function Header({
  status,
  title,
  subtitle,
}: {
  status: QualityCheckStatus;
  title: string;
  subtitle: string;
}) {
  const Icon = iconFor(status);
  const color = colorFor(status);
  return (
    <div className="flex items-start gap-2">
      <Icon size={18} className={color + " mt-0.5"} />
      <div>
        <div className="flex items-center gap-2 text-white">
          <ShieldCheck size={14} className="opacity-70" />
          <h2 className="font-display text-lg">{title}</h2>
        </div>
        <div className="text-[14px] text-slate-300">{subtitle}</div>
      </div>
    </div>
  );
}

function Counts({ counts }: { counts: { success: number; warning: number; blocked: number } }) {
  return (
    <div className="flex items-center gap-1 text-[14px]">
      <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-emerald-100">
        success {counts.success}
      </span>
      <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-100">
        warn {counts.warning}
      </span>
      <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-rose-100">
        blocked {counts.blocked}
      </span>
    </div>
  );
}

function CheckRow({ check }: { check: QualityCheck }) {
  const Icon = iconFor(check.status);
  const color = colorFor(check.status);
  return (
    <li className="flex items-start gap-2 rounded-md border border-white/10 bg-slate-950/30 px-3 py-2">
      <Icon size={14} className={`${color} mt-0.5`} />
      <div className="min-w-0 flex-1">
        <div className="text-white">{check.label}</div>
        <div className="text-[14px] leading-6 text-slate-300 break-words">{check.message}</div>
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{check.status}</div>
    </li>
  );
}

function TimelineBlock({ events }: { events: any[] }) {
  const items = events.filter((e) => e && e.type === "quality_review").slice(-8).reverse();
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[15px] uppercase tracking-[0.18em] text-slate-400">История проверки</div>
      <ul className="space-y-1">
        {items.map((e, i) => (
          <li key={`${e.created_at}-${i}`} className="rounded-md border border-white/10 bg-slate-950/30 px-3 py-1.5 text-[14px] leading-6 text-slate-300">
            <span className="text-slate-400">{new Date(e.created_at).toLocaleString("ru-RU")} · </span>
            <span className="text-white">{trCaseLabel(e.status)}</span>
            <span className="ml-2 opacity-80">{e.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function iconFor(s: QualityCheckStatus) {
  switch (s) {
    case "success":
      return CheckCircle2;
    case "warning":
      return AlertTriangle;
    case "blocked":
      return XCircle;
    default:
      return HelpCircle;
  }
}
function colorFor(s: QualityCheckStatus) {
  switch (s) {
    case "success":
      return "text-emerald-300";
    case "warning":
      return "text-amber-300";
    case "blocked":
      return "text-rose-300";
    default:
      return "text-slate-300";
  }
}
