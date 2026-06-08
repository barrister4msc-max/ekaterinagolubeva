import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Upload, Plus, Save, Sparkles, FileText, Trash2, FolderArchive } from "lucide-react";
import {
  matterGet,
  matterUpdate,
  docList,
  docCreate,
  docDelete,
  strategyGet,
  strategyUpsert,
  actionList,
  actionCreate,
  actionUpdate,
  actionDelete,
  archiveList,
  archiveCreate,
  archiveDelete,
} from "@/lib/lawyer-matters.functions";
import { ZipUploadDialog } from "@/components/practice/zip-upload-dialog";

export const Route = createFileRoute("/workspace/matter/$matterId")({
  head: () => ({ meta: [{ title: "Дело — Workspace" }, { name: "robots", content: "noindex" }] }),
  component: MatterDetailPage,
});

const ACTION_TYPES = [
  { v: "legal_opinion", l: "Правовое заключение" },
  { v: "protocol_disagreements", l: "Протокол разногласий" },
  { v: "claim_letter", l: "Претензия" },
  { v: "lawsuit", l: "Иск" },
  { v: "lawsuit_response", l: "Отзыв на иск" },
  { v: "objections", l: "Возражения" },
  { v: "motion", l: "Ходатайство" },
  { v: "appeal", l: "Апелляционная жалоба" },
  { v: "cassation", l: "Кассационная жалоба" },
  { v: "fns_response", l: "Ответ на требование ФНС" },
  { v: "tax_act_objection", l: "Возражения на акт налоговой проверки" },
  { v: "ufns_complaint", l: "Жалоба в УФНС" },
  { v: "doc_request_seller", l: "Запрос документов продавцу" },
  { v: "deal_risk_list", l: "Риск-лист сделки" },
  { v: "sale_contract", l: "Договор купли-продажи" },
  { v: "rent_contract", l: "Договор аренды" },
];
const ACTION_STATUSES = [
  { v: "suggested", l: "Предложено" },
  { v: "approved", l: "Утверждено" },
  { v: "in_progress", l: "В работе" },
  { v: "done", l: "Готово" },
  { v: "dismissed", l: "Отклонено" },
];
const ARCHIVE_TYPES = [
  { v: "document", l: "Документ" },
  { v: "note", l: "Заметка" },
  { v: "case_law", l: "Судебная практика" },
  { v: "template", l: "Шаблон" },
  { v: "research", l: "Исследование" },
  { v: "legal_source", l: "Источник права" },
];

type Matter = {
  id: string;
  matter_number: string | null;
  title: string | null;
  matter_type: string;
  status: string;
  priority: string;
  archive_status: string;
  description: string | null;
  lawyer_notes: string | null;
  ai_summary: string | null;
  risk_level: string | null;
  client_id: string | null;
  lead_id: string | null;
  created_at: string;
};

