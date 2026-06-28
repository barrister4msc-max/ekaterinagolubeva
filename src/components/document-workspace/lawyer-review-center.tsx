// Lawyer Review Center — UI для ручного подтверждения документа юристом.
// Читает metadata.lawyer_review / ready_for_client / ready_for_lawyer / quality_review.
// Записывает обратно через lib/lawyer-review.ts (без новых таблиц и Edge Functions).

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Gavel,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  PlayCircle,
  ShieldCheck,
  UserCheck,
  FileCheck2,
} from "lucide-react";
import {
  approveLawyerReview,
  isReadyForClient,
  isReadyForLawyer,
  readLawyerReview,
  rejectLawyerReview,
  startLawyerReview,
  type LawyerReview,
  type LawyerReviewStatus,
} from "@/lib/lawyer-review";
import { useAuth } from "@/hooks/use-auth";

const PANEL = "rounded-xl border border-white/10 bg-slate-900/40";

export function LawyerReviewCenter({
  documentId,
  meta,
}: {
  documentId: string | null;
  meta: Record<string, any> | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const reviewerId = user?.id ?? null;

  const lawyerReview = useMemo(() => readLawyerReview(meta), [meta]);
  const readyForLawyer = isReadyForLawyer(meta);
  const readyForClient = isReadyForClient(meta);
  const qualityStatus: string | null = (meta?.quality_review?.status as string | null) ?? null;

  const [comment, setComment] = useState<string>(lawyerReview.comment ?? "");
  const [fixesText, setFixesText] = useState<string>(
    (lawyerReview.required_fixes ?? []).join("\n"),
  );

  const invalidate = () => {
    if (documentId) qc.invalidateQueries({ queryKey: ["generated-document", documentId] });
  };

  const startMut = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error("Нет documentId");
      return startLawyerReview(documentId, meta, reviewerId);
    },
    onSuccess: invalidate,
  });

  const approveMut = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error("Нет documentId");
      return approveLawyerReview(documentId, meta, reviewerId, comment.trim() || null);
    },
    onSuccess: invalidate,
  });

  const rejectMut = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error("Нет documentId");
      const fixes = fixesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const text = comment.trim();
      if (!text && fixes.length === 0) {
        throw new Error("Укажите комментарий или список замечаний");
      }
      return rejectLawyerReview(
        documentId,
        meta,
        reviewerId,
        text || "Возвращено на доработку",
        fixes,
      );
    },
    onSuccess: invalidate,
  });

  if (!documentId) {
    return (
      <section className={`${PANEL} p-5 text-sm text-slate-200`}>
        <Header status="not_started" />
        <div className="mt-2 text-slate-300">Документ ещё не сохранён.</div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className={`${PANEL} p-5 space-y-4 text-sm text-slate-100`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Header status={lawyerReview.status} />
          <StatusChips
            readyForLawyer={readyForLawyer}
            readyForClient={readyForClient}
            qualityStatus={qualityStatus}
            lawyerStatus={lawyerReview.status}
          />
        </div>

        {lawyerReview.reviewed_at && (
          <div className="text-[11px] text-slate-400">
            Последнее изменение: {new Date(lawyerReview.reviewed_at).toLocaleString("ru-RU")}
            {lawyerReview.reviewed_by ? ` · reviewer ${lawyerReview.reviewed_by.slice(0, 8)}…` : ""}
          </div>
        )}

        {lawyerReview.comment && (
          <div className="rounded-md border border-white/10 bg-slate-950/30 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Комментарий юриста</div>
            <div className="mt-1 whitespace-pre-wrap text-slate-100">{lawyerReview.comment}</div>
          </div>
        )}

        {lawyerReview.required_fixes.length > 0 && (
          <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber-200">Требуется исправить</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-50">
              {lawyerReview.required_fixes.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {!readyForLawyer ? (
          <div className="rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-3 text-rose-100">
            Документ ещё не готов к проверке юристом. Сначала устраните блокеры Quality Review
            (вкладка «Контроль качества»).
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Комментарий юриста
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Заметки, основания подтверждения или причина возврата…"
                className="mt-1 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Замечания (по одному в строке, используется при отклонении)
              </label>
              <textarea
                value={fixesText}
                onChange={(e) => setFixesText(e.target.value)}
                rows={3}
                placeholder={"Например:\nУточнить реквизиты ответчика\nДобавить расчёт неустойки"}
                className="mt-1 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400/60 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startMut.mutate()}
                disabled={startMut.isPending || lawyerReview.status === "in_review"}
                className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
              >
                {startMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
                Начать проверку
              </button>
              <button
                type="button"
                onClick={() => approveMut.mutate()}
                disabled={approveMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                {approveMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Подтвердить документ
              </button>
              <button
                type="button"
                onClick={() => rejectMut.mutate()}
                disabled={rejectMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
              >
                {rejectMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Отклонить / вернуть на доработку
              </button>
            </div>

            {(startMut.isError || approveMut.isError || rejectMut.isError) && (
              <div className="text-xs text-rose-200">
                Ошибка:{" "}
                {String(
                  (startMut.error as Error)?.message ??
                    (approveMut.error as Error)?.message ??
                    (rejectMut.error as Error)?.message ??
                    "",
                )}
              </div>
            )}
          </div>
        )}

        <ReadyForClientCard
          readyForClient={readyForClient}
          lawyerReview={lawyerReview}
        />

        <TimelineBlock events={(meta?.review_timeline as any[]) ?? []} />
      </section>
    </div>
  );
}

function Header({ status }: { status: LawyerReviewStatus }) {
  const label =
    status === "approved"
      ? "Подтверждён юристом"
      : status === "rejected"
        ? "Возвращён на доработку"
        : status === "in_review"
          ? "На проверке у юриста"
          : "Проверка не начата";
  const Icon =
    status === "approved" ? CheckCircle2 : status === "rejected" ? XCircle : status === "in_review" ? UserCheck : Gavel;
  const color =
    status === "approved"
      ? "text-emerald-300"
      : status === "rejected"
        ? "text-rose-300"
        : status === "in_review"
          ? "text-sky-300"
          : "text-slate-300";
  return (
    <div className="flex items-start gap-2">
      <Icon size={18} className={`${color} mt-0.5`} />
      <div>
        <div className="flex items-center gap-2 text-white">
          <Gavel size={14} className="opacity-70" />
          <h2 className="font-display text-lg">Проверка юристом</h2>
        </div>
        <div className="text-xs text-slate-300">{label}</div>
      </div>
    </div>
  );
}

function StatusChips({
  readyForLawyer,
  readyForClient,
  qualityStatus,
  lawyerStatus,
}: {
  readyForLawyer: boolean;
  readyForClient: boolean;
  qualityStatus: string | null;
  lawyerStatus: LawyerReviewStatus;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      <Chip
        ok={readyForLawyer}
        label={`ready_for_lawyer: ${readyForLawyer ? "true" : "false"}`}
      />
      <Chip
        ok={readyForClient}
        label={`ready_for_client: ${readyForClient ? "true" : "false"}`}
      />
      <span className="rounded-md bg-white/10 px-2 py-0.5 text-slate-100">
        quality: {qualityStatus ?? "—"}
      </span>
      <span className="rounded-md bg-white/10 px-2 py-0.5 text-slate-100">
        lawyer: {lawyerStatus}
      </span>
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "rounded-md bg-emerald-500/15 px-2 py-0.5 text-emerald-100"
          : "rounded-md bg-rose-500/15 px-2 py-0.5 text-rose-100"
      }
    >
      {label}
    </span>
  );
}

function ReadyForClientCard({
  readyForClient,
  lawyerReview,
}: {
  readyForClient: boolean;
  lawyerReview: LawyerReview;
}) {
  if (readyForClient) {
    return (
      <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-3 text-emerald-50">
        <div className="flex items-center gap-2 font-medium text-emerald-100">
          <FileCheck2 size={14} /> Документ готов для клиента
        </div>
        <div className="mt-1 text-xs text-emerald-100/85">
          Разрешены экспорт в DOCX/PDF, копирование и печать. Используйте вкладку «Экспорт».
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-amber-50">
      <div className="flex items-center gap-2 font-medium text-amber-100">
        <AlertTriangle size={14} /> Черновик / не подтверждено юристом
      </div>
      <div className="mt-1 text-xs text-amber-100/85">
        Экспорт доступен, но файлы будут помечены как черновик.{" "}
        {lawyerReview.status === "rejected"
          ? "Юрист вернул документ на доработку — устраните замечания и повторите проверку."
          : "Чтобы передать клиенту, дождитесь подтверждения юриста."}
      </div>
    </div>
  );
}

function TimelineBlock({ events }: { events: any[] }) {
  const items = events
    .filter((e) => e && (e.type === "lawyer_review" || e.type === "quality_review"))
    .slice(-10)
    .reverse();
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
        <ShieldCheck size={10} /> Review Timeline
      </div>
      <ul className="space-y-1">
        {items.map((e, i) => (
          <li
            key={`${e.created_at}-${i}`}
            className="rounded-md border border-white/10 bg-slate-950/30 px-3 py-1.5 text-[11px] text-slate-300"
          >
            <span className="text-slate-400">
              {new Date(e.created_at).toLocaleString("ru-RU")} ·{" "}
            </span>
            <span className="text-white">
              {e.type === "lawyer_review" ? "lawyer" : "quality"} · {e.status}
            </span>
            <span className="ml-2 opacity-80">{e.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
