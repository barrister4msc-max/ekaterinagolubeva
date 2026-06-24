import { createFileRoute, useNavigate, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
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
  Archive,
  Download,
  Copy,
  FileText,
  Printer,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelRightOpen,
  PanelRightClose,
  List,
  BookOpen,
  ClipboardCheck,
  Columns,
  Search,
  Filter,
  Target,
  ChevronRight,
  ChevronDown,
  Gavel,
  FileSearch,
  Landmark,
  AlertCircle,
  Link2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  buildConsistencyChecks,
  QualityGate,
  QualityGateSummary,
  ConsistencyCheck,
  type ConsistencyResult,
} from "@/components/quality-gate";

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
  template_id: string | null;
  category: string | null;
  status: string;
  ai_review_status: string | null;
  version_number: number;
  parent_document_id: string | null;
  source_document_id: string | null;
  lead_id: string | null;
  crm_lead_id: string | null;
  lawyer_approved_at: string | null;
  lawyer_approved_by: string | null;
  created_at: string;
  updated_at: string;
  content: string | null;
  metadata: Record<string, any> | null;
  intake_session_id: string | null;
};

const GLASS = "rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md";
// High-contrast solid panel surfaces (right workspace panel).
const PANEL = "rounded-2xl border border-slate-700/70 bg-slate-900/95 shadow-xl";
const PANEL_SUB = "rounded-xl border border-slate-700/60 bg-slate-800/90";
const PANEL_LABEL = "text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400";
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
  { id: "reasoning", label: "Обоснование" },
  { id: "analysis", label: "AI правовой анализ" },
  { id: "sources", label: "Источники" },
  { id: "review", label: "AI Review" },
  { id: "chain", label: "История AI" },
  { id: "history", label: "История" },
  { id: "export", label: "Экспорт" },
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

/* ============ Location / Navigation ============ */

type LocationRef = {
  section?: string | number;
  subsection?: string | number;
  paragraph?: string | number;
  sentence?: string | number;
  anchor?: string;
  quote?: string;
};

function pickLocation(obj: any): LocationRef | null {
  if (!obj || typeof obj !== "object") return null;
  const loc = obj.used_in ?? obj.location ?? obj.usage ?? obj.placement ?? obj;
  if (!loc || typeof loc !== "object") return null;
  const out: LocationRef = {
    section: loc.section ?? loc.раздел ?? loc.section_number,
    subsection: loc.subsection ?? loc.подраздел,
    paragraph: loc.paragraph ?? loc.абзац ?? loc.para ?? loc.paragraph_number,
    sentence: loc.sentence ?? loc.предложение,
    anchor: loc.anchor ?? loc.element_id ?? loc.id,
    quote: loc.quote ?? loc.text_fragment ?? loc.fragment,
  };
  const hasAny = Object.values(out).some((v) => v != null && v !== "");
  return hasAny ? out : null;
}

function navigateToLocation(loc: LocationRef | null, setTab: (t: TabId) => void) {
  if (!loc) return;
  setTab("document");
  window.setTimeout(() => {
    const root = document.getElementById("generated-doc-content");
    if (!root) return;
    let target: HTMLElement | null = null;
    if (loc.anchor) target = document.getElementById(loc.anchor);
    if (!target && loc.quote) {
      const needle = String(loc.quote).trim().slice(0, 40).toLowerCase();
      if (needle) {
        const nodes = Array.from(
          root.querySelectorAll("p, li, h1, h2, h3, h4, blockquote"),
        ) as HTMLElement[];
        target = nodes.find((n) => n.innerText.toLowerCase().includes(needle)) ?? null;
      }
    }
    if (!target && loc.section) {
      const needle = String(loc.section).toLowerCase();
      const heads = Array.from(root.querySelectorAll("h1,h2,h3,h4")) as HTMLElement[];
      target = heads.find((n) => n.innerText.toLowerCase().includes(needle)) ?? null;
    }
    if (!target && loc.paragraph != null) {
      const idx = Number(loc.paragraph);
      if (Number.isFinite(idx) && idx > 0) {
        const paras = Array.from(root.querySelectorAll("p")) as HTMLElement[];
        target = paras[idx - 1] ?? null;
      }
    }
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("doc-highlight");
      window.setTimeout(() => target?.classList.remove("doc-highlight"), 2400);
    }
  }, 140);
}

function LocationBadge({ loc }: { loc: LocationRef | null }) {
  if (!loc) return null;
  const parts: string[] = [];
  if (loc.section != null && loc.section !== "") parts.push(`раздел ${loc.section}`);
  if (loc.subsection != null && loc.subsection !== "") parts.push(`подраздел ${loc.subsection}`);
  if (loc.paragraph != null && loc.paragraph !== "") parts.push(`абз. ${loc.paragraph}`);
  if (loc.sentence != null && loc.sentence !== "") parts.push(`предл. ${loc.sentence}`);
  if (parts.length === 0) return <span className="text-[11px] text-foreground/55">—</span>;
  return <span className="text-[11px] text-foreground/80">{parts.join(" · ")}</span>;
}

function GoToButton({
  loc,
  setTab,
  label = "Перейти",
}: {
  loc: LocationRef | null;
  setTab: (t: TabId) => void;
  label?: string;
}) {
  if (!loc) return null;
  return (
    <button
      type="button"
      onClick={() => navigateToLocation(loc, setTab)}
      className="inline-flex items-center gap-1 rounded-md border border-sky-300/40 bg-sky-400/15 px-2 py-0.5 text-[11px] text-sky-100 hover:bg-sky-400/25"
    >
      <ExternalLink size={10} /> {label}
    </button>
  );
}

function ExpandableQuote({ quote }: { quote?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!quote || typeof quote !== "string" || !quote.trim()) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-sky-200 hover:underline"
      >
        {open ? "▲ Скрыть цитату" : "▼ Показать цитату"}
      </button>
      {open && (
        <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-sky-300/40 bg-black/20 p-2 text-xs italic text-foreground/85">
          «{quote.trim()}»
        </blockquote>
      )}
    </div>
  );
}

/* ============ Unified Source Viewer (Phase 3) ============ */

type SourceViewerPayload = {
  source: any;
  focusQuote?: boolean;
  focusLocalization?: boolean;
  /** Optional context: where this source is used in the document/argument */
  usage?: {
    argumentTitle?: string;
    facts?: string[];
    location?: LocationRef | null;
  };
};

function openSourceViewer(payload: SourceViewerPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ws:open-source-viewer", { detail: payload }));
}

function buildSourceRows(source: any, kind: CitationKind): Array<[string, any]> {
  const rows: Array<[string, any]> = [];
  const push = (label: string, value: any) => {
    if (value != null && value !== "") rows.push([label, value]);
  };
  if (kind === "law") {
    push("Нормативный акт", source.act ?? source.code ?? source.law ?? source.title ?? source.name);
    push("Статья", source.article ?? source.статья);
    push("Часть", source.part ?? source.часть);
    push("Пункт", source.point ?? source.пункт);
    push("Подпункт", source.subpoint ?? source.подпункт);
    push("Абзац", source.paragraph ?? source.абзац);
    push("Предложение", source.sentence ?? source.предложение);
  } else if (kind === "court") {
    push("Суд", source.court ?? source.суд);
    push("Дело", source.case_number ?? source.case ?? source.number);
    push("Дата", source.date ?? source.date_decided);
    push("Документ", source.document_type ?? source.title ?? source.name);
    push("Пункт", source.point);
    push("Подпункт", source.subpoint);
    push("Абзац", source.paragraph);
    push("Страница", source.page);
  } else if (kind === "plenum") {
    push("Постановление", source.title ?? source.name ?? "Пленум");
    push("Номер", source.number ?? source.case_number);
    push("Дата", source.date);
    push("Пункт", source.point);
    push("Подпункт", source.subpoint);
    push("Абзац", source.paragraph);
  } else if (kind === "fns" || kind === "minfin") {
    push(kind === "fns" ? "Письмо ФНС" : "Письмо Минфина", source.title ?? source.name ?? "Письмо");
    push("Номер", source.number ?? source.letter_number);
    push("Дата", source.date);
    push("Раздел", source.section);
    push("Пункт", source.point);
    push("Подпункт", source.subpoint);
    push("Абзац", source.paragraph);
  } else if (kind === "ekaterina") {
    push("Архив", source.archive ?? source.archive_name);
    push("Файл", source.file ?? source.file_name);
    push("Версия", source.version);
    push("Страница", source.page);
    push("Абзац", source.paragraph);
  } else if (kind === "client_doc") {
    push("Файл", source.file ?? source.file_name ?? source.document_name);
    push("Размер OCR", source.ocr_length ?? source.ocr_size);
    push("Страница", source.page);
    push("Абзац", source.paragraph);
  } else {
    push("Название", source.title ?? source.name ?? source.source_id);
    push("Тип", source.type ?? source.kind);
    push("Цитата (citation)", source.citation);
  }
  return rows;
}

async function openClientDocFile(source: any): Promise<void> {
  const explicitUrl = source?.url ?? source?.file_url ?? source?.signed_url;
  if (explicitUrl) {
    window.open(String(explicitUrl), "_blank", "noopener,noreferrer");
    return;
  }
  const path: string | undefined =
    source?.storage_path ?? source?.file_path ?? source?.path ?? source?.object_path;
  if (!path) {
    toast.error("У документа нет ссылки или storage_path");
    return;
  }
  const explicitBucket: string | undefined = source?.bucket ?? source?.storage_bucket;
  let bucket = explicitBucket;
  let objectPath = path;
  if (!bucket && path.includes("/")) {
    const [first, ...rest] = path.split("/");
    bucket = first;
    objectPath = rest.join("/");
  }
  if (!bucket) bucket = "lead-documents";
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 300);
    if (error || !data?.signedUrl) throw error ?? new Error("no url");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  } catch (err) {
    console.warn("openClientDocFile failed", err);
    toast.error("Не удалось открыть файл документа");
  }
}

