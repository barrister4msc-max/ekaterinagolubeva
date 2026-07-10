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
import { supabase } from "@/integrations/supabase/client";
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
function extractKbChunkId(sourceRef?: string | null): string | null {
  if (!sourceRef) return null;

  const match = String(sourceRef).match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );

  return match?.[1] ?? null;
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
        <div className="db-section-label">Центр проверки источников</div>
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
        Предупреждения не блокируют формирование документа.
        После подтверждения предупреждение считается обработанным.
        После отклонения оно остаётся в списке до повторной проверки или замены источника.
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
            <span className="opacity-70">ID источника: </span>
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
              <span className="opacity-70">Используется в выводах: </span>
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
          <XCircle size={12} className="inline mr-1" /> Отклонить
        </button>
        <button
  type="button"
  className="db-ghost"
  onClick={onOpen}
>
  <BookOpen size={12} className="inline mr-1" />
  Просмотреть источник
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
          Статус:
<span className="text-white/75">
  {REVIEW_STATUS_LABEL[status]}
</span>
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
            placeholder="Комментарий юриста…"
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
function SourceWarningDrawer({
  warning,
  onClose,
}: {
  warning: LegalAnalysisSourceWarning | null;
  onClose: () => void;
}) {
  if (!warning) return null;

const kbChunkId = extractKbChunkId(warning.source_ref);

const kbQuery = useQuery({
  queryKey: ["source-warning-kb-chunk", kbChunkId],
  enabled: !!kbChunkId,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("legal_knowledge_chunks" as any)
      .select("id,title,content,source_type,category,metadata")
      .eq("id", kbChunkId)
      .maybeSingle();

    if (error) return null;
    return data as any;
  },
});

const title = kbQuery.data?.title ?? getSourceTitle(warning);
const text = kbQuery.data?.content ?? getSourceText(warning);
const url =
  kbQuery.data?.metadata?.official_url ??
  kbQuery.data?.metadata?.source_url ??
  kbQuery.data?.metadata?.url ??
  getOfficialUrl(warning);

const sourceMetadata = {
  ...((warning as any).metadata ?? {}),
  ...(kbQuery.data?.metadata ?? {}),
};

const w = { ...(warning as any), metadata: sourceMetadata };
console.log("SOURCE DRAWER", {
  source_ref: warning.source_ref,
  kbChunkId,
  kbData: kbQuery.data,
  metadata: sourceMetadata,
});
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-[520px] overflow-y-auto border-l border-white/15 bg-slate-950 p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
              Карточка источника
            </div>
            <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 bg-white/10 p-1.5 hover:bg-white/20"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          <section className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
              Основные сведения
            </div>
            <InfoRow label="Тип предупреждения" value={WARNING_LABEL[warning.warning_type] ?? warning.warning_type} />
<InfoRow label="ID источника" value={warning.source_ref} />
<InfoRow label="Источник KB" value={kbChunkId} />
<InfoRow label="Название" value={kbQuery.data?.title} />
<InfoRow label="Оригинальный файл" value={w.metadata.original_file_name} />
<InfoRow label="Категория" value={kbQuery.data?.category ?? w.metadata.category} />
<InfoRow label="Подкатегория" value={w.metadata.subcategory} />
<InfoRow label="Тип источника" value={kbQuery.data?.source_type ?? w.metadata.source_type ?? w.metadata.source_kind} />
<InfoRow label="Статья" value={w.metadata.article} />
<InfoRow label="Номер документа" value={w.metadata.document_number} />
<InfoRow label="Дата документа" value={w.metadata.document_date} />
<InfoRow label="Архив" value={w.metadata.archive_name} />
<InfoRow label="Источник" value={w.metadata.source_origin} />
<InfoRow label="Статус проверки" value={w.metadata.verification_status} />
<InfoRow label="Официальная ссылка" value={w.metadata.official_url ?? w.metadata.source_url} />
<InfoRow label="Заменён на" value={warning.superseded_by} />

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sky-300 hover:underline"
              >
                <ExternalLink size={12} />
                Открыть официальный источник
              </a>
            )}
          </section>

          <section className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
              Причина проверки
            </div>
            <div className="whitespace-pre-wrap text-white/75">
              {warning.message}
            </div>
          </section>
           <section className="rounded-md border border-white/10 bg-white/5 p-3">
  <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
    Использование источника
  </div>

  {warning.affected_conclusions && warning.affected_conclusions.length > 0 ? (
    <div className="space-y-2">
      <div className="text-white/70">
        Этот источник связан со следующими выводами AI:
      </div>

      <ul className="list-disc space-y-1 pl-5 text-white/75">
        {warning.affected_conclusions.map((conclusion) => (
          <li key={conclusion}>{conclusion}</li>
        ))}
      </ul>
    </div>
  ) : (
    <div className="rounded border border-amber-400/30 bg-amber-500/10 p-3 text-amber-100">
      В текущих данных не указано, где именно используется этот источник.
      Требуется ручная проверка связи источника с выводами.
    </div>
  )}
</section>   
          <section className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
              <FileText size={12} />
              Текст источника
            </div>

            {text ? (
              <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded border border-white/10 bg-black/20 p-3 text-white/75">
                {String(text)}
              </div>
            ) : (
              <div className="rounded border border-amber-400/30 bg-amber-500/10 p-3 text-amber-100">
                Полный текст источника недоступен в текущих данных. Требуется открыть оригинал или проверить источник вручную.
              </div>
            )}
          </section>

          

          {w.metadata && (
  <section className="rounded-md border border-white/10 bg-white/5 p-3">
    <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
      Сведения об источнике
    </div>

    <InfoRow label="Категория" value={w.metadata.category} />
    <InfoRow label="Подкатегория" value={w.metadata.subcategory} />
    <InfoRow label="Тип источника" value={w.metadata.source_type} />
    <InfoRow label="Автор" value={w.metadata.author} />
    <InfoRow label="Орган" value={w.metadata.organization} />
    <InfoRow label="Дата" value={w.metadata.date} />
    <InfoRow label="Редакция" value={w.metadata.version} />
    <InfoRow label="Номер документа" value={w.metadata.document_number} />
   <InfoRow label="Оригинальный файл" value={w.metadata.original_file_name} />
<InfoRow label="Архив" value={w.metadata.archive_name} />
<InfoRow label="Источник" value={w.metadata.source_origin} />
<InfoRow label="Статус проверки" value={w.metadata.verification_status} />
<InfoRow label="Официальная ссылка" value={w.metadata.official_url ?? w.metadata.source_url} />

    {Object.keys(w.metadata).length === 0 && (
      <div className="text-white/60">
        Метаданные отсутствуют.
      </div>
    )}
  </section>
)}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === "") return null;

  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 border-b border-white/10 py-1 last:border-0">
      <div className="text-white/45">{label}</div>
      <div className="break-words text-white/80">{String(value)}</div>
    </div>
  );
}
