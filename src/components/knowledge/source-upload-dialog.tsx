import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, Upload, Link as LinkIcon, FileText } from "lucide-react";
import {
  lkCreateManualSource,
  lkCreateUrlSource,
  lkUploadFileSource,
} from "@/lib/legal-knowledge.functions";

const SOURCE_TYPES: { value: string; label: string }[] = [
  { value: "codex", label: "Кодекс" },
  { value: "federal_law", label: "Федеральный закон" },
  { value: "fns_letter", label: "Письмо ФНС" },
  { value: "minfin_letter", label: "Письмо Минфина" },
  { value: "court_practice", label: "Судебная практика" },
  { value: "vs_review", label: "Обзор ВС РФ" },
  { value: "explanation", label: "Разъяснение" },
  { value: "other", label: "Иной источник" },
];

type CommonFields = {
  title: string;
  source_type: string;
  document_number: string;
  document_date: string;
  edition_date: string;
  source_url: string;
  article: string;
};

const emptyCommon: CommonFields = {
  title: "",
  source_type: "federal_law",
  document_number: "",
  document_date: "",
  edition_date: "",
  source_url: "",
  article: "",
};

function CommonFieldsForm({ value, onChange }: { value: CommonFields; onChange: (v: CommonFields) => void }) {
  const set = <K extends keyof CommonFields>(k: K, v: CommonFields[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <Label className="text-xs">Название</Label>
        <Input value={value.title} onChange={(e) => set("title", e.target.value)} placeholder="Например: НК РФ ст. 220" />
      </div>
      <div>
        <Label className="text-xs">Тип источника</Label>
        <Select value={value.source_type} onValueChange={(v) => set("source_type", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {SOURCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Статья / пункт</Label>
        <Input value={value.article} onChange={(e) => set("article", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Номер документа</Label>
        <Input value={value.document_number} onChange={(e) => set("document_number", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Дата документа</Label>
        <Input type="date" value={value.document_date} onChange={(e) => set("document_date", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Дата редакции</Label>
        <Input type="date" value={value.edition_date} onChange={(e) => set("edition_date", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">URL официального источника</Label>
        <Input value={value.source_url} onChange={(e) => set("source_url", e.target.value)} placeholder="https://pravo.gov.ru/..." />
      </div>
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const s = String(r.result);
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.readAsDataURL(file);
  });
}

export function SourceUploadDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("text");
  const [common, setCommon] = useState<CommonFields>(emptyCommon);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const createText = useServerFn(lkCreateManualSource);
  const createUrl = useServerFn(lkCreateUrlSource);
  const uploadFile = useServerFn(lkUploadFileSource);

  const reset = () => {
    setCommon(emptyCommon);
    setText("");
    setFile(null);
    setTab("text");
  };

  const submit = async () => {
    if (!common.title.trim()) {
      toast.error("Укажите название источника");
      return;
    }
    setSaving(true);
    try {
      const base = {
        title: common.title.trim(),
        source_type: common.source_type as "codex",
        document_number: common.document_number || null,
        document_date: common.document_date || null,
        edition_date: common.edition_date || null,
        source_url: common.source_url || null,
        article: common.article || null,
      };
      if (tab === "text") {
        if (!text.trim()) throw new Error("Вставьте текст источника");
        await createText({ data: { ...base, text_content: text } });
      } else if (tab === "url") {
        if (!common.source_url) throw new Error("Укажите URL");
        await createUrl({ data: base });
      } else {
        if (!file) throw new Error("Выберите файл");
        const b64 = await toBase64(file);
        await uploadFile({
          data: {
            ...base,
            file_name: file.name,
            file_mime: file.type || "application/octet-stream",
            file_base64: b64,
          },
        });
      }
      toast.success("Источник создан со статусом «нужна проверка»");
      setOpen(false);
      reset();
      onCreated?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> Загрузить источник</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Загрузить источник</DialogTitle>
          <DialogDescription>
            Новый источник создаётся со статусом <b>needs_review</b> и <b>pending</b>. Он не используется в юридических
            заключениях до подтверждения администратором.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle size={14} className="mt-0.5 text-amber-600" />
          <div>Источник не используется в юридических заключениях, пока не одобрен администратором и не прошёл проверку актуальности.</div>
        </div>

        <CommonFieldsForm value={common} onChange={setCommon} />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="text"><FileText size={14} /> Текст</TabsTrigger>
            <TabsTrigger value="file"><Upload size={14} /> Файл</TabsTrigger>
            <TabsTrigger value="url"><LinkIcon size={14} /> URL</TabsTrigger>
          </TabsList>
          <TabsContent value="text">
            <Label className="text-xs">Текст документа</Label>
            <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Вставьте полный текст нормы..." />
            <div className="mt-1 text-[10px] text-muted-foreground">Текст будет нарезан на чанки и сохранён как needs_review.</div>
          </TabsContent>
          <TabsContent value="file">
            <Label className="text-xs">Файл (PDF, DOCX, TXT, HTML)</Label>
            <Input type="file" accept=".pdf,.docx,.txt,.html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/html" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="mt-1 text-[10px] text-muted-foreground">Файл сохраняется в защищённое хранилище. Парсинг — отдельным шагом (Отправить на индексацию).</div>
          </TabsContent>
          <TabsContent value="url">
            <div className="text-xs text-muted-foreground">URL берётся из поля выше. Поддерживаемые официальные источники: pravo.gov.ru, nalog.gov.ru, minfin.gov.ru, vsrf.ru, kad.arbitr.ru, sudrf.ru. Автоматический парсинг отключён.</div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Отмена</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Сохраняем..." : "Создать черновик"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
