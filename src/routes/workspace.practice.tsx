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
import { Briefcase, FileText, Star, FolderArchive, Layers, ExternalLink, Trash2, Link2, Wand2, Sparkles, ShieldCheck, Eraser, GraduationCap, Send, Tags, Eye } from "lucide-react";
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
  archiveSendToKbQueue,
  archiveGetExtractedText,
  matterList,
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
  const sendToKbFn = useServerFn(archiveSendToKbQueue);
  const getTextFn = useServerFn(archiveGetExtractedText);
  const mList = useServerFn(matterList);

  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [tab, setTab] = useState("directions");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [familyFilter, setFamilyFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [anonTarget, setAnonTarget] = useState<ArchiveItem | null>(null);
  const [statsMap, setStatsMap] = useState<Record<string, { total: number; gold: number; templates: number; unclassified: number; pending_approval: number }>>({});
  const [batchRows, setBatchRows] = useState<{ id: string; count: number; created_at: string }[]>([]);
  const [matters, setMatters] = useState<{ id: string; title: string | null; matter_number: string | null }[]>([]);
  const [attachOpen, setAttachOpen] = useState<ArchiveItem | null>(null);
  const [attachMatterId, setAttachMatterId] = useState("");
  const [classifyTarget, setClassifyTarget] = useState<ArchiveItem | null>(null);
  const [kbTarget, setKbTarget] = useState<ArchiveItem | null>(null);
  const [textTarget, setTextTarget] = useState<{ title: string; extracted_text: string; redacted_text: string | null } | null>(null);

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

  useEffect(() => {
    if (tab === "uploads") {
      batches({}).then((r: any) => setBatchRows(r.batches ?? [])).catch(() => {});
    }
  }, [tab, batches]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display">Практика Екатерины</h1>
          <p className="text-sm text-muted-foreground">
            Рабочий архив документов. Не используется в правовых заключениях без явного одобрения.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ZipUploadDialog onUploaded={reload} />
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
                            {role && <Badge className={role.tone} variant="secondary">{role.l}</Badge>}
                            {it.item_type === "template" && <Badge variant="outline">Шаблон</Badge>}
                            {md.is_anonymized && (
                              <Badge className="bg-purple-100 text-purple-900" variant="secondary">
                                Обезличено{md.anonymization_mode ? ` · ${md.anonymization_mode}` : ""}
                              </Badge>
                            )}
                            {md.anonymization_status === "needs_review" && (
                              <Badge className="bg-amber-100 text-amber-900" variant="secondary">Требует проверки</Badge>
                            )}
                            {useGen ? (
                              <Badge className="bg-green-100 text-green-900" variant="secondary">Для генерации</Badge>
                            ) : (
                              <Badge variant="outline">Только архив</Badge>
                            )}
                            {md.can_use_for_training && (
                              <Badge className="bg-blue-100 text-blue-900" variant="secondary">Для обучения</Badge>
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

        <TabsContent value="uploads" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Партии ZIP-загрузок</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID партии</TableHead>
                    <TableHead>Файлов</TableHead>
                    <TableHead>Загружено</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchRows.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Пока нет загрузок</TableCell></TableRow>
                  )}
                  {batchRows.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.id}</TableCell>
                      <TableCell>{b.count}</TableCell>
                      <TableCell className="text-xs">{new Date(b.created_at).toLocaleString("ru-RU")}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => { /* could filter by batch */ toast.message(`Партия ${b.id}`); }}>
                          Открыть
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

      <AnonymizeDialog
        open={!!anonTarget}
        onOpenChange={(o) => { if (!o) setAnonTarget(null); }}
        item={anonTarget}
        onCreated={reload}
      />
    </div>
  );
}
