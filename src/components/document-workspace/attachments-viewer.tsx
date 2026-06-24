/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  ExternalLink,
  Copy,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Target,
  LayoutGrid,
  Table as TableIcon,
  Link2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getFactLinksForDoc } from "@/lib/source-backlinks";

const PANEL = "rounded-2xl border border-slate-700/70 bg-slate-900/95 shadow-xl";
const PANEL_SUB = "rounded-xl border border-slate-700/60 bg-slate-800/90";
const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs text-slate-100 hover:bg-slate-700 disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-md border border-sky-400/50 bg-sky-500/20 px-2.5 py-1 text-xs text-sky-50 hover:bg-sky-500/30";
const CHIP_ON =
  "inline-flex items-center gap-1 rounded-full border border-sky-400/50 bg-sky-500/25 px-2.5 py-1 text-[11px] font-medium text-sky-50";
const CHIP_OFF =
  "inline-flex items-center gap-1 rounded-full border border-slate-600/70 bg-slate-800/70 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-700";

/* ============ Types ============ */

export type AttachmentRow = {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
  file_url: string | null;
  ocr_text: string | null;
  ocr_length: number;
  document_type: string | null;
  analysis_status: string | null;
  created_at: string;
  source_table: "documents" | "lead_documents";
  metadata: Record<string, any> | null;
  /** Computed: used / rejected / unknown */
  audit_status: "used" | "rejected" | "unknown";
  /** Audit entry from analysis.documents_audit */
  audit_entry: any | null;
};

type DrawerPayload = {
  doc: AttachmentRow;
  focusQuote?: string | null;
};

/* ============ Custom events ============ */

export function openAttachment(payload: DrawerPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ws:open-attachment", { detail: payload }));
}

/* ============ Helpers ============ */

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
}

function matchAudit(doc: { id: string; file_name: string | null }, audit: any): {
  status: AttachmentRow["audit_status"];
  entry: any | null;
} {
  if (!audit || typeof audit !== "object") return { status: "unknown", entry: null };
  const used: any[] = Array.isArray(audit?.used) ? audit.used : [];
  const rejected: any[] = Array.isArray(audit?.rejected) ? audit.rejected : [];
  const match = (e: any) => {
    if (!e) return false;
    if (e.id && doc.id && String(e.id) === String(doc.id)) return true;
    const eName = String(e.file_name ?? e.title ?? e.name ?? "").trim().toLowerCase();
    const dName = String(doc.file_name ?? "").trim().toLowerCase();
    return Boolean(eName && dName && (eName === dName || eName.includes(dName) || dName.includes(eName)));
  };
  const u = used.find(match);
  if (u) return { status: "used", entry: u };
  const r = rejected.find(match);
  if (r) return { status: "rejected", entry: r };
  return { status: "unknown", entry: null };
}

async function openInTab(doc: AttachmentRow): Promise<void> {
  if (doc.file_url) {
    window.open(doc.file_url, "_blank", "noopener,noreferrer");
    return;
  }
  if (!doc.storage_path) {
    toast.error("Файл недоступен: ссылка на хранилище отсутствует.");
    return;
  }
  let bucket = "lead-documents";
  let path = doc.storage_path;
  if (path.includes("/") && !path.startsWith("lead-documents/")) {
    // try sniff bucket prefix
    const first = path.split("/")[0];
    if (first === "communication-attachments" || first === "lead-documents") {
      bucket = first;
      path = path.split("/").slice(1).join("/");
    }
  } else if (path.startsWith("lead-documents/")) {
    path = path.slice("lead-documents/".length);
  }
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) throw error ?? new Error("no url");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  } catch (err) {
    console.warn("attachment open failed", err);
    toast.error("Не удалось открыть файл.");
  }
}

/* ============ Data hook ============ */

