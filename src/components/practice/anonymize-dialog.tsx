import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Eraser, Loader2, ShieldAlert } from "lucide-react";
import { anonymize, isTextLike, type AnonymizeMode, type FoundEntity } from "@/lib/anonymization";
import { archiveCreateAnonymized } from "@/lib/lawyer-matters.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    id: string;
    title: string;
    storage_path: string | null;
    metadata: Record<string, any> | null;
  } | null;
  onCreated?: () => void;
}

const MODES: { v: AnonymizeMode; l: string; d: string }[] = [
  { v: "soft", l: "Мягкое", d: "ФИО, контакты, паспорт, ИНН/ОГРН/СНИЛС, адреса" },
  { v: "strict", l: "Строгое", d: "+ суммы, даты, номера договоров, кадастровые номера" },
  { v: "full", l: "Полное", d: "+ названия компаний и уникальные обстоятельства" },
];

export function AnonymizeDialog({ open, onOpenChange, item, onCreated }: Props) {
  const createFn = useServerFn(archiveCreateAnonymized);
  const [mode, setMode] = useState<AnonymizeMode>("soft");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceText, setSourceText] = useState<string>("");
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) {
      setSourceText("");
      setPasteText("");
      setPasteMode(false);
      setLoadError(null);
      return;
    }
    const md = item.metadata ?? {};
    const ext: string | undefined = md.file_extension;
    const mime: string | undefined = md.mime_type;
    if (!item.storage_path) {
      setPasteMode(true);
      setLoadError("У элемента нет файла. Вставьте текст вручную.");
      return;
    }
    if (!isTextLike(mime, ext)) {
      setPasteMode(true);
      setLoadError(
        `Файл .${ext || "?"} не поддерживается для автоматического извлечения текста. Вставьте текст вручную или нажмите «Обезличить» — копия будет помечена как needs_review.`,
      );
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from("lead-documents")
          .createSignedUrl(item.storage_path!, 600);
        if (error || !data) throw new Error(error?.message ?? "signed url failed");
        const res = await fetch(data.signedUrl);
        const txt = await res.text();
        setSourceText(txt);
      } catch (e: any) {
        setPasteMode(true);
        setLoadError(`Не удалось загрузить файл: ${e?.message ?? e}. Вставьте текст вручную.`);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, item]);

  const effectiveSource = pasteMode ? pasteText : sourceText;
  const result = useMemo(() => anonymize(effectiveSource, mode), [effectiveSource, mode]);
  const entitiesByKind = useMemo(() => {
    const m = new Map<string, FoundEntity[]>();
    for (const e of result.entities) {
      const list = m.get(e.kind) ?? [];
      list.push(e);
      m.set(e.kind, list);
    }
    return Array.from(m.entries());
  }, [result]);

  async function handleSave() {
    if (!item) return;
    setBusy(true);
    try {
      const hasText = effectiveSource.trim().length > 0;
      const anonymizedText = result.text;
      const status: "completed" | "needs_review" | "failed" = !hasText
        ? "needs_review"
        : result.entities.length === 0
          ? "needs_review"
          : "completed";

      // Upload anonymized .txt to storage (even if empty, to keep a record).
      const path = `lawyer-archive/anonymized/${item.id}/${Date.now()}.anonymized.txt`;
      const body = hasText
        ? anonymizedText
        : `# Обезличивание не выполнено\n# Исходный файл: ${item.title}\n# Статус: needs_review\n`;
      const { error: upErr } = await supabase.storage
        .from("lead-documents")
        .upload(path, new Blob([body], { type: "text/plain" }), {
          contentType: "text/plain",
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message);

      const summary = entitiesByKind.map(([kind, list]) => ({ kind, count: list.length }));
      await createFn({
        data: {
          original_archive_item_id: item.id,
          mode,
          storage_path: path,
          title: `${item.title} — обезличено (${mode})`,
          anonymization_status: status,
          entities_summary: summary,
          entities_total: result.entities.length,
          preview: anonymizedText.slice(0, 4000),
          original_length: effectiveSource.length,
          anonymized_length: anonymizedText.length,
          note: pasteMode ? loadError ?? null : null,
        },
      });
      toast.success(
        status === "completed"
          ? "Обезличенная копия создана"
          : "Копия создана, требуется проверка юриста",
      );
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eraser className="size-4" /> Обезличивание документа
          </DialogTitle>
          <DialogDescription>
            Исходный документ не изменяется. Будет создана отдельная обезличенная копия как новый
            элемент архива (category=anonymized).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Документ</Label>
            <div className="text-sm font-medium">{item?.title}</div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Режим обезличивания</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as AnonymizeMode)} className="gap-2">
              {MODES.map((m) => (
                <div key={m.v} className="flex items-start gap-2 rounded-md border p-2">
                  <RadioGroupItem value={m.v} id={`mode-${m.v}`} className="mt-1" />
                  <Label htmlFor={`mode-${m.v}`} className="cursor-pointer">
                    <div className="text-sm font-medium">{m.l}</div>
                    <div className="text-xs text-muted-foreground">{m.d}</div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {loadError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <ShieldAlert className="size-4 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}

          {pasteMode && (
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Текст документа</Label>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={8}
                placeholder="Вставьте текст документа сюда…"
              />
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Загружаем файл…
            </div>
          )}

          {effectiveSource && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground">Оригинал</Label>
                <Textarea readOnly value={effectiveSource.slice(0, 8000)} rows={14} className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground">Обезличенная версия</Label>
                <Textarea readOnly value={result.text.slice(0, 8000)} rows={14} className="font-mono text-xs" />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs uppercase text-muted-foreground">
              Найдено сущностей: {result.entities.length}
            </Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {entitiesByKind.length === 0 && (
                <span className="text-xs text-muted-foreground">Пока ничего не найдено.</span>
              )}
              {entitiesByKind.map(([kind, list]) => (
                <Badge key={kind} variant="secondary" className="text-xs">
                  {kind}: {list.length}
                </Badge>
              ))}
            </div>
            {result.entities.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-muted/40 p-2 text-xs space-y-0.5">
                {result.entities.slice(0, 200).map((e, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{e.placeholder}</Badge>
                    <span className="truncate text-muted-foreground">{e.original}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Обезличенная копия НЕ используется автоматически. Для генерации/обучения нажмите
            «Разрешить использовать как стиль/шаблон» в карточке копии.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={busy || loading}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Создать обезличенную копию
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
