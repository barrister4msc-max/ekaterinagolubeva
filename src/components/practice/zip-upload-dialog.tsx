import { useState } from "react";
import JSZip from "jszip";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FolderArchive } from "lucide-react";
import { archiveBulkCreate } from "@/lib/lawyer-matters.functions";

const IGNORED_PREFIX = ["__MACOSX/", "__MACOSX"];
const IGNORED_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

const EXT_TO_CATEGORY: Record<string, string> = {
  jpg: "case_images", jpeg: "case_images", png: "case_images", gif: "case_images",
  webp: "case_images", heic: "case_images", tif: "case_images", tiff: "case_images",
};

function isIgnored(path: string) {
  if (path.endsWith("/")) return true;
  if (IGNORED_PREFIX.some((p) => path.startsWith(p))) return true;
  const base = path.split("/").pop() ?? "";
  if (!base) return true;
  if (base.startsWith(".")) return true;
  if (IGNORED_NAMES.has(base)) return true;
  return false;
}

function getExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

export function ZipUploadDialog({ onUploaded }: { onUploaded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("");
  const bulkCreate = useServerFn(archiveBulkCreate);

  const reset = () => {
    setFile(null);
    setBusy(false);
    setProgress(0);
    setStatus("");
  };

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setStatus("Распаковка ZIP…");
    try {
      const zip = await JSZip.loadAsync(file);
      const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
      zip.forEach((relPath, entry) => {
        if (entry.dir) return;
        if (isIgnored(relPath)) return;
        entries.push({ path: relPath, entry });
      });
      if (entries.length === 0) {
        toast.error("В архиве не найдено подходящих файлов");
        setBusy(false);
        return;
      }

      const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const items: Parameters<typeof bulkCreate>[0]["data"]["items"] = [];
      let done = 0;

      for (const { path, entry } of entries) {
        const blob = await entry.async("blob");
        if (blob.size === 0) {
          done += 1;
          continue;
        }
        const base = path.split("/").pop() ?? path;
        const safeName = sanitize(base) || `file_${done}`;
        const storagePath = `lawyer-archive/${batchId}/${Date.now()}_${done}_${safeName}`;
        setStatus(`Загрузка ${done + 1} / ${entries.length}: ${base}`);
        const { error } = await supabase.storage.from("lead-documents").upload(storagePath, blob, {
          contentType: blob.type || "application/octet-stream",
          upsert: false,
        });
        if (error) {
          console.error("upload error", error);
          toast.error(`Не удалось загрузить ${base}: ${error.message}`);
          done += 1;
          setProgress(Math.round((done / entries.length) * 100));
          continue;
        }
        const ext = getExt(base);
        items.push({
          title: base.replace(/\.[^.]+$/, "") || base,
          storage_path: storagePath,
          original_filename: base,
          file_extension: ext,
          file_size: blob.size,
          mime_type: blob.type || undefined,
          category: EXT_TO_CATEGORY[ext] || "contracts_archive",
          item_type: "document",
        });
        done += 1;
        setProgress(Math.round((done / entries.length) * 100));
      }

      if (items.length === 0) {
        toast.error("Ни один файл не был загружен");
        setBusy(false);
        return;
      }

      setStatus("Сохранение записей…");
      await bulkCreate({ data: { archive_batch_id: batchId, items } });
      toast.success(`Загружено файлов: ${items.length}`);
      onUploaded?.();
      setOpen(false);
      reset();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Ошибка загрузки архива");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderArchive className="size-4" /> Загрузить ZIP-папку
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Загрузка ZIP-архива</DialogTitle>
          <DialogDescription>
            Файлы будут сохранены в архив юриста. Они не попадают в правовую базу знаний и не используются
            в юридических заключениях до явного одобрения.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>ZIP-файл</Label>
            <Input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </div>
          {busy && (
            <div className="space-y-1">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">{status}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Отмена</Button>
          <Button onClick={handleUpload} disabled={!file || busy}>
            {busy ? "Загрузка…" : "Загрузить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