export function useSessionAttachments(sessionId: string | null, audit: any) {
  return useQuery({
    queryKey: ["session-attachments-full", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<AttachmentRow[]> => {
      const [docsRes, leadDocsRes] = await Promise.all([
        supabase
          .from("documents")
          .select(
            "id,file_name,mime_type,storage_path,ocr_text,document_type,analysis_status,created_at,metadata",
          )
          .eq("metadata->>intake_session_id", sessionId!)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("lead_documents")
          .select(
            "id,file_name,file_url,document_type,analysis_status,created_at,extracted_data",
          )
          .eq("intake_session_id" as any, sessionId!)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const rows: AttachmentRow[] = [];

      if (!docsRes.error && Array.isArray(docsRes.data)) {
        for (const d of docsRes.data as any[]) {
          const base = {
            id: d.id,
            file_name: d.file_name ?? null,
            mime_type: d.mime_type ?? null,
            storage_path: d.storage_path ?? null,
            file_url: null,
            ocr_text: d.ocr_text ?? null,
            ocr_length: typeof d.ocr_text === "string" ? d.ocr_text.length : 0,
            document_type: d.document_type ?? null,
            analysis_status: d.analysis_status ?? null,
            created_at: d.created_at,
            source_table: "documents" as const,
            metadata: d.metadata ?? null,
          };
          const m = matchAudit(base, audit);
          rows.push({ ...base, audit_status: m.status, audit_entry: m.entry });
        }
      }

      if (!leadDocsRes.error && Array.isArray(leadDocsRes.data)) {
        for (const d of leadDocsRes.data as any[]) {
          // de-dup by file_name + created_at if already present from documents
          const dup = rows.find(
            (r) =>
              (r.file_name ?? "").toLowerCase() === String(d.file_name ?? "").toLowerCase() &&
              r.created_at?.slice(0, 16) === String(d.created_at ?? "").slice(0, 16),
          );
          if (dup) continue;
          const ocr =
            (d.extracted_data && typeof d.extracted_data === "object"
              ? (d.extracted_data as any).ocr_text
              : null) ?? null;
          const base = {
            id: d.id,
            file_name: d.file_name ?? null,
            mime_type: null,
            storage_path: null,
            file_url: d.file_url ?? null,
            ocr_text: typeof ocr === "string" ? ocr : null,
            ocr_length: typeof ocr === "string" ? ocr.length : 0,
            document_type: d.document_type ?? null,
            analysis_status: d.analysis_status ?? null,
            created_at: d.created_at,
            source_table: "lead_documents" as const,
            metadata: null,
          };
          const m = matchAudit(base, audit);
          rows.push({ ...base, audit_status: m.status, audit_entry: m.entry });
        }
      }

      return rows;
    },
  });
}

/* ============ Attachments Tab ============ */

export function AttachmentsTab({
  sessionId,
  analysis,
  onJumpToFacts,
}: {
  sessionId: string | null;
  analysis: any;
  onJumpToFacts?: (fileName: string | null) => void;
}) {
  const audit = analysis?.documents_audit ?? null;
  const { data, isLoading, error } = useSessionAttachments(sessionId, audit);
  const docs = data ?? [];

  if (!sessionId) {
    return (
      <section className={`${PANEL} p-5 text-sm text-slate-200`}>
        <h2 className="font-display text-lg text-white">Приложения</h2>
        <p className="mt-2 text-slate-300">
          Документ не связан с сессией intake. Список приложений недоступен.
        </p>
      </section>
    );
  }

  return (
    <section className={`${PANEL} p-5 space-y-3`}>
      <div>
        <h2 className="font-display text-lg text-white">Приложения</h2>
        <p className="mt-1 text-xs text-slate-300">
          Все документы текущей сессии. Статус: использован AI / отклонён / не определён.
        </p>
      </div>

      {isLoading && <div className="text-sm text-slate-300">Загрузка списка…</div>}
      {error && <div className="text-sm text-red-300">Ошибка загрузки приложений.</div>}
      {!isLoading && docs.length === 0 && (
        <div className="text-sm text-slate-300">К сессии не привязано ни одного документа.</div>
      )}

      <ul className="space-y-2">
        {docs.map((d) => (
          <li key={`${d.source_table}:${d.id}`} className={`${PANEL_SUB} p-3 text-xs text-slate-100`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText size={12} className="text-slate-300" />
                  <span className="break-all font-medium text-white">
                    {d.file_name ?? "Без имени"}
                  </span>
                  <StatusBadge status={d.audit_status} />
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-300 sm:grid-cols-4">
                  <div>
                    <span className="text-slate-400">Тип: </span>
                    {d.document_type ?? d.mime_type ?? "—"}
                  </div>
                  <div>
                    <span className="text-slate-400">OCR: </span>
                    {ocrStatusLabel(d)}
                  </div>
                  <div>
                    <span className="text-slate-400">Длина OCR: </span>
                    {d.ocr_length || "—"}
                  </div>
                  <div>
                    <span className="text-slate-400">Создан: </span>
                    {fmtDate(d.created_at)}
                  </div>
                </div>
                {d.audit_status === "rejected" && (
                  <div className="mt-1 text-[11px] text-amber-200">
                    Причина:{" "}
                    {d.audit_entry?.reason === "no_ocr"
                      ? "не распознан текст (OCR пуст)"
                      : String(d.audit_entry?.reason ?? "не указана")}
                  </div>
                )}
                {d.audit_status === "used" && Array.isArray(d.audit_entry?.used_for) && d.audit_entry.used_for.length > 0 && (
                  <div className="mt-1 text-[11px] text-emerald-200">
                    Использован для: {d.audit_entry.used_for.join(", ")}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={() => openAttachment({ doc: d })}
                  title="Открыть просмотр OCR"
                >
                  <ExternalLink size={12} /> Открыть
                </button>
                {d.audit_status === "used" && onJumpToFacts && (
                  <button
                    type="button"
                    className={BTN}
                    onClick={() => onJumpToFacts(d.file_name)}
                    title="Найти упоминания в фактах / матрице"
                  >
                    <Target size={12} /> Найти в фактах
                  </button>
                )}
              </div>
            </div>
            {!d.storage_path && !d.file_url && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
                <AlertTriangle size={12} /> Файл недоступен: ссылка на хранилище отсутствует.
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ocrStatusLabel(d: AttachmentRow): string {
  const status = String(d.analysis_status ?? "").toLowerCase();
  if (d.ocr_length > 0) return "распознан";
  if (status === "failed") return "ошибка";
  if (status === "processing" || status === "pending") return "в процессе";
  if (status === "completed") return "пусто";
  return "—";
}

function StatusBadge({ status }: { status: AttachmentRow["audit_status"] }) {
  if (status === "used") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold text-emerald-50">
        <CheckCircle2 size={10} /> использован
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-semibold text-red-50">
        <XCircle size={10} /> отклонён
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-600/40 px-2 py-0.5 text-[10px] font-semibold text-slate-100">
      не определён
    </span>
  );
}

/* ============ Attachment Drawer (OCR viewer) ============ */

export function AttachmentDrawer() {
  const [payload, setPayload] = useState<DrawerPayload | null>(null);
  const [query, setQuery] = useState("");
  const open = payload != null;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<DrawerPayload>).detail;
      if (detail && typeof detail === "object") {
        setPayload(detail);
        setQuery(detail.focusQuote ?? "");
      }
    };
    window.addEventListener("ws:open-attachment", handler as EventListener);
    return () => window.removeEventListener("ws:open-attachment", handler as EventListener);
  }, []);

  const doc = payload?.doc;
  const ocr = doc?.ocr_text ?? "";
  const hasOcr = ocr.length > 0;

  const matches = useMemo(() => {
    if (!query || !ocr) return [] as Array<{ index: number; preview: string }>;
    const lower = ocr.toLowerCase();
    const q = query.toLowerCase();
    const out: Array<{ index: number; preview: string }> = [];
    let i = lower.indexOf(q);
    while (i !== -1 && out.length < 100) {
      const start = Math.max(0, i - 60);
      const end = Math.min(ocr.length, i + q.length + 60);
      out.push({ index: i, preview: ocr.slice(start, end) });
      i = lower.indexOf(q, i + q.length);
    }
    return out;
  }, [query, ocr]);

  const copyFragment = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Фрагмент скопирован");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && setPayload(null)}>
      <SheetContent
        side="right"
        className="w-[520px] sm:max-w-[560px] border-slate-700 bg-slate-950 p-0 text-slate-100"
      >
        <SheetHeader className="border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-slate-300" />
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-100">
              Приложение
            </span>
            {doc && <StatusBadge status={doc.audit_status} />}
          </div>
          <SheetTitle className="text-left text-base text-white">
            {doc?.file_name ?? "Документ"}
          </SheetTitle>
        </SheetHeader>

        {doc && (
          <div className="flex h-[calc(100vh-110px)] flex-col gap-3 overflow-y-auto p-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
              <div>
                <div className="text-slate-400">Тип</div>
                <div className="text-slate-100">{doc.document_type ?? doc.mime_type ?? "—"}</div>
              </div>
              <div>
                <div className="text-slate-400">Длина OCR</div>
                <div className="text-slate-100">{doc.ocr_length || "—"}</div>
              </div>
              <div>
                <div className="text-slate-400">Создан</div>
                <div className="text-slate-100">{fmtDate(doc.created_at)}</div>
              </div>
              <div>
                <div className="text-slate-400">Источник</div>
                <div className="text-slate-100">{doc.source_table}</div>
              </div>
            </div>

            {(doc.storage_path || doc.file_url) ? (
              <button type="button" className={BTN_PRIMARY} onClick={() => openInTab(doc)}>
                <ExternalLink size={12} /> Открыть оригинал
              </button>
            ) : (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
                <AlertTriangle size={12} /> Оригинал недоступен: ссылка на хранилище отсутствует.
              </div>
            )}

            {!hasOcr && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
                <AlertTriangle size={12} /> OCR-текст недоступен для этого документа.
              </div>
            )}

            {hasOcr && (
              <>
                <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1">
                  <Search size={12} className="text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Поиск по OCR…"
                    className="w-full bg-transparent text-xs text-slate-100 outline-none"
                  />
                  {query && (
                    <span className="text-[10px] text-slate-400">{matches.length}</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 rounded-md border border-slate-700/70 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-300">
                  <AlertTriangle size={11} className="text-amber-300" />
                  OCR-координаты (страница / абзац) недоступны — подсвечивается только текстовое совпадение.
                </div>

                {matches.length > 0 && (
                  <div className="space-y-1">
                    {matches.slice(0, 10).map((m, i) => (
                      <div
                        key={i}
                        className="rounded border border-slate-700/70 bg-slate-900/80 p-2 text-[11px] text-slate-100"
                      >
                        <Highlighted text={m.preview} q={query} />
                        <button
                          type="button"
                          className={`mt-1 ${BTN}`}
                          onClick={() => copyFragment(m.preview)}
                        >
                          <Copy size={10} /> Копировать
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded border border-slate-700/70 bg-slate-900/80 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      OCR-текст
                    </span>
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => copyFragment(ocr)}
                    >
                      <Copy size={10} /> Копировать весь
                    </button>
                  </div>
                  <pre className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-100">
                    {ocr}
                  </pre>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Highlighted({ text, q }: { text: string; q: string }) {
  if (!q) return <span>{text}</span>;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const i = lower.indexOf(ql);
  if (i === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-300/60 px-0.5 text-slate-900">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </span>
  );
}
