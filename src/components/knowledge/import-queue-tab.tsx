import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Search, Ban, ShieldAlert, Eye, CheckCircle2, Upload, FileCheck } from "lucide-react";
import {
  lkqListQueue,
  lkqGetItem,
  lkqSetStatus,
  lkqApproveForKb,
  lkqImportToKb,
  SOURCE_TYPES,
  CATEGORIES,
  DOCUMENT_TYPES,
  IMPORT_STATUSES,
} from "@/lib/legal-knowledge-import-queue.functions";

type QueueRow = {
  id: string;
  original_file_name: string;
  archive_name: string | null;
  source_type: string;
  category: string;
  subcategory: string | null;
  document_type: string | null;
  import_status: string;
  contains_personal_data: boolean;
  contains_passport_data: boolean;
  contains_bank_data: boolean;
  requires_redaction: boolean;
  approved_by_lawyer: boolean;
  approved_at: string | null;
  approved_by: string | null;
  imported_chunk_id: string | null;
  import_error: string | null;
  created_at: string;
  updated_at: string;
};

type FullRow = QueueRow & {
  extracted_text: string | null;
  redacted_text: string | null;
  metadata: Record<string, unknown> | null;
  storage_path: string | null;
};

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("ru-RU") : "—";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "imported":
    case "approved":
      return "default";
    case "ready_for_review":
    case "needs_redaction":
      return "secondary";
    case "blocked":
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export function ImportQueueTab() {
  const listFn = useServerFn(lkqListQueue);
  const getFn = useServerFn(lkqGetItem);
  const setStatusFn = useServerFn(lkqSetStatus);
  const approveFn = useServerFn(lkqApproveForKb);
  const importFn = useServerFn(lkqImportToKb);

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fSource, setFSource] = useState<string>("all");
  const [fCategory, setFCategory] = useState<string>("all");
  const [fDocType, setFDocType] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<FullRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFn({
        data: {
          search: search || undefined,
          import_status: fStatus !== "all" ? fStatus : undefined,
          source_type: fSource !== "all" ? fSource : undefined,
          category: fCategory !== "all" ? fCategory : undefined,
          document_type: fDocType !== "all" ? fDocType : undefined,
        },
      });
      setRows((res as { rows: QueueRow[] }).rows);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [listFn, search, fStatus, fSource, fCategory, fDocType]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleOpen = async (id: string) => {
    setOpenId(id);
    setOpenRow(null);
    try {
      const res = await getFn({ data: { id } });
      setOpenRow((res as { row: FullRow }).row);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const runAction = async (id: string, label: string, fn: () => Promise<unknown>) => {
    setBusy(id + ":" + label);
    try {
      await fn();
      toast.success(label + " — готово");
      await reload();
      if (openId === id) {
        const res = await getFn({ data: { id } });
        setOpenRow((res as { row: FullRow }).row);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid gap-2 md:grid-cols-5">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по имени файла"
                className="pl-7"
              />
            </div>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue placeholder="Статус" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {IMPORT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fSource} onValueChange={setFSource}>
              <SelectTrigger><SelectValue placeholder="Тип источника" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {SOURCE_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fCategory} onValueChange={setFCategory}>
              <SelectTrigger><SelectValue placeholder="Категория" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                {CATEGORIES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fDocType} onValueChange={setFDocType}>
              <SelectTrigger><SelectValue placeholder="Тип документа" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы документов</SelectItem>
                {DOCUMENT_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
              <RefreshCw size={14} /> Обновить
            </Button>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Файл</TableHead>
                  <TableHead>Архив</TableHead>
                  <TableHead>Источник</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Подкатегория</TableHead>
                  <TableHead>Тип документа</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Флаги</TableHead>
                  <TableHead>Юрист</TableHead>
                  <TableHead>Создано</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const flags: string[] = [];
                  if (r.contains_personal_data) flags.push("ПДн");
                  if (r.contains_passport_data) flags.push("паспорт");
                  if (r.contains_bank_data) flags.push("банк");
                  if (r.requires_redaction) flags.push("redact");
                  const canImport =
                    r.approved_by_lawyer &&
                    r.import_status === "approved" &&
                    !r.contains_passport_data &&
                    !r.contains_bank_data;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-xs">
                        <div className="line-clamp-2 text-xs font-medium">{r.original_file_name}</div>
                        {r.import_error && (
                          <div className="line-clamp-1 text-[10px] text-destructive">{r.import_error}</div>
                        )}
                        {r.imported_chunk_id && (
                          <div className="text-[10px] text-muted-foreground">
                            chunk: {r.imported_chunk_id.slice(0, 8)}…
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{r.archive_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.source_type}</TableCell>
                      <TableCell className="text-xs">{r.category}</TableCell>
                      <TableCell className="text-xs">{r.subcategory ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.document_type ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.import_status)}>{r.import_status}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {flags.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {flags.map((f) => (
                              <Badge key={f} variant="outline" className="px-1 py-0 text-[10px]">
                                {f}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.approved_by_lawyer ? (
                          <span className="text-emerald-600">✓ {fmtDate(r.approved_at)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => void handleOpen(r.id)}>
                          <Eye size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Заблокировать"
                          disabled={busy === r.id + ":Заблокировано"}
                          onClick={() =>
                            void runAction(r.id, "Заблокировано", () =>
                              setStatusFn({ data: { id: r.id, status: "blocked" } }),
                            )
                          }
                        >
                          <Ban size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Требует обезличивания"
                          disabled={busy === r.id + ":Требует обезличивания"}
                          onClick={() =>
                            void runAction(r.id, "Требует обезличивания", () =>
                              setStatusFn({ data: { id: r.id, status: "needs_redaction" } }),
                            )
                          }
                        >
                          <ShieldAlert size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Готово к проверке"
                          disabled={busy === r.id + ":Готово к проверке"}
                          onClick={() =>
                            void runAction(r.id, "Готово к проверке", () =>
                              setStatusFn({ data: { id: r.id, status: "ready_for_review" } }),
                            )
                          }
                        >
                          <FileCheck size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Утвердить для KB"
                          disabled={busy === r.id + ":Утверждено"}
                          onClick={() =>
                            void runAction(r.id, "Утверждено", () => approveFn({ data: { id: r.id } }))
                          }
                        >
                          <CheckCircle2 size={12} />
                        </Button>
                        <Button
                          size="sm"
                          title="Импортировать в KB"
                          disabled={!canImport || busy === r.id + ":Импортировано в KB"}
                          onClick={() =>
                            void runAction(r.id, "Импортировано в KB", () => importFn({ data: { id: r.id } }))
                          }
                        >
                          <Upload size={12} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-xs text-muted-foreground">
                      {loading ? "Загрузка…" : "В очереди импорта пока пусто."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!openId} onOpenChange={(o) => { if (!o) { setOpenId(null); setOpenRow(null); } }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {openRow?.original_file_name ?? "Загрузка…"}
            </DialogTitle>
          </DialogHeader>
          {!openRow ? (
            <div className="text-xs text-muted-foreground">Загрузка…</div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="grid gap-2 md:grid-cols-3">
                <div><span className="text-muted-foreground">Архив:</span> {openRow.archive_name ?? "—"}</div>
                <div><span className="text-muted-foreground">Источник:</span> {openRow.source_type}</div>
                <div><span className="text-muted-foreground">Категория:</span> {openRow.category}</div>
                <div><span className="text-muted-foreground">Подкатегория:</span> {openRow.subcategory ?? "—"}</div>
                <div><span className="text-muted-foreground">Тип:</span> {openRow.document_type ?? "—"}</div>
                <div><span className="text-muted-foreground">Статус:</span> <Badge variant={statusVariant(openRow.import_status)}>{openRow.import_status}</Badge></div>
              </div>

              {openRow.import_error && (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-destructive">
                  <div className="font-medium">Ошибка импорта</div>
                  <div className="whitespace-pre-wrap">{openRow.import_error}</div>
                </div>
              )}

              <section>
                <div className="mb-1 font-medium">Extracted text</div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-muted/30 p-2 text-[11px]">
                  {openRow.extracted_text || "—"}
                </pre>
              </section>

              <section>
                <div className="mb-1 font-medium">Redacted text</div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-muted/30 p-2 text-[11px]">
                  {openRow.redacted_text || "—"}
                </pre>
              </section>

              <section>
                <div className="mb-1 font-medium">Metadata</div>
                <pre className="max-h-48 overflow-auto rounded border bg-muted/30 p-2 text-[11px]">
                  {JSON.stringify(openRow.metadata ?? {}, null, 2)}
                </pre>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
