import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  lkClassifySources,
  lkCreateGapRequest,
  lkRequestExternalSearchByQuery,
} from "@/lib/legal-knowledge.functions";
import { recommendSourceFor } from "@/lib/recommended-source";

type RawItem = any;

type Bucket = "confirmed" | "needs_verification" | "not_found";

function itemToText(item: RawItem): string {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (typeof item === "object") {
    return Object.entries(item)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(" · ");
  }
  return String(item);
}

function itemFields(item: RawItem): {
  title?: string;
  article?: string;
  doc_number?: string;
  url?: string;
  date?: string;
  source_id?: string;
  verification_status?: string;
  type?: string;
} {
  if (!item || typeof item !== "object") return {};
  const it = item as Record<string, any>;
  return {
    title: it.title || it.name || it.law || it.act,
    article: it.article || it.статья,
    doc_number: it.document_number || it.number || it.номер,
    url: it.url || it.source_url || it.link,
    date: it.date || it.document_date || it.дата,
    source_id: it.source_id,
    verification_status: it.verification_status,
    type: it.type || it.kind || it.source_type,
  };
}

function localClassify(item: RawItem): Bucket | "unknown" {
  const f = itemFields(item);
  if (f.source_id) return "confirmed";
  if (f.verification_status === "verified_local_source") return "confirmed";
  if (f.verification_status === "needs_external_verification") return "needs_verification";
  // Letters / court practice / reviews without URL/number/date → needs verification
  const typeStr = (f.type || "").toString().toLowerCase();
  const looksLikeLetterOrCase = /letter|пис|court|суд|practice|обзор|review/i.test(
    typeStr + " " + itemToText(item),
  );
  if (looksLikeLetterOrCase && !f.url && !f.doc_number && !f.date) {
    return "needs_verification";
  }
  return "unknown";
}

interface Props {
  items: RawItem[];
  leadId?: string | null;
  reviewId?: string | null;
}

export function SourcesClassifier({ items, leadId, reviewId }: Props) {
  const classify = useServerFn(lkClassifySources);
  const createGap = useServerFn(lkCreateGapRequest);
  const externalSearch = useServerFn(lkRequestExternalSearchByQuery);
  const [matches, setMatches] = useState<Record<string, { matched: boolean; title?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState<Record<string, boolean>>({});
  const [externalRequested, setExternalRequested] = useState<Record<string, boolean>>({});

  const normalized = useMemo(
    () =>
      (Array.isArray(items) ? items : items ? [items] : []).map((item, idx) => ({
        key: `${idx}`,
        item,
        text: itemToText(item),
      })),
    [items],
  );

  useEffect(() => {
    let cancelled = false;
    const unknowns = normalized.filter((n) => localClassify(n.item) === "unknown" && n.text);
    if (unknowns.length === 0) {
      setMatches({});
      return;
    }
    setLoading(true);
    classify({ data: { items: unknowns.map(({ key, text }) => ({ key, text })) } })
      .then((res) => {
        if (cancelled) return;
        setMatches(res.results || {});
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [normalized, classify]);

  const buckets = useMemo(() => {
    const b: Record<Bucket, { key: string; item: RawItem; text: string }[]> = {
      confirmed: [],
      needs_verification: [],
      not_found: [],
    };
    for (const n of normalized) {
      const local = localClassify(n.item);
      if (local === "confirmed") b.confirmed.push(n);
      else if (local === "needs_verification") b.needs_verification.push(n);
      else {
        const m = matches[n.key];
        if (m?.matched) b.confirmed.push(n);
        else b.not_found.push(n);
      }
    }
    return b;
  }, [normalized, matches]);

  const handleCreateGap = async (key: string, item: RawItem, text: string) => {
    const f = itemFields(item);
    try {
      await createGap({
        data: {
          query_text: text || f.title || "Неопознанный источник",
          missing_source_type: f.type ?? null,
          guessed_title: f.title ?? (typeof item === "string" ? item.slice(0, 200) : null),
          guessed_article: f.article ?? null,
          guessed_document_number: f.doc_number ?? null,
          context: `lead=${leadId ?? "-"} review=${reviewId ?? "-"}`,
          priority: "medium",
          source_lead_id: leadId ?? null,
          source_review_id: reviewId ?? null,
        },
      });
      setRequested((r) => ({ ...r, [key]: true }));
      toast.success("Запрос на загрузку источника создан");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось создать запрос");
    }
  };

  if (normalized.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-3 text-xs text-muted-foreground">
        Источников не указано
      </div>
    );
  }

  const Block = ({
    title,
    tone,
    statusLabel,
    rows,
    actionable,
  }: {
    title: string;
    tone: "green" | "amber" | "red";
    statusLabel: string;
    rows: { key: string; item: RawItem; text: string }[];
    actionable?: boolean;
  }) => {
    const toneCls =
      tone === "green"
        ? "border-green-200 bg-green-50 text-green-900"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-red-200 bg-red-50 text-red-900";
    const badgeCls =
      tone === "green"
        ? "bg-green-100 text-green-800"
        : tone === "amber"
          ? "bg-amber-100 text-amber-800"
          : "bg-red-100 text-red-800";
    return (
      <div className={`rounded-xl border p-3 ${toneCls}`}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide">{title}</div>
          <span className="text-[10px] opacity-70">{rows.length}</span>
        </div>
        <div className="mt-2 space-y-2 text-xs leading-5">
          {rows.length === 0 ? (
            <div className="opacity-60">—</div>
          ) : (
            rows.map((r) => (
              <div key={r.key} className="rounded-lg bg-white/80 px-2 py-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 break-words text-foreground">{r.text}</div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase ${badgeCls}`}>
                    {statusLabel}
                  </span>
                </div>
                {actionable && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground">
                      ⚠ Источник не подтверждён локальной базой. Требуется внешняя проверка.
                    </div>
                    <button
                      type="button"
                      disabled={requested[r.key]}
                      onClick={() => handleCreateGap(r.key, r.item, r.text)}
                      className="shrink-0 rounded-full border border-current px-2 py-0.5 text-[11px] hover:bg-white disabled:opacity-50"
                    >
                      {requested[r.key] ? "Запрос создан" : "Создать запрос на загрузку источника"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Классификация источников
        </div>
        {loading && <div className="text-[10px] text-muted-foreground">проверяю каталог…</div>}
      </div>
      <div className="grid gap-2">
        <Block
          title="Подтверждено локальной базой"
          tone="green"
          statusLabel="Подтверждено локальной базой"
          rows={buckets.confirmed}
        />
        <Block
          title="Требует внешней проверки"
          tone="amber"
          statusLabel="Требует проверки"
          rows={buckets.needs_verification}
          actionable
        />
        <Block
          title="Не найдено в базе"
          tone="red"
          statusLabel="Не найдено в базе"
          rows={buckets.not_found}
          actionable
        />
      </div>
    </div>
  );
}
