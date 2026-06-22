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
  Scale,
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
  const url = source.url ?? source.link;
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
    push("OCR block", source.ocr_block);
    push("Абзац", source.paragraph);
    push(
      "OCR координаты",
      source.ocr_coords ? JSON.stringify(source.ocr_coords) : null,
    );
  } else {
    push("Название", source.title ?? source.name ?? source.source_id);
    push("Тип", source.type ?? source.kind);
  }

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-800/95 p-3 text-sm text-slate-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-slate-600/80 bg-slate-700/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-100">
          {KIND_LABEL[kind]}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {source.verification_status && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-100">
              verif: {String(source.verification_status)}
            </span>
          )}
          {source.actuality_status && (
            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-100">
              акт.: {String(source.actuality_status)}
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
      <ExpandableQuote quote={typeof quote === "string" ? quote : undefined} />
      {loc && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/70 bg-slate-900/80 p-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Использовано в документе</span>
            <LocationBadge loc={loc} />
          </div>
          <GoToButton loc={loc} setTab={setTab} />
        </div>
      )}
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
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
            Индекс доверия
          </div>
          <div className="mt-0.5 text-base font-bold">
            {trust.score}% · {label}
          </div>
        </div>
        <div className="h-12 w-12 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(trust.score / 100) * 94.2} 94.2`}
            />
          </svg>
        </div>
      </div>
      {trust.reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12px] opacity-95">
          {trust.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
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
  const [viewMode, setViewMode] = useState<"workspace" | "read" | "review" | "compare">("workspace");
  const [zoom, setZoom] = useState<number>(100);
  const [fit, setFit] = useState<"none" | "width" | "page">("none");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [selectedArgIndex, setSelectedArgIndex] = useState<number>(0);
  const [argFilter, setArgFilter] = useState<"all" | "high" | "medium" | "low" | "no_evidence" | "ai_issues" | "needs_review">("all");
  const [argSearch, setArgSearch] = useState<string>("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    fact: true, evidence: true, law: true, why: true, rejected: false, practice: true, letters: false, counter: false, review: true, conclusion: true,
  });
  const toggleNode = (k: string) => setExpandedNodes((s) => ({ ...s, [k]: !s[k] }));

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
    if (viewMode !== "workspace") return;
    const arg = argumentsList[selectedArgIndex];
    if (!arg) return;
    const t = window.setTimeout(() => highlightArgumentInDoc(arg), 80);
    return () => window.clearTimeout(t);
  }, [selectedArgIndex, viewMode, argumentsList]);

  const selectedArg = argumentsList[selectedArgIndex] ?? null;

  const showPanel = viewMode !== "read" && viewMode !== "workspace" && !panelCollapsed;
  const gridCols =
    viewMode === "compare" && showPanel
      ? "lg:grid-cols-[minmax(0,1fr)_minmax(440px,1fr)]"
      : viewMode === "review" && showPanel
        ? "lg:grid-cols-[minmax(0,1fr)_minmax(420px,480px)]"
        : "lg:grid-cols-1";

  const docMaxWidth =
    fit === "width"
      ? "100%"
      : viewMode === "read"
        ? "clamp(900px, 72vw, 1250px)"
        : viewMode === "workspace"
          ? "100%"
          : viewMode === "compare"
            ? "100%"
            : "clamp(880px, 66vw, 1150px)";
  const docFontSize = fit === "page" ? 16 : Math.round((18 * zoom) / 100);

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
        className="doc-paper mx-auto w-full px-[60px] py-[70px] shadow-[0_10px_40px_rgba(0,0,0,0.25)] ring-1 ring-black/10"
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
            style={{
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: `${docFontSize}px`,
              lineHeight: 1.9,
              color: "#111827",
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
          disabled={isApproved || !editMode || !dirty || saveEdits.isPending}
          className={`${BTN_PRIMARY} whitespace-nowrap`}
        >
          {saveEdits.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Сохранить
        </button>
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
          Создать версию
        </button>
        {!isApproved && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Одобрить документ?")) approve.mutate();
            }}
            disabled={approve.isPending}
            className={`${BTN_EMERALD} whitespace-nowrap`}
          >
            {approve.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCircle2 size={12} />
            )}
            Одобрить
          </button>
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

      {tab === "reasoning" && <ReasoningTab analysis={analysis} meta={meta} setTab={setTab} />}

      {tab === "analysis" && (
        <section className={`${PANEL} p-5 space-y-4 text-sm text-slate-100`}>
          <h2 className="font-display text-lg text-white">AI правовой анализ</h2>
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
                document_context_quality:{" "}
                <span className="font-semibold text-white">{contextQuality ?? "—"}</span>
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
            <ModeBtn mode="workspace" icon={Scale} label="Workspace" />
            <ModeBtn mode="read" icon={BookOpen} label="Чтение" />
            <ModeBtn mode="review" icon={ClipboardCheck} label="Проверка" />
            <ModeBtn mode="compare" icon={Columns} label="Сравнение" />
          </div>

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

      {/* Document header */}
      <header className={`${GLASS} p-5 no-print`}>
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
          {usedContext && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-100">
              DocumentContext{contextQuality != null ? ` · ${contextQuality}` : ""}
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

      {/* Workspace layout */}
      {viewMode === "workspace" ? (
        <div className="grid gap-4 transition-all duration-300 ease-out lg:grid-cols-[300px_minmax(0,1fr)_460px] xl:grid-cols-[320px_minmax(0,1fr)_500px]">
          <aside className="no-print min-w-0 lg:sticky lg:top-3 lg:max-h-[calc(100vh-90px)] lg:overflow-y-auto lg:pr-1">
            <ArgumentNavigator
              args={argumentsList}
              filtered={filteredArguments}
              selectedIndex={selectedArgIndex}
              onSelect={setSelectedArgIndex}
              filter={argFilter}
              onFilterChange={setArgFilter}
              search={argSearch}
              onSearchChange={setArgSearch}
              reviewProblems={reviewProblems}
            />
          </aside>
          <div className="min-w-0">{DocumentPane}</div>
          <aside className="no-print min-w-0 lg:sticky lg:top-3 lg:max-h-[calc(100vh-90px)] lg:overflow-y-auto lg:pr-1">
            <ArgumentTree
              arg={selectedArg}
              reviewProblems={reviewProblems}
              expanded={expandedNodes}
              onToggle={toggleNode}
              onJumpDoc={() => selectedArg && highlightArgumentInDoc(selectedArg)}
              setTab={setTab}
            />
          </aside>
        </div>
      ) : viewMode === "read" || !showPanel ? (
        <div className="min-w-0 transition-all duration-300 ease-out">{DocumentPane}</div>
      ) : (
        <div className={`grid gap-6 transition-all duration-300 ease-out ${gridCols}`}>
          <div className="min-w-0">{DocumentPane}</div>
          <aside className="no-print min-w-0">{PanelPane}</aside>
        </div>
      )}

      {/* Print + doc styles */}
      <style>{`
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
        <div className="rounded-lg border border-amber-300/40 bg-amber-400/10 p-3 text-xs text-amber-50">
          fact_to_law_mapping отсутствует в правовом анализе. Обоснование построить нельзя.
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
          <ReasoningCard tone="default" title={`Инструкции для генератора · ${generationInstructions.length}`}>
            <ul className="space-y-1 text-xs">
              {generationInstructions.map((c: any, k: number) => (
                <li key={k}>{renderText(c?.text ?? c?.description ?? c)}</li>
              ))}
            </ul>
          </ReasoningCard>
        )}
      </div>
    </section>
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
            Аргументы не обнаружены (нет fact_to_law_mapping).
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
