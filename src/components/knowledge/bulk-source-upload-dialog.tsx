import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Layers, CheckCircle2, Power } from "lucide-react";
import {
  lkBulkCreateSources,
  lkApproveBatch,
  lkDeactivateSource,
} from "@/lib/legal-knowledge.functions";

type RawItem = {
  title?: unknown;
  content?: unknown;
  source_type?: unknown;
  document_number?: unknown;
  article?: unknown;
  document_date?: unknown;
  edition_date?: unknown;
  source_url?: unknown;
};

type ParsedRow = {
  ok: boolean;
  error?: string;
  title: string;
  article: string;
  document_number: string;
  source_url: string;
  contentLen: number;
  raw: Record<string, unknown>;
};

const EXAMPLE = `[
  {
    "title": "НК РФ ст. 54.1",
    "source_type": "code",
    "document_number": "НК РФ",
    "article": "54.1",
    "document_date": null,
    "edition_date": "2026-01-01",
    "source_url": "https://pravo.gov.ru/...",
    "content": "Полный текст статьи..."
  }
]`;

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function BulkSourceUploadDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastGroupId, setLastGroupId] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState(0);

  const bulkCreate = useServerFn(lkBulkCreateSources);
  const approveBatch = useServerFn(lkApproveBatch);
  const deactivateBatch = useServerFn(lkDeactivateSource);

  const parsed = useMemo<{ rows: ParsedRow[]; parseError: string | null }>(() => {
    if (!json.trim()) return { rows: [], parseError: null };
    let arr: unknown;
    try { arr = JSON.parse(json); } catch (e) { return { rows: [], parseError: (e as Error).message }; }
    if (!Array.isArray(arr)) return { rows: [], parseError: "Ожидался JSON-массив" };
    const rows: ParsedRow[] = arr.map((it, idx) => {
      const r = (it ?? {}) as RawItem;
      const title = asStr(r.title).trim();
      const content = asStr(r.content);
      const errs: string[] = [];
      if (!title) errs.push("нет title");
      if (!content.trim()) errs.push("нет content");
      return {
        ok: errs.length === 0,
        error: errs.length ? `Строка ${idx + 1}: ${errs.join(", ")}` : undefined,
        title: title || `(без названия #${idx + 1})`,
        article: asStr(r.article),
        document_number: asStr(r.document_number),
        source_url: asStr(r.source_url),
        contentLen: content.length,
        raw: r as Record<string, unknown>,
      };
    });
    return { rows, parseError: null };
  }, [json]);

  const validCount = parsed.rows.filter((r) => r.ok).length;
  const invalidCount = parsed.rows.length - validCount;

  const reset = () => {
    setJson("");
    setLastGroupId(null);
    setLastCount(0);
  };

  const submit = async () => {
    if (parsed.parseError) { toast.error("JSON: " + parsed.parseError); return; }
    if (!parsed.rows.length) { toast.error("Пустой массив"); return; }
    if (invalidCount > 0) {
      const first = parsed.rows.find((r) => !r.ok);
      toast.error(first?.error ?? "Есть невалидные строки");
      return;
    }
    setSaving(true);
    try {
      const items = parsed.rows.map((r) => ({
        title: asStr(r.raw.title).trim(),
        content: asStr(r.raw.content),
        source_type: asStr(r.raw.source_type) || null,
        document_number: asStr(r.raw.document_number) || null,
        article: asStr(r.raw.article) || null,
        document_date: asStr(r.raw.document_date) || null,
        edition_date: asStr(r.raw.edition_date) || null,
        source_url: asStr(r.raw.source_url) || null,
      }));
      const res = await bulkCreate({ data: { items } });
      setLastGroupId(res.source_group_id);
      setLastCount(res.count);
      toast.success(`Загружено источников: ${res.count}`);
      onCreated?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!lastGroupId) return;
    try {
      await approveBatch({ data: { source_group_id: lastGroupId } });
      toast.success("Партия одобрена (official_verified)");
      onCreated?.();
    } catch (e) { toast.error((e as Error).message); }
  };

  const deactivate = async () => {
    if (!lastGroupId) return;
    try {
      await deactivateBatch({ data: { source_group_id: lastGroupId } });
      toast.success("Партия деактивирована");
      onCreated?.();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Layers size={14} /> Массовая загрузка</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Массовая загрузка источников (JSON)</DialogTitle>
          <DialogDescription>
            Вставьте JSON-массив. Каждый элемент станет отдельной записью в <b>legal_knowledge_chunks</b> со статусом{" "}
            <b>needs_review</b> / <b>pending</b>. Embeddings не запускаются автоматически. Источники не используются
            в юридических заключениях до одобрения.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle size={14} className="mt-0.5 text-amber-600" />
          <div>Партия загружается под одним <code>source_group_id</code>. Одобрение/деактивация применяется ко всей партии.</div>
        </div>

        <div>
          <Textarea
            rows={10}
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder={EXAMPLE}
            className="font-mono text-xs"
          />
          <div className="mt-1 text-[10px] text-muted-foreground">
            Формат элемента: title, content (обязательно); source_type, document_number, article, document_date, edition_date, source_url (опционально).
          </div>
          {parsed.parseError && (
            <div className="mt-2 text-xs text-destructive">Ошибка JSON: {parsed.parseError}</div>
          )}
        </div>

        {parsed.rows.length > 0 && (
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
              <div>Превью: <b>{parsed.rows.length}</b> · валидно: <b className="text-emerald-600">{validCount}</b>{invalidCount > 0 && <> · ошибок: <b className="text-destructive">{invalidCount}</b></>}</div>
            </div>
            <div className="max-h-72 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Article</TableHead>
                    <TableHead>Document №</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead className="text-right">Content len</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.map((r, i) => (
                    <TableRow key={i} className={r.ok ? "" : "bg-destructive/10"}>
                      <TableCell className="text-xs">{i + 1}</TableCell>
                      <TableCell className="text-xs max-w-[240px] truncate" title={r.title}>{r.title}</TableCell>
                      <TableCell className="text-xs">{r.article || "—"}</TableCell>
                      <TableCell className="text-xs">{r.document_number || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate" title={r.source_url}>{r.source_url || "—"}</TableCell>
                      <TableCell className="text-right text-xs">{r.contentLen}</TableCell>
                      <TableCell className="text-xs">{r.ok ? <span className="text-emerald-600">ok</span> : <span className="text-destructive">{r.error}</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {lastGroupId && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs">
            <div className="mb-2">Загружено источников: <b>{lastCount}</b>. Group: <code>{lastGroupId}</code></div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={approve}><CheckCircle2 size={14} /> Одобрить всю партию</Button>
              <Button size="sm" variant="outline" onClick={deactivate}><Power size={14} /> Деактивировать всю партию</Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Закрыть</Button>
          <Button onClick={submit} disabled={saving || !parsed.rows.length || invalidCount > 0 || !!parsed.parseError}>
            {saving ? "Загружаем..." : `Загрузить ${validCount || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
