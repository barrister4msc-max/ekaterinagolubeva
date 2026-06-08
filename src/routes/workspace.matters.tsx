import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, RefreshCw } from "lucide-react";
import { matterList, matterCreate, matterNextNumber } from "@/lib/lawyer-matters.functions";

export const Route = createFileRoute("/workspace/matters")({
  head: () => ({ meta: [{ title: "Дела — Workspace" }, { name: "robots", content: "noindex" }] }),
  component: MattersPage,
});

const MATTER_TYPES = [
  { v: "real_estate", l: "Недвижимость" },
  { v: "rental", l: "Аренда" },
  { v: "contracts", l: "Договоры" },
  { v: "litigation", l: "Суд" },
  { v: "tax", l: "Налоги" },
  { v: "corporate", l: "Корпоративное" },
  { v: "other", l: "Иное" },
];
const STATUSES = [
  { v: "new", l: "Новое" },
  { v: "in_progress", l: "В работе" },
  { v: "on_hold", l: "Пауза" },
  { v: "closed", l: "Закрыто" },
];
const PRIORITIES = [
  { v: "low", l: "Низкий" },
  { v: "normal", l: "Обычный" },
  { v: "high", l: "Высокий" },
  { v: "urgent", l: "Срочный" },
];
const ARCHIVES = [
  { v: "active", l: "Активные" },
  { v: "archived", l: "Архив" },
];

type Row = {
  id: string;
  matter_number: string | null;
  title: string | null;
  matter_type: string;
  status: string;
  priority: string;
  archive_status: string;
  description: string | null;
  created_at: string;
};

function MattersPage() {
  const listFn = useServerFn(matterList);
  const createFn = useServerFn(matterCreate);
  const nextNumFn = useServerFn(matterNextNumber);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState<string>("");
  const [fType, setFType] = useState<string>("");
  const [fPrio, setFPrio] = useState<string>("");
  const [fArch, setFArch] = useState<string>("active");
  const [openNew, setOpenNew] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFn({
        data: {
          search: search || undefined,
          status: fStatus || undefined,
          matter_type: fType || undefined,
          priority: fPrio || undefined,
          archive_status: fArch || undefined,
        },
      });
      setRows((res?.rows ?? []) as Row[]);
    } catch (e: any) {
      toast.error(e?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [listFn, search, fStatus, fType, fPrio, fArch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Дела</h1>
          <p className="text-sm text-muted-foreground">Реестр юридических дел и сопровождений.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw size={14} /> Обновить
          </Button>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus size={14} /> Новое дело
              </Button>
            </DialogTrigger>
            <NewMatterDialog
              onCreated={() => {
                setOpenNew(false);
                void reload();
              }}
              createFn={createFn}
              nextNumFn={nextNumFn}
            />
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label className="text-xs">Поиск</Label>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Название, номер, описание"
              />
            </div>
          </div>
          <FilterSelect label="Статус" value={fStatus} onChange={setFStatus} options={STATUSES} />
          <FilterSelect label="Тип" value={fType} onChange={setFType} options={MATTER_TYPES} />
          <FilterSelect label="Приоритет" value={fPrio} onChange={setFPrio} options={PRIORITIES} />
          <FilterSelect label="Архив" value={fArch} onChange={setFArch} options={ARCHIVES} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {loading ? "Загрузка…" : "Дел пока нет."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Номер</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Приоритет</TableHead>
                  <TableHead>Создано</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer">
                    <TableCell className="font-mono text-xs">
                      <Link to="/workspace/matter/$matterId" params={{ matterId: r.id }} className="hover:underline">
                        {r.matter_number || r.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link to="/workspace/matter/$matterId" params={{ matterId: r.id }} className="hover:underline">
                        {r.title || "—"}
                      </Link>
                    </TableCell>
                    <TableCell><Badge variant="outline">{MATTER_TYPES.find((t) => t.v === r.matter_type)?.l || r.matter_type}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{STATUSES.find((t) => t.v === r.status)?.l || r.status}</Badge></TableCell>
                    <TableCell>{PRIORITIES.find((t) => t.v === r.priority)?.l || r.priority}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ru-RU")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Все</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NewMatterDialog({
  onCreated,
  createFn,
  nextNumFn,
}: {
  onCreated: () => void;
  createFn: ReturnType<typeof useServerFn<typeof matterCreate>>;
  nextNumFn: ReturnType<typeof useServerFn<typeof matterNextNumber>>;
}) {
  const [matterNumber, setMatterNumber] = useState("");
  const [title, setTitle] = useState("");
  const [matterType, setMatterType] = useState("real_estate");
  const [status, setStatus] = useState("new");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [lawyerNotes, setLawyerNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void nextNumFn({}).then((r: any) => setMatterNumber(r?.matter_number ?? "")).catch(() => {});
  }, [nextNumFn]);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Введите название дела");
      return;
    }
    setSaving(true);
    try {
      await createFn({
        data: {
          matter_number: matterNumber || undefined,
          title: title.trim(),
          matter_type: matterType,
          status,
          priority,
          description: description || undefined,
          lawyer_notes: lawyerNotes || undefined,
        },
      });
      toast.success("Дело создано");
      onCreated();
    } catch (e: any) {
      toast.error(e?.message || "Ошибка создания");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Новое дело</DialogTitle>
        <DialogDescription>Дело может быть создано без лида и без клиента.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Номер дела</Label>
          <Input value={matterNumber} onChange={(e) => setMatterNumber(e.target.value)} placeholder="MAT-YYYY-0001" />
        </div>
        <div>
          <Label className="text-xs">Тип дела</Label>
          <Select value={matterType} onValueChange={setMatterType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MATTER_TYPES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Название</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Краткое описание дела" />
        </div>
        <div>
          <Label className="text-xs">Статус</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Приоритет</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Описание</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Заметки юриста</Label>
          <Textarea value={lawyerNotes} onChange={(e) => setLawyerNotes(e.target.value)} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={saving}>{saving ? "Создание…" : "Создать дело"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
