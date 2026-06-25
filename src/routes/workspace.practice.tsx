import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Briefcase, FileText, Star, FolderArchive, Layers, ExternalLink, Trash2, Link2, Wand2, ShieldCheck, Eraser, GraduationCap, Send, Tags, Eye, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  archivePracticeList,
  archivePracticeStats,
  archiveBatchesList,
  archiveDelete,
  archiveApproveStyle,
  archiveMakeTemplate,
  archiveAddToMatter,
  archiveApproveTraining,
  archiveClassify,
  archiveClassifyBatchByContent,
  archiveNormalizePracticeAreas,
  archiveSendToKbQueue,
  archiveGetExtractedText,
  archiveExtractTextBatch,
  archiveOcrBatch,
  archiveProcessBatchFully,
  archiveAiAnalyzeBatch,
  archiveGetAiAnalysis,
  archiveApproveBatchGold,
  archiveSendBatchGoldToKb,
  matterList,
  type BatchStats,
} from "@/lib/lawyer-matters.functions";

import { ZipUploadDialog } from "@/components/practice/zip-upload-dialog";
import { AnonymizeDialog } from "@/components/practice/anonymize-dialog";

export const Route = createFileRoute("/workspace/practice")({
  head: () => ({ meta: [{ title: "Практика Екатерины — Workspace" }, { name: "robots", content: "noindex" }] }),
  component: PracticePage,
});

const PRACTICE_AREAS: { v: string; l: string }[] = [
  { v: "real_estate", l: "Недвижимость" },
  { v: "tax", l: "Налоги" },
  { v: "litigation", l: "Судебные споры" },
  { v: "contracts", l: "Договоры" },
  { v: "land", l: "Земельное право" },
  { v: "inheritance", l: "Наследство" },
  { v: "bankruptcy", l: "Банкротство" },
  { v: "corporate", l: "Корпоративное право" },
  { v: "enforcement", l: "Исполнительное производство" },
  { v: "claims", l: "Претензионная работа" },
  { v: "other", l: "Прочее" },
];

const DOC_FAMILIES: { v: string; l: string }[] = [
  { v: "contract_sale_real_estate", l: "Договор купли-продажи (недв.)" },
  { v: "contract_lease", l: "Договор аренды" },
  { v: "contract_services", l: "Договор услуг" },
  { v: "claim", l: "Претензия" },
  { v: "statement_of_claim", l: "Иск" },
  { v: "response_to_claim", l: "Отзыв на иск" },
  { v: "objection", l: "Возражения" },
  { v: "appeal", l: "Апелляция" },
  { v: "cassation", l: "Кассация" },
  { v: "tax_response", l: "Ответ ФНС" },
  { v: "tax_objection", l: "Возражения (налог)" },
  { v: "tax_complaint", l: "Жалоба УФНС" },
  { v: "legal_opinion", l: "Правовое заключение" },
  { v: "due_diligence_report", l: "Due diligence" },
  { v: "risk_report", l: "Риск-отчёт" },
  { v: "settlement_agreement", l: "Мировое соглашение" },
  { v: "other", l: "Прочее" },
];

const DOC_ROLES: { v: string; l: string; tone: string }[] = [
  { v: "gold_reference", l: "Gold", tone: "bg-amber-100 text-amber-900" },
  { v: "silver_reference", l: "Silver", tone: "bg-slate-200 text-slate-900" },
  { v: "template_candidate", l: "Кандидат в шаблон", tone: "bg-blue-100 text-blue-900" },
  { v: "archive_only", l: "Только архив", tone: "bg-muted text-muted-foreground" },
  { v: "not_for_training", l: "Не для обучения", tone: "bg-red-100 text-red-900" },
];

type ArchiveItem = {
  id: string;
  title: string;
  item_type: string;
  category: string | null;
  storage_path: string | null;
  matter_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

function areaLabel(v?: string | null) {
  return PRACTICE_AREAS.find((x) => x.v === v)?.l ?? (v || "—");
}
function familyLabel(v?: string | null) {
  return DOC_FAMILIES.find((x) => x.v === v)?.l ?? (v || "—");
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border bg-card/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function BatchCard({
  b, busy,
  onExtract, onOcr, onClassify, onAnalyze, onProcessAll, onApproveGold, onSendGoldKb,
}: {
  b: BatchStats;
  busy: boolean;
  onExtract: () => void;
  onOcr: () => void;
  onClassify: () => void;
  onAnalyze: () => void;
  onProcessAll: () => void;
  onApproveGold: () => void;
  onSendGoldKb: () => void;
}) {
  const title = b.title || b.archive_name || b.id;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <div className="text-xs text-muted-foreground font-mono">{b.id}</div>
            <div className="text-xs text-muted-foreground">
              Загружено: {new Date(b.created_at).toLocaleString("ru-RU")}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">Файлов: {b.total}</Badge>
            {b.gold > 0 && <Badge className="bg-amber-500/20 text-amber-700">Gold {b.gold}</Badge>}
            {b.silver > 0 && <Badge className="bg-zinc-300/40 text-zinc-800">Silver {b.silver}</Badge>}
            {b.bronze > 0 && <Badge className="bg-orange-500/20 text-orange-700">Bronze {b.bronze}</Badge>}
            {b.private_count > 0 && <Badge variant="destructive">Private {b.private_count}</Badge>}
            {b.rag_ready > 0 && <Badge className="bg-emerald-500/20 text-emerald-700">RAG {b.rag_ready}</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <Stat label="Текст" value={`${b.with_content} / ${b.total}`} />
          <Stat label="OCR required" value={b.ocr_required} />
          <Stat label="OCR failed" value={b.ocr_failed} />
          <Stat label="Классификация" value={`${b.classified} / ${b.total}`} />
          <Stat label="AI Экспертиза" value={`${b.ai_analysis_completed} / ${b.total}`} />
          <Stat label="Reject" value={b.reject} />
          <Stat label="Technical" value={b.technical} />
          <Stat label="RAG Ready" value={b.rag_ready} />
          <Stat label="Approved" value={b.approved} />
          <Stat label="Sent to KB" value={b.sent_to_kb} />
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" variant="outline" disabled={busy} onClick={onExtract}>
            <FileText className="size-4 mr-1" /> Извлечь текст
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onOcr}>
            <Eye className="size-4 mr-1" /> OCR сканов
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onClassify}>
            <Wand2 className="size-4 mr-1" /> AI классификация
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onAnalyze}>
            <Sparkles className="size-4 mr-1" /> AI Экспертиза
          </Button>
          <Button size="sm" variant="outline" disabled={busy || b.gold === 0} onClick={onApproveGold}>
            <ShieldCheck className="size-4 mr-1" /> Одобрить Gold
          </Button>
          <Button size="sm" variant="outline" disabled={busy || b.gold === 0} onClick={onSendGoldKb}>
            <Send className="size-4 mr-1" /> Отправить Gold в KB
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onOcr} title="Повторить OCR">
            <Eye className="size-4 mr-1" /> Повторить OCR
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onClassify} title="Повторить AI классификацию">
            <Wand2 className="size-4 mr-1" /> Повторить классиф.
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onAnalyze} title="Повторить AI Экспертизу">
            <Sparkles className="size-4 mr-1" /> Повторить Экспертизу
          </Button>
          <Button size="sm" disabled={busy} onClick={onProcessAll}>
            <Layers className="size-4 mr-1" /> Обработать полностью
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}



