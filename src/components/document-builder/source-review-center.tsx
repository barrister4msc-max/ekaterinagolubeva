// Source Review Center — vkladka «Источники» в Review-шаге.
// Покажет все source_warnings из последнего legal_analysis run, позволит
// reviewer-у пометить каждое предупреждение accepted/rejected с комментарием.
// Хранение — document_intake_ai_runs.review_result.source_warning_reviews
// (см. src/lib/source-warning-reviews.ts). Warnings НЕ блокируют draft.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MessageSquare,
  BookOpen,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";
import { fetchLatestLegalAnalysis } from "@/lib/legal-analysis";
import type { LegalAnalysisSourceWarning } from "@/lib/legal-analysis";
import {
  loadReviewMap,
  saveReviewEntry,
  warningKey,
  computeRemainingWarnings,
  type SourceWarningReview,
  type SourceWarningReviewMap,
  type SourceWarningReviewStatus,
} from "@/lib/source-warning-reviews";

const WARNING_LABEL: Record<LegalAnalysisSourceWarning["warning_type"], string> = {
  superseded_source: "Источник заменён более новым",
  superseded_source_used: "Использован заменённый источник",
  low_trust_source: "Низкий trust score",
  low_trust_source_used: "Использован источник с низким trust",
  ekaterina_not_redacted: "Практика Екатерины не обезличена",
  missing_official_url: "Нет ссылки на официальный источник",
};
const REVIEW_STATUS_LABEL: Record<SourceWarningReviewStatus, string> = {
  pending: "Ожидает проверки",
  accepted: "Подтверждено",
  rejected: "Отклонено",
};

function getSourceText(warning: LegalAnalysisSourceWarning): string {
  const w = warning as any;

  return (
    w.content ??
    w.text ??
    w.quote ??
    w.excerpt ??
    w.fragment ??
    w.source_text ??
    w.source_content ??
    w.metadata?.content ??
    w.metadata?.text ??
    ""
  );
}

function getSourceTitle(warning: LegalAnalysisSourceWarning): string {
  const w = warning as any;

  return (
    w.title ??
    w.source_title ??
    w.name ??
    w.source_name ??
    w.source_ref ??
    "Источник"
  );
}

function getOfficialUrl(warning: LegalAnalysisSourceWarning): string {
  const w = warning as any;

  return (
    w.official_url ??
    w.url ??
    w.link ??
    w.metadata?.official_url ??
    w.metadata?.url ??
    ""
  );
}
export function SourceReviewCenter({ sessionId }: { sessionId: string | null }) {
  const qc = useQueryClient();

  const runQuery = useQuery({
    queryKey: ["legal-analysis-run", sessionId],
    queryFn: async () => (sessionId ? fetchLatestLegalAnalysis(sessionId) : null),
    enabled: !!sessionId,
  });

  const runId = runQuery.data?.id ?? null;
  const warnings: LegalAnalysisSourceWarning[] = runQuery.data?.analysis?.source_warnings ?? [];

  const reviewsQuery = useQuery<SourceWarningReviewMap>({
    queryKey: ["source-warning-reviews", runId],
    queryFn: async () => (runId ? loadReviewMap(runId) : {}),
    enabled: !!runId,
  });

  const reviews = reviewsQuery.data ?? {};
  const [selectedWarning, setSelectedWarning] =
  useState<LegalAnalysisSourceWarning | null>(null);
  const mutation = useMutation({
    mutationFn: async (args: { key: string; patch: Partial<SourceWarningReview> }) => {
      if (!runId) throw new Error("Нет активного run");
      return saveReviewEntry(runId, args.key, args.patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["source-warning-reviews", runId] });
    },
  });

  const remaining = useMemo(
    () => computeRemainingWarnings(warnings, reviews),
    [warnings, reviews],
  );

  if (!sessionId) return null;

  if (runQuery.isLoading) {
    return (
      <div className="db-subcard">
        <div className="db-section-label flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Загрузка источников…
        </div>
      </div>
    );
  }

  if (!runQuery.data) {
    return (
      <div className="db-subcard">
        <div className="db-section-label">Источники</div>
        <div className="mt-2 text-xs text-white/65">
          AI правовой анализ ещё не выполнен. Запустите анализ в карточке опросника.
        </div>
      </div>
    );
  }

  return (
    <div className="db-subcard">
      <div className="flex items-center justify-between gap-3">
        <div className="db-section-label">Источники — Review Center</div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">
          Осталось без решения:{" "}
          <span
            className={
              remaining.length === 0
                ? "text-emerald-200"
                : "text-amber-200"
            }
          >
            {remaining.length}
          </span>{" "}
          из {warnings.length}
        </div>
      </div>

      <div className="mt-2 text-[11px] text-white/55">
        Предупреждения не блокируют генерацию Draft. После accept предупреждение
        исчезает из remaining; reject оставляет его в списке для дальнейшей работы.
      </div>

      {warnings.length === 0 ? (
        <div className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
          <CheckCircle2 size={14} className="inline mr-1" />
          Источники прошли проверку без предупреждений.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {warnings.map((w) => {
            const key = warningKey(w);
            const rv = reviews[key];
            return (
              <WarningRow
  key={key}
  warning={w}
  review={rv}
  pending={mutation.isPending}
  onOpen={() => setSelectedWarning(w)}
  onChange={(patch) => mutation.mutate({ key, patch })}
/>
            );
          })}
        </ul>
      )}
    <SourceWarningDrawer
  warning={selectedWarning}
  onClose={() => setSelectedWarning(null)}
/>
      {mutation.isError && (
        <div className="mt-3 text-xs text-rose-200">
          Ошибка сохранения: {String((mutation.error as Error).message)}
        </div>
      )}
    </div>
  );
}