function SourceViewerDrawer({ setTab }: { setTab: (t: TabId) => void }) {
  const [payload, setPayload] = useState<SourceViewerPayload | null>(null);
  const open = payload != null;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SourceViewerPayload>).detail;
      if (detail && typeof detail === "object") setPayload(detail);
    };
    window.addEventListener("ws:open-source-viewer", handler as EventListener);
    return () => window.removeEventListener("ws:open-source-viewer", handler as EventListener);
  }, []);

  const source = payload?.source;
  const kind = source ? detectKind(source) : "generic";
  const rows = source ? buildSourceRows(source, kind) : [];
  const url = source?.url ?? source?.link ?? source?.official_url;
  const quote =
    source?.quote ?? source?.cited_text ?? source?.text_fragment ?? source?.fragment ?? source?.excerpt;
  const loc = source ? pickLocation(source) : null;
  const usageLoc = payload?.usage?.location ?? loc;
  const precise = source ? hasPreciseLocalization(source, kind) : false;
  const verificationLabel = humanizeStatus(VERIFICATION_LABEL, source?.verification_status);
  const actualityLabel = humanizeStatus(ACTUALITY_LABEL, source?.actuality_status);
  const why = source?.why_selected ?? source?.why_used;
  const usedFor = source?.used_for;
  const citation = source?.citation;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && setPayload(null)}>
      <SheetContent
        side="right"
        className="w-[440px] sm:max-w-[480px] border-slate-700 bg-slate-950 p-0 text-slate-100"
      >
        <SheetHeader className="border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-600/80 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-100">
              {KIND_LABEL[kind]}
            </span>
            {verificationLabel && (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
                {verificationLabel}
              </span>
            )}
            {actualityLabel && (
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-medium text-sky-100">
                {actualityLabel}
              </span>
            )}
          </div>
          <SheetTitle className="text-left text-base text-white">
            {String(
              source?.title ??
                source?.name ??
                source?.act ??
                source?.code ??
                source?.file ??
                source?.file_name ??
                source?.case_number ??
                citation ??
                "Источник",
            )}
          </SheetTitle>
          {citation && (
            <SheetDescription className="text-left text-xs text-slate-400">
              {String(citation)}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="h-[calc(100vh-110px)] space-y-4 overflow-y-auto p-4">
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {url && (
              <a
                href={String(url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/20 px-2.5 py-1 text-[12px] font-medium text-sky-50 hover:bg-sky-500/30"
              >
                <ExternalLink size={12} /> Открыть в новой вкладке
              </a>
            )}
            {kind === "client_doc" && (
              <button
                type="button"
                onClick={() => openClientDocFile(source)}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[12px] font-medium text-emerald-50 hover:bg-emerald-500/30"
              >
                <FileText size={12} /> Открыть файл
              </button>
            )}
            {usageLoc && (
              <button
                type="button"
                onClick={() => {
                  navigateToLocation(usageLoc, setTab);
                  setPayload(null);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-indigo-400/40 bg-indigo-500/20 px-2.5 py-1 text-[12px] font-medium text-indigo-50 hover:bg-indigo-500/30"
              >
                <Target size={12} /> Перейти в документ
              </button>
            )}
          </div>

          {/* Warnings */}
          {!precise && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-400/10 p-2 text-[12px] text-amber-50">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Точная локализация источника отсутствует. Требуется ручная проверка.</span>
            </div>
          )}
          {kind === "client_doc" &&
            !source?.storage_path &&
            !source?.file_path &&
            !source?.url &&
            !source?.file_url && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-400/10 p-2 text-[12px] text-amber-50">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>Файл недоступен: storage_path / url не указаны в данных анализа.</span>
              </div>
            )}

          {/* Metadata rows */}
          {rows.length > 0 && (
            <section>
              <div className={PANEL_LABEL + " mb-1"}>Метаданные источника</div>
              <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 rounded-lg border border-slate-700/70 bg-slate-900/70 p-3 text-[13px]">
                {rows.map(([label, value], i) => (
                  <Fragment key={i}>
                    <dt className="text-slate-400">{label}</dt>
                    <dd className="break-words font-medium text-slate-50">{String(value)}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          )}

          {/* Client doc specifics */}
          {kind === "client_doc" && (
            <section className="space-y-1 text-[12px] text-slate-200">
              {usedFor && (
                <div>
                  <span className="text-slate-400">Как использован: </span>
                  {renderText(usedFor)}
                </div>
              )}
              {source?.rejected_reason || source?.rejection_reason ? (
                <div className="text-amber-100">
                  <span className="text-amber-300">Отклонён: </span>
                  {renderText(source?.rejected_reason ?? source?.rejection_reason)}
                </div>
              ) : null}
            </section>
          )}

          {/* Why selected / used for (non-client) */}
          {kind !== "client_doc" && (usedFor || why) && (
            <section className="space-y-1 text-[12px] text-slate-200">
              {usedFor && (
                <div>
                  <span className="text-slate-400">Как использовано: </span>
                  {renderText(usedFor)}
                </div>
              )}
              {why && (
                <div>
                  <span className="text-slate-400">Почему выбрано: </span>
                  {renderText(why)}
                </div>
              )}
            </section>
          )}

          {/* Used fragment */}
          {typeof quote === "string" && quote.trim() && (
            <section>
              <div className={PANEL_LABEL + " mb-1"}>Использованный фрагмент</div>
              <blockquote className="whitespace-pre-wrap rounded-md border-l-2 border-sky-300/50 bg-slate-900/80 p-3 text-[13px] italic text-slate-100">
                «{quote.trim()}»
              </blockquote>
            </section>
          )}

          {/* Usage in document */}
          {(payload?.usage?.argumentTitle ||
            (payload?.usage?.facts && payload.usage.facts.length > 0) ||
            usageLoc) && (
            <section>
              <div className={PANEL_LABEL + " mb-1"}>Использование в документе</div>
              <div className="space-y-2 rounded-lg border border-slate-700/70 bg-slate-900/70 p-3 text-[12px]">
                {payload?.usage?.argumentTitle && (
                  <div>
                    <span className="text-slate-400">Аргумент: </span>
                    <span className="text-slate-50">{payload.usage.argumentTitle}</span>
                  </div>
                )}
                {payload?.usage?.facts && payload.usage.facts.length > 0 && (
                  <div>
                    <span className="text-slate-400">Связанные факты:</span>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-100">
                      {payload.usage.facts.slice(0, 6).map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {usageLoc && (
                  <div className="flex items-center justify-between gap-2">
                    <LocationBadge loc={usageLoc} />
                    <GoToButton
                      loc={usageLoc}
                      setTab={(t) => {
                        setPayload(null);
                        setTab(t);
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ============ Source Citation ============ */

type CitationKind =
  | "law"
  | "court"
  | "plenum"
  | "fns"
  | "minfin"
  | "ekaterina"
  | "client_doc"
  | "generic";

function detectKind(s: any): CitationKind {
  const k = String(s?.kind ?? s?.type ?? s?.source_type ?? "").toLowerCase();
  if (k.includes("plenum") || k.includes("пленум")) return "plenum";
  if (k.includes("court") || k.includes("суд") || s?.case_number) return "court";
  if (k.includes("fns") || k.includes("фнс")) return "fns";
  if (k.includes("minfin") || k.includes("минфин")) return "minfin";
  if (k.includes("ekaterina") || k.includes("екатерин") || k.includes("practice_archive")) return "ekaterina";
  if (k.includes("client") || k.includes("intake") || k.includes("ocr") || s?.ocr_block != null) return "client_doc";
  if (k.includes("law") || k.includes("норм") || k.includes("кодекс") || k.includes("статья") || s?.article) return "law";
  return "generic";
}

const KIND_LABEL: Record<CitationKind, string> = {
  law: "Закон",
  court: "Судебная практика",
  plenum: "Пленум",
  fns: "Письмо ФНС",
  minfin: "Письмо Минфина",
  ekaterina: "Практика Екатерины",
  client_doc: "Документ клиента",
  generic: "Источник",
};

/** Человекочитаемые подписи для технических статусов из ai_result */
const VERIFICATION_LABEL: Record<string, string> = {
  verified: "Источник проверен",
  needs_check: "Требуется проверка ссылки",
  missing_url: "Ссылка на источник отсутствует",
  failed: "Ссылка недоступна",
  unknown: "Статус проверки неизвестен",
};
const ACTUALITY_LABEL: Record<string, string> = {
  actual: "Норма актуальна",
  requires_actuality_check: "Требуется проверка актуальности",
  requires_manual_verification: "Требуется ручная проверка",
  outdated: "Норма устарела",
  unknown: "Актуальность неизвестна",
};

function humanizeStatus(map: Record<string, string>, value: any): string {
  if (value == null || value === "") return "";
  const k = String(value).toLowerCase();
  return map[k] ?? String(value).replace(/_/g, " ");
}

/**
 * Узнаём, есть ли у источника точная локализация (статья/пункт/абзац/дата/№ дела и т.п.).
 * Если нет — UI покажет предупреждение «Точная локализация отсутствует».
 */
function hasPreciseLocalization(source: any, kind: CitationKind): boolean {
  if (!source) return false;
  const s = source;
  if (kind === "law" || kind === "generic") {
    return Boolean(s.article || s.part || s.point || s.subpoint || s.paragraph || s.sentence);
  }
  if (kind === "court" || kind === "plenum") {
    return Boolean(s.case_number || s.case || s.number || s.date || s.point || s.paragraph || s.page);
  }
  if (kind === "fns" || kind === "minfin") {
    return Boolean(s.number || s.letter_number || s.date || s.section || s.point || s.paragraph);
  }
  if (kind === "ekaterina") {
    return Boolean(s.file || s.file_name || s.page || s.paragraph);
  }
  if (kind === "client_doc") {
    return Boolean(s.page || s.paragraph || s.ocr_block);
  }
  return false;
}

function SourceCitation({ source, setTab }: { source: any; setTab: (t: TabId) => void }) {
  if (!source || typeof source !== "object") {
    return (
      <div className="rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-foreground/85">
        {String(source ?? "—")}
      </div>
    );
  }
  const kind = detectKind(source);
  const loc = pickLocation(source);
  const quote =
    source.quote ?? source.cited_text ?? source.text_fragment ?? source.fragment ?? source.excerpt;
  const url = source.url ?? source.link ?? source.official_url;
  const why = source.why_selected ?? source.why_used;
  const usedFor = source.used_for;
  const rows: Array<[string, any]> = [];
  const push = (label: string, value: any) => {
    if (value != null && value !== "") rows.push([label, value]);
  };

  if (kind === "law") {
    push("Нормативный акт", source.act ?? source.code ?? source.law ?? source.title ?? source.name);
    push("Статья", source.article ?? source.статья);
    push("Часть", source.part ?? source.часть);
    push("Пункт", source.point ?? source.пункт);
    push("Подпункт", source.subpoint ?? source.подпункт);
    push("Абзац", source.paragraph ?? source.абзац);
    push("Предложение", source.sentence ?? source.предложение);
  } else if (kind === "court") {
    push("Суд", source.court ?? source.суд);
    push("Дело", source.case_number ?? source.case ?? source.number);
    push("Дата", source.date ?? source.date_decided);
    push("Документ", source.document_type ?? source.title ?? source.name);
    push("Пункт", source.point);
    push("Подпункт", source.subpoint);
    push("Абзац", source.paragraph);
    push("Страница", source.page);
  } else if (kind === "plenum") {
    push("Постановление", source.title ?? source.name ?? "Пленум");
    push("Номер", source.number ?? source.case_number);
    push("Дата", source.date);
    push("Пункт", source.point);
    push("Подпункт", source.subpoint);
    push("Абзац", source.paragraph);
  } else if (kind === "fns" || kind === "minfin") {
    push(kind === "fns" ? "Письмо ФНС" : "Письмо Минфина", source.title ?? source.name ?? "Письмо");
    push("Номер", source.number ?? source.letter_number);
    push("Дата", source.date);
    push("Раздел", source.section);
    push("Пункт", source.point);
    push("Подпункт", source.subpoint);
    push("Абзац", source.paragraph);
  } else if (kind === "ekaterina") {
    push("Архив", source.archive ?? source.archive_name);
    push("Файл", source.file ?? source.file_name);
    push("Версия", source.version);
    push("Страница", source.page);
    push("Абзац", source.paragraph);
  } else if (kind === "client_doc") {
    push("Файл", source.file ?? source.file_name ?? source.document_name);
    push("Страница", source.page);
    push("Абзац", source.paragraph);
  } else {
    push("Название", source.title ?? source.name ?? source.source_id);
    push("Тип", source.type ?? source.kind);
  }

  const precise = hasPreciseLocalization(source, kind);
  const verificationLabel = humanizeStatus(VERIFICATION_LABEL, source.verification_status);
  const actualityLabel = humanizeStatus(ACTUALITY_LABEL, source.actuality_status);

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-800/95 p-3 text-sm text-slate-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-slate-600/80 bg-slate-700/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-100">
          {KIND_LABEL[kind]}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {verificationLabel && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-100">
              {verificationLabel}
            </span>
          )}
          {actualityLabel && (
            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-100">
              {actualityLabel}
            </span>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-50 hover:bg-sky-500/30"
            >
              <ExternalLink size={11} /> {kind === "law" ? "Перейти к статье" : "Открыть источник"}
            </a>
          )}
        </div>
      </div>
      {rows.length > 0 && (
        <dl className="mt-2 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-[13px]">
          {rows.map(([label, value], i) => (
            <Fragment key={i}>
              <dt className="text-slate-400">{label}</dt>
              <dd className="break-words font-medium text-slate-50">{String(value)}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {usedFor && (
        <div className="mt-2 text-[12px] text-slate-200">
          <span className="text-slate-400">Как использовано:</span> {renderText(usedFor)}
        </div>
      )}
      {why && (
        <div className="mt-1 text-[12px] text-slate-200">
          <span className="text-slate-400">Почему выбрано:</span> {renderText(why)}
        </div>
      )}
      <ExpandableQuote quote={typeof quote === "string" ? quote : undefined} />
      {!precise && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-400/10 p-2 text-[11px] text-amber-50">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>Точная локализация источника отсутствует. Требуется ручная проверка.</span>
        </div>
      )}
      {loc && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/70 bg-slate-900/80 p-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Использовано в документе</span>
            <LocationBadge loc={loc} />
          </div>
          <GoToButton loc={loc} setTab={setTab} />
        </div>
      )}
      {/* Phase 3: Unified source viewer actions */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => openSourceViewer({ source })}
          className="inline-flex items-center gap-1 rounded-md border border-slate-500/60 bg-slate-700/60 px-2 py-0.5 text-[11px] text-slate-50 hover:bg-slate-700"
        >
          <BookOpen size={11} /> Открыть источник
        </button>
        {(quote && typeof quote === "string" && quote.trim()) && (
          <button
            type="button"
            onClick={() => openSourceViewer({ source, focusQuote: true })}
            className="inline-flex items-center gap-1 rounded-md border border-slate-500/60 bg-slate-700/60 px-2 py-0.5 text-[11px] text-slate-50 hover:bg-slate-700"
          >
            <FileSearch size={11} /> Показать фрагмент
          </button>
        )}
        <button
          type="button"
          onClick={() => openSourceViewer({ source, focusLocalization: true })}
          className="inline-flex items-center gap-1 rounded-md border border-slate-500/60 bg-slate-700/60 px-2 py-0.5 text-[11px] text-slate-50 hover:bg-slate-700"
        >
          <Target size={11} /> Проверить локализацию
        </button>
      </div>
    </div>
  );
}

/* ============ Local Trust Index ============ */

function computeLocalTrust(input: {
  evidenceCount: number;
  hasLaw: boolean;
  supportingCount: number;
  missingCount: number;
  weakCount: number;
}): { score: number; level: "high" | "medium" | "low"; reasons: string[] } {
  let score = 30;
  const reasons: string[] = [];
  if (input.hasLaw) {
    score += 25;
    reasons.push("Норма указана");
  } else {
    reasons.push("Норма не указана");
  }
  if (input.evidenceCount > 0) {
    score += Math.min(25, 10 + input.evidenceCount * 5);
    reasons.push(`Доказательств: ${input.evidenceCount}`);
  } else {
    reasons.push("Доказательства не привязаны");
  }
  if (input.supportingCount > 0) {
    score += Math.min(20, 5 + input.supportingCount * 4);
    reasons.push(`Поддерживающих источников: ${input.supportingCount}`);
  }
  score -= input.missingCount * 8;
  if (input.missingCount > 0) reasons.push(`Не хватает доказательств: ${input.missingCount}`);
  score -= input.weakCount * 6;
  if (input.weakCount > 0) reasons.push(`Слабых мест: ${input.weakCount}`);
  score = Math.max(0, Math.min(100, score));
  const level: "high" | "medium" | "low" = score >= 80 ? "high" : score >= 55 ? "medium" : "low";
  return { score, level, reasons };
}

function TrustIndex({
  trust,
}: {
  trust: { score: number; level: "high" | "medium" | "low"; reasons: string[] };
}) {
  const tone =
    trust.level === "high"
      ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-50"
      : trust.level === "medium"
        ? "border-amber-400/50 bg-amber-500/15 text-amber-50"
        : "border-red-400/50 bg-red-500/15 text-red-50";
  const label =
    trust.level === "high"
      ? "Подтверждено"
      : trust.level === "medium"
        ? "Требует уточнения"
        : "Нужна проверка юриста";
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-wider opacity-80">
            Индекс доверия
          </div>
          <div className="text-[13px] font-bold leading-tight">
            {trust.score}% · {label}
          </div>
        </div>
        <div className="h-7 w-7 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(trust.score / 100) * 94.2} 94.2`}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ============ Review Problem Card ============ */

function severityTone(sev?: string) {
  const s = String(sev ?? "").toLowerCase();
  if (s.includes("crit") || s.includes("high") || s.includes("крит") || s.includes("выс"))
    return "border-red-400/40 bg-red-500/15 text-red-50";
  if (s.includes("med") || s.includes("сред"))
    return "border-amber-300/40 bg-amber-400/10 text-amber-50";
  return "border-emerald-300/40 bg-emerald-400/10 text-emerald-50";
}

function ReviewProblemCard({
  index,
  item,
  setTab,
}: {
  index: number;
  item: any;
  setTab: (t: TabId) => void;
}) {
  if (typeof item === "string") {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-foreground/85">
        <div className="text-[11px] uppercase text-foreground/55">Проблема №{index}</div>
        <div className="mt-1">{item}</div>
      </div>
    );
  }
  if (!item || typeof item !== "object") return null;
  const title =
    item.title ?? item.summary ?? item.problem ?? item.issue ?? item.message ?? `Проблема №${index}`;
  const severity = item.severity ?? item.priority ?? item.risk;
  const where = item.where ?? item.location ?? item.placement;
  const loc = pickLocation(where ?? item);
  const reason = item.reason ?? item.cause ?? item.why ?? item.description ?? item.detail;
  const recommendation =
    item.recommendation ?? item.fix ?? item.suggested_fix ?? item.action ?? item.advice;
  const fragment = item.text_fragment ?? item.fragment ?? item.quote ?? item.excerpt;
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-800/90 p-4 text-sm text-slate-100 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={PANEL_LABEL}>Проблема №{index}</div>
          <div className="mt-1 font-semibold text-white">{String(title)}</div>
        </div>
        {severity && (
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityTone(String(severity))}`}>
            {String(severity)}
          </span>
        )}
      </div>
      {loc && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/70 bg-slate-900/80 p-2">
          <div className="flex flex-col gap-0.5">
            <span className={PANEL_LABEL}>Где найдено</span>
            <LocationBadge loc={loc} />
          </div>
          <GoToButton loc={loc} setTab={setTab} />
        </div>
      )}
      {fragment && (
        <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-slate-500 bg-slate-900/70 p-2 text-xs italic text-slate-100">
          «{String(fragment).trim()}»
        </blockquote>
      )}
      {reason && (
        <div className="mt-3">
          <div className="text-[11px] uppercase text-foreground/55">Причина</div>
          <p className="mt-0.5 whitespace-pre-wrap text-foreground/90">{String(reason)}</p>
        </div>
      )}
      {recommendation && (
        <div className="mt-3">
          <div className="text-[11px] uppercase text-foreground/55">Рекомендация</div>
          <p className="mt-0.5 whitespace-pre-wrap text-foreground/90">{String(recommendation)}</p>
        </div>
      )}
    </div>
  );
}

function ReviewSection({
  title,
  items,
  setTab,
  startIndex = 1,
}: {
  title: string;
  items: any[];
  setTab: (t: TabId) => void;
  startIndex?: number;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="space-y-2">
        {items.map((it, i) => (
          <ReviewProblemCard key={i} index={startIndex + i} item={it} setTab={setTab} />
        ))}
      </div>
    </div>
  );
}

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isNestedRoute = /\/workspace\/generated-documents\/[^/]+\/(revise|versions)$/.test(pathname);

  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("reasoning");
  const [edited, setEdited] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [viewMode, setViewMode] = useState<"read" | "review" | "compare">("review");
  const [argDrawerOpen, setArgDrawerOpen] = useState(false);
  const [zoom, setZoom] = useState<number>(100);
  const [fit, setFit] = useState<"none" | "width" | "page">("none");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [selectedArgIndex, setSelectedArgIndex] = useState<number>(0);
  const [argFilter, setArgFilter] = useState<"all" | "high" | "medium" | "low" | "no_evidence" | "ai_issues" | "needs_review">("all");
  const [argSearch, setArgSearch] = useState<string>("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    fact: true, evidence: false, law: true, why: false, rejected: false, practice: false, letters: false, counter: false, review: false, conclusion: false,
  });
  const toggleNode = (k: string) => setExpandedNodes((s) => ({ ...s, [k]: !s[k] }));

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["generated-document", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .select(
          "id,title,template_key,template_id,category,status,ai_review_status,version_number,parent_document_id,source_document_id,lead_id,crm_lead_id,lawyer_approved_at,lawyer_approved_by,created_at,updated_at,content,metadata,intake_session_id",
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

  const meta = (doc?.metadata ?? {}) as Record<string, any>;
  const legalAnalysisRunId: string | null =
    meta?.legal_analysis_run_id ?? meta?.legal_analysis?.run_id ?? null;
  const usedContext: boolean = Boolean(
    meta?.generation_used_document_context ?? meta?.used_document_context,
  );
  const contextQuality: number | null =
    meta?.document_context_quality ?? meta?.context_quality ?? null;
  const contextSummary = meta?.document_context_summary ?? null;
  const generationModel = meta?.model ?? meta?.generation_model ?? null;
  const generationMode = meta?.generation_mode ?? meta?.mode ?? null;
  const language = meta?.language ?? null;
  const jurisdiction = meta?.jurisdiction ?? null;

  // Load legal_analysis run (ai_result)
  const { data: analysisRun } = useQuery({
    queryKey: ["legal-analysis-run", legalAnalysisRunId],
    enabled: !!legalAnalysisRunId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_ai_runs")
        .select("id,run_type,status,ai_result,created_at")
        .eq("id", legalAnalysisRunId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Load last review run for this generated document
  const { data: reviewRun } = useQuery({
    queryKey: ["review-run", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_ai_runs")
        .select("id,run_type,status,ai_result,created_at")
        .eq("generated_document_id" as any, documentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        // column may not exist or no rows — fail silently
        return null;
      }
      return data;
    },
  });

  // Related session documents
  const { data: sessionDocs } = useQuery({
    queryKey: ["session-documents", doc?.intake_session_id],
    enabled: !!doc?.intake_session_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_documents")
        .select("id,file_name,created_at")
        .eq("intake_session_id" as any, doc!.intake_session_id!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return data ?? [];
    },
  });

  // Latest legal_analysis run for the intake session (independent of doc.metadata)
  const sessionId = doc?.intake_session_id ?? null;
  const { data: latestSessionAnalysis, refetch: refetchLatestAnalysis } = useQuery({
    queryKey: ["latest-legal-analysis", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_ai_runs")
        .select("id,status,error_message,created_at,completed_at")
        .eq("session_id", sessionId!)
        .eq("run_type", "legal_analysis")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  // Latest run regardless of status — to surface failed reruns
  const { data: latestSessionRun, refetch: refetchLatestRun } = useQuery({
    queryKey: ["latest-legal-analysis-any", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_ai_runs")
        .select("id,status,error_message,created_at,completed_at")
        .eq("session_id", sessionId!)
        .eq("run_type", "legal_analysis")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  // Source documents attached to the intake session (the corpus the AI analyzed)
  const { data: sessionSourceDocs } = useQuery({
    queryKey: ["session-source-documents", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id,created_at,metadata")
        .eq("metadata->>intake_session_id", sessionId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return [];
      return (data ?? []) as Array<{ id: string; created_at: string }>;
    },
  });

  const lastAnalysisAt = latestSessionAnalysis?.created_at ?? null;
  const lastDocUploadAt = (sessionSourceDocs?.[0]?.created_at as string | undefined) ?? null;
  const docsAfterAnalysis = useMemo(() => {
    if (!sessionSourceDocs || sessionSourceDocs.length === 0) return [];
    if (!lastAnalysisAt) return sessionSourceDocs;
    return sessionSourceDocs.filter((d) => (d.created_at ?? "") > lastAnalysisAt);
  }, [sessionSourceDocs, lastAnalysisAt]);
  const analysisOutdated = docsAfterAnalysis.length > 0;
  const latestRunFailed =
    !!latestSessionRun &&
    latestSessionRun.status !== "completed" &&
    latestSessionRun.status !== "running" &&
    latestSessionRun.status !== "pending";

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

      const original = doc;
      const originalMetadata: Record<string, any> = (original.metadata ?? {}) as Record<string, any>;

      // Provenance guard: never silently drop AI links
      const hasAnalysisRunId = Boolean(
        originalMetadata?.legal_analysis_run_id ?? originalMetadata?.legal_analysis?.run_id,
      );

      const inheritedMetadata: Record<string, any> = { ...originalMetadata };
      const newMetadata: Record<string, any> = {
        ...inheritedMetadata,
        created_via: "manual_edit",
        created_from_document_id: original.id,
        created_from_version: original.version_number ?? 1,
        provenance_inherited: true,
      };

      if (hasAnalysisRunId && !newMetadata.legal_analysis_run_id && !newMetadata.legal_analysis?.run_id) {
        throw new Error("Нельзя создать версию: потеряна связь с AI-анализом.");
      }

      // Root document for version chain
      const rootDocumentId = original.parent_document_id ?? original.id;

      // Compute next version number from DB max across the chain
      let nextVersionNumber = (original.version_number ?? 1) + 1;
      try {
        const { data: maxRows } = await supabase
          .from("generated_legal_documents")
          .select("version_number")
          .or(`id.eq.${rootDocumentId},parent_document_id.eq.${rootDocumentId}`)
          .order("version_number", { ascending: false })
          .limit(1);
        const maxVersion = Array.isArray(maxRows) && maxRows.length > 0 ? (maxRows[0] as any).version_number : null;
        if (typeof maxVersion === "number" && Number.isFinite(maxVersion)) {
          nextVersionNumber = maxVersion + 1;
        }
      } catch {
        // fall back to original+1
      }

      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const insert: Record<string, any> = {
        title: original.title ?? "Без названия",
        template_key: original.template_key ?? "unknown",
        template_id: original.template_id ?? null,
        category: original.category ?? null,
        parent_document_id: rootDocumentId,
        source_document_id: original.source_document_id ?? null,
        version_number: nextVersionNumber,
        content: edited,
        status: "draft",
        ai_review_status: null,
        intake_session_id: original.intake_session_id ?? null,
        lead_id: original.lead_id ?? null,
        crm_lead_id: original.crm_lead_id ?? null,
        lawyer_approved_at: null,
        lawyer_approved_by: null,
        created_by: userId,
        metadata: newMetadata,
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
      toast.success("Документ утверждён");
      queryClient.invalidateQueries({ queryKey: ["generated-document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось утвердить документ"),
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (!doc) return;
      const { error } = await supabase
        .from("generated_legal_documents")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Документ перемещён в архив");
      queryClient.invalidateQueries({ queryKey: ["generated-document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });
      navigate({ to: "/workspace/generated-documents" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось архивировать"),
  });

  // Re-run legal analysis for the current intake session
  const rerunAnalysis = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Нет привязанной intake-сессии.");
      const { data, error } = await supabase.functions.invoke<{
        success?: boolean;
        error?: string;
        run_id?: string;
      }>("analyze-document-legal-position", { body: { session_id: sessionId } });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error ?? "Анализ не выполнен");
      return data;
    },
    onSuccess: async () => {
      toast.success("AI-анализ обновлён. Можно сформировать новую редакцию.");
      await Promise.all([refetchLatestAnalysis(), refetchLatestRun()]);
      queryClient.invalidateQueries({ queryKey: ["legal-analysis-run"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось запустить AI-анализ"),
  });

  // Approved flow: create a new draft version, navigate to it, then trigger re-analysis
  const createVersionAndReanalyze = useMutation({
    mutationFn: async () => {
      const newId = await createVersion.mutateAsync();
      if (sessionId) {
        // Fire-and-forget; user will see the analysis update on the new draft route
        supabase.functions
          .invoke("analyze-document-legal-position", { body: { session_id: sessionId } })
          .catch(() => null);
      }
      return newId;
    },
    onSuccess: () => {
      toast.success("Создана новая редакция, AI-анализ запущен.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось создать редакцию"),
  });

  const getSafeFileName = () =>
    `${(doc?.title ?? "document").replace(/[^\wа-яА-ЯёЁ\-]+/g, "_")}_v${doc?.version_number ?? 1}`;

  const downloadDocx = async () => {
    if (!doc) return;
    const text = edited || doc.content || "";
    const paragraphs = text.split("\n").map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line, size: 28, font: "Times New Roman" })],
          spacing: { after: 160, line: 360 },
        }),
    );
    const wordDoc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
    const blob = await Packer.toBlob(wordDoc);
    saveAs(blob, `${getSafeFileName()}.docx`);
  };

  const downloadPdf = () => window.print();

  const downloadMarkdown = () => {
    if (!doc) return;
    const text = edited || doc.content || "";
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, `${getSafeFileName()}.md`);
  };

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(edited || doc?.content || "");
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  // NOTE: early returns moved below all hooks to keep hook order stable across renders.




  // Markdown headings → TOC entries
  const slugify = (s: string, i: number) =>
    `h-${i}-${s.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").slice(0, 40)}`;
  const headings: { level: number; text: string; slug: string }[] = [];
  {
    const lines = (edited || "").split("\n");
    let idx = 0;
    for (const line of lines) {
      const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
      if (m) {
        headings.push({ level: m[1].length, text: m[2], slug: slugify(m[2], idx++) });
      }
    }
  }
  const mdComponents = {
    h1: ({ node: _n, children, ...rest }: any) => {
      const t = String(children?.[0] ?? children ?? "");
      return <h1 id={slugify(t, headingCounter(0))} {...rest}>{children}</h1>;
    },
    h2: ({ node: _n, children, ...rest }: any) => {
      const t = String(children?.[0] ?? children ?? "");
      return <h2 id={slugify(t, headingCounter(0))} {...rest}>{children}</h2>;
    },
    h3: ({ node: _n, children, ...rest }: any) => {
      const t = String(children?.[0] ?? children ?? "");
      return <h3 id={slugify(t, headingCounter(0))} {...rest}>{children}</h3>;
    },
  } as any;
  // simple counter shared per render
  const _counter = { i: 0 };
  function headingCounter(_: number) {
    return _counter.i++;
  }

  const analysis = (analysisRun?.ai_result ?? {}) as Record<string, any>;
  const review = (reviewRun?.ai_result ?? {}) as Record<string, any>;
  const sources: any[] =
    (Array.isArray(analysis?.sources) && analysis.sources) ||
    pickArray(meta, "sources") ||
    [];

  const PANEL_TABS = TABS.filter((t) => t.id !== "document");

  // Build the argument list (the central object of the workspace).
  const argumentsList = useMemo(() => buildArguments(analysis, meta), [analysis, meta]);
  const reviewProblems: any[] = useMemo(
    () => [
      ...((review?.problems as any[]) ?? pickArray(meta, "problems")),
      ...((review?.required_fixes as any[]) ?? pickArray(meta, "required_fixes")),
      ...((review?.recommendations as any[]) ?? pickArray(meta, "recommendations")),
    ],
    [review, meta],
  );

  // Filter + search arguments
  const filteredArguments = useMemo(() => {
    const q = argSearch.trim().toLowerCase();
    return argumentsList.filter((a) => {
      if (q) {
        const hay = `${a.title} ${a.factText} ${a.lawLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      switch (argFilter) {
        case "high":
          return a.trust.level === "low"; // high risk = low trust
        case "medium":
          return a.trust.level === "medium";
        case "low":
          return a.trust.level === "high";
        case "no_evidence":
          return a.evidenceDocs.length === 0;
        case "ai_issues":
          return matchReviewForArg(a, reviewProblems).length > 0;
        case "needs_review":
          return a.needsReview;
        default:
          return true;
      }
    });
  }, [argumentsList, argFilter, argSearch, reviewProblems]);

  // Clamp selectedArgIndex to valid range
  useEffect(() => {
    if (argumentsList.length === 0) return;
    if (selectedArgIndex >= argumentsList.length) setSelectedArgIndex(0);
  }, [argumentsList.length, selectedArgIndex]);

  // Sync: when selected argument changes, highlight all its mentions in the document.
  useEffect(() => {
    const arg = argumentsList[selectedArgIndex];
    if (!arg) return;
    const t = window.setTimeout(() => highlightArgumentInDoc(arg), 80);
    return () => window.clearTimeout(t);
  }, [selectedArgIndex, argumentsList]);

  const selectedArg = argumentsList[selectedArgIndex] ?? null;

  // Phase 4: Quality Gate / Consistency
  const consistency: ConsistencyResult = useMemo(
    () =>
      buildConsistencyChecks({
        doc: doc ?? null,
        legalAnalysisRunId,
        analysisRun: analysisRun ?? null,
        reviewRun: reviewRun ?? null,
        analysis,
        review,
        meta,
        argumentsCount: argumentsList.length,
        sources,
        usedContext,
        contextQuality,
      }),
    [doc, legalAnalysisRunId, analysisRun, reviewRun, analysis, review, meta, argumentsList.length, sources, usedContext, contextQuality],
  );
  const approveBlocked = !consistency.ready;

  const showPanel = viewMode !== "read" && !panelCollapsed;
  // Right panel is a fixed compact column; document fills the rest.
  const gridCols = showPanel
    ? viewMode === "compare"
      ? "min-[1600px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      : "lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]"
    : "lg:grid-cols-1";

  // In Review/Compare the doc fills its column; only Read centers as A4-ish paper.
  const docMaxWidth =
    fit === "width"
      ? "none"
      : viewMode === "read"
        ? "min(1200px, calc(100vw - 160px))"
        : "none";
  const docFontSize = fit === "page" ? 16 : Math.round((18 * zoom) / 100);

  // ── Early returns AFTER all hooks (keeps hook order stable across renders) ──
  if (isNestedRoute) {
    return <Outlet />;
  }
  if (isLoading) {
    return (
      <div className={`${GLASS} flex items-center gap-2 p-6 text-sm text-foreground/80`}>
        <Loader2 size={14} className="animate-spin" /> Загружаем документ…
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div className={`${GLASS} p-6 text-sm text-red-200`}>
        <div className="mb-3">{(error as Error)?.message ?? "Документ не найден"}</div>
        <Link
          to="/workspace/generated-documents"
          className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-foreground/90 hover:bg-white/20"
        >
          <ArrowLeft size={14} /> Назад к моим документам
        </Link>
      </div>
    );
  }


  const cycleMode = (m: typeof viewMode) => () => setViewMode(m);
  const zoomDec = () => {
    setFit("none");
    setZoom((z) => Math.max(60, z - 10));
  };
  const zoomInc = () => {
    setFit("none");
    setZoom((z) => Math.min(200, z + 10));
  };
  const zoomReset = () => {
    setFit("none");
    setZoom(100);
  };

  const ModeBtn = ({
    mode,
    icon: Icon,
    label,
  }: {
    mode: typeof viewMode;
    icon: any;
    label: string;
  }) => (
    <button
      type="button"
      onClick={cycleMode(mode)}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
        viewMode === mode
          ? "border-emerald-300/60 bg-emerald-500/30 text-white"
          : "border-white/20 bg-white/5 text-foreground/85 hover:bg-white/15"
      }`}
      title={label}
    >
      <Icon size={13} /> {label}
    </button>
  );

  // The document pane (used in all modes)
  const DocumentPane = (
    <section
      id="document-pane"
      className="relative space-y-0 pb-10"
    >
      {isApproved && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-400/10 p-3 text-xs text-amber-50 no-print">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Одобренную или финальную версию нельзя изменить напрямую. Создайте новую версию.</span>
        </div>
      )}

      <div
        className="doc-paper mx-auto w-full px-6 py-8 shadow-[0_10px_40px_rgba(0,0,0,0.25)] ring-1 ring-black/10 sm:px-10 sm:py-12 lg:px-[60px] lg:py-[70px]"
        style={{ backgroundColor: "#ffffff", maxWidth: docMaxWidth }}
      >
        {editMode ? (
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
              fontSize: `${docFontSize}px`,
              lineHeight: 1.9,
              backgroundColor: "#ffffff",
              color: "#111827",
            }}
            className="block min-h-[900px] w-full resize-none border-0 p-0 outline-none placeholder:text-slate-500"
            placeholder="Текст документа..."
          />
        ) : (
          <div
            id="generated-doc-content"
            className="doc-prose min-h-[900px]"
            onClick={(e) => {
              const tgt = (e.target as HTMLElement)?.closest?.(
                "p, li, h1, h2, h3, h4, blockquote",
              ) as HTMLElement | null;
              if (!tgt || argumentsList.length === 0) return;
              const text = (tgt.innerText || "").toLowerCase();
              if (text.length < 8) return;
              let best = -1;
              let bestLen = 0;
              for (let i = 0; i < argumentsList.length; i++) {
                const a = argumentsList[i];
                const needles: string[] = [];
                if (a.factText) needles.push(a.factText.toLowerCase().slice(0, 40));
                for (const loc of a.allLocations) {
                  if (loc.quote) needles.push(String(loc.quote).toLowerCase().slice(0, 40));
                }
                for (const n of needles) {
                  if (n.length >= 8 && text.includes(n) && n.length > bestLen) {
                    best = i;
                    bestLen = n.length;
                  }
                }
              }
              if (best >= 0) {
                setSelectedArgIndex(best);
                setTab("reasoning");
              }
            }}
            style={{
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: `${docFontSize}px`,
              lineHeight: 1.9,
              color: "#111827",
              cursor: argumentsList.length > 0 ? "pointer" : "auto",
            }}
          >
            {edited ? (
              <ReactMarkdown components={mdComponents}>{edited}</ReactMarkdown>
            ) : (
              <span className="text-slate-500">Документ пуст</span>
            )}
          </div>
        )}

        <p className="mt-8 border-t border-slate-200 pt-3 text-center text-[11px] italic text-slate-500">
          Рабочий текст документа. Правки юриста сохраняются в соответствии со статусом версии.
        </p>
      </div>

      <div className="doc-actions mx-auto flex w-full flex-nowrap items-center gap-3 overflow-x-auto border-t border-slate-200 bg-white px-[60px] py-6 no-print" style={{ maxWidth: docMaxWidth }}>
        {!isApproved && (
          <>
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`${BTN} whitespace-nowrap`}
            >
              {editMode ? "Закрыть" : "Редактировать"}
            </button>
            <button type="button" onClick={copyContent} className={`${BTN} whitespace-nowrap`}>
              <Copy size={12} /> Скопировать
            </button>
            <button
              type="button"
              onClick={() => saveEdits.mutate()}
              disabled={!editMode || !dirty || saveEdits.isPending}
              className={`${BTN_PRIMARY} whitespace-nowrap`}
            >
              {saveEdits.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => rerunAnalysis.mutate()}
              disabled={rerunAnalysis.isPending || !sessionId}
              title={!sessionId ? "Нет привязанной intake-сессии" : "Запустить AI правовой анализ заново"}
              className={`${BTN} whitespace-nowrap`}
            >
              {rerunAnalysis.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCcw size={12} />
              )}
              Повторить AI-анализ
            </button>
            {analysisOutdated ? (
              <button
                type="button"
                onClick={() => createVersionAndReanalyze.mutate()}
                disabled={createVersionAndReanalyze.isPending || !edited}
                className={`${BTN_AMBER} whitespace-nowrap`}
                title="Добавлены новые документы — нужна новая редакция и повторный AI-анализ"
              >
                {createVersionAndReanalyze.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <GitBranch size={12} />
                )}
                Создать новую редакцию и выполнить AI-анализ
              </button>
            ) : (
              <button
                type="button"
                onClick={() => createVersion.mutate()}
                disabled={createVersion.isPending || !edited}
                className={`${BTN_AMBER} whitespace-nowrap`}
              >
                {createVersion.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <GitBranch size={12} />
                )}
                Создать новую редакцию
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (approveBlocked) {
                  toast.error(consistency.blockReason ?? "Документ не прошёл проверку качества.");
                  setTab("review");
                  return;
                }
                if (confirm("Утвердить документ?")) approve.mutate();
              }}
              disabled={approve.isPending || approveBlocked}
              title={approveBlocked ? (consistency.blockReason ?? "Quality Gate не пройден") : undefined}
              className={`${BTN_EMERALD} whitespace-nowrap`}
            >
              {approve.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CheckCircle2 size={12} />
              )}
              Утвердить документ
            </button>
          </>
        )}
        {isApproved && (
          <>
            <button type="button" onClick={downloadDocx} className={`${BTN} whitespace-nowrap`}>
              <Download size={12} /> DOCX
            </button>
            <button type="button" onClick={downloadPdf} className={`${BTN} whitespace-nowrap`}>
              <FileText size={12} /> PDF
            </button>
            <button type="button" onClick={() => window.print()} className={`${BTN} whitespace-nowrap`}>
              <Printer size={12} /> Печать
            </button>
            {analysisOutdated ? (
              <button
                type="button"
                onClick={() => createVersionAndReanalyze.mutate()}
                disabled={createVersionAndReanalyze.isPending}
                className={`${BTN_AMBER} whitespace-nowrap`}
                title="Добавлены новые документы — нужна новая редакция и повторный AI-анализ"
              >
                {createVersionAndReanalyze.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <GitBranch size={12} />
                )}
                Создать новую редакцию и выполнить AI-анализ
              </button>
            ) : (
              <button
                type="button"
                onClick={() => createVersion.mutate()}
                disabled={createVersion.isPending}
                className={`${BTN_AMBER} whitespace-nowrap`}
              >
                {createVersion.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <GitBranch size={12} />
                )}
                Создать новую редакцию
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm("Переместить документ в архив?")) archive.mutate();
              }}
              disabled={archive.isPending}
              className={`${BTN} whitespace-nowrap`}
            >
              {archive.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Archive size={12} />
              )}
              Архивировать
            </button>
            {!consistency.ready && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-amber-400/60 bg-amber-500/15 px-2.5 py-1.5 text-xs text-amber-700">
                <AlertTriangle size={12} /> Утверждён, но Quality Gate не пройден
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );

  // The aux/check panel (reasoning / analysis / sources / review / history / export)
  const PanelPane = (
    <div
      className={`min-w-0 space-y-3 ${
        viewMode !== "read"
          ? "lg:sticky lg:top-3 lg:max-h-[calc(100vh-90px)] lg:overflow-y-auto lg:pr-1"
          : ""
      }`}
    >
      <div className="sticky top-0 z-30 flex flex-wrap gap-1.5 rounded-2xl border border-slate-700/70 bg-slate-950/95 p-2 shadow-2xl">
        {PANEL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
              tab === t.id
                ? "border-emerald-300/60 bg-emerald-500/30 text-white"
                : "border-slate-700/70 bg-slate-800/80 text-slate-100 hover:border-slate-500 hover:bg-slate-700/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <QualityGateSummary
        result={consistency}
        approved={isApproved}
        onClick={() => setTab("review")}
      />



      {tab === "reasoning" && (
        <div className="space-y-3">
          {argumentsList.length > 1 && (
            <div className={`${PANEL} flex items-center justify-between gap-2 p-2`}>
              <button
                type="button"
                onClick={() => setSelectedArgIndex((i) => Math.max(0, i - 1))}
                disabled={selectedArgIndex <= 0}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 disabled:opacity-40"
              >
                ← Пред.
              </button>
              <div className="text-center text-[11px] text-slate-300">
                Аргумент <span className="font-semibold text-white">{selectedArgIndex + 1}</span>{" "}
                из {argumentsList.length}
                <button
                  type="button"
                  onClick={() => setArgDrawerOpen(true)}
                  className="ml-2 underline decoration-dotted hover:text-white"
                >
                  список
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSelectedArgIndex((i) => Math.min(argumentsList.length - 1, i + 1))
                }
                disabled={selectedArgIndex >= argumentsList.length - 1}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 disabled:opacity-40"
              >
                След. →
              </button>
            </div>
          )}
          {selectedArg ? (
            <ArgumentTree
              arg={selectedArg}
              reviewProblems={reviewProblems}
              expanded={expandedNodes}
              onToggle={toggleNode}
              onJumpDoc={() => selectedArg && highlightArgumentInDoc(selectedArg)}
              setTab={setTab}
            />
          ) : (
            <ReasoningTab analysis={analysis} meta={meta} setTab={setTab} />
          )}
        </div>
      )}

      {tab === "analysis" && (
        <section className={`${PANEL} p-5 space-y-4 text-sm text-slate-100`}>
          <h2 className="font-display text-lg text-white">AI правовой анализ</h2>
          <AnalysisFreshness
            sessionId={sessionId}
            lastAnalysisAt={lastAnalysisAt}
            lastDocUploadAt={lastDocUploadAt}
            docsTotal={sessionSourceDocs?.length ?? 0}
            docsAfter={docsAfterAnalysis.length}
            outdated={analysisOutdated}
            latestRunFailed={latestRunFailed}
            latestRunError={latestSessionRun?.error_message ?? null}
            isApproved={isApproved}
            isRunning={rerunAnalysis.isPending || createVersionAndReanalyze.isPending}
            onRerun={() => rerunAnalysis.mutate()}
            onCreateVersionAndRerun={() => createVersionAndReanalyze.mutate()}
          />
          {!analysisRun && <p className="text-slate-300">Правовой анализ не привязан к документу.</p>}
          {analysisRun && (
            <>
              <AnalysisField label="Правовая квалификация" value={analysis?.legal_qualification ?? analysis?.qualification} />
              <AnalysisField label="Основная позиция" value={analysis?.main_position ?? analysis?.position} />
              <AnalysisField label="Позиция клиента" value={analysis?.client_position} />
              <AnalysisField label="Позиция ФНС / оппонента" value={analysis?.opponent_position ?? analysis?.fns_position} />
              <AnalysisList label="Факты" items={analysis?.facts} />
              <AnalysisList label="Контраргументы" items={analysis?.counter_arguments} />
              <AnalysisList label="Слабые места" items={analysis?.weak_points} />
              <AnalysisList label="Недостающие доказательства" items={analysis?.missing_evidence} />
              <AnalysisList label="Инструкции для генератора" items={analysis?.generation_instructions} />
              <div className={`${PANEL_SUB} p-3 text-xs text-slate-200`}>
                Качество подготовленного контекста для документа:{" "}
                <span className="font-semibold text-white">{contextQuality ?? "—"}</span>
                {contextQuality == null && (
                  <span className="ml-2 text-amber-200/90">оценка качества недоступна</span>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {tab === "sources" && (
        <section className={`${PANEL} p-5 space-y-3`}>
          <div>
            <h2 className="font-display text-lg text-white">Источники</h2>
            <p className="mt-1 text-xs text-slate-300">
              Точная локализация: статья, пункт, абзац, страница, цитата. Кнопка «Перейти» открывает место в документе.
            </p>
          </div>
          {sources.length === 0 && <p className="text-sm text-slate-300">Источники не указаны.</p>}
          <div className="space-y-2">
            {sources.map((s: any, i: number) => (
              <SourceCitation key={i} source={s} setTab={setTab} />
            ))}
          </div>
        </section>
      )}

      {tab === "review" && (
        <section className={`${PANEL} p-5 space-y-4`}>
          <div>
            <h2 className="font-display text-lg text-white">AI Review</h2>
            <p className="mt-1 text-xs text-slate-300">
              Найденные проблемы, причины и рекомендации. Каждый блок содержит ссылку на место в документе.
            </p>
          </div>

          <QualityGate result={consistency} approved={isApproved} />

          {!reviewRun && <p className="text-sm text-slate-300">AI Review для этого документа не найден.</p>}
          {reviewRun && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Юридическая точность" value={review?.legal_accuracy_score ?? pickScalar(meta, "legal_accuracy_score")} />
                <Stat label="Риск галлюцинаций" value={review?.hallucination_risk ?? pickScalar(meta, "hallucination_risk")} />
                <Stat label="Нужен юрист" value={String(review?.needs_lawyer_review ?? "—")} />
              </div>
              {(() => {
                const problems = (review?.problems ?? pickArray(meta, "problems")) as any[];
                const fixes = (review?.required_fixes ?? pickArray(meta, "required_fixes")) as any[];
                const recs = (review?.recommendations ?? pickArray(meta, "recommendations")) as any[];
                const total = (problems?.length ?? 0) + (fixes?.length ?? 0) + (recs?.length ?? 0);
                if (total === 0) return <p className="text-sm text-slate-300">Замечаний нет.</p>;
                return (
                  <>
                    <ReviewSection title="Проблемы" items={problems} setTab={setTab} />
                    <ReviewSection title="Обязательные правки" items={fixes} setTab={setTab} startIndex={(problems?.length ?? 0) + 1} />
                    <ReviewSection title="Рекомендации" items={recs} setTab={setTab} startIndex={(problems?.length ?? 0) + (fixes?.length ?? 0) + 1} />
                  </>
                );
              })()}
            </>
          )}
        </section>
      )}

      {tab === "chain" && (
        <ChainOfCustodyTab
          sessionId={sessionId}
          currentDocumentId={doc.id}
          currentMeta={meta}
        />
      )}

      {tab === "history" && (
        <section className={`${PANEL} p-5 space-y-3 text-sm text-slate-100`}>
          <h2 className="font-display text-lg text-white">История и метаданные</h2>
          <Row label="Создан" value={fmt(doc.created_at)} />
          <Row label="Обновлён" value={fmt(doc.updated_at)} />
          <Row label="Версия" value={String(doc.version_number)} />
          <Row label="Режим генерации" value={generationMode ?? "—"} />
          <Row label="Модель" value={generationModel ?? "—"} />
          <Row label="legal_analysis_run_id" value={legalAnalysisRunId ?? "—"} />
          <Row label="document_context_quality" value={contextQuality != null ? String(contextQuality) : "—"} />
          <Row label="generation_used_document_context" value={String(usedContext)} />
          {sessionDocs && sessionDocs.length > 0 && (
            <div>
              <div className={`mt-3 ${PANEL_LABEL}`}>Документы сессии</div>
              <ul className="mt-2 space-y-1">
                {sessionDocs.map((d: any) => (
                  <li key={d.id} className="text-xs text-slate-200">
                    {d.file_name} <span className="text-slate-400">· {fmt(d.created_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              to="/workspace/generated-documents/$documentId/versions"
              params={{ documentId: doc.id }}
              className={BTN}
            >
              <GitBranch size={12} /> История версий
            </Link>
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/workspace/generated-documents/$documentId/revise",
                  params: { documentId },
                })
              }
              className={BTN_AMBER}
            >
              <RefreshCcw size={12} /> Пересмотр
            </button>
          </div>
        </section>
      )}

      {tab === "export" && (
        <section className={`${PANEL} p-5 space-y-3`}>
          <h2 className="font-display text-lg text-white">Экспорт</h2>
          <p className="text-sm text-slate-300">Скачайте документ или отправьте на печать.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadDocx} className={BTN}>
              <Download size={12} /> DOCX
            </button>
            <button type="button" onClick={downloadPdf} className={BTN}>
              <FileText size={12} /> PDF
            </button>
            <button type="button" onClick={downloadMarkdown} className={BTN}>
              <Download size={12} /> Markdown
            </button>
            <button type="button" onClick={() => window.print()} className={BTN}>
              <Printer size={12} /> Печать
            </button>
          </div>

          <div className={`${PANEL_SUB} mt-4 grid grid-cols-2 gap-3 p-3 text-xs text-slate-100`}>
            <SideRow label="Статус" value={doc.status} />
            <SideRow label="Шаблон" value={doc.template_key ?? "—"} />
            <SideRow label="Язык" value={language ?? "—"} />
            <SideRow label="Юрисдикция" value={jurisdiction ?? "—"} />
            <SideRow label="used_context" value={String(usedContext)} />
            <SideRow label="context_quality" value={contextQuality != null ? String(contextQuality) : "—"} />
            <SideRow label="legal_analysis_run_id" value={legalAnalysisRunId ? `${legalAnalysisRunId.slice(0, 8)}…` : "—"} />
            <SideRow label="created_at" value={fmt(doc.created_at)} />
            {contextSummary && (
              <div className={`col-span-2 ${PANEL_SUB} p-2 text-slate-200`}>
                {String(contextSummary)}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );



  return (

    <div className="ws-doc-root space-y-4">
      {/* Top toolbar */}
      <div className="ws-doc-toolbar no-print sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/workspace/generated-documents" })}
            className={`${BTN} whitespace-nowrap`}
          >
            <ArrowLeft size={12} /> Назад
          </button>

          {/* Mode switcher */}
          <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 p-1">
            <ModeBtn mode="read" icon={BookOpen} label="Чтение" />
            <ModeBtn mode="review" icon={ClipboardCheck} label="Проверка" />
            <ModeBtn mode="compare" icon={Columns} label="Сравнение" />
          </div>

          {/* Argument navigator drawer trigger */}
          <button
            type="button"
            onClick={() => setArgDrawerOpen(true)}
            className={`${BTN} whitespace-nowrap`}
            title="Навигатор аргументов"
          >
            <Target size={12} /> Аргументы
            {argumentsList.length > 0 && (
              <span className="ml-1 rounded-full bg-emerald-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-50">
                {argumentsList.length}
              </span>
            )}
          </button>


          {/* TOC */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setTocOpen((v) => !v)}
              className={`${BTN} whitespace-nowrap`}
              title="Оглавление"
            >
              <List size={12} /> Оглавление
            </button>
            {tocOpen && headings.length > 0 && (
              <div className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-[60vh] w-[320px] overflow-y-auto rounded-xl border border-white/15 bg-slate-950/95 p-2 text-xs shadow-2xl backdrop-blur-xl">
                {headings.map((h) => (
                  <button
                    key={h.slug}
                    type="button"
                    onClick={() => {
                      setTocOpen(false);
                      window.setTimeout(() => {
                        const el = document.getElementById(h.slug);
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "start" });
                          el.classList.add("doc-highlight");
                          window.setTimeout(() => el.classList.remove("doc-highlight"), 1800);
                        }
                      }, 50);
                    }}
                    className="block w-full truncate rounded-md px-2 py-1 text-left text-foreground/85 hover:bg-white/10"
                    style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                  >
                    {h.text}
                  </button>
                ))}
              </div>
            )}
            {tocOpen && headings.length === 0 && (
              <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[260px] rounded-xl border border-white/15 bg-slate-950/95 p-3 text-xs text-foreground/70 shadow-2xl">
                Заголовков в документе не найдено.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom */}
          <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 p-1">
            <button type="button" onClick={zoomDec} className="rounded-md p-1.5 text-foreground/85 hover:bg-white/10" title="Уменьшить">
              <ZoomOut size={14} />
            </button>
            <button type="button" onClick={zoomReset} className="min-w-[52px] rounded-md px-2 py-1 text-xs text-foreground/90 hover:bg-white/10" title="Сбросить">
              {zoom}%
            </button>
            <button type="button" onClick={zoomInc} className="rounded-md p-1.5 text-foreground/85 hover:bg-white/10" title="Увеличить">
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={() => setFit(fit === "width" ? "none" : "width")}
              className={`rounded-md px-2 py-1 text-[11px] ${fit === "width" ? "bg-emerald-500/30 text-white" : "text-foreground/85 hover:bg-white/10"}`}
              title="Fit Width"
            >
              Fit W
            </button>
            <button
              type="button"
              onClick={() => setFit(fit === "page" ? "none" : "page")}
              className={`rounded-md px-2 py-1 text-[11px] ${fit === "page" ? "bg-emerald-500/30 text-white" : "text-foreground/85 hover:bg-white/10"}`}
              title="Fit Page"
            >
              <Maximize2 size={12} className="inline" /> Page
            </button>
          </div>

          {viewMode !== "read" && (
            <button
              type="button"
              onClick={() => setPanelCollapsed((v) => !v)}
              className={`${BTN} whitespace-nowrap`}
              title={panelCollapsed ? "Показать панель" : "Скрыть панель"}
            >
              {panelCollapsed ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
              {panelCollapsed ? "Панель" : "Скрыть"}
            </button>
          )}

          <button type="button" onClick={downloadDocx} className={BTN}>
            <Download size={12} /> DOCX
          </button>
          <button type="button" onClick={downloadPdf} className={BTN}>
            <FileText size={12} /> PDF
          </button>
          <button type="button" onClick={() => window.print()} className={BTN}>
            <Printer size={12} /> Печать
          </button>
        </div>
      </div>

      {/* Document header — compact */}
      <header className={`${GLASS} px-4 py-2.5 no-print`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[10px] uppercase tracking-wide text-foreground/55 shrink-0">
            {doc.template_key ?? "—"}
          </span>
          <h1 className="font-display text-base font-semibold text-white truncate min-w-0">
            {doc.title || "Без названия"}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={CHIP}>v{doc.version_number}</span>
            <span className={CHIP}>{doc.status}</span>
            {doc.ai_review_status && (
              <span className={CHIP}>
                <Sparkles size={10} /> {doc.ai_review_status}
              </span>
            )}
            {usedContext && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-100">
                Ctx{contextQuality != null ? `·${contextQuality}` : ""}
              </span>
            )}
            {doc.lawyer_approved_at && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-100">
                <ShieldCheck size={10} /> Одобрен
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Workspace layout */}
      {viewMode === "read" || !showPanel ? (
        <div className="min-w-0 transition-all duration-300 ease-out">{DocumentPane}</div>
      ) : viewMode === "compare" ? (
        // Compare: side-by-side at >=1600px, stacked (doc on top, panel below) otherwise.
        <div className={`grid gap-5 transition-all duration-300 ease-out ${gridCols}`}>
          <div className="min-w-0">{DocumentPane}</div>
          <aside className="no-print min-w-0">{PanelPane}</aside>
        </div>
      ) : (
        <div className={`grid gap-5 transition-all duration-300 ease-out ${gridCols}`}>
          <div className="min-w-0">{DocumentPane}</div>
          <aside className="no-print min-w-0 hidden lg:block">{PanelPane}</aside>
        </div>
      )}

      {/* Arguments drawer */}
      <Sheet open={argDrawerOpen} onOpenChange={setArgDrawerOpen}>
        <SheetContent side="left" className="w-[400px] sm:max-w-[420px] border-slate-700 bg-slate-950 p-0 text-slate-100">
          <SheetHeader className="border-b border-slate-800 px-4 py-3">
            <SheetTitle className="text-white">Навигатор аргументов</SheetTitle>
            <SheetDescription className="text-slate-400">
              Выберите аргумент — документ прокрутится к нужному месту, правая панель покажет цепочку обоснования.
            </SheetDescription>
          </SheetHeader>
          <div className="h-[calc(100vh-110px)] overflow-y-auto p-3">
            <ArgumentNavigator
              args={argumentsList}
              filtered={filteredArguments}
              selectedIndex={selectedArgIndex}
              onSelect={(i) => {
                setSelectedArgIndex(i);
                setArgDrawerOpen(false);
                setTab("reasoning");
                window.setTimeout(() => {
                  const a = argumentsList[i];
                  if (a) highlightArgumentInDoc(a);
                }, 120);
              }}
              filter={argFilter}
              onFilterChange={setArgFilter}
              search={argSearch}
              onSearchChange={setArgSearch}
              reviewProblems={reviewProblems}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Phase 3: Unified Source Viewer */}
      <SourceViewerDrawer setTab={setTab} />


      {/* Print + doc styles */}
      <style>{`
        /* Break out of the workspace .container-wide (max-width:1280px)
           so the document can use the real viewport width. */
        .container-wide:has(.ws-doc-root) {
          max-width: none !important;
          padding-inline: 1rem !important;
        }
        @media (min-width: 1280px) {
          .container-wide:has(.ws-doc-root) { padding-inline: 1.5rem !important; }
        }
        main:has(> .ws-doc-root) { min-width: 0; }
        .ws-doc-root { min-width: 0; }
        .ws-doc-root, .ws-doc-root * { box-sizing: border-box; }
        .doc-paper { width: 100%; }
        .doc-prose h1 { font-size: 1.34em; font-weight: 700; margin: 16px 0 12px; scroll-margin-top: 80px; }
        .doc-prose h2 { font-size: 1.18em; font-weight: 700; margin: 14px 0 10px; scroll-margin-top: 80px; }
        .doc-prose h3 { font-size: 1.06em; font-weight: 600; margin: 12px 0 8px; scroll-margin-top: 80px; }
        .doc-prose p { margin: 8px 0; }
        .doc-prose ul { list-style: disc; padding-left: 28px; margin: 8px 0; }
        .doc-prose ol { list-style: decimal; padding-left: 28px; margin: 8px 0; }
        .doc-prose li { margin: 4px 0; }
        .doc-prose strong { font-weight: 700; }
        .doc-prose em { font-style: italic; }
        .doc-prose blockquote { border-left: 3px solid #d1d5db; padding-left: 12px; color: #374151; margin: 10px 0; }
        .doc-prose hr { border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0; }
        .doc-prose code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
        .doc-highlight { background: #fde68a !important; transition: background-color 0.4s ease; border-radius: 4px; box-shadow: 0 0 0 4px #fde68a; }
        .doc-arg-active {
          background: linear-gradient(90deg, rgba(16,185,129,0.18), rgba(16,185,129,0.06)) !important;
          border-left: 3px solid #10b981;
          padding-left: 10px;
          margin-left: -13px;
          border-radius: 4px;
          animation: argpulse 1.4s ease-out;
        }
        @keyframes argpulse {
          0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.45); }
          70% { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }

        @media print {
          .no-print { display: none !important; }
          body, html { background: #ffffff !important; }
          .ws-doc-root { background: #ffffff !important; }
          .ws-doc-root > * { margin: 0 !important; }
          .doc-paper {
            box-shadow: none !important;
            ring: 0 !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .doc-actions { display: none !important; }
          aside { display: none !important; }
          @page { size: A4; margin: 18mm 16mm; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-700/60 pb-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-slate-100">{value}</span>
    </div>
  );
}

function SideRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-slate-50">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-800/90 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-white">{value != null && value !== "" ? String(value) : "—"}</div>
    </div>
  );
}

function humanizeItem(it: any): string {
  if (it == null) return "—";
  if (typeof it === "string") return it;
  if (typeof it === "number" || typeof it === "boolean") return String(it);
  if (typeof it === "object") {
    for (const k of [
      "text",
      "description",
      "title",
      "name",
      "summary",
      "value",
      "fact",
      "argument",
      "instruction",
      "label",
    ]) {
      if (typeof it[k] === "string" && it[k].trim()) return it[k];
    }
  }
  return "";
}

function AnalysisField({ label, value }: { label: string; value: any }) {
  if (value == null || value === "") return null;
  const text = typeof value === "string" ? value : humanizeItem(value) || JSON.stringify(value);
  return (
    <div className={`${PANEL_SUB} p-3`}>
      <div className={PANEL_LABEL}>{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-50">{text}</div>
    </div>
  );
}

function AnalysisFreshness({
  sessionId,
  lastAnalysisAt,
  lastDocUploadAt,
  docsTotal,
  docsAfter,
  outdated,
  latestRunFailed,
  latestRunError,
  isApproved,
  isRunning,
  onRerun,
  onCreateVersionAndRerun,
}: {
  sessionId: string | null;
  lastAnalysisAt: string | null;
  lastDocUploadAt: string | null;
  docsTotal: number;
  docsAfter: number;
  outdated: boolean;
  latestRunFailed: boolean;
  latestRunError: string | null;
  isApproved: boolean;
  isRunning: boolean;
  onRerun: () => void;
  onCreateVersionAndRerun: () => void;
}) {
  if (!sessionId) return null;
  const status = outdated ? "Устарел" : lastAnalysisAt ? "Актуален" : "Нет анализа";
  const tone = outdated
    ? "border-amber-400/50 bg-amber-500/10 text-amber-50"
    : lastAnalysisAt
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-50"
    : "border-slate-600/60 bg-slate-800/60 text-slate-200";

  return (
    <div className={`rounded-2xl border ${tone} p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {outdated ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
          <span>Статус AI-анализа: {status}</span>
        </div>
        <span className="rounded-full bg-black/30 px-2 py-0.5 text-[11px]">
          Документов: {docsTotal}
          {docsAfter > 0 ? ` · +${docsAfter} после анализа` : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-slate-200/90">
        <div>
          <div className="opacity-70">Последний AI-анализ</div>
          <div className="font-medium text-slate-50">{lastAnalysisAt ? fmt(lastAnalysisAt) : "—"}</div>
        </div>
        <div>
          <div className="opacity-70">Последний документ</div>
          <div className="font-medium text-slate-50">{lastDocUploadAt ? fmt(lastDocUploadAt) : "—"}</div>
        </div>
      </div>

      {latestRunFailed && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/15 p-2 text-xs text-red-50">
          Последний запуск AI-анализа завершился с ошибкой
          {latestRunError ? `: ${latestRunError}` : "."} Предыдущий завершённый анализ сохранён.
        </div>
      )}

      {outdated && (
        <div className="text-xs text-amber-50/90">
          Добавлены новые документы. Требуется повторный AI правовой анализ.
        </div>
      )}

      {outdated &&
        (isApproved ? (
          <button
            onClick={onCreateVersionAndRerun}
            disabled={isRunning}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-60"
          >
            {isRunning ? <Loader2 className="animate-spin" size={14} /> : <GitBranch size={14} />}
            Создать новую редакцию и запустить AI-анализ
          </button>
        ) : (
          <button
            onClick={onRerun}
            disabled={isRunning}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60"
          >
            {isRunning ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
            Запустить повторный AI-анализ
          </button>
        ))}
    </div>
  );
}

function AnalysisList({ label, items }: { label: string; items: any }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <div className={PANEL_LABEL}>
        {label} · <span className="text-slate-200">{items.length}</span>
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((it: any, i: number) => {
          const text = humanizeItem(it);
          const why = typeof it === "object" ? it?.reasoning ?? it?.why ?? it?.note : null;
          return (
            <li
              key={i}
              className="rounded-lg border border-slate-700/60 bg-slate-800/80 p-2.5 text-[13px] leading-relaxed text-slate-100"
            >
              {text || "—"}
              {why && (
                <div className="mt-1 text-[12px] text-slate-300">{String(why)}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RiskList({ title, items }: { title: string; items: any[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="rounded-lg border border-slate-700/60 bg-slate-800/80 p-2.5 text-xs text-slate-100"
          >
            {humanizeItem(it) || "—"}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============ Reasoning Tab ============ */

function getFactToEvidenceMapping(analysis: any, meta: any): any[] {
  const candidates = [
    analysis?.fact_to_evidence_mapping,
    analysis?.document_context?.fact_to_evidence_mapping,
    meta?.document_context?.fact_to_evidence_mapping,
    meta?.fact_to_evidence_mapping,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c;
  }
  return [];
}

function findEvidenceForFact(factKey: string, evidenceMap: any[]): any[] {
  if (!evidenceMap.length) return [];
  return evidenceMap.filter((m: any) => {
    const f = m?.fact ?? m?.fact_id ?? m?.fact_key ?? m?.fact_text ?? "";
    return (
      String(f).toLowerCase() === String(factKey).toLowerCase() ||
      String(f).toLowerCase().includes(String(factKey).toLowerCase()) ||
      String(factKey).toLowerCase().includes(String(f).toLowerCase())
    );
  });
}

function ReasoningCard({
  tone = "default",
  title,
  children,
}: {
  tone?: "default" | "fact" | "evidence" | "law" | "why" | "conclusion" | "warn";
  title: string;
  children: React.ReactNode;
}) {
  const toneCls: Record<string, string> = {
    default: "border-slate-700/70 bg-slate-800/85",
    fact: "border-sky-400/40 bg-sky-500/15",
    evidence: "border-emerald-400/40 bg-emerald-500/15",
    law: "border-violet-400/40 bg-violet-500/15",
    why: "border-amber-400/40 bg-amber-500/15",
    conclusion: "border-emerald-400/60 bg-emerald-500/25",
    warn: "border-red-400/60 bg-red-500/20",
  };
  return (
    <div className={`rounded-xl border p-3 ${toneCls[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-200/90">{title}</div>
      <div className="mt-1 text-[14px] leading-relaxed text-slate-50">{children}</div>
    </div>
  );
}

function renderText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function ReasoningTab({ analysis, meta, setTab }: { analysis: any; meta: any; setTab: (t: TabId) => void }) {
  const factToLaw: any[] = Array.isArray(analysis?.fact_to_law_mapping) ? analysis.fact_to_law_mapping : [];
  const factToEvidence: any[] = getFactToEvidenceMapping(analysis, meta);
  const applicableLaws: any[] = Array.isArray(analysis?.applicable_laws) ? analysis.applicable_laws : [];
  const rejectedLaws: any[] = Array.isArray(analysis?.rejected_laws) ? analysis.rejected_laws : [];
  const courtPractice: any[] = Array.isArray(analysis?.court_practice) ? analysis.court_practice : [];
  const rejectedPractice: any[] = Array.isArray(analysis?.rejected_court_practice) ? analysis.rejected_court_practice : [];
  const fnsLetters: any[] = Array.isArray(analysis?.fns_letters) ? analysis.fns_letters : [];
  const minfinLetters: any[] = Array.isArray(analysis?.minfin_letters) ? analysis.minfin_letters : [];
  const sources: any[] = Array.isArray(analysis?.sources) ? analysis.sources : [];
  const missingEvidence: any[] = Array.isArray(analysis?.missing_evidence) ? analysis.missing_evidence : [];
  const weakPoints: any[] = Array.isArray(analysis?.weak_points) ? analysis.weak_points : [];
  const counterArguments: any[] = Array.isArray(analysis?.counter_arguments) ? analysis.counter_arguments : [];
  const generationInstructions: any[] = Array.isArray(analysis?.generation_instructions) ? analysis.generation_instructions : [];

  const findLaw = (key: any) => {
    if (!key) return null;
    const k = String(key).toLowerCase();
    return (
      applicableLaws.find((l: any) =>
        [l?.id, l?.law_id, l?.code, l?.article, l?.title, l?.name]
          .filter(Boolean)
          .some((x: any) => String(x).toLowerCase() === k || String(x).toLowerCase().includes(k)),
      ) ?? null
    );
  };

  const findSource = (ref: any) => {
    if (!ref) return null;
    const k = String(ref).toLowerCase();
    return (
      sources.find((s: any) =>
        [s?.id, s?.source_id, s?.title, s?.name, s?.url]
          .filter(Boolean)
          .some((x: any) => String(x).toLowerCase() === k || String(x).toLowerCase().includes(k)),
      ) ?? null
    );
  };

  const hasAnyMapping = factToLaw.length > 0;

  return (
    <section className={`${PANEL} space-y-5 p-5 text-sm text-slate-100`}>
      <div>
        <h2 className="font-display text-lg text-white">Юридическое обоснование</h2>
        <p className="mt-1 text-xs text-foreground/65">
          Цепочка: факт → доказательство → норма → почему применима → отклонённые альтернативы → судебная практика → вывод.
        </p>
      </div>

      {!hasAnyMapping && (
        <div className="space-y-3 rounded-xl border border-amber-300/40 bg-amber-400/10 p-4 text-sm text-amber-50">
          <div className="font-medium text-amber-50">Юридическое обоснование недоступно.</div>
          <p className="text-xs leading-relaxed text-amber-100/90">
            AI не сформировал цепочку: Факт → Доказательство → Норма → Практика → Вывод.
            Документ не соответствует требованиям качества для утверждения.
          </p>
        </div>
      )}

      {factToEvidence.length === 0 && hasAnyMapping && (
        <div className="rounded-lg border border-amber-300/30 bg-amber-400/5 p-3 text-xs text-amber-50/90">
          Связка факт → доказательство пока не сформирована.
        </div>
      )}

      {factToLaw.map((m: any, i: number) => {
        const factText = renderText(m?.fact ?? m?.fact_text ?? m?.fact_description ?? m?.description);
        const factKey = String(m?.fact_id ?? m?.fact_key ?? m?.fact ?? factText ?? "");
        const lawRef = m?.law ?? m?.law_id ?? m?.article ?? m?.code;
        const lawObj = (typeof lawRef === "object" ? lawRef : findLaw(lawRef)) ?? null;
        const lawLabel =
          (lawObj && (lawObj.title ?? lawObj.name ?? lawObj.article ?? lawObj.code)) ??
          renderText(lawRef) ??
          "—";
        const whyApplicable =
          m?.why_applicable ?? m?.reasoning ?? m?.justification ?? m?.why ?? lawObj?.why_applicable ?? lawObj?.reasoning;
        const conclusion = m?.conclusion ?? m?.outcome ?? m?.result;
        const supportingRefs: any[] =
          (Array.isArray(m?.supporting_sources) && m.supporting_sources) ||
          (Array.isArray(m?.sources) && m.sources) ||
          [];
        const supportingResolved = supportingRefs.map((r: any) => (typeof r === "object" ? r : findSource(r) ?? r));

        const evidenceForFact = findEvidenceForFact(factKey, factToEvidence);
        const evidenceDocs = evidenceForFact.flatMap((e: any) => {
          const docs = e?.documents ?? e?.evidence ?? e?.document ?? e?.evidence_documents;
          if (Array.isArray(docs)) return docs;
          if (docs) return [docs];
          return [];
        });

        const rejectedAlts: any[] = Array.isArray(m?.rejected_alternatives)
          ? m.rejected_alternatives
          : rejectedLaws.filter((rl: any) => {
              const linked = rl?.related_fact ?? rl?.fact ?? rl?.fact_id;
              return linked && String(linked).toLowerCase().includes(String(factKey).toLowerCase());
            });

        const factMissing = missingEvidence.filter((me: any) => {
          const f = me?.fact ?? me?.fact_id ?? me?.related_fact ?? "";
          return f && String(f).toLowerCase().includes(String(factKey).toLowerCase());
        });
        const factWeak = weakPoints.filter((wp: any) => {
          const f = wp?.fact ?? wp?.related_fact ?? "";
          return f && String(f).toLowerCase().includes(String(factKey).toLowerCase());
        });

        const needsReview = evidenceDocs.length === 0 || (!lawObj && !lawRef);
        const trust = computeLocalTrust({
          evidenceCount: evidenceDocs.length,
          hasLaw: Boolean(lawObj || lawRef),
          supportingCount: supportingResolved.length,
          missingCount: factMissing.length,
          weakCount: factWeak.length,
        });

        return (
          <div
            key={i}
            className="space-y-3 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className={PANEL_LABEL}>Цепочка обоснования #{i + 1}</div>
              {needsReview && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/25 px-2 py-0.5 text-[11px] font-semibold text-red-50">
                  <AlertTriangle size={11} /> Требуется проверка юристом
                </span>
              )}
            </div>

            <TrustIndex trust={trust} />

            <ReasoningCard tone="fact" title="Факт">
              {factText || "—"}
            </ReasoningCard>

            <ReasoningCard tone="evidence" title={`Доказательства · ${evidenceDocs.length}`}>
              {evidenceDocs.length === 0 ? (
                <span className="text-foreground/60">Доказательства не привязаны.</span>
              ) : (
                <ul className="space-y-1.5">
                  {evidenceDocs.map((d: any, k: number) => (
                    <li key={k} className="rounded border border-white/10 bg-black/20 p-2 text-xs">
                      <div className="text-foreground/90">
                        {renderText(d?.title ?? d?.file_name ?? d?.name ?? d?.document_id ?? d)}
                      </div>
                      {(d?.relevance || d?.why_relevant) && (
                        <div className="mt-1 text-foreground/65">{renderText(d?.relevance ?? d?.why_relevant)}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ReasoningCard>

            <ReasoningCard tone="law" title="Норма">
              <SourceCitation
                source={
                  lawObj && typeof lawObj === "object"
                    ? { kind: "law", ...lawObj }
                    : { kind: "law", title: lawLabel }
                }
                setTab={setTab}
              />
            </ReasoningCard>

            {whyApplicable && (
              <ReasoningCard tone="why" title="Почему применима">
                <div className="whitespace-pre-wrap">{renderText(whyApplicable)}</div>
              </ReasoningCard>
            )}

            {rejectedAlts.length > 0 && (
              <ReasoningCard tone="default" title={`Отклонённые альтернативы · ${rejectedAlts.length}`}>
                <ul className="space-y-1.5">
                  {rejectedAlts.map((r: any, k: number) => (
                    <li key={k} className="rounded border border-white/10 bg-black/20 p-2 text-xs">
                      <div className="text-foreground/90">
                        {renderText(r?.title ?? r?.name ?? r?.article ?? r?.code ?? r)}
                      </div>
                      {(r?.reason ?? r?.why_rejected) && (
                        <div className="mt-1 text-foreground/65">{renderText(r?.reason ?? r?.why_rejected)}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </ReasoningCard>
            )}

            {supportingResolved.length > 0 && (
              <ReasoningCard tone="default" title={`Источники · ${supportingResolved.length}`}>
                <div className="space-y-2">
                  {supportingResolved.map((s: any, k: number) => (
                    <SourceCitation key={k} source={s} setTab={setTab} />
                  ))}
                </div>
              </ReasoningCard>
            )}

            {(factMissing.length > 0 || factWeak.length > 0) && (
              <ReasoningCard tone="warn" title="Слабые места / нехватка доказательств">
                {factMissing.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase text-foreground/60">Недостающие доказательства</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                      {factMissing.map((me: any, k: number) => (
                        <li key={k}>{renderText(me?.description ?? me?.text ?? me)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {factWeak.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[11px] uppercase text-foreground/60">Слабые места</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                      {factWeak.map((wp: any, k: number) => (
                        <li key={k}>{renderText(wp?.description ?? wp?.text ?? wp)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </ReasoningCard>
            )}

            {conclusion && (
              <ReasoningCard tone="conclusion" title="Вывод">
                <div className="whitespace-pre-wrap">{renderText(conclusion)}</div>
              </ReasoningCard>
            )}
          </div>
        );
      })}

      {/* Global blocks */}
      <div className="grid gap-3 md:grid-cols-2">
        {courtPractice.length > 0 && (
          <ReasoningCard tone="default" title={`Судебная практика · ${courtPractice.length}`}>
            <div className="space-y-2">
              {courtPractice.map((c: any, k: number) => (
                <SourceCitation key={k} source={{ kind: "court", ...c }} setTab={setTab} />
              ))}
            </div>
          </ReasoningCard>
        )}
        {rejectedPractice.length > 0 && (
          <ReasoningCard tone="default" title={`Отклонённая практика · ${rejectedPractice.length}`}>
            <div className="space-y-2">
              {rejectedPractice.map((c: any, k: number) => (
                <SourceCitation key={k} source={{ kind: "court", ...c }} setTab={setTab} />
              ))}
            </div>
          </ReasoningCard>
        )}
        {fnsLetters.length > 0 && (
          <ReasoningCard tone="default" title={`Письма ФНС · ${fnsLetters.length}`}>
            <div className="space-y-2">
              {fnsLetters.map((c: any, k: number) => (
                <SourceCitation key={k} source={{ kind: "fns", ...c }} setTab={setTab} />
              ))}
            </div>
          </ReasoningCard>
        )}
        {minfinLetters.length > 0 && (
          <ReasoningCard tone="default" title={`Письма Минфина · ${minfinLetters.length}`}>
            <div className="space-y-2">
              {minfinLetters.map((c: any, k: number) => (
                <SourceCitation key={k} source={{ kind: "minfin", ...c }} setTab={setTab} />
              ))}
            </div>
          </ReasoningCard>
        )}

        {counterArguments.length > 0 && (
          <ReasoningCard tone="default" title={`Контраргументы · ${counterArguments.length}`}>
            <ul className="space-y-1 text-xs">
              {counterArguments.map((c: any, k: number) => (
                <li key={k}>{renderText(c?.text ?? c?.description ?? c)}</li>
              ))}
            </ul>
          </ReasoningCard>
        )}
        {generationInstructions.length > 0 && (
          <ReasoningCard tone="default" title={`Указания по подготовке документа · ${generationInstructions.length}`}>
            <ul className="space-y-1 text-xs">
              {generationInstructions.map((c: any, k: number) => (
                <li key={k}>{renderText(c?.text ?? c?.description ?? c)}</li>
              ))}
            </ul>
          </ReasoningCard>
        )}
      </div>

      <DocumentsAuditBlock analysis={analysis} />
    </section>
  );
}

function DocumentsAuditBlock({ analysis }: { analysis: any }) {
  const audit = analysis?.documents_audit ?? {};
  const used: any[] = Array.isArray(audit?.used) ? audit.used : [];
  const rejected: any[] = Array.isArray(audit?.rejected) ? audit.rejected : [];
  if (used.length === 0 && rejected.length === 0) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ReasoningCard tone="evidence" title={`Документы клиента · использовано · ${used.length}`}>
        {used.length === 0 ? (
          <span className="text-foreground/60">AI не использовал ни один загруженный документ.</span>
        ) : (
          <ul className="space-y-1.5">
            {used.map((d: any, k: number) => {
              const purposes: any[] = Array.isArray(d?.used_for) ? d.used_for : d?.used_for ? [d.used_for] : [];
              return (
                <li key={k} className="rounded border border-white/10 bg-black/20 p-2 text-xs">
                  <div className="font-medium text-foreground/90">
                    {renderText(d?.title ?? d?.file_name ?? d?.name ?? d?.id) || "Документ"}
                  </div>
                  {purposes.length > 0 && (
                    <div className="mt-1 text-foreground/65">
                      Использован для: {purposes.map((p) => renderText(p)).join(", ")}
                    </div>
                  )}
                  {d?.ocr_length != null && (
                    <div className="mt-0.5 text-[11px] text-foreground/50">
                      Длина распознанного текста: {String(d.ocr_length)} симв.
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ReasoningCard>
      <ReasoningCard tone="warn" title={`Документы клиента · отклонено · ${rejected.length}`}>
        {rejected.length === 0 ? (
          <span className="text-foreground/60">Отклонённых документов нет.</span>
        ) : (
          <ul className="space-y-1.5">
            {rejected.map((d: any, k: number) => (
              <li key={k} className="rounded border border-white/10 bg-black/20 p-2 text-xs">
                <div className="font-medium text-foreground/90">
                  {renderText(d?.title ?? d?.file_name ?? d?.name ?? d?.id) || "Документ"}
                </div>
                {d?.reason && (
                  <div className="mt-1 text-foreground/65">
                    Причина: {d.reason === "no_ocr" ? "не распознан текст (OCR пуст)" : renderText(d.reason)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </ReasoningCard>
    </div>
  );
}

/* ================================================================
   ARGUMENT-CENTRIC WORKSPACE — Argument model, sync, components
   ================================================================ */

type ArgRecord = {
  index: number;
  title: string;
  factText: string;
  factKey: string;
  lawObj: any;
  lawLabel: string;
  whyApplicable: string;
  conclusion: string;
  evidenceDocs: any[];
  supportingResolved: any[];
  rejectedAlts: any[];
  factMissing: any[];
  factWeak: any[];
  courtPractice: any[];
  fnsLetters: any[];
  minfinLetters: any[];
  counterArguments: any[];
  location: LocationRef | null;
  allLocations: LocationRef[];
  trust: ReturnType<typeof computeLocalTrust>;
  needsReview: boolean;
  raw: any;
};

function buildArguments(analysis: any, meta: any): ArgRecord[] {
  const factToLaw: any[] = Array.isArray(analysis?.fact_to_law_mapping) ? analysis.fact_to_law_mapping : [];
  const factToEvidence = getFactToEvidenceMapping(analysis, meta);
  const applicableLaws: any[] = Array.isArray(analysis?.applicable_laws) ? analysis.applicable_laws : [];
  const rejectedLaws: any[] = Array.isArray(analysis?.rejected_laws) ? analysis.rejected_laws : [];
  const sources: any[] = Array.isArray(analysis?.sources) ? analysis.sources : [];
  const missingEvidence: any[] = Array.isArray(analysis?.missing_evidence) ? analysis.missing_evidence : [];
  const weakPoints: any[] = Array.isArray(analysis?.weak_points) ? analysis.weak_points : [];
  const courtPractice: any[] = Array.isArray(analysis?.court_practice) ? analysis.court_practice : [];
  const fnsLetters: any[] = Array.isArray(analysis?.fns_letters) ? analysis.fns_letters : [];
  const minfinLetters: any[] = Array.isArray(analysis?.minfin_letters) ? analysis.minfin_letters : [];
  const counterArgs: any[] = Array.isArray(analysis?.counter_arguments) ? analysis.counter_arguments : [];

  const findLaw = (key: any) => {
    if (!key) return null;
    const k = String(key).toLowerCase();
    return (
      applicableLaws.find((l: any) =>
        [l?.id, l?.law_id, l?.code, l?.article, l?.title, l?.name]
          .filter(Boolean)
          .some((x: any) => String(x).toLowerCase() === k || String(x).toLowerCase().includes(k)),
      ) ?? null
    );
  };
  const findSource = (ref: any) => {
    if (!ref) return null;
    const k = String(ref).toLowerCase();
    return (
      sources.find((s: any) =>
        [s?.id, s?.source_id, s?.title, s?.name, s?.url]
          .filter(Boolean)
          .some((x: any) => String(x).toLowerCase() === k || String(x).toLowerCase().includes(k)),
      ) ?? null
    );
  };

  const matchByFact = <T,>(arr: T[], factKey: string): T[] =>
    arr.filter((it: any) => {
      const f = it?.fact ?? it?.fact_id ?? it?.related_fact ?? it?.fact_key ?? "";
      return f && String(f).toLowerCase().includes(String(factKey).toLowerCase());
    });

  return factToLaw.map((m: any, i: number) => {
    const factText = String(m?.fact ?? m?.fact_text ?? m?.fact_description ?? m?.description ?? "");
    const factKey = String(m?.fact_id ?? m?.fact_key ?? m?.fact ?? factText ?? i);
    const lawRef = m?.law ?? m?.law_id ?? m?.article ?? m?.code;
    const lawObj = (typeof lawRef === "object" ? lawRef : findLaw(lawRef)) ?? null;
    const lawLabel =
      (lawObj && (lawObj.title ?? lawObj.name ?? lawObj.article ?? lawObj.code)) ?? String(lawRef ?? "—");
    const whyApplicable = String(
      m?.why_applicable ?? m?.reasoning ?? m?.justification ?? m?.why ?? lawObj?.why_applicable ?? lawObj?.reasoning ?? "",
    );
    const conclusion = String(m?.conclusion ?? m?.outcome ?? m?.result ?? "");

    const supportingRefs: any[] =
      (Array.isArray(m?.supporting_sources) && m.supporting_sources) ||
      (Array.isArray(m?.sources) && m.sources) ||
      [];
    const supportingResolved = supportingRefs.map((r: any) => (typeof r === "object" ? r : findSource(r) ?? r));

    const evidenceForFact = findEvidenceForFact(factKey, factToEvidence);
    const evidenceDocs = evidenceForFact.flatMap((e: any) => {
      const docs = e?.documents ?? e?.evidence ?? e?.document ?? e?.evidence_documents;
      if (Array.isArray(docs)) return docs;
      if (docs) return [docs];
      return [];
    });

    const rejectedAlts: any[] = Array.isArray(m?.rejected_alternatives)
      ? m.rejected_alternatives
      : rejectedLaws.filter((rl: any) => {
          const linked = rl?.related_fact ?? rl?.fact ?? rl?.fact_id;
          return linked && String(linked).toLowerCase().includes(String(factKey).toLowerCase());
        });

    const factMissing = matchByFact(missingEvidence, factKey);
    const factWeak = matchByFact(weakPoints, factKey);
    const linkedCourt = matchByFact(courtPractice, factKey);
    const linkedFns = matchByFact(fnsLetters, factKey);
    const linkedMinfin = matchByFact(minfinLetters, factKey);
    const linkedCounter = matchByFact(counterArgs, factKey);

    // Pick locations
    const primaryLoc = pickLocation(m) ?? pickLocation(m?.used_in) ?? null;
    const allLocs: LocationRef[] = [];
    if (primaryLoc) allLocs.push(primaryLoc);
    const more = Array.isArray(m?.used_in_all) ? m.used_in_all : Array.isArray(m?.locations) ? m.locations : [];
    for (const l of more) {
      const loc = pickLocation(l);
      if (loc) allLocs.push(loc);
    }
    // Synthesize a quote-based location from factText if nothing
    if (allLocs.length === 0 && factText) {
      allLocs.push({ quote: factText.slice(0, 80) });
    }

    const needsReview = evidenceDocs.length === 0 || (!lawObj && !lawRef);
    const trust = computeLocalTrust({
      evidenceCount: evidenceDocs.length,
      hasLaw: Boolean(lawObj || lawRef),
      supportingCount: supportingResolved.length,
      missingCount: factMissing.length,
      weakCount: factWeak.length,
    });

    const title = (factText || lawLabel || `Аргумент №${i + 1}`).slice(0, 120);

    return {
      index: i,
      title,
      factText,
      factKey,
      lawObj,
      lawLabel,
      whyApplicable,
      conclusion,
      evidenceDocs,
      supportingResolved,
      rejectedAlts,
      factMissing,
      factWeak,
      courtPractice: linkedCourt,
      fnsLetters: linkedFns,
      minfinLetters: linkedMinfin,
      counterArguments: linkedCounter,
      location: allLocs[0] ?? null,
      allLocations: allLocs,
      trust,
      needsReview,
      raw: m,
    };
  });
}

function matchReviewForArg(arg: ArgRecord, items: any[]): any[] {
  if (!arg || !items || items.length === 0) return [];
  const needles = [arg.factText, arg.lawLabel, arg.factKey]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase().slice(0, 30));
  return items.filter((it: any) => {
    if (it?.argument_id != null && Number(it.argument_id) === arg.index) return true;
    if (it?.fact_id != null && String(it.fact_id).toLowerCase() === arg.factKey.toLowerCase()) return true;
    const hay = JSON.stringify(it ?? "").toLowerCase();
    return needles.some((n) => n && hay.includes(n));
  });
}

function highlightArgumentInDoc(arg: ArgRecord | null) {
  if (typeof document === "undefined") return;
  const root = document.getElementById("generated-doc-content");
  if (!root) return;
  // Clear previous persistent highlights
  root.querySelectorAll(".doc-arg-active").forEach((n) => n.classList.remove("doc-arg-active"));
  if (!arg) return;

  const targets: HTMLElement[] = [];
  const nodes = Array.from(root.querySelectorAll("p, li, h1, h2, h3, h4, blockquote")) as HTMLElement[];

  for (const loc of arg.allLocations) {
    if (loc.anchor) {
      const el = document.getElementById(loc.anchor);
      if (el) targets.push(el);
    }
    if (loc.quote) {
      const needle = String(loc.quote).trim().slice(0, 40).toLowerCase();
      if (needle) {
        for (const n of nodes) {
          if (n.innerText.toLowerCase().includes(needle) && !targets.includes(n)) targets.push(n);
        }
      }
    }
  }
  // Also try fact text directly (substring match)
  if (targets.length === 0 && arg.factText) {
    const needle = arg.factText.toLowerCase().slice(0, 30);
    if (needle.length >= 6) {
      for (const n of nodes) {
        if (n.innerText.toLowerCase().includes(needle) && !targets.includes(n)) targets.push(n);
      }
    }
  }

  targets.forEach((t, i) => {
    t.classList.add("doc-arg-active");
    if (i === 0) t.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

/* ============ Argument Navigator (left rail) ============ */

const FILTER_BUTTONS: { id: any; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "high", label: "Высокий риск" },
  { id: "medium", label: "Средний" },
  { id: "low", label: "Низкий" },
  { id: "no_evidence", label: "Нет доказательств" },
  { id: "ai_issues", label: "Замечания AI" },
  { id: "needs_review", label: "Требует проверки" },
];

function trustDot(level: "high" | "medium" | "low") {
  return level === "high"
    ? "bg-emerald-400"
    : level === "medium"
      ? "bg-amber-400"
      : "bg-red-400";
}

function ArgumentNavigator({
  args,
  filtered,
  selectedIndex,
  onSelect,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  reviewProblems,
}: {
  args: ArgRecord[];
  filtered: ArgRecord[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  filter: string;
  onFilterChange: (f: any) => void;
  search: string;
  onSearchChange: (v: string) => void;
  reviewProblems: any[];
}) {
  return (
    <div className={`${PANEL} flex h-full flex-col p-3`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Target size={14} /> Аргументы
        </h3>
        <span className="rounded-full bg-slate-700/80 px-2 py-0.5 text-[10px] font-semibold text-slate-100">
          {filtered.length}/{args.length}
        </span>
      </div>

      <div className="relative mt-2">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Поиск по аргументам / нормам…"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 py-1.5 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {FILTER_BUTTONS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
              filter === f.id
                ? "border-emerald-300/60 bg-emerald-500/30 text-white"
                : "border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {args.length === 0 && (
          <div className="rounded-lg border border-slate-700/60 bg-slate-800/60 p-3 text-xs text-slate-300">
            Юридические аргументы пока не сформированы. Запустите правовой анализ или проверьте, что AI вернул цепочку фактов и норм.
          </div>
        )}
        {filtered.length === 0 && args.length > 0 && (
          <div className="rounded-lg border border-slate-700/60 bg-slate-800/60 p-3 text-xs text-slate-300">
            Ничего не найдено по фильтру.
          </div>
        )}
        {filtered.map((a) => {
          const issues = matchReviewForArg(a, reviewProblems);
          const active = a.index === selectedIndex;
          return (
            <button
              key={a.index}
              type="button"
              onClick={() => onSelect(a.index)}
              className={`group block w-full rounded-xl border p-2.5 text-left transition ${
                active
                  ? "border-emerald-400/70 bg-emerald-500/15 shadow-lg shadow-emerald-500/10"
                  : "border-slate-700/70 bg-slate-800/70 hover:border-slate-500 hover:bg-slate-700/80"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${trustDot(a.trust.level)}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                    Аргумент №{a.index + 1}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-100">{a.trust.score}%</span>
              </div>
              <div className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-snug text-slate-50">
                {a.title || "—"}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-300">
                <span className="rounded bg-slate-900/70 px-1.5 py-0.5">
                  <FileSearch size={9} className="-mt-0.5 mr-0.5 inline" /> {a.evidenceDocs.length}
                </span>
                {a.lawObj || a.lawLabel !== "—" ? (
                  <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-violet-100">
                    <Landmark size={9} className="-mt-0.5 mr-0.5 inline" /> норма
                  </span>
                ) : (
                  <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-100">нет нормы</span>
                )}
                {issues.length > 0 && (
                  <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-amber-100">
                    <AlertCircle size={9} className="-mt-0.5 mr-0.5 inline" /> AI {issues.length}
                  </span>
                )}
                {a.needsReview && (
                  <span className="rounded bg-red-500/25 px-1.5 py-0.5 text-red-100">проверка</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============ Argument Tree (right column) ============ */

function TreeNode({
  id,
  title,
  count,
  icon: Icon,
  tone = "default",
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  icon: any;
  tone?: "default" | "fact" | "evidence" | "law" | "why" | "conclusion" | "warn" | "practice";
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const toneCls: Record<string, string> = {
    default: "border-slate-700/70 bg-slate-800/80",
    fact: "border-sky-400/40 bg-sky-500/10",
    evidence: "border-emerald-400/40 bg-emerald-500/10",
    law: "border-violet-400/40 bg-violet-500/10",
    why: "border-amber-400/40 bg-amber-500/10",
    practice: "border-indigo-400/40 bg-indigo-500/10",
    conclusion: "border-emerald-400/60 bg-emerald-500/20",
    warn: "border-red-400/50 bg-red-500/15",
  };
  return (
    <div className={`rounded-xl border ${toneCls[tone]}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-slate-100">
          <Icon size={12} /> {title}
          {typeof count === "number" && (
            <span className="rounded-full bg-slate-900/60 px-1.5 py-0.5 text-[10px] text-slate-200">{count}</span>
          )}
        </span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {expanded && <div className="border-t border-white/10 px-3 py-2 text-[13px] text-slate-50">{children}</div>}
    </div>
  );
}

function ArgumentTree({
  arg,
  reviewProblems,
  expanded,
  onToggle,
  onJumpDoc,
  setTab,
}: {
  arg: ArgRecord | null;
  reviewProblems: any[];
  expanded: Record<string, boolean>;
  onToggle: (k: string) => void;
  onJumpDoc: () => void;
  setTab: (t: TabId) => void;
}) {
  if (!arg) {
    return (
      <div className={`${PANEL} p-4 text-sm text-slate-300`}>
        Выберите аргумент слева, чтобы увидеть полную цепочку обоснования.
      </div>
    );
  }
  const reviewItems = matchReviewForArg(arg, reviewProblems);
  return (
    <div className={`${PANEL} space-y-3 p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={PANEL_LABEL}>Аргумент №{arg.index + 1}</div>
          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-white">{arg.title}</h3>
        </div>
        <button
          type="button"
          onClick={onJumpDoc}
          className="shrink-0 rounded-lg border border-sky-400/40 bg-sky-500/20 px-2 py-1 text-[11px] font-semibold text-sky-50 hover:bg-sky-500/30"
          title="Подсветить в документе"
        >
          <Link2 size={11} className="-mt-0.5 mr-1 inline" /> В документ
        </button>
      </div>

      <TrustIndex trust={arg.trust} />

      {arg.needsReview && (
        <div className="flex items-start gap-2 rounded-lg border border-red-400/40 bg-red-500/15 p-2 text-[12px] text-red-50">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>Требуется проверка юриста: не хватает доказательств или нормы.</span>
        </div>
      )}

      <TreeNode id="fact" title="Факт" icon={Target} tone="fact" expanded={expanded.fact} onToggle={() => onToggle("fact")}>
        <div className="whitespace-pre-wrap">{arg.factText || "—"}</div>
      </TreeNode>

      <TreeNode
        id="evidence"
        title="Доказательства"
        count={arg.evidenceDocs.length}
        icon={FileSearch}
        tone="evidence"
        expanded={expanded.evidence}
        onToggle={() => onToggle("evidence")}
      >
        {arg.evidenceDocs.length === 0 ? (
          <span className="text-slate-300">Доказательства не привязаны.</span>
        ) : (
          <div className="space-y-2">
            {arg.evidenceDocs.map((d: any, k: number) => (
              <SourceCitation key={k} source={{ kind: "client_doc", ...d }} setTab={setTab} />
            ))}
          </div>
        )}
      </TreeNode>

      <TreeNode id="law" title="Норма" icon={Landmark} tone="law" expanded={expanded.law} onToggle={() => onToggle("law")}>
        <SourceCitation
          source={
            arg.lawObj && typeof arg.lawObj === "object"
              ? { kind: "law", ...arg.lawObj }
              : { kind: "law", title: arg.lawLabel }
          }
          setTab={setTab}
        />
      </TreeNode>

      {arg.whyApplicable && (
        <TreeNode id="why" title="Почему применима" icon={Sparkles} tone="why" expanded={expanded.why} onToggle={() => onToggle("why")}>
          <div className="whitespace-pre-wrap">{arg.whyApplicable}</div>
        </TreeNode>
      )}

      {arg.rejectedAlts.length > 0 && (
        <TreeNode
          id="rejected"
          title="Почему НЕ применима другая"
          count={arg.rejectedAlts.length}
          icon={AlertCircle}
          expanded={expanded.rejected}
          onToggle={() => onToggle("rejected")}
        >
          <ul className="space-y-1.5">
            {arg.rejectedAlts.map((r: any, k: number) => (
              <li key={k} className="rounded border border-white/10 bg-black/20 p-2 text-xs">
                <div className="text-slate-100">
                  {renderText(r?.title ?? r?.name ?? r?.article ?? r?.code ?? r)}
                </div>
                {(r?.reason ?? r?.why_rejected) && (
                  <div className="mt-1 text-slate-300">{renderText(r?.reason ?? r?.why_rejected)}</div>
                )}
              </li>
            ))}
          </ul>
        </TreeNode>
      )}

      {(arg.courtPractice.length > 0) && (
        <TreeNode
          id="practice"
          title="Судебная практика"
          count={arg.courtPractice.length}
          icon={Gavel}
          tone="practice"
          expanded={expanded.practice}
          onToggle={() => onToggle("practice")}
        >
          <div className="space-y-2">
            {arg.courtPractice.map((c: any, k: number) => (
              <SourceCitation key={k} source={{ kind: "court", ...c }} setTab={setTab} />
            ))}
          </div>
        </TreeNode>
      )}

      {(arg.fnsLetters.length > 0 || arg.minfinLetters.length > 0) && (
        <TreeNode
          id="letters"
          title="Письма ФНС / Минфина"
          count={arg.fnsLetters.length + arg.minfinLetters.length}
          icon={FileText}
          expanded={expanded.letters}
          onToggle={() => onToggle("letters")}
        >
          <div className="space-y-2">
            {arg.fnsLetters.map((c: any, k: number) => (
              <SourceCitation key={`f-${k}`} source={{ kind: "fns", ...c }} setTab={setTab} />
            ))}
            {arg.minfinLetters.map((c: any, k: number) => (
              <SourceCitation key={`m-${k}`} source={{ kind: "minfin", ...c }} setTab={setTab} />
            ))}
          </div>
        </TreeNode>
      )}

      {arg.counterArguments.length > 0 && (
        <TreeNode
          id="counter"
          title="Контраргументы"
          count={arg.counterArguments.length}
          icon={AlertCircle}
          expanded={expanded.counter}
          onToggle={() => onToggle("counter")}
        >
          <ul className="space-y-1 text-xs">
            {arg.counterArguments.map((c: any, k: number) => (
              <li key={k} className="rounded border border-white/10 bg-black/20 p-2">
                {renderText(c?.text ?? c?.description ?? c)}
              </li>
            ))}
          </ul>
        </TreeNode>
      )}

      <TreeNode
        id="review"
        title="AI Review"
        count={reviewItems.length}
        icon={ClipboardCheck}
        tone={reviewItems.length > 0 ? "warn" : "default"}
        expanded={expanded.review}
        onToggle={() => onToggle("review")}
      >
        {reviewItems.length === 0 ? (
          <span className="text-slate-300">Замечаний по этому аргументу нет.</span>
        ) : (
          <div className="space-y-2">
            {reviewItems.map((it: any, i: number) => (
              <ReviewProblemCard key={i} index={i + 1} item={it} setTab={setTab} />
            ))}
          </div>
        )}
      </TreeNode>

      {(arg.factMissing.length > 0 || arg.factWeak.length > 0) && (
        <TreeNode
          id="weak"
          title="Слабые места"
          count={arg.factMissing.length + arg.factWeak.length}
          icon={AlertTriangle}
          tone="warn"
          expanded={true}
          onToggle={() => onToggle("weak")}
        >
          {arg.factMissing.length > 0 && (
            <div>
              <div className="text-[10px] uppercase text-slate-300">Недостающие доказательства</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {arg.factMissing.map((me: any, k: number) => (
                  <li key={k}>{renderText(me?.description ?? me?.text ?? me)}</li>
                ))}
              </ul>
            </div>
          )}
          {arg.factWeak.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase text-slate-300">Слабые места</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {arg.factWeak.map((wp: any, k: number) => (
                  <li key={k}>{renderText(wp?.description ?? wp?.text ?? wp)}</li>
                ))}
              </ul>
            </div>
          )}
        </TreeNode>
      )}

      {arg.conclusion && (
        <TreeNode
          id="conclusion"
          title="Вывод"
          icon={CheckCircle2}
          tone="conclusion"
          expanded={expanded.conclusion}
          onToggle={() => onToggle("conclusion")}
        >
          <div className="whitespace-pre-wrap font-medium">{arg.conclusion}</div>
        </TreeNode>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AI Chain of Custody — История AI
// ────────────────────────────────────────────────────────────────────────────

type AiRunRow = {
  id: string;
  session_id: string | null;
  generated_document_id: string | null;
  run_type: string | null;
  status: string | null;
  model_name: string | null;
  hallucination_risk: string | null;
  legal_accuracy_score: number | null;
  needs_lawyer_review: boolean | null;
  review_status: string | null;
  input_snapshot: any;
  ai_result: any;
  review_result: any;
  problems: any;
  required_fixes: any;
  recommendations: any;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type ChainDoc = {
  id: string;
  title: string | null;
  version_number: number;
  parent_document_id: string | null;
  status: string;
  ai_review_status: string | null;
  lawyer_approved_at: string | null;
  lawyer_approved_by: string | null;
  created_at: string;
  created_by: string | null;
  metadata: Record<string, any> | null;
};

type TimelineItem =
  | { kind: "version"; at: string; doc: ChainDoc }
  | { kind: "approval"; at: string; doc: ChainDoc }
  | { kind: "run"; at: string; run: AiRunRow };

const RUN_TYPE_LABEL: Record<string, string> = {
  legal_analysis: "AI правовой анализ",
  review: "AI Review",
  document_review: "AI Review",
  generated_document_review: "AI Review",
  fact_extraction: "Извлечение фактов",
  facts: "Извлечение фактов",
};
function runTypeLabel(t: string | null) {
  if (!t) return "AI запуск";
  return RUN_TYPE_LABEL[t] ?? t;
}
function statusLabel(s: string | null) {
  switch ((s ?? "").toLowerCase()) {
    case "completed":
    case "success":
      return "Завершён";
    case "failed":
    case "error":
      return "Ошибка";
    case "running":
      return "Выполняется";
    case "pending":
      return "В очереди";
    case "parse_failed":
      return "Ошибка разбора ответа";
    default:
      return s ?? "—";
  }
}
function statusTone(s: string | null) {
  const v = (s ?? "").toLowerCase();
  if (v === "completed" || v === "success")
    return "border-emerald-400/40 bg-emerald-500/20 text-emerald-100";
  if (v === "running" || v === "pending")
    return "border-sky-400/40 bg-sky-500/20 text-sky-100";
  if (v === "failed" || v === "error" || v === "parse_failed")
    return "border-red-400/40 bg-red-500/20 text-red-100";
  return "border-slate-500/40 bg-slate-700/40 text-slate-100";
}
function riskTone(r: string | null) {
  const v = (r ?? "").toLowerCase();
  if (v === "low") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  if (v === "medium") return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  if (v === "high" || v === "critical")
    return "border-red-400/40 bg-red-500/20 text-red-100";
  return "border-slate-500/40 bg-slate-700/40 text-slate-100";
}
function fmtDuration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!isFinite(a) || !isFinite(b) || b < a) return null;
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `${sec} c`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} мин ${s} c`;
}
function shortId(id: string | null | undefined) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Скопировано");
  } catch {
    toast.error("Не удалось скопировать");
  }
}

function IdChip({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-200">
      <span className="text-slate-400">{label}:</span>
      <span className="font-mono">{shortId(value)}</span>
      <button
        type="button"
        onClick={() => copyToClipboard(value)}
        className="text-slate-400 hover:text-white"
        title="Скопировать"
      >
        <Copy size={10} />
      </button>
    </span>
  );
}

function isLegalAnalysis(r: AiRunRow) {
  return (r.run_type ?? "").toLowerCase() === "legal_analysis";
}
function isReview(r: AiRunRow) {
  const t = (r.run_type ?? "").toLowerCase();
  return t === "review" || t === "document_review" || t === "generated_document_review";
}

function ChainOfCustodyTab({
  sessionId,
  currentDocumentId,
  currentMeta,
}: {
  sessionId: string | null;
  currentDocumentId: string;
  currentMeta: Record<string, any> | null;
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [cmpA, setCmpA] = useState<string | null>(null);
  const [cmpB, setCmpB] = useState<string | null>(null);

  // All AI runs for this session
  const { data: sessionRuns, isLoading: runsLoading } = useQuery({
    queryKey: ["chain-session-runs", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_ai_runs")
        .select(
          "id,session_id,generated_document_id,run_type,status,model_name,hallucination_risk,legal_accuracy_score,needs_lawyer_review,review_status,input_snapshot,ai_result,review_result,problems,required_fixes,recommendations,error_message,created_at,completed_at",
        )
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: true });
      if (error) return [] as AiRunRow[];
      return (data ?? []) as AiRunRow[];
    },
  });

  // Runs that may be attached to documents in the version chain (no session)
  const { data: chainDocs, isLoading: chainLoading } = useQuery({
    queryKey: ["chain-version-docs", currentDocumentId],
    queryFn: async () => {
      // BFS: walk up to root, then collect descendants
      const visited = new Set<string>();
      const result: ChainDoc[] = [];
      let cursor: string | null = currentDocumentId;
      // Up
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        const res: any = await supabase
          .from("generated_legal_documents")
          .select(
            "id,title,version_number,parent_document_id,status,ai_review_status,lawyer_approved_at,lawyer_approved_by,created_at,created_by,metadata",
          )
          .eq("id", cursor)
          .maybeSingle();
        const data = res?.data;
        if (!data) break;
        result.push(data as unknown as ChainDoc);
        cursor = (data as any).parent_document_id ?? null;
      }
      // Down (descendants of root)
      const root = result[result.length - 1];
      if (root) {
        const queue: string[] = [root.id];
        const seen = new Set<string>([root.id]);
        while (queue.length > 0) {
          const id = queue.shift()!;
          const { data } = await supabase
            .from("generated_legal_documents")
            .select(
              "id,title,version_number,parent_document_id,status,ai_review_status,lawyer_approved_at,lawyer_approved_by,created_at,created_by,metadata",
            )
            .eq("parent_document_id", id);
          for (const d of (data ?? []) as unknown as ChainDoc[]) {
            if (seen.has(d.id)) continue;
            seen.add(d.id);
            result.push(d);
            queue.push(d.id);
          }
        }
      }
      // Deduplicate
      const dedup = new Map<string, ChainDoc>();
      for (const d of result) dedup.set(d.id, d);
      return Array.from(dedup.values());
    },
  });

  const runs = useMemo(() => sessionRuns ?? [], [sessionRuns]);
  const docs = useMemo(
    () => (chainDocs ?? []).slice().sort((a, b) => a.version_number - b.version_number),
    [chainDocs],
  );

  // Timeline: merge versions + approvals + runs
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    for (const d of docs) {
      items.push({ kind: "version", at: d.created_at, doc: d });
      if (d.lawyer_approved_at)
        items.push({ kind: "approval", at: d.lawyer_approved_at, doc: d });
    }
    for (const r of runs) items.push({ kind: "run", at: r.created_at, run: r });
    items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return items;
  }, [docs, runs]);

  // Initial selection: legal_analysis_run_id from current doc metadata,
  // otherwise most recent legal_analysis run.
  useEffect(() => {
    if (selectedRunId) return;
    const fromMeta: string | null =
      currentMeta?.legal_analysis_run_id ??
      currentMeta?.legal_analysis?.run_id ??
      null;
    if (fromMeta && runs.some((r) => r.id === fromMeta)) {
      setSelectedRunId(fromMeta);
      return;
    }
    const completed = runs
      .filter(isLegalAnalysis)
      .filter((r) => (r.status ?? "").toLowerCase() === "completed");
    const last = completed[completed.length - 1] ?? runs[runs.length - 1];
    if (last) setSelectedRunId(last.id);
  }, [runs, currentMeta, selectedRunId]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  // For each version, find its analysis & review run (via metadata or generated_document_id)
  function findRunsForDoc(d: ChainDoc) {
    const meta = (d.metadata ?? {}) as any;
    const analysisId: string | null =
      meta?.legal_analysis_run_id ?? meta?.legal_analysis?.run_id ?? null;
    const analysis =
      (analysisId && runs.find((r) => r.id === analysisId)) ||
      runs.find((r) => isLegalAnalysis(r) && r.generated_document_id === d.id) ||
      null;
    const review =
      runs.find((r) => isReview(r) && r.generated_document_id === d.id) || null;
    return { analysis, review };
  }

  function toggleCompare(id: string) {
    if (cmpA === id) {
      setCmpA(cmpB);
      setCmpB(null);
      return;
    }
    if (cmpB === id) {
      setCmpB(null);
      return;
    }
    if (!cmpA) setCmpA(id);
    else if (!cmpB) setCmpB(id);
    else {
      setCmpA(id);
      setCmpB(null);
    }
  }

  const completedAnalyses = useMemo(
    () =>
      runs.filter(
        (r) => isLegalAnalysis(r) && (r.status ?? "").toLowerCase() === "completed",
      ),
    [runs],
  );

  if (!sessionId) {
    return (
      <section className={`${PANEL} p-5 text-sm text-slate-200`}>
        <h2 className="font-display text-lg text-white">История AI</h2>
        <p className="mt-2 text-slate-300">
          Документ не привязан к сессии. История AI-запусков недоступна.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <section className={`${PANEL} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-white">История AI</h2>
            <p className="mt-1 text-xs text-slate-300">
              Полная цепочка происхождения документа: версии, AI-анализы и AI-проверки.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCompareMode((v) => !v);
                setCmpA(null);
                setCmpB(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                compareMode
                  ? "border-emerald-300/60 bg-emerald-500/30 text-white"
                  : "border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
              }`}
              disabled={completedAnalyses.length < 2}
              title={
                completedAnalyses.length < 2
                  ? "Нужны минимум 2 завершённых правовых анализа"
                  : "Сравнить два анализа"
              }
            >
              <Columns size={12} /> Сравнить
            </button>
          </div>
        </div>
        {(runsLoading || chainLoading) && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
            <Loader2 size={12} className="animate-spin" /> Загружаем историю…
          </div>
        )}
      </section>

      {/* Compare picker */}
      {compareMode && (
        <section className={`${PANEL} p-4`}>
          <div className="text-[11px] text-slate-300">
            Выберите два завершённых правовых анализа для сравнения.
          </div>
          <div className="mt-2 space-y-2">
            {completedAnalyses.map((r) => {
              const checked = cmpA === r.id || cmpB === r.id;
              const which = cmpA === r.id ? "A" : cmpB === r.id ? "B" : null;
              return (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => toggleCompare(r.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                    checked
                      ? "border-emerald-400/60 bg-emerald-500/15 text-white"
                      : "border-slate-700 bg-slate-800/70 text-slate-100 hover:bg-slate-700/70"
                  }`}
                >
                  <span>
                    {fmt(r.created_at)} · {r.model_name ?? "модель не указана"}
                  </span>
                  {which && (
                    <span className="rounded-md border border-emerald-300/50 bg-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {which}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {cmpA && cmpB && (
            <AnalysisDiffView
              a={runs.find((r) => r.id === cmpA) ?? null}
              b={runs.find((r) => r.id === cmpB) ?? null}
            />
          )}
        </section>
      )}

      {/* Timeline + snapshot */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Timeline */}
        <section className={`${PANEL} p-4`}>
          <div className={PANEL_LABEL}>Хронология</div>
          {timeline.length === 0 && (
            <p className="mt-2 text-sm text-slate-300">События не найдены.</p>
          )}
          <ol className="mt-3 space-y-3">
            {timeline.map((item, i) => (
              <TimelineNode
                key={i}
                item={item}
                selectedRunId={selectedRunId}
                onSelectRun={(id) => setSelectedRunId(id)}
                compareMode={compareMode}
                cmpA={cmpA}
                cmpB={cmpB}
                onToggleCompare={toggleCompare}
                currentDocumentId={currentDocumentId}
                findRunsForDoc={findRunsForDoc}
              />
            ))}
          </ol>
        </section>

        {/* Snapshot of selected run */}
        <section className={`${PANEL} p-4`}>
          <div className={PANEL_LABEL}>Снимок выбранного запуска</div>
          {!selectedRun ? (
            <p className="mt-2 text-sm text-slate-300">Выберите запуск в хронологии.</p>
          ) : (
            <RunSnapshot run={selectedRun} docs={docs} />
          )}
        </section>
      </div>
    </div>
  );
}

function TimelineNode({
  item,
  selectedRunId,
  onSelectRun,
  compareMode,
  cmpA,
  cmpB,
  onToggleCompare,
  currentDocumentId,
  findRunsForDoc,
}: {
  item: TimelineItem;
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  compareMode: boolean;
  cmpA: string | null;
  cmpB: string | null;
  onToggleCompare: (id: string) => void;
  currentDocumentId: string;
  findRunsForDoc: (d: ChainDoc) => { analysis: AiRunRow | null; review: AiRunRow | null };
}) {
  if (item.kind === "version") {
    const d = item.doc;
    const isCurrent = d.id === currentDocumentId;
    const { analysis, review } = findRunsForDoc(d);
    return (
      <li className="relative pl-5">
        <span className="absolute left-1 top-2 inline-block h-2 w-2 rounded-full bg-sky-400" />
        <div
          className={`rounded-lg border p-3 ${
            isCurrent
              ? "border-sky-400/60 bg-sky-500/10"
              : "border-slate-700 bg-slate-800/60"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white">
              Версия {d.version_number}
              {isCurrent && (
                <span className="ml-2 rounded-full border border-sky-300/50 bg-sky-500/30 px-2 py-0.5 text-[10px] font-semibold text-sky-50">
                  текущая
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-300">{fmt(d.created_at)}</div>
          </div>
          <div className="mt-1 truncate text-xs text-slate-200">{d.title ?? "—"}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`rounded-md border px-2 py-0.5 ${statusTone(d.status)}`}>
              {statusLabel(d.status)}
            </span>
            {d.ai_review_status && (
              <span className="rounded-md border border-slate-600 bg-slate-700/60 px-2 py-0.5 text-slate-100">
                AI Review: {statusLabel(d.ai_review_status)}
              </span>
            )}
            {!isCurrent && (
              <Link
                to="/workspace/generated-documents/$documentId"
                params={{ documentId: d.id }}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-0.5 text-slate-100 hover:bg-slate-700"
              >
                <ExternalLink size={10} /> Открыть версию
              </Link>
            )}
          </div>
          {(analysis || review) && (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {analysis && (
                <button
                  type="button"
                  onClick={() => onSelectRun(analysis.id)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${
                    selectedRunId === analysis.id
                      ? "border-emerald-400/60 bg-emerald-500/20 text-white"
                      : "border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
                  }`}
                >
                  <Sparkles size={10} /> AI анализ
                </button>
              )}
              {review && (
                <button
                  type="button"
                  onClick={() => onSelectRun(review.id)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${
                    selectedRunId === review.id
                      ? "border-emerald-400/60 bg-emerald-500/20 text-white"
                      : "border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
                  }`}
                >
                  <ShieldCheck size={10} /> AI Review
                </button>
              )}
            </div>
          )}
        </div>
      </li>
    );
  }
  if (item.kind === "approval") {
    return (
      <li className="relative pl-5">
        <span className="absolute left-1 top-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
        <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-emerald-50">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-white">
              Одобрено: версия {item.doc.version_number}
            </div>
            <div className="text-[11px] text-emerald-100/80">{fmt(item.at)}</div>
          </div>
          {item.doc.lawyer_approved_by && (
            <div className="mt-1 text-[11px] text-emerald-100/80">
              Юрист: <span className="font-mono">{shortId(item.doc.lawyer_approved_by)}</span>
            </div>
          )}
        </div>
      </li>
    );
  }
  // run
  const r = item.run;
  const isSelected = selectedRunId === r.id;
  const isCmp = cmpA === r.id || cmpB === r.id;
  const which = cmpA === r.id ? "A" : cmpB === r.id ? "B" : null;
  const canCompare = compareMode && isLegalAnalysis(r) && (r.status ?? "").toLowerCase() === "completed";
  return (
    <li className="relative pl-5">
      <span
        className={`absolute left-1 top-2 inline-block h-2 w-2 rounded-full ${
          isReview(r) ? "bg-violet-400" : "bg-amber-400"
        }`}
      />
      <button
        type="button"
        onClick={() => onSelectRun(r.id)}
        className={`block w-full rounded-lg border p-3 text-left transition ${
          isSelected
            ? "border-emerald-400/60 bg-emerald-500/10"
            : "border-slate-700 bg-slate-800/60 hover:bg-slate-700/60"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">{runTypeLabel(r.run_type)}</div>
          <div className="text-[11px] text-slate-300">{fmt(r.created_at)}</div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-md border px-2 py-0.5 ${statusTone(r.status)}`}>
            {statusLabel(r.status)}
          </span>
          {r.model_name && (
            <span className="rounded-md border border-slate-600 bg-slate-700/60 px-2 py-0.5 text-slate-100">
              {r.model_name}
            </span>
          )}
          {r.hallucination_risk && (
            <span className={`rounded-md border px-2 py-0.5 ${riskTone(r.hallucination_risk)}`}>
              Риск: {r.hallucination_risk}
            </span>
          )}
          {r.legal_accuracy_score != null && (
            <span className="rounded-md border border-slate-600 bg-slate-700/60 px-2 py-0.5 text-slate-100">
              Точность: {Math.round(Number(r.legal_accuracy_score) * (Number(r.legal_accuracy_score) <= 1 ? 100 : 1))}
            </span>
          )}
          {fmtDuration(r.created_at, r.completed_at) && (
            <span className="rounded-md border border-slate-600 bg-slate-700/60 px-2 py-0.5 text-slate-100">
              {fmtDuration(r.created_at, r.completed_at)}
            </span>
          )}
        </div>
        {canCompare && (
          <div className="mt-2 flex justify-end">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCompare(r.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleCompare(r.id);
                }
              }}
              className={`cursor-pointer rounded-md border px-2 py-0.5 text-[10px] ${
                isCmp
                  ? "border-emerald-400/60 bg-emerald-500/30 text-white"
                  : "border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
              }`}
            >
              {which ? `Выбрано ${which}` : "Сравнить"}
            </span>
          </div>
        )}
      </button>
    </li>
  );
}

function RunSnapshot({ run, docs }: { run: AiRunRow; docs: ChainDoc[] }) {
  const ai = (run.ai_result ?? {}) as Record<string, any>;
  const review = (run.review_result ?? {}) as Record<string, any>;
  const linkedDoc = docs.find((d) => d.id === run.generated_document_id);
  // Context quality might be stored either on ai_result or on the linked doc metadata
  const ctxQuality =
    (ai?.document_context_quality as number | undefined) ??
    (ai?.context_quality as number | undefined) ??
    ((linkedDoc?.metadata as any)?.document_context_quality as number | undefined) ??
    null;

  const facts: any[] = pickArray(ai, "facts");
  const sources: any[] = pickArray(ai, "sources");
  const practice: any[] = pickArray(ai, "court_practice");
  const counter: any[] = pickArray(ai, "counter_arguments");
  const weak: any[] = pickArray(ai, "weak_points");
  const docsAudit: any =
    ai?.documents_audit ?? (ai?.input?.documents_audit as any) ?? null;
  const inputSnap = run.input_snapshot ?? null;

  const problems: any[] =
    (Array.isArray(run.problems) ? (run.problems as any[]) : null) ??
    pickArray(review, "problems");
  const fixes: any[] =
    (Array.isArray(run.required_fixes) ? (run.required_fixes as any[]) : null) ??
    pickArray(review, "required_fixes");
  const recs: any[] =
    (Array.isArray(run.recommendations) ? (run.recommendations as any[]) : null) ??
    pickArray(review, "recommendations");

  return (
    <div className="mt-3 space-y-3 text-sm text-slate-100">
      {/* Header */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-white">{runTypeLabel(run.run_type)}</div>
          <span className={`rounded-md border px-2 py-0.5 text-[11px] ${statusTone(run.status)}`}>
            {statusLabel(run.status)}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-300 sm:grid-cols-2">
          <div>Запущен: {fmt(run.created_at)}</div>
          <div>Завершён: {fmt(run.completed_at)}</div>
          {fmtDuration(run.created_at, run.completed_at) && (
            <div>Длительность: {fmtDuration(run.created_at, run.completed_at)}</div>
          )}
          {run.model_name && <div>Модель: {run.model_name}</div>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <IdChip label="Run" value={run.id} />
          <IdChip label="Session" value={run.session_id} />
          <IdChip label="Document" value={run.generated_document_id} />
        </div>
        {run.error_message && (
          <div className="mt-2 rounded-md border border-red-400/40 bg-red-500/10 p-2 text-[11px] text-red-100">
            {run.error_message}
          </div>
        )}
        {linkedDoc && (
          <div className="mt-2">
            <Link
              to="/workspace/generated-documents/$documentId"
              params={{ documentId: linkedDoc.id }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-100 hover:bg-slate-700"
            >
              <ExternalLink size={10} /> Перейти к версии {linkedDoc.version_number}
            </Link>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {run.hallucination_risk && (
          <SnapStat label="Риск галлюцинаций" value={run.hallucination_risk} tone={riskTone(run.hallucination_risk)} />
        )}
        {run.legal_accuracy_score != null && (
          <SnapStat label="Точность" value={String(run.legal_accuracy_score)} />
        )}
        {ctxQuality != null && (
          <SnapStat label="Качество контекста" value={String(ctxQuality)} />
        )}
        {run.needs_lawyer_review != null && (
          <SnapStat label="Нужен юрист" value={run.needs_lawyer_review ? "Да" : "Нет"} />
        )}
        {run.review_status && (
          <SnapStat label="Статус Review" value={statusLabel(run.review_status)} />
        )}
      </div>

      {/* Legal analysis snapshot */}
      {isLegalAnalysis(run) && (
        <>
          {facts.length > 0 && <SnapList title="Факты" items={facts} />}
          {sources.length > 0 && <SnapList title="Источники" items={sources} renderer={renderSource} />}
          {practice.length > 0 && <SnapList title="Судебная практика" items={practice} renderer={renderSource} />}
          {counter.length > 0 && <SnapList title="Контраргументы" items={counter} />}
          {weak.length > 0 && <SnapList title="Слабые места" items={weak} />}
          {docsAudit && <DocsAuditSnap audit={docsAudit} />}
          {inputSnap && <InputSnapshotView snapshot={inputSnap} />}
        </>
      )}

      {/* Review snapshot */}
      {isReview(run) ? (
        problems.length + fixes.length + recs.length > 0 ? (
          <>
            {problems.length > 0 && <SnapList title="Проблемы" items={problems} />}
            {fixes.length > 0 && <SnapList title="Обязательные правки" items={fixes} />}
            {recs.length > 0 && <SnapList title="Рекомендации" items={recs} />}
          </>
        ) : (
          <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3 text-xs text-slate-300">
            Замечаний нет.
          </div>
        )
      ) : null}

      {/* If not a review run but no review attached at all */}
      {isLegalAnalysis(run) && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3 text-[11px] text-slate-300">
          AI Review запускается отдельно для конкретной версии документа. См. вкладку «AI Review».
        </div>
      )}
    </div>
  );
}

function SnapStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`rounded-lg border p-3 ${tone ?? "border-slate-700 bg-slate-800/70 text-slate-100"}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function renderItemText(it: any): string {
  if (it == null) return "";
  if (typeof it === "string") return it;
  return (
    it?.text ??
    it?.title ??
    it?.description ??
    it?.summary ??
    it?.fact ??
    it?.statement ??
    ""
  );
}

function renderSource(it: any): string {
  if (!it) return "";
  if (typeof it === "string") return it;
  const parts = [
    it?.title,
    it?.article,
    it?.paragraph,
    it?.case_number,
    it?.court,
    it?.url,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : renderItemText(it);
}

function SnapList({
  title,
  items,
  renderer,
}: {
  title: string;
  items: any[];
  renderer?: (it: any) => string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-white"
      >
        <span>
          {title} <span className="text-slate-400">({items.length})</span>
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <ul className="space-y-1 px-3 pb-3 text-xs text-slate-200">
          {items.slice(0, 50).map((it, i) => (
            <li key={i} className="rounded-md border border-slate-700/60 bg-slate-900/40 p-2">
              {(renderer ?? renderItemText)(it) || "—"}
            </li>
          ))}
          {items.length > 50 && (
            <li className="text-[11px] text-slate-400">
              Показаны первые 50 из {items.length}.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function DocsAuditSnap({ audit }: { audit: any }) {
  const used: any[] = Array.isArray(audit?.used) ? audit.used : [];
  const rejected: any[] = Array.isArray(audit?.rejected) ? audit.rejected : [];
  if (used.length === 0 && rejected.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
      <div className="text-xs font-semibold text-white">Аудит документов клиента</div>
      {used.length > 0 && (
        <div className="mt-2">
          <div className={PANEL_LABEL}>Использованы ({used.length})</div>
          <ul className="mt-1 space-y-1 text-xs text-slate-200">
            {used.map((u, i) => (
              <li key={i} className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-2">
                <div className="font-medium text-emerald-50">{u?.title ?? u?.name ?? u?.file_name ?? "—"}</div>
                {u?.used_for && (
                  <div className="text-[11px] text-emerald-100/80">Цель: {u.used_for}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rejected.length > 0 && (
        <div className="mt-2">
          <div className={PANEL_LABEL}>Отклонены ({rejected.length})</div>
          <ul className="mt-1 space-y-1 text-xs text-slate-200">
            {rejected.map((u, i) => (
              <li key={i} className="rounded-md border border-amber-400/30 bg-amber-500/10 p-2">
                <div className="font-medium text-amber-50">{u?.title ?? u?.name ?? u?.file_name ?? "—"}</div>
                {u?.reason && (
                  <div className="text-[11px] text-amber-100/80">Причина: {u.reason}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InputSnapshotView({ snapshot }: { snapshot: any }) {
  const docs: any[] =
    (Array.isArray(snapshot?.documents) && snapshot.documents) ||
    (Array.isArray(snapshot?.lead_documents) && snapshot.lead_documents) ||
    [];
  if (docs.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
      <div className="text-xs font-semibold text-white">Входные документы запуска</div>
      <ul className="mt-2 space-y-1 text-xs text-slate-200">
        {docs.slice(0, 50).map((d, i) => {
          const used = d?.used ?? d?.included ?? true;
          const reason = d?.reason ?? d?.rejection_reason ?? null;
          const ocrLen = d?.ocr_length ?? d?.ocr_size ?? d?.text_length ?? null;
          return (
            <li
              key={i}
              className={`rounded-md border p-2 ${
                used
                  ? "border-slate-700/60 bg-slate-900/40"
                  : "border-amber-400/30 bg-amber-500/10"
              }`}
            >
              <div className="font-medium">
                {d?.title ?? d?.name ?? d?.file_name ?? "—"}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-300">
                {ocrLen != null && <span>OCR: {ocrLen} симв.</span>}
                {d?.created_at && <span>{fmt(d.created_at)}</span>}
                <span>{used ? "Использован" : "Отклонён"}</span>
                {reason && <span className="text-amber-200/80">причина: {reason}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AnalysisDiffView({ a, b }: { a: AiRunRow | null; b: AiRunRow | null }) {
  if (!a || !b) return null;
  const ai1 = (a.ai_result ?? {}) as any;
  const ai2 = (b.ai_result ?? {}) as any;

  const sec = (label: string, k1: any[], k2: any[], renderer?: (x: any) => string) => {
    const r = renderer ?? renderItemText;
    const s1 = new Map<string, any>();
    const s2 = new Map<string, any>();
    for (const x of k1) {
      const t = r(x).trim();
      if (t) s1.set(t.toLowerCase(), x);
    }
    for (const x of k2) {
      const t = r(x).trim();
      if (t) s2.set(t.toLowerCase(), x);
    }
    const added = [...s2.entries()].filter(([k]) => !s1.has(k)).map(([, v]) => v);
    const removed = [...s1.entries()].filter(([k]) => !s2.has(k)).map(([, v]) => v);
    if (added.length === 0 && removed.length === 0) return null;
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
        <div className="text-xs font-semibold text-white">{label}</div>
        {added.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase text-emerald-200">Добавлены ({added.length})</div>
            <ul className="mt-1 space-y-1 text-xs">
              {added.map((x, i) => (
                <li
                  key={i}
                  className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-2 text-emerald-50"
                >
                  + {r(x) || "—"}
                </li>
              ))}
            </ul>
          </div>
        )}
        {removed.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase text-red-200">Удалены ({removed.length})</div>
            <ul className="mt-1 space-y-1 text-xs">
              {removed.map((x, i) => (
                <li
                  key={i}
                  className="rounded-md border border-red-400/30 bg-red-500/10 p-2 text-red-50"
                >
                  − {r(x) || "—"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const inputDocs = (snap: any): any[] =>
    (Array.isArray(snap?.documents) && snap.documents) ||
    (Array.isArray(snap?.lead_documents) && snap.lead_documents) ||
    [];

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-200">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase text-slate-400">A</div>
            <div>{fmt(a.created_at)}</div>
            <div className="text-slate-300">{a.model_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400">B</div>
            <div>{fmt(b.created_at)}</div>
            <div className="text-slate-300">{b.model_name ?? "—"}</div>
          </div>
        </div>
      </div>
      {sec("Нормы и источники", pickArray(ai1, "sources"), pickArray(ai2, "sources"), renderSource)}
      {sec("Судебная практика", pickArray(ai1, "court_practice"), pickArray(ai2, "court_practice"), renderSource)}
      {sec("Факты", pickArray(ai1, "facts"), pickArray(ai2, "facts"))}
      {sec("Риски / слабые места", pickArray(ai1, "weak_points"), pickArray(ai2, "weak_points"))}
      {sec("Контраргументы", pickArray(ai1, "counter_arguments"), pickArray(ai2, "counter_arguments"))}
      {sec(
        "Документы клиента",
        inputDocs(a.input_snapshot),
        inputDocs(b.input_snapshot),
        (d) => d?.title ?? d?.name ?? d?.file_name ?? "",
      )}
    </div>
  );
}