function PracticePage() {
  const list = useServerFn(archivePracticeList);
  const stats = useServerFn(archivePracticeStats);
  const batches = useServerFn(archiveBatchesList);
  const delFn = useServerFn(archiveDelete);
  const approveStyle = useServerFn(archiveApproveStyle);
  const makeTemplate = useServerFn(archiveMakeTemplate);
  const addToMatter = useServerFn(archiveAddToMatter);
  const approveTraining = useServerFn(archiveApproveTraining);
  const classifyFn = useServerFn(archiveClassify);
  const classifyBatchFn = useServerFn(archiveClassifyBatchByContent);
  const normalizeAreasFn = useServerFn(archiveNormalizePracticeAreas);
  const sendToKbFn = useServerFn(archiveSendToKbQueue);
  const getTextFn = useServerFn(archiveGetExtractedText);
  const extractTextFn = useServerFn(archiveExtractTextBatch);
  const ocrBatchFn = useServerFn(archiveOcrBatch);
  const processFullyFn = useServerFn(archiveProcessBatchFully);
  const aiAnalyzeFn = useServerFn(archiveAiAnalyzeBatch);
  const getAnalysisFn = useServerFn(archiveGetAiAnalysis);
  const mList = useServerFn(matterList);
  const [aiBusy, setAiBusy] = useState(false);

  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [tab, setTab] = useState("directions");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [familyFilter, setFamilyFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [anonTarget, setAnonTarget] = useState<ArchiveItem | null>(null);
  const [statsMap, setStatsMap] = useState<Record<string, { total: number; gold: number; templates: number; unclassified: number; pending_approval: number }>>({});
  const [batchRows, setBatchRows] = useState<BatchStats[]>([]);
  const approveGoldFn = useServerFn(archiveApproveBatchGold);
  const sendGoldKbFn = useServerFn(archiveSendBatchGoldToKb);
  const [analyzeMode, setAnalyzeMode] = useState<null | "selected" | "unprocessed" | "all">(null);
  const [analyzeBatchId, setAnalyzeBatchId] = useState<string | null>(null);

  const [matters, setMatters] = useState<{ id: string; title: string | null; matter_number: string | null }[]>([]);
  const [attachOpen, setAttachOpen] = useState<ArchiveItem | null>(null);
  const [attachMatterId, setAttachMatterId] = useState("");
  const [classifyTarget, setClassifyTarget] = useState<ArchiveItem | null>(null);
  const [kbTarget, setKbTarget] = useState<ArchiveItem | null>(null);
  const [textTarget, setTextTarget] = useState<{ title: string; extracted_text: string; redacted_text: string | null } | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<{ title: string; analysis: any } | null>(null);

  const baseFilter = useMemo(() => {
    const f: Record<string, any> = {};
    if (areaFilter) f.practice_area = areaFilter;
    if (familyFilter) f.document_family = familyFilter;
    if (roleFilter) f.document_role = roleFilter;
    if (search) f.search = search;
    return f;
  }, [areaFilter, familyFilter, roleFilter, search]);

  const reload = useCallback(async () => {
    try {
      const extra: Record<string, any> = { ...baseFilter };
      if (tab === "best") {
        // server doesn't support OR for role; fetch broadly then filter client-side
      } else if (tab === "templates") {
        extra.item_type = "template";
      } else if (tab === "archive") {
        // all
      }
      const [{ rows }, s] = await Promise.all([
        list({ data: extra }),
        stats({}),
      ]);
      setItems(rows as ArchiveItem[]);
      setStatsMap((s as any).stats ?? {});
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось загрузить");
    }
  }, [list, stats, baseFilter, tab]);

  useEffect(() => {
    reload();
  }, [reload]);

  const reloadBatches = useCallback(() => {
    batches({}).then((r: any) => setBatchRows(r.batches ?? [])).catch(() => {});
  }, [batches]);

  useEffect(() => {
    if (tab === "uploads") reloadBatches();
  }, [tab, reloadBatches]);


  useEffect(() => {
    mList({ data: { limit: 200 } })
      .then((r: any) => setMatters(r.rows ?? []))
      .catch(() => {});
  }, [mList]);

  const filteredForTab = useMemo(() => {
    if (tab === "best") {
      return items.filter((it) => {
        const role = it.metadata?.document_role;
        return role === "gold_reference" || role === "silver_reference" || role === "template_candidate";
      });
    }
    return items;
  }, [items, tab]);

  async function handleOpen(it: ArchiveItem) {
    if (!it.storage_path) return;
    const { data, error } = await supabase.storage.from("lead-documents").createSignedUrl(it.storage_path, 600);
    if (error || !data) {
      toast.error("Не удалось открыть файл");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить элемент архива?")) return;
    try {
      await delFn({ data: { id } });
      toast.success("Удалено");
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка");
    }
  }

  async function handleApproveStyle(id: string) {
    try {
      await approveStyle({ data: { id } });
      toast.success("Разрешено использовать как стиль");
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка");
    }
  }

  async function handleMakeTemplate(id: string) {
    try {
      await makeTemplate({ data: { id } });
      toast.success("Помечено как шаблон");
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка");
    }
  }

  async function handleAttach() {
    if (!attachOpen || !attachMatterId) return;
    try {
      await addToMatter({ data: { id: attachOpen.id, matter_id: attachMatterId } });
      toast.success("Привязано к делу");
      setAttachOpen(null);
      setAttachMatterId("");
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка");
    }
  }

  async function runAiClassify(args: { batch_id?: string; only_pending?: boolean }) {
    if (aiBusy) return;
    setAiBusy(true);
    const tid = toast.loading("AI классифицирует документы…");
    try {
      const r: any = await classifyBatchFn({ data: { ...args, limit: 30 } });
      toast.dismiss(tid);
      const errMsg = r.errors?.length ? ` · ошибок: ${r.errors.length}` : "";
      toast.success(
        `Классифицировано: ${r.classified_count} · осталось: ${r.pending_count} · сбоев: ${r.failed_count}${errMsg}`,
      );
      if (r.errors?.length) {
        console.warn("[archiveClassifyBatchByContent] errors", r.errors);
      }
      reload();
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e?.message ?? "Ошибка AI-классификации");
    } finally {
      setAiBusy(false);
    }
  }

  async function runExtractText(args: { batch_id?: string; only_pending?: boolean }) {
    if (aiBusy) return;
    setAiBusy(true);
    const tid = toast.loading("Извлечение текста…");
    try {
      const totals = { completed: 0, ocr_required: 0, technical: 0, nested: 0, failed: 0, processed: 0 };
      const loop = Boolean(args.only_pending || args.batch_id);
      const maxIters = loop ? 200 : 1;
      for (let i = 0; i < maxIters; i++) {
        const r: any = await extractTextFn({ data: { ...args, limit: 100 } });
        totals.completed += r.completed ?? 0;
        totals.ocr_required += r.ocr_required ?? 0;
        totals.technical += r.technical ?? 0;
        totals.nested += r.nested ?? 0;
        totals.failed += r.failed ?? 0;
        totals.processed += r.processed ?? 0;
        if (r.errors?.length) console.warn("[archiveExtractTextBatch] errors", r.errors);
        toast.loading(
          `Извлечение… обработано ${totals.processed} · готово ${totals.completed} · OCR ${totals.ocr_required} · технич ${totals.technical} · архивов ${totals.nested} · ошибок ${totals.failed}`,
          { id: tid },
        );
        if (!loop || (r.processed ?? 0) === 0) break;
      }
      toast.dismiss(tid);
      toast.success(
        `Готово: ${totals.completed} · OCR нужен: ${totals.ocr_required} · технич.: ${totals.technical} · вложенные архивы: ${totals.nested} · ошибок: ${totals.failed}`,
      );
      reload();
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e?.message ?? "Ошибка извлечения текста");
    } finally {
      setAiBusy(false);
    }
  }

  async function runOcr(args: { batch_id?: string }) {
    if (aiBusy) return;
    setAiBusy(true);
    const tid = toast.loading("OCR сканов…");
    const totals = { processed: 0, completed: 0, failed: 0, remaining: 0 };
    try {
      for (let i = 0; i < 500; i++) {
        const r: any = await ocrBatchFn({ data: { ...args, limit: 10 } });
        totals.processed += r.processed ?? 0;
        totals.completed += r.ocr_completed ?? r.completed ?? 0;
        totals.failed += r.ocr_failed ?? r.failed ?? 0;
        totals.remaining = r.remaining_ocr_required ?? 0;
        toast.loading(
          `OCR… обработано ${totals.processed} · готово ${totals.completed} · сбоев ${totals.failed} · осталось ${totals.remaining}`,
          { id: tid },
        );
        if (r.errors?.length) console.warn("[archiveOcrBatch] errors", r.errors);
        if ((r.processed ?? 0) === 0 || totals.remaining === 0) break;
      }
      toast.dismiss(tid);
      toast.success(
        `OCR: готово ${totals.completed} · сбоев ${totals.failed} · осталось ${totals.remaining}`,
      );
      reload();
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e?.message ?? "Ошибка OCR");
    } finally {
      setAiBusy(false);
    }
  }

  async function runProcessFully(args: { batch_id?: string }) {
    if (aiBusy) return;
    setAiBusy(true);
    const tid = toast.loading("Обработка партии: текст → OCR → классификация…");
    try {
      const r: any = await processFullyFn({ data: { ...args, limit: 100 } });
      toast.dismiss(tid);
      toast.success(
        `Извлечено: ${r.extract.completed} · OCR: ${r.ocr.completed} · классифицировано: ${r.classify.classified}`,
      );
      reload();
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e?.message ?? "Ошибка полной обработки");
    } finally {
      setAiBusy(false);
    }
  }

  async function runAiAnalyze(args: { batch_id?: string }) {
    if (aiBusy) return;
    setAiBusy(true);
    const tid = toast.loading("AI Анализ практики…");
    const totals = { processed: 0, analyzed: 0, skipped: 0, failed: 0, remaining: 0 };
    try {
      for (let i = 0; i < 500; i++) {
        const r: any = await aiAnalyzeFn({ data: { ...args, only_pending: true, limit: 8 } });
        totals.processed += r.processed ?? 0;
        totals.analyzed += r.analyzed ?? 0;
        totals.skipped += r.skipped ?? 0;
        totals.failed += r.failed ?? 0;
        totals.remaining = r.remaining ?? 0;
        toast.loading(
          `AI Анализ… обработано ${totals.processed} · проанализировано ${totals.analyzed} · без текста ${totals.skipped} · сбоев ${totals.failed} · осталось ${totals.remaining}`,
          { id: tid },
        );
        if (r.errors?.length) console.warn("[archiveAiAnalyzeBatch] errors", r.errors);
        if ((r.processed ?? 0) === 0 || totals.remaining === 0) break;
      }
      toast.dismiss(tid);
      toast.success(
        `AI Анализ готов: ${totals.analyzed} · без текста: ${totals.skipped} · сбоев: ${totals.failed} · осталось: ${totals.remaining}`,
      );
      reload();
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e?.message ?? "Ошибка AI Анализа");
    } finally {
      setAiBusy(false);
    }
  }

  async function runNormalizeAreas() {
    if (aiBusy) return;
    if (!confirm("Распределить архив по направлениям без AI? Будут переписаны только category и metadata.practice_area.")) return;
    setAiBusy(true);
    const tid = toast.loading("Распределение архива…");
    try {
      const r: any = await normalizeAreasFn({});
      toast.dismiss(tid);
      toast.success(`Архив распределён: ${r.updated} документов обновлено (просмотрено ${r.scanned})`);
      reload();
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e?.message ?? "Ошибка распределения");
    } finally {
      setAiBusy(false);
    }
  }

  async function runClassifyUnclassifiedBatches() {
  if (aiBusy) return;

  if (
    !confirm(
      "Запустить AI-классификацию неразобранных документов батчами по 25? Это потребляет AI-кредиты.",
    )
  ) {
    return;
  }

  setAiBusy(true);

  const tid = toast.loading("AI классификация неразобранных…");

  const totals = {
    processed: 0,
    classified: 0,
    failed: 0,
    remaining: 0,
    iterations: 0,
  };

  try {
    const maxIterations = 100;

    for (let i = 0; i < maxIterations; i++) {
      const r: any = await classifyBatchFn({
        data: {
          only_pending: true,
          limit: 25,
        },
      });

      const processed = r.processed ?? 0;
      const classified = r.classified ?? r.classified_count ?? 0;
      const failed = r.failed ?? r.failed_count ?? 0;
      const remaining = r.remaining_pending ?? r.pending_count ?? 0;

      totals.processed += processed;
      totals.classified += classified;
      totals.failed += failed;
      totals.remaining = remaining;
      totals.iterations += 1;

      if (r.errors?.length) {
        console.warn("[archiveClassifyBatchByContent] errors", r.errors);
      }

      toast.loading(
        `AI классификация: батч ${totals.iterations} · обработано ${totals.processed} · classified ${totals.classified} · failed ${totals.failed} · осталось ${totals.remaining}`,
        { id: tid },
      );

      reload();

      if (processed === 0) {
        toast.warning("AI классификация остановлена: нет документов для обработки.");
        break;
      }

      if (remaining === 0) {
        break;
      }
    }

    toast.dismiss(tid);

    toast.success(
      `AI классификация завершена: classified ${totals.classified}, failed ${totals.failed}, осталось ${totals.remaining}`,
    );

    reload();
  } catch (e: any) {
    toast.dismiss(tid);
    toast.error(e?.message ?? "Ошибка AI-классификации");
  } finally {
    setAiBusy(false);
  }
}
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display">Практика Екатерины</h1>
          <p className="text-sm text-muted-foreground">
            Рабочий архив документов. Не используется в правовых заключениях без явного одобрения.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={aiBusy} onClick={() => runExtractText({ only_pending: true })}>
            <FileText className="size-4 mr-1" /> Извлечь текст
          </Button>
          <Button variant="outline" disabled={aiBusy} onClick={() => runOcr({})}>
            <Eye className="size-4 mr-1" /> OCR для сканов
          </Button>
          <Button variant="outline" disabled={aiBusy} onClick={runNormalizeAreas} title="Без AI: переписать category и practice_area по детерминированным правилам">
            <Tags className="size-4 mr-1" /> Распределить архив
          </Button>
          <Button variant="outline" disabled={aiBusy} onClick={runClassifyUnclassifiedBatches} title="AI: батчи по 25 для документов без practice_area / не classified">
            <Wand2 className="size-4 mr-1" /> AI классифицировать неразобранные
          </Button>
          <Button variant="outline" disabled={aiBusy} onClick={() => runAiClassify({ only_pending: true })}>
            <Wand2 className="size-4 mr-1" /> AI классифицировать
          </Button>
          <Button
            disabled={aiBusy}
            onClick={() => {
              setAnalyzeBatchId(batchRows[0]?.id ?? null);
              setAnalyzeMode("selected");
            }}
          >
            <Sparkles className="size-4 mr-1" /> AI Экспертиза документов

          </Button>
          <ZipUploadDialog onUploaded={() => { reload(); setTab("uploads"); reloadBatches(); }} />
        </div>
      </div>


      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="directions"><Layers className="size-4 mr-1" /> Направления</TabsTrigger>
          <TabsTrigger value="best"><Star className="size-4 mr-1" /> Лучшие документы</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="size-4 mr-1" /> Шаблоны</TabsTrigger>
          <TabsTrigger value="archive"><Briefcase className="size-4 mr-1" /> Архив</TabsTrigger>
          <TabsTrigger value="uploads"><FolderArchive className="size-4 mr-1" /> Загрузки ZIP</TabsTrigger>
        </TabsList>

        <TabsContent value="directions" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRACTICE_AREAS.map((a) => {
              const s = statsMap[a.v] ?? { total: 0, gold: 0, templates: 0, unclassified: 0, pending_approval: 0 };
              return (
                <Card key={a.v} className="cursor-pointer hover:bg-accent/40" onClick={() => { setAreaFilter(a.v); setTab("archive"); }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{a.l}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1 text-muted-foreground">
                    <div>Всего: <span className="text-foreground font-medium">{s.total}</span></div>
                    <div>Gold: {s.gold} · Шаблоны: {s.templates}</div>
                    <div>Неразобранные: {s.unclassified}</div>
                    <div>Ожидают одобрения: {s.pending_approval}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {(["best", "templates", "archive"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Поиск по названию…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Select value={areaFilter || "__all"} onValueChange={(v) => setAreaFilter(v === "__all" ? "" : v)}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Направление" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Все направления</SelectItem>
                  {PRACTICE_AREAS.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={familyFilter || "__all"} onValueChange={(v) => setFamilyFilter(v === "__all" ? "" : v)}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Тип документа" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Все типы</SelectItem>
                  {DOC_FAMILIES.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={roleFilter || "__all"} onValueChange={(v) => setRoleFilter(v === "__all" ? "" : v)}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Качество" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Любое</SelectItem>
                  {DOC_ROLES.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Тип файла</TableHead>
                      <TableHead>Направление</TableHead>
                      <TableHead>Тип документа</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredForTab.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Нет документов</TableCell></TableRow>
                    )}
                    {filteredForTab.map((it) => {
                      const md = it.metadata ?? {};
                      const role = DOC_ROLES.find((r) => r.v === md.document_role);
                      const useGen = md.use_in_generation === true;
                      return (
                        <TableRow key={it.id}>
                          <TableCell className="max-w-[280px] truncate" title={it.title}>{it.title}</TableCell>
                          <TableCell className="text-xs uppercase">{md.file_extension || "—"}</TableCell>
                          <TableCell className="text-xs">{areaLabel(md.practice_area)}</TableCell>
                          <TableCell className="text-xs">{familyLabel(md.document_family)}</TableCell>
                          <TableCell className="text-xs space-x-1">
                            {md.quality_tier === "gold" && <Badge className="bg-amber-100 text-amber-900" variant="secondary">Gold</Badge>}
                            {md.quality_tier === "silver" && <Badge className="bg-slate-200 text-slate-900" variant="secondary">Silver</Badge>}
                            {md.quality_tier === "bronze" && <Badge className="bg-orange-100 text-orange-900" variant="secondary">Bronze</Badge>}
                            {md.document_role === "private_do_not_index" && <Badge className="bg-red-100 text-red-900" variant="secondary">Private</Badge>}
                            {md.document_role === "technical" && <Badge variant="outline">Technical</Badge>}
                            {md.use_in_rag === true && <Badge className="bg-emerald-100 text-emerald-900" variant="secondary">RAG Ready</Badge>}
                            {md.requires_redaction === true && <Badge className="bg-rose-100 text-rose-900" variant="secondary">Needs Redaction</Badge>}
                            {role && !md.quality_tier && <Badge className={role.tone} variant="secondary">{role.l}</Badge>}
                            {it.item_type === "template" && <Badge variant="outline">Шаблон</Badge>}
                            {md.is_anonymized && (
                              <Badge className="bg-purple-100 text-purple-900" variant="secondary">
                                Обезличено{md.anonymization_mode ? ` · ${md.anonymization_mode}` : ""}
                              </Badge>
                            )}
                            {md.anonymization_status === "needs_review" && (
                              <Badge className="bg-amber-100 text-amber-900" variant="secondary">Требует проверки</Badge>
                            )}
                            {useGen && <Badge className="bg-green-100 text-green-900" variant="secondary">Для генерации</Badge>}
                            {md.can_use_for_training && (
                              <Badge className="bg-blue-100 text-blue-900" variant="secondary">Для обучения</Badge>
                            )}
                            {md.ai_analysis_status === "analyzed" && typeof md.quality_score === "number" && (
                              <span className="text-[10px] text-muted-foreground">· score {md.quality_score}</span>
                            )}
                            {md.classification_status === "pending" && <Badge variant="outline">Не классифицирован</Badge>}
                          </TableCell>

                          <TableCell className="text-right space-x-1 whitespace-nowrap">
                            <Button size="sm" variant="ghost" onClick={() => handleOpen(it)} title="Открыть">
                              <ExternalLink className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setAttachOpen(it); setAttachMatterId(""); }} title="Привязать к делу">
                              <Link2 className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setAnonTarget(it)} title="Обезличить">
                              <Eraser className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleMakeTemplate(it.id)} title="Сделать шаблоном">
                              <Wand2 className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleApproveStyle(it.id)} title="Разрешить как стиль">
                              <ShieldCheck className="size-4" />
                            </Button>
                            {md.is_anonymized && !md.can_use_for_training && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Разрешить использовать как стиль/шаблон (для обучения)"
                                onClick={async () => {
                                  try {
                                    await approveTraining({ data: { id: it.id } });
                                    toast.success("Разрешено для обучения");
                                    reload();
                                  } catch (e: any) {
                                    toast.error(e?.message ?? "Ошибка");
                                  }
                                }}
                              >
                                <GraduationCap className="size-4" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" title="Посмотреть текст" onClick={async () => {
                              try {
                                const r: any = await getTextFn({ data: { id: it.id } });
                                setTextTarget({ title: r.title, extracted_text: r.extracted_text || "", redacted_text: r.redacted_text });
                              } catch (e: any) { toast.error(e?.message ?? "Ошибка"); }
                            }}>
                              <Eye className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" title="AI Анализ" onClick={async () => {
                              try {
                                const r: any = await getAnalysisFn({ data: { id: it.id } });
                                setAnalysisTarget({ title: r.title, analysis: r.analysis });
                              } catch (e: any) { toast.error(e?.message ?? "Ошибка"); }
                            }}>
                              <Sparkles className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Классифицировать" onClick={() => setClassifyTarget(it)}>
                              <Tags className="size-4" />
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              title={md.kb_queue_id ? "Уже отправлено в очередь KB" : "Отправить в KB (очередь)"}
                              disabled={!!md.kb_queue_id}
                              onClick={() => setKbTarget(it)}
                            >
                              <Send className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(it.id)} title="Удалить">
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>

                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="uploads" className="mt-4 space-y-3">
          {batchRows.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-10 rounded-md border border-dashed">
              Пока нет загруженных партий
            </div>
          )}
          {batchRows.map((b) => (
            <BatchCard
              key={b.id}
              b={b}
              busy={aiBusy}
              onExtract={() => runExtractText({ batch_id: b.id })}
              onOcr={() => runOcr({ batch_id: b.id })}
              onClassify={() => runAiClassify({ batch_id: b.id })}
              onAnalyze={() => runAiAnalyze({ batch_id: b.id })}
              onProcessAll={() => runProcessFully({ batch_id: b.id })}
              onApproveGold={async () => {
                if (!confirm(`Одобрить все Gold (${b.gold}) в партии «${b.title ?? b.id}»?`)) return;
                try {
                  setAiBusy(true);
                  const r: any = await approveGoldFn({ data: { batch_id: b.id } });
                  toast.success(`Gold одобрено: ${r.approved}/${r.gold_total}`);
                  reloadBatches();
                } catch (e: any) {
                  toast.error(e?.message ?? "Ошибка");
                } finally { setAiBusy(false); }
              }}
              onSendGoldKb={async () => {
                if (!confirm(`Отправить Gold (${b.gold}) в Knowledge Base?`)) return;
                try {
                  setAiBusy(true);
                  const r: any = await sendGoldKbFn({ data: { batch_id: b.id } });
                  toast.success(`Отправлено в KB: ${r.queued}, пропущено: ${r.skipped}`);
                  reloadBatches();
                } catch (e: any) {
                  toast.error(e?.message ?? "Ошибка");
                } finally { setAiBusy(false); }
              }}
            />
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!analyzeMode} onOpenChange={(o) => { if (!o) setAnalyzeMode(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>AI Экспертиза документов — выбор режима</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="amode" checked={analyzeMode === "selected"} onChange={() => setAnalyzeMode("selected")} />
                <span>
                  <b>Выбранная партия</b>
                  <div className="text-xs text-muted-foreground">Только документы выбранного ZIP-архива</div>
                </span>
              </label>
              {analyzeMode === "selected" && (
                <Select value={analyzeBatchId ?? ""} onValueChange={(v) => setAnalyzeBatchId(v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Выберите партию" /></SelectTrigger>
                  <SelectContent>
                    {batchRows.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {(b.title || b.archive_name || b.id).slice(0, 60)} — {b.total} файл.
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="amode" checked={analyzeMode === "unprocessed"} onChange={() => setAnalyzeMode("unprocessed")} />
                <span>
                  <b>Все необработанные документы</b>
                  <div className="text-xs text-muted-foreground">По всему архиву — только те, что без AI Экспертизы</div>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="amode" checked={analyzeMode === "all"} onChange={() => setAnalyzeMode("all")} />
                <span>
                  <b>Весь архив</b>
                  <div className="text-xs text-muted-foreground">Перепроанализировать все документы</div>
                </span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAnalyzeMode(null)}>Отмена</Button>
            <Button
              disabled={aiBusy || (analyzeMode === "selected" && !analyzeBatchId)}
              onClick={async () => {
                const m = analyzeMode;
                setAnalyzeMode(null);
                if (m === "selected" && analyzeBatchId) await runAiAnalyze({ batch_id: analyzeBatchId });
                else if (m === "unprocessed") await runAiAnalyze({});
                else if (m === "all") await runAiAnalyze({});
                reloadBatches();
              }}
            >
              <Sparkles className="size-4 mr-1" /> Запустить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={!!attachOpen} onOpenChange={(o) => { if (!o) setAttachOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Привязать к делу</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{attachOpen?.title}</p>
            <Select value={attachMatterId} onValueChange={setAttachMatterId}>
              <SelectTrigger><SelectValue placeholder="Выберите дело" /></SelectTrigger>
              <SelectContent>
                {matters.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.matter_number ? `${m.matter_number} — ` : ""}{m.title ?? "Без названия"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Будет создана копия в Documents с upload_source = lawyer_archive.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAttachOpen(null)}>Отмена</Button>
            <Button onClick={handleAttach} disabled={!attachMatterId}>
              <Link to="/workspace/matters" className="hidden" />
              Привязать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClassifyDialog
        item={classifyTarget}
        onClose={() => setClassifyTarget(null)}
        onSaved={() => { setClassifyTarget(null); reload(); }}
        save={async (patch) => {
          if (!classifyTarget) return;
          await classifyFn({ data: { id: classifyTarget.id, ...patch } });
          toast.success("Классификация сохранена");
        }}
      />

      <SendToKbDialog
        item={kbTarget}
        onClose={() => setKbTarget(null)}
        onSent={() => { setKbTarget(null); reload(); }}
        send={async (payload) => {
          if (!kbTarget) return;
          await sendToKbFn({ data: { archive_item_id: kbTarget.id, ...payload } });
          toast.success("Отправлено в очередь импорта KB");
        }}
      />

      <Dialog open={!!textTarget} onOpenChange={(o) => { if (!o) setTextTarget(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{textTarget?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-auto">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Извлечённый текст</div>
              <pre className="text-xs whitespace-pre-wrap bg-muted/40 p-3 rounded">{textTarget?.extracted_text || "(текст не извлечён)"}</pre>
            </div>
            {textTarget?.redacted_text && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Обезличенный текст</div>
                <pre className="text-xs whitespace-pre-wrap bg-muted/40 p-3 rounded">{textTarget.redacted_text}</pre>
              </div>
            )}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setTextTarget(null)}>Закрыть</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!analysisTarget} onOpenChange={(o) => { if (!o) setAnalysisTarget(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>AI Анализ · {analysisTarget?.title}</DialogTitle></DialogHeader>
          {analysisTarget && (() => {
            const a = analysisTarget.analysis;
            if (!a || a.status !== "analyzed") {
              return (
                <div className="text-sm text-muted-foreground py-4">
                  Документ ещё не проанализирован{a?.status ? ` (статус: ${a.status})` : ""}.
                  Запустите «AI Анализ практики».
                </div>
              );
            }
            return (
              <div className="space-y-3 max-h-[65vh] overflow-auto text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {a.quality_tier === "gold" && <Badge className="bg-amber-100 text-amber-900" variant="secondary">Gold</Badge>}
                  {a.quality_tier === "silver" && <Badge className="bg-slate-200 text-slate-900" variant="secondary">Silver</Badge>}
                  {a.quality_tier === "bronze" && <Badge className="bg-orange-100 text-orange-900" variant="secondary">Bronze</Badge>}
                  {a.quality_tier === "reject" && <Badge className="bg-red-100 text-red-900" variant="secondary">Не использовать</Badge>}
                  {a.use_in_rag && <Badge className="bg-emerald-100 text-emerald-900" variant="secondary">RAG Ready</Badge>}
                  {a.use_in_generation && <Badge className="bg-green-100 text-green-900" variant="secondary">Для генерации</Badge>}
                  {a.gold_candidate && <Badge className="bg-amber-200 text-amber-900" variant="secondary">Gold candidate</Badge>}
                  {a.requires_redaction && <Badge className="bg-rose-100 text-rose-900" variant="secondary">Needs Redaction</Badge>}
                  {a.contains_passport_data && <Badge className="bg-red-100 text-red-900" variant="secondary">Паспорт</Badge>}
                  {a.contains_bank_data && <Badge className="bg-red-100 text-red-900" variant="secondary">Банк</Badge>}
                  {a.document_role === "private_do_not_index" && <Badge className="bg-red-100 text-red-900" variant="secondary">Private</Badge>}
                  {a.document_role === "technical" && <Badge variant="outline">Technical</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Quality score:</span> <b>{a.quality_score ?? "—"}</b></div>
                  <div><span className="text-muted-foreground">Document role:</span> {a.document_role ?? "—"}</div>
                  <div><span className="text-muted-foreground">Practice area:</span> {areaLabel(a.practice_area)}</div>
                  <div><span className="text-muted-foreground">RAG title:</span> {a.rag_title ?? "—"}</div>
                </div>
                {a.short_summary && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">AI Summary</div>
                    <p className="text-sm bg-muted/40 p-3 rounded">{a.short_summary}</p>
                  </div>
                )}
                {Array.isArray(a.legal_topics) && a.legal_topics.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Юридические темы</div>
                    <div className="flex flex-wrap gap-1">
                      {a.legal_topics.map((t: string, i: number) => <Badge key={i} variant="outline" className="text-xs">{t}</Badge>)}
                    </div>
                  </div>
                )}
                {Array.isArray(a.key_facts) && a.key_facts.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Ключевые факты</div>
                    <ul className="list-disc pl-5 space-y-0.5 text-sm">
                      {a.key_facts.map((f: string, i: number) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}
                {Array.isArray(a.key_risks) && a.key_risks.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Ключевые риски</div>
                    <ul className="list-disc pl-5 space-y-0.5 text-sm">
                      {a.key_risks.map((f: string, i: number) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}
                {a.court && (a.court.court_document_type || a.court.dispute_subject) && (
                  <div className="border-t pt-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Судебная практика</div>
                    <div className="text-xs grid grid-cols-2 gap-1">
                      <div>Тип: {a.court.court_document_type ?? "—"}</div>
                      <div>Стадия: {a.court.procedural_stage ?? "—"}</div>
                      <div className="col-span-2">Предмет: {a.court.dispute_subject ?? "—"}</div>
                      <div className="col-span-2">Итог: {a.court.outcome ?? "—"}</div>
                    </div>
                    {Array.isArray(a.court.winning_arguments) && a.court.winning_arguments.length > 0 && (
                      <div className="mt-1 text-xs"><b>Выигрышные:</b> {a.court.winning_arguments.join("; ")}</div>
                    )}
                    {Array.isArray(a.court.losing_arguments) && a.court.losing_arguments.length > 0 && (
                      <div className="mt-1 text-xs"><b>Проигрышные:</b> {a.court.losing_arguments.join("; ")}</div>
                    )}
                  </div>
                )}
                {a.contract && (a.contract.contract_type || a.contract.subject) && (
                  <div className="border-t pt-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Договор</div>
                    <div className="text-xs grid grid-cols-2 gap-1">
                      <div>Тип: {a.contract.contract_type ?? "—"}</div>
                      <div>Шаблон-готов: {a.contract.template_ready ? "да" : "нет"}</div>
                      <div className="col-span-2">Предмет: {a.contract.subject ?? "—"}</div>
                    </div>
                    {Array.isArray(a.contract.critical_risks) && a.contract.critical_risks.length > 0 && (
                      <div className="mt-1 text-xs"><b>Критические риски:</b> {a.contract.critical_risks.join("; ")}</div>
                    )}
                    {Array.isArray(a.contract.strong_clauses) && a.contract.strong_clauses.length > 0 && (
                      <div className="mt-1 text-xs"><b>Сильные формулировки:</b> {a.contract.strong_clauses.join("; ")}</div>
                    )}
                  </div>
                )}
                {a.real_estate && (a.real_estate.object_type || a.real_estate.deal_type) && (
                  <div className="border-t pt-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Недвижимость</div>
                    <div className="text-xs grid grid-cols-2 gap-1">
                      <div>Объект: {a.real_estate.object_type ?? "—"}</div>
                      <div>Сделка: {a.real_estate.deal_type ?? "—"}</div>
                    </div>
                    {Array.isArray(a.real_estate.main_risks) && a.real_estate.main_risks.length > 0 && (
                      <div className="mt-1 text-xs"><b>Риски:</b> {a.real_estate.main_risks.join("; ")}</div>
                    )}
                    {Array.isArray(a.real_estate.recommendations) && a.real_estate.recommendations.length > 0 && (
                      <div className="mt-1 text-xs"><b>Рекомендации:</b> {a.real_estate.recommendations.join("; ")}</div>
                    )}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground pt-2 border-t">
                  Версия анализа: {a.version ?? "—"} · {a.at ? new Date(a.at).toLocaleString("ru-RU") : ""}
                </div>
              </div>
            );
          })()}
          <DialogFooter><Button variant="ghost" onClick={() => setAnalysisTarget(null)}>Закрыть</Button></DialogFooter>
        </DialogContent>
      </Dialog>


      <AnonymizeDialog
        open={!!anonTarget}
        onOpenChange={(o) => { if (!o) setAnonTarget(null); }}
        item={anonTarget}
        onCreated={reload}
      />
    </div>
  );
}

const KB_CATEGORIES = ["tax", "real_estate", "contracts", "court", "corporate", "compliance"];
const KB_SOURCE_TYPES: { v: "ekaterina_practice" | "template" | "memo"; l: string }[] = [
  { v: "ekaterina_practice", l: "Практика Екатерины" },
  { v: "template", l: "Шаблон" },
  { v: "memo", l: "Методология / памятка" },
];
const KB_DOCUMENT_TYPES = [
  "legal_analysis", "legal_position", "contract_example", "contract_template",
  "lease_agreement", "addendum", "act", "claim", "response_to_claim",
  "termination_letter", "notice", "complaint", "objections",
  "court_document", "court_decision", "due_diligence", "checklist", "memo", "other",
];

function ClassifyDialog({
  item, onClose, onSaved, save,
}: {
  item: ArchiveItem | null;
  onClose: () => void;
  onSaved: () => void;
  save: (patch: { practice_area?: string; document_family?: string; category?: string; subcategory?: string; document_type?: string; document_role?: string }) => Promise<void>;
}) {
  const [practiceArea, setPracticeArea] = useState("");
  const [docFamily, setDocFamily] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [docType, setDocType] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    const md = (item.metadata ?? {}) as any;
    setPracticeArea(md.practice_area ?? "");
    setDocFamily(md.document_family ?? "");
    setCategory(item.category ?? md.category ?? "");
    setSubcategory(md.subcategory ?? "");
    setDocType(md.document_type ?? "");
    setRole(md.document_role ?? "");
  }, [item]);

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Классификация документа</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground truncate">{item?.title}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Направление практики</Label>
              <Select value={practiceArea || "__none"} onValueChange={(v) => setPracticeArea(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {PRACTICE_AREAS.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Семейство документа</Label>
              <Select value={docFamily || "__none"} onValueChange={(v) => setDocFamily(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {DOC_FAMILIES.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Категория KB</Label>
              <Select value={category || "__none"} onValueChange={(v) => setCategory(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {KB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Подкатегория</Label>
              <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="например, lease_disputes" />
            </div>
            <div>
              <Label className="text-xs">Тип документа</Label>
              <Select value={docType || "__none"} onValueChange={(v) => setDocType(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {KB_DOCUMENT_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Качество</Label>
              <Select value={role || "__none"} onValueChange={(v) => setRole(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {DOC_ROLES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await save({
                  practice_area: practiceArea || undefined,
                  document_family: docFamily || undefined,
                  category: category || undefined,
                  subcategory: subcategory || undefined,
                  document_type: docType || undefined,
                  document_role: role || undefined,
                });
                onSaved();
              } catch (e: any) {
                toast.error(e?.message ?? "Ошибка");
              } finally {
                setSaving(false);
              }
            }}
          >Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendToKbDialog({
  item, onClose, onSent, send,
}: {
  item: ArchiveItem | null;
  onClose: () => void;
  onSent: () => void;
  send: (payload: {
    source_type: "ekaterina_practice" | "template" | "memo";
    category: string;
    subcategory?: string;
    document_type?: string;
    contains_personal_data?: boolean;
    contains_passport_data?: boolean;
    contains_bank_data?: boolean;
    contains_signature?: boolean;
    requires_redaction?: boolean;
    redacted_text?: string;
  }) => Promise<void>;
}) {
  const [sourceType, setSourceType] = useState<"ekaterina_practice" | "template" | "memo">("ekaterina_practice");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [docType, setDocType] = useState("");
  const [hasPersonal, setHasPersonal] = useState(false);
  const [hasPassport, setHasPassport] = useState(false);
  const [hasBank, setHasBank] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [requiresRedaction, setRequiresRedaction] = useState(true);
  const [redactedText, setRedactedText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!item) return;
    const md = (item.metadata ?? {}) as any;
    setSourceType(item.item_type === "template" ? "template" : "ekaterina_practice");
    setCategory(item.category ?? md.category ?? "");
    setSubcategory(md.subcategory ?? "");
    setDocType(md.document_type ?? "");
    setHasPersonal(false);
    setHasPassport(false);
    setHasBank(false);
    setHasSignature(false);
    setRequiresRedaction(true);
    setRedactedText("");
  }, [item]);

  const blocked = hasPassport || hasBank;

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Отправить в очередь импорта KB</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground truncate">{item?.title}</p>
          <p className="text-xs text-muted-foreground">
            Документ попадёт в <code>legal_knowledge_import_queue</code> со статусом <b>ready_for_review</b>.
            Одобрение и импорт в KB выполняются в разделе «База знаний → Очередь импорта».
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Тип источника</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KB_SOURCE_TYPES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Категория</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                <SelectContent>
                  {KB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Подкатегория</Label>
              <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Тип документа</Label>
              <Select value={docType || "__none"} onValueChange={(v) => setDocType(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {KB_DOCUMENT_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={hasPersonal} onCheckedChange={(v) => setHasPersonal(!!v)} /> Персональные данные</label>
            <label className="flex items-center gap-2"><Checkbox checked={hasPassport} onCheckedChange={(v) => setHasPassport(!!v)} /> Паспортные данные</label>
            <label className="flex items-center gap-2"><Checkbox checked={hasBank} onCheckedChange={(v) => setHasBank(!!v)} /> Банковские данные</label>
            <label className="flex items-center gap-2"><Checkbox checked={hasSignature} onCheckedChange={(v) => setHasSignature(!!v)} /> Подпись/печать</label>
            <label className="flex items-center gap-2 col-span-2"><Checkbox checked={requiresRedaction} onCheckedChange={(v) => setRequiresRedaction(!!v)} /> Требует обезличивания</label>
          </div>

          {blocked && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              Документы с паспортными или банковскими данными нельзя импортировать в KB напрямую.
              Сначала обезличьте документ.
            </div>
          )}

          <div>
            <Label className="text-xs">Обезличенный текст (опционально)</Label>
            <Textarea
              rows={4}
              value={redactedText}
              onChange={(e) => setRedactedText(e.target.value)}
              placeholder="Если уже подготовили обезличенную версию — вставьте сюда"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Отмена</Button>
          <Button
            disabled={sending || blocked || !category}
            onClick={async () => {
              setSending(true);
              try {
                await send({
                  source_type: sourceType,
                  category,
                  subcategory: subcategory || undefined,
                  document_type: docType || undefined,
                  contains_personal_data: hasPersonal,
                  contains_passport_data: hasPassport,
                  contains_bank_data: hasBank,
                  contains_signature: hasSignature,
                  requires_redaction: requiresRedaction,
                  redacted_text: redactedText || undefined,
                });
                onSent();
              } catch (e: any) {
                toast.error(e?.message ?? "Ошибка");
              } finally {
                setSending(false);
              }
            }}
          >Отправить в очередь</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