function WarningRow({
  warning,
  review,
  pending,
  onOpen,
  onChange,
}: {
  warning: LegalAnalysisSourceWarning;
  review: SourceWarningReview | undefined;
  pending: boolean;
  onOpen: () => void;
  onChange: (patch: Partial<SourceWarningReview>) => void;
}) {
  const status: SourceWarningReviewStatus = review?.status ?? "pending";
  const [comment, setComment] = useState(review?.comment ?? "");
  const [editing, setEditing] = useState(false);

  const accent =
    status === "accepted"
      ? "border-emerald-400/40 bg-emerald-500/5"
      : status === "rejected"
        ? "border-rose-400/30 bg-rose-500/5"
        : "border-amber-400/30 bg-amber-500/5";

  return (
    <li className={`rounded-md border p-3 text-xs ${accent}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          className={
            status === "accepted"
              ? "text-emerald-300 mt-0.5"
              : status === "rejected"
                ? "text-rose-300 mt-0.5"
                : "text-amber-300 mt-0.5"
          }
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white/90">
            {WARNING_LABEL[warning.warning_type] ?? warning.warning_type}
          </div>
          <div className="mt-0.5 text-white/70 break-words">{warning.message}</div>
          <div className="mt-1 text-[11px] text-white/45 break-all">
            <span className="opacity-70">source_ref: </span>
            {warning.source_ref}
            {warning.superseded_by && (
              <>
                {" · "}
                <span className="opacity-70">заменён: </span>
                {warning.superseded_by}
              </>
            )}
          </div>
          {warning.affected_conclusions && warning.affected_conclusions.length > 0 && (
            <div className="mt-1 text-[11px] text-white/45">
              <span className="opacity-70">влияет на выводы: </span>
              {warning.affected_conclusions.join(", ")}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`db-ghost ${status === "accepted" ? "opacity-100" : "opacity-80"}`}
          disabled={pending}
          onClick={() => onChange({ status: "accepted", comment })}
        >
          <CheckCircle2 size={12} className="inline mr-1" /> Подтвердить
        </button>
        <button
          type="button"
          className={`db-ghost ${status === "rejected" ? "opacity-100" : "opacity-80"}`}
          disabled={pending}
          onClick={() => onChange({ status: "rejected", comment })}
        >
          <XCircle size={12} className="inline mr-1" /> Reject
        </button>
        <button
          type="button"
          className="db-ghost"
          onClick={() => setEditing((v) => !v)}
        >
          <MessageSquare size={12} className="inline mr-1" />
          {editing ? "Скрыть комментарий" : "Комментарий"}
        </button>
        <div className="ml-auto text-[11px] text-white/45">
          Статус: <span className="text-white/75">{status}</span>
          {review?.reviewed_at && (
            <>
              {" · "}
              {new Date(review.reviewed_at).toLocaleString("ru-RU")}
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-2">
          <textarea
            className="db-input min-h-[64px] text-xs"
            placeholder="Комментарий reviewer-а…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => onChange({ comment })}
          />
          <div className="mt-1 text-[11px] text-white/45">
            Комментарий сохраняется автоматически при потере фокуса.
          </div>
        </div>
      )}

      {!editing && review?.comment && (
        <div className="mt-2 text-[11px] text-white/65">
          <span className="opacity-70">Комментарий: </span>
          {review.comment}
        </div>
      )}
    </li>
  );
}
