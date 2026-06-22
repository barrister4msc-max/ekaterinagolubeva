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
    <div className="rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-foreground/85">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-foreground/75">
          {KIND_LABEL[kind]}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {source.verification_status && (
            <span className={CHIP}>verif: {String(source.verification_status)}</span>
          )}
          {source.actuality_status && (
            <span className={CHIP}>actuality: {String(source.actuality_status)}</span>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-200 hover:underline"
            >
              <ExternalLink size={11} /> {kind === "law" ? "Перейти к статье" : "Открыть"}
            </a>
          )}
        </div>
      </div>
      {rows.length > 0 && (
        <dl className="mt-2 grid grid-cols-[130px_1fr] gap-x-3 gap-y-0.5">
          {rows.map(([label, value], i) => (
            <Fragment key={i}>
              <dt className="text-foreground/55">{label}</dt>
              <dd className="break-words text-foreground/90">{String(value)}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      <ExpandableQuote quote={typeof quote === "string" ? quote : undefined} />
      {loc && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 p-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-foreground/55">Использовано в документе</span>
            <LocationBadge loc={loc} />
          </div>
          <GoToButton loc={loc} setTab={setTab} />
        </div>
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
    <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-foreground/85">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase text-foreground/55">Проблема №{index}</div>
          <div className="mt-1 font-semibold text-white">{String(title)}</div>
        </div>
        {severity && (
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${severityTone(String(severity))}`}>
            {String(severity)}
          </span>
        )}
      </div>
      {loc && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 p-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-foreground/55">Где найдено</span>
            <LocationBadge loc={loc} />
          </div>
          <GoToButton loc={loc} setTab={setTab} />
        </div>
      )}
      {fragment && (
        <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-white/20 bg-black/20 p-2 text-xs italic text-foreground/80">
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
  const [zoom, setZoom] = useState<number>(100);
  const [fit, setFit] = useState<"none" | "width" | "page">("none");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

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

  const analysis = (analysisRun?.ai_result ?? {}) as Record<string, any>;
  const review = (reviewRun?.ai_result ?? {}) as Record<string, any>;
  const sources: any[] =
    (Array.isArray(analysis?.sources) && analysis.sources) ||
    pickArray(meta, "sources") ||
    [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/workspace/generated-documents" })}
          className={BTN}
        >
          <ArrowLeft size={12} /> К списку
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={downloadDocx} className={BTN}>
            <Download size={12} /> DOCX
          </button>
          <button type="button" onClick={downloadPdf} className={BTN}>
            <Download size={12} /> PDF
          </button>
        </div>
      </div>

      <header className={`${GLASS} p-5`}>
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

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          {/* Tabs */}
          <div className="sticky top-3 z-40 flex flex-wrap gap-2 rounded-2xl border border-white/15 bg-slate-950/75 p-3 shadow-2xl backdrop-blur-xl">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                  tab === t.id
                    ? "border-emerald-300/60 bg-emerald-500/30 text-white"
                    : "border-white/20 bg-black/40 text-white/85 hover:border-white/35 hover:bg-white/15"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "document" && (
            <section className="relative space-y-0 pb-10">
              {isApproved && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-400/10 p-3 text-xs text-amber-50">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Одобренную или финальную версию нельзя изменить напрямую. Создайте новую версию.</span>
                </div>
              )}

              <div
                className="mx-auto w-full max-w-[900px] px-[60px] py-[70px] shadow-[0_10px_40px_rgba(0,0,0,0.25)] ring-1 ring-black/10"
                style={{ backgroundColor: "#ffffff" }}
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
                      fontSize: "18px",
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
                      fontSize: "18px",
                      lineHeight: 1.9,
                      color: "#111827",
                    }}
                  >
                    {edited ? (
                      <ReactMarkdown>{edited}</ReactMarkdown>
                    ) : (
                      <span className="text-slate-500">Документ пуст</span>
                    )}
                  </div>
                )}

                <p className="mt-8 border-t border-slate-200 pt-3 text-center text-[11px] italic text-slate-500">
                  Рабочий текст документа. Правки юриста сохраняются в соответствии со статусом версии.
                </p>
              </div>

              <div className="mx-auto flex w-full max-w-[900px] flex-nowrap items-center gap-3 overflow-x-auto border-t border-slate-200 bg-white px-[60px] py-6">
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

              <style>{`
                .doc-prose h1 { font-size: 24px; font-weight: 700; margin: 16px 0 12px; }
                .doc-prose h2 { font-size: 21px; font-weight: 700; margin: 14px 0 10px; }
                .doc-prose h3 { font-size: 19px; font-weight: 600; margin: 12px 0 8px; }
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
              `}</style>
            </section>
          )}

          {tab === "reasoning" && (
            <ReasoningTab analysis={analysis} meta={meta} setTab={setTab} />
          )}

          {tab === "analysis" && (

            <section className={`${GLASS} p-5 space-y-4 text-sm text-foreground/85`}>
              {!analysisRun && (
                <p className="text-foreground/70">Правовой анализ не привязан к документу.</p>
              )}
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
                  <div className="rounded-lg border border-white/15 bg-white/5 p-3 text-xs">
                    document_context_quality:{" "}
                    <span className="text-white">{contextQuality ?? "—"}</span>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "sources" && (
            <section className={`${GLASS} p-5 space-y-3`}>
              <div>
                <h2 className="font-display text-lg text-white">Источники</h2>
                <p className="mt-1 text-xs text-foreground/65">
                  Точная локализация: статья, пункт, абзац, страница, цитата. Кнопка «Перейти» открывает место в документе, где источник был использован.
                </p>
              </div>
              {sources.length === 0 && (
                <p className="text-sm text-foreground/70">Источники не указаны.</p>
              )}
              <div className="space-y-2">
                {sources.map((s: any, i: number) => (
                  <SourceCitation key={i} source={s} setTab={setTab} />
                ))}
              </div>
            </section>
          )}

          {tab === "review" && (
            <section className={`${GLASS} p-5 space-y-4`}>
              <div>
                <h2 className="font-display text-lg text-white">AI Review</h2>
                <p className="mt-1 text-xs text-foreground/65">
                  Найденные проблемы, причины и рекомендации. Каждый блок содержит ссылку на место в документе.
                </p>
              </div>
              {!reviewRun && (
                <p className="text-sm text-foreground/70">AI Review для этого документа не найден.</p>
              )}
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
                    if (total === 0) {
                      return (
                        <p className="text-sm text-foreground/70">Замечаний нет.</p>
                      );
                    }
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
            <section className={`${GLASS} p-5 space-y-3 text-sm text-foreground/85`}>
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
                  <div className="mt-3 text-[11px] uppercase text-foreground/60">Документы сессии</div>
                  <ul className="mt-2 space-y-1">
                    {sessionDocs.map((d: any) => (
                      <li key={d.id} className="text-xs text-foreground/75">
                        {d.file_name} <span className="text-foreground/50">· {fmt(d.created_at)}</span>
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
            <section className={`${GLASS} p-5 space-y-3`}>
              <p className="text-sm text-foreground/80">Скачайте документ или отправьте на печать.</p>
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
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className={`${GLASS} h-fit space-y-3 p-4 text-xs text-foreground/85 lg:sticky lg:top-3`}>
          <SideRow label="Статус" value={doc.status} />
          <SideRow label="Шаблон" value={doc.template_key ?? "—"} />
          <SideRow label="Язык" value={language ?? "—"} />
          <SideRow label="Юрисдикция" value={jurisdiction ?? "—"} />
          <SideRow label="used_context" value={String(usedContext)} />
          <SideRow label="context_quality" value={contextQuality != null ? String(contextQuality) : "—"} />
          <SideRow label="legal_analysis_run_id" value={legalAnalysisRunId ? `${legalAnalysisRunId.slice(0, 8)}…` : "—"} />
          <SideRow label="created_at" value={fmt(doc.created_at)} />
          {contextSummary && (
            <div className="rounded-lg border border-white/15 bg-white/5 p-2 text-foreground/75">
              {String(contextSummary)}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-1.5">
      <span className="text-[11px] uppercase text-foreground/55">{label}</span>
      <span className="text-foreground/90">{value}</span>
    </div>
  );
}

function SideRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-foreground/55">{label}</div>
      <div className="text-foreground/90">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/5 p-3">
      <div className="text-[11px] uppercase text-foreground/60">{label}</div>
      <div className="mt-1 text-sm text-white">{value != null && value !== "" ? String(value) : "—"}</div>
    </div>
  );
}

function AnalysisField({ label, value }: { label: string; value: any }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <div className="text-[11px] uppercase text-foreground/60">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-foreground/90">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </div>
    </div>
  );
}

function AnalysisList({ label, items }: { label: string; items: any }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase text-foreground/60">{label} · {items.length}</div>
      <ul className="mt-1 space-y-1.5">
        {items.map((it: any, i: number) => (
          <li key={i} className="rounded-lg border border-white/15 bg-white/5 p-2 text-xs text-foreground/85">
            {typeof it === "string" ? it : JSON.stringify(it)}
          </li>
        ))}
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
            className="rounded-lg border border-white/15 bg-white/5 p-2.5 text-xs text-foreground/80"
          >
            {typeof it === "string" ? it : JSON.stringify(it)}
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
    default: "border-white/15 bg-white/5",
    fact: "border-sky-300/30 bg-sky-400/10",
    evidence: "border-emerald-300/30 bg-emerald-400/10",
    law: "border-violet-300/30 bg-violet-400/10",
    why: "border-amber-300/30 bg-amber-400/10",
    conclusion: "border-emerald-400/40 bg-emerald-500/15",
    warn: "border-red-400/40 bg-red-500/15",
  };
  return (
    <div className={`rounded-xl border p-3 ${toneCls[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider text-foreground/60">{title}</div>
      <div className="mt-1 text-sm text-foreground/90">{children}</div>
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
    <section className={`${GLASS} space-y-5 p-5 text-sm text-foreground/85`}>
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

        const needsReview = evidenceDocs.length === 0 || !lawObj && !lawRef;

        return (
          <div
            key={i}
            className="space-y-3 rounded-2xl border border-white/15 bg-black/20 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-wider text-foreground/55">
                Цепочка обоснования #{i + 1}
              </div>
              {needsReview && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] text-red-100">
                  <AlertTriangle size={11} /> Требуется проверка юристом
                </span>
              )}
            </div>

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