function MatterDetailPage() {
  const { matterId } = Route.useParams();
  const getFn = useServerFn(matterGet);
  const updateFn = useServerFn(matterUpdate);
  const [matter, setMatter] = useState<Matter | null>(null);
  const [tab, setTab] = useState("overview");

  const reload = useCallback(async () => {
    try {
      const r = await getFn({ data: { id: matterId } });
      setMatter((r as any).matter);
    } catch (e: any) {
      toast.error(e?.message || "Ошибка");
    }
  }, [getFn, matterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!matter) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/workspace/matters" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} className="inline" /> К списку
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{matter.matter_number || matter.id.slice(0, 8)}</div>
          <h1 className="font-display text-2xl">{matter.title || "—"}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{matter.matter_type}</Badge>
            <Badge variant="secondary">{matter.status}</Badge>
            <Badge>{matter.priority}</Badge>
            {matter.archive_status !== "active" && <Badge variant="destructive">{matter.archive_status}</Badge>}
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="documents">Документы</TabsTrigger>
          <TabsTrigger value="strategy">Стратегия</TabsTrigger>
          <TabsTrigger value="actions">Действия</TabsTrigger>
          <TabsTrigger value="generated">Сформированные документы</TabsTrigger>
          <TabsTrigger value="archive">Архив</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab matter={matter} updateFn={updateFn} onSaved={reload} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab matterId={matter.id} />
        </TabsContent>
        <TabsContent value="strategy">
          <StrategyTab matterId={matter.id} />
        </TabsContent>
        <TabsContent value="actions">
          <ActionsTab matterId={matter.id} />
        </TabsContent>
        <TabsContent value="generated">
          <GeneratedTab matterId={matter.id} />
        </TabsContent>
        <TabsContent value="archive">
          <ArchiveTab matterId={matter.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ===== Overview ===== */

function OverviewTab({ matter, updateFn, onSaved }: { matter: Matter; updateFn: any; onSaved: () => void }) {
  const [title, setTitle] = useState(matter.title || "");
  const [status, setStatus] = useState(matter.status);
  const [priority, setPriority] = useState(matter.priority);
  const [archiveStatus, setArchiveStatus] = useState(matter.archive_status);
  const [description, setDescription] = useState(matter.description || "");
  const [lawyerNotes, setLawyerNotes] = useState(matter.lawyer_notes || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateFn({
        data: { id: matter.id, title, status, priority, archive_status: archiveStatus, description, lawyer_notes: lawyerNotes },
      });
      toast.success("Сохранено");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Обзор</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label className="text-xs">Название</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Статус</Label>
          <Input value={status} onChange={(e) => setStatus(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Приоритет</Label>
          <Input value={priority} onChange={(e) => setPriority(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Архив</Label>
          <Select value={archiveStatus} onValueChange={setArchiveStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Активное</SelectItem>
              <SelectItem value="archived">В архиве</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Описание</Label>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Заметки юриста</Label>
          <Textarea rows={4} value={lawyerNotes} onChange={(e) => setLawyerNotes(e.target.value)} />
        </div>
        {matter.ai_summary && (
          <div className="md:col-span-2 rounded border border-border bg-muted/30 p-3 text-sm">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">AI-сводка</div>
            {matter.ai_summary}
          </div>
        )}
        <div className="md:col-span-2">
          <Button onClick={save} disabled={saving}><Save size={14} /> Сохранить</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Documents ===== */

type Doc = {
  id: string;
  title: string | null;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
  document_type: string | null;
  analysis_status: string;
  review_status: string;
  created_at: string;
};

function DocumentsTab({ matterId }: { matterId: string }) {
  const listFn = useServerFn(docList);
  const createFn = useServerFn(docCreate);
  const deleteFn = useServerFn(docDelete);
  const [rows, setRows] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lastUploaded, setLastUploaded] = useState<Doc | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await listFn({ data: { matter_id: matterId } });
      setRows(((r as any).rows ?? []) as Doc[]);
    } catch (e: any) {
      toast.error(e?.message || "Ошибка");
    }
  }, [listFn, matterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onFile = async (file: File) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Файл больше 20 МБ");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `matters/${matterId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("lead-documents").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) throw upErr;
      const res = await createFn({
        data: {
          matter_id: matterId,
          title: file.name,
          file_name: file.name,
          mime_type: file.type || undefined,
          storage_path: path,
        },
      });
      setLastUploaded((res as any).document);
      toast.success("Документ загружен");
      void reload();
    } catch (e: any) {
      toast.error(e?.message || "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Удалить документ?")) return;
    try {
      await deleteFn({ data: { id } });
      void reload();
    } catch (e: any) {
      toast.error(e?.message || "Ошибка");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Документы дела</CardTitle>
          <div>
            <input
              id="matter-doc-upload"
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" disabled={uploading} onClick={() => document.getElementById("matter-doc-upload")?.click()}>
              <Upload size={14} /> {uploading ? "Загрузка…" : "Загрузить документ"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Документов пока нет.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Файл</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Анализ</TableHead>
                  <TableHead>Проверка</TableHead>
                  <TableHead>Создано</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm"><FileText size={14} /> {d.title || d.file_name}</div>
                      <div className="text-xs text-muted-foreground">{d.mime_type}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{d.document_type || "—"}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{d.analysis_status}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{d.review_status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString("ru-RU")}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(d.id)}><Trash2 size={14} /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {lastUploaded && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Что сделать с документом?</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled title="AI-анализ — будет подключено"><Sparkles size={14} /> Выполнить AI-анализ</Button>
            <Button size="sm" variant="outline" disabled title="Будет подключено"><Sparkles size={14} /> Сформировать юридическое заключение</Button>
            <Button size="sm" variant="outline" disabled title="Уже привязано к делу">Добавить в дело</Button>
            <Button size="sm" variant="outline" disabled title="Будет подключено">Создать новое дело из документа</Button>
            <Button size="sm" variant="outline" disabled title="Используйте вкладку «Архив»"><FolderArchive size={14} /> Добавить в архив юриста</Button>
            <Button size="sm" variant="outline" disabled title="Используйте «База знаний»">Добавить в базу знаний</Button>
            <Button size="sm" variant="ghost" onClick={() => setLastUploaded(null)}>Скрыть</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ===== Strategy ===== */

function StrategyTab({ matterId }: { matterId: string }) {
  const getFn = useServerFn(strategyGet);
  const upsertFn = useServerFn(strategyUpsert);
  const [loaded, setLoaded] = useState(false);
  const [clientPosition, setClientPosition] = useState("");
  const [opponentPosition, setOpponentPosition] = useState("");
  const [successProb, setSuccessProb] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [facts, setFacts] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [risks, setRisks] = useState("");
  const [legalBasis, setLegalBasis] = useState("");
  const [courtPractice, setCourtPractice] = useState("");
  const [recommendedDocs, setRecommendedDocs] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r: any = await getFn({ data: { matter_id: matterId } });
        const s = r?.strategy;
        if (s) {
          setClientPosition(s.client_position ?? "");
          setOpponentPosition(s.opponent_position ?? "");
          setSuccessProb(s.success_probability ?? "");
          setAiSummary(s.ai_summary ?? "");
          const j = (a: any) => (Array.isArray(a) ? a.join("\n") : "");
          setFacts(j(s.facts));
          setStrengths(j(s.strengths));
          setWeaknesses(j(s.weaknesses));
          setRisks(j(s.risks));
          setLegalBasis(j(s.legal_basis));
          setCourtPractice(j(s.court_practice));
          setRecommendedDocs(j(s.recommended_documents));
          setNextSteps(j(s.next_steps));
        }
      } catch (e: any) {
        toast.error(e?.message || "Ошибка");
      } finally {
        setLoaded(true);
      }
    })();
  }, [getFn, matterId]);

  const toArr = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      await upsertFn({
        data: {
          matter_id: matterId,
          client_position: clientPosition,
          opponent_position: opponentPosition,
          success_probability: successProb,
          ai_summary: aiSummary,
          facts: toArr(facts),
          strengths: toArr(strengths),
          weaknesses: toArr(weaknesses),
          risks: toArr(risks),
          legal_basis: toArr(legalBasis),
          court_practice: toArr(courtPractice),
          recommended_documents: toArr(recommendedDocs),
          next_steps: toArr(nextSteps),
        },
      });
      toast.success("Стратегия сохранена");
    } catch (e: any) {
      toast.error(e?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="py-6 text-center text-sm text-muted-foreground">Загрузка…</p>;

  const F = ({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Стратегия дела</CardTitle>
        <Button size="sm" variant="outline" disabled title="AI-генерация будет подключена"><Sparkles size={14} /> Сформировать стратегию AI</Button>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <F label="Позиция клиента" value={clientPosition} onChange={setClientPosition} />
        <F label="Позиция оппонента" value={opponentPosition} onChange={setOpponentPosition} />
        <F label="Факты (по строке)" value={facts} onChange={setFacts} rows={5} />
        <F label="Правовое основание (по строке)" value={legalBasis} onChange={setLegalBasis} rows={5} />
        <F label="Сильные стороны (по строке)" value={strengths} onChange={setStrengths} />
        <F label="Слабые стороны (по строке)" value={weaknesses} onChange={setWeaknesses} />
        <F label="Риски (по строке)" value={risks} onChange={setRisks} />
        <F label="Судебная практика (по строке)" value={courtPractice} onChange={setCourtPractice} />
        <F label="Рекомендуемые документы (по строке)" value={recommendedDocs} onChange={setRecommendedDocs} />
        <F label="Следующие шаги (по строке)" value={nextSteps} onChange={setNextSteps} />
        <div>
          <Label className="text-xs">Вероятность успеха</Label>
          <Input value={successProb} onChange={(e) => setSuccessProb(e.target.value)} placeholder="например, 70%" />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">AI-сводка</Label>
          <Textarea rows={3} value={aiSummary} onChange={(e) => setAiSummary(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Button onClick={save} disabled={saving}><Save size={14} /> Сохранить</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Actions ===== */

type Action = {
  id: string;
  action_type: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  generated_document_id: string | null;
  created_at: string;
};

function ActionsTab({ matterId }: { matterId: string }) {
  const listFn = useServerFn(actionList);
  const createFn = useServerFn(actionCreate);
  const updateFn = useServerFn(actionUpdate);
  const deleteFn = useServerFn(actionDelete);
  const [rows, setRows] = useState<Action[]>([]);
  const [open, setOpen] = useState(false);
  const [actionType, setActionType] = useState("legal_opinion");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("suggested");

  const reload = useCallback(async () => {
    try {
      const r: any = await listFn({ data: { matter_id: matterId } });
      setRows((r?.rows ?? []) as Action[]);
    } catch (e: any) {
      toast.error(e?.message || "Ошибка");
    }
  }, [listFn, matterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async () => {
    if (!title.trim()) {
      toast.error("Введите заголовок");
      return;
    }
    try {
      await createFn({ data: { matter_id: matterId, action_type: actionType, title: title.trim(), description, priority, status } });
      toast.success("Действие добавлено");
      setOpen(false);
      setTitle("");
      setDescription("");
      void reload();
    } catch (e: any) {
      toast.error(e?.message || "Ошибка");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Рекомендованные действия</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus size={14} /> Добавить действие</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Новое действие</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Тип действия</Label>
                <Select value={actionType} onValueChange={setActionType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Заголовок</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Описание</Label>
                <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Приоритет</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Низкий</SelectItem>
                      <SelectItem value="medium">Средний</SelectItem>
                      <SelectItem value="high">Высокий</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Статус</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTION_STATUSES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={create}>Добавить</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Действий пока нет.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Тип</TableHead>
                <TableHead>Заголовок</TableHead>
                <TableHead>Приоритет</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><Badge variant="outline">{ACTION_TYPES.find((t) => t.v === a.action_type)?.l || a.action_type}</Badge></TableCell>
                  <TableCell>
                    <div className="text-sm">{a.title}</div>
                    {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                  </TableCell>
                  <TableCell>{a.priority}</TableCell>
                  <TableCell>
                    <Select value={a.status} onValueChange={async (v) => { await updateFn({ data: { id: a.id, status: v } }); void reload(); }}>
                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTION_STATUSES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={async () => { if (confirm("Удалить?")) { await deleteFn({ data: { id: a.id } }); void reload(); } }}><Trash2 size={14} /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ===== Generated (read-only listing) ===== */

function GeneratedTab({ matterId }: { matterId: string }) {
  const listFn = useServerFn(actionList);
  const [rows, setRows] = useState<Action[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const r: any = await listFn({ data: { matter_id: matterId } });
        setRows(((r?.rows ?? []) as Action[]).filter((a) => a.generated_document_id));
      } catch (e: any) {
        toast.error(e?.message || "Ошибка");
      }
    })();
  }, [listFn, matterId]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Сформированные документы</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Сформированных документов пока нет.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded border border-border bg-muted/20 px-3 py-2">
                <FileText size={14} />
                <span>{a.title}</span>
                <Badge variant="outline" className="ml-auto">{a.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ===== Archive ===== */

type Arch = {
  id: string;
  title: string;
  item_type: string;
  category: string | null;
  description: string | null;
  source_url: string | null;
  tags: string[];
  created_at: string;
};

function ArchiveTab({ matterId }: { matterId: string }) {
  const listFn = useServerFn(archiveList);
  const createFn = useServerFn(archiveCreate);
  const deleteFn = useServerFn(archiveDelete);
  const [rows, setRows] = useState<Arch[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [itemType, setItemType] = useState("note");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tags, setTags] = useState("");

  const reload = useCallback(async () => {
    try {
      const r: any = await listFn({ data: { matter_id: matterId } });
      setRows((r?.rows ?? []) as Arch[]);
    } catch (e: any) {
      toast.error(e?.message || "Ошибка");
    }
  }, [listFn, matterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Введите название");
      return;
    }
    try {
      await createFn({
        data: {
          matter_id: matterId,
          title: title.trim(),
          item_type: itemType,
          category: category || undefined,
          description: description || undefined,
          source_url: sourceUrl || undefined,
          tags: tags ? tags.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        },
      });
      toast.success("Добавлено в архив");
      setOpen(false);
      setTitle("");
      setDescription("");
      setSourceUrl("");
      setCategory("");
      setTags("");
      void reload();
    } catch (e: any) {
      toast.error(e?.message || "Ошибка");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">Архив юриста</CardTitle>
        <div className="flex items-center gap-2">
          <ZipUploadDialog onUploaded={reload} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus size={14} /> Добавить</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Новый элемент архива</DialogTitle><DialogDescription>Может быть связан с делом или быть самостоятельным.</DialogDescription></DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Тип</Label>
                <Select value={itemType} onValueChange={setItemType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ARCHIVE_TYPES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Название</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Категория</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Описание</Label>
                <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Источник (URL)</Label>
                <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Теги (через запятую)</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
            </div>
            <DialogFooter><Button onClick={submit}>Сохранить</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Архив пуст.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Тип</TableHead>
                <TableHead>Название</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead>Теги</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline">{ARCHIVE_TYPES.find((t) => t.v === r.item_type)?.l || r.item_type}</Badge></TableCell>
                  <TableCell>
                    <div className="text-sm">{r.title}</div>
                    {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                    {r.source_url && <a className="text-xs text-primary hover:underline" href={r.source_url} target="_blank" rel="noreferrer">{r.source_url}</a>}
                  </TableCell>
                  <TableCell className="text-xs">{r.category || "—"}</TableCell>
                  <TableCell className="text-xs">{(r.tags || []).join(", ") || "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={async () => { if (confirm("Удалить?")) { await deleteFn({ data: { id: r.id } }); void reload(); } }}><Trash2 size={14} /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
