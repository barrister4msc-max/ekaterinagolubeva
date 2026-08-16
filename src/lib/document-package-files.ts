import JSZip from "jszip";

/**
 * Browser-only helper: expands selected ZIP packages into individual inner
 * documents so the existing upload -> extract-document-text pipeline can run
 * per document. No server-only imports.
 */

/** Extensions the document-builder intake + extract-document-text pipeline can handle. */
export const SUPPORTED_PACKAGE_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "txt",
  "rtf",
  "html",
  "htm",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "xls",
  "xlsx",
] as const;

export const PACKAGE_LIMITS = {
  maxEntries: 100,
  maxEntryBytes: 25 * 1024 * 1024,
  maxTotalBytes: 150 * 1024 * 1024,
} as const;

export class DocumentPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentPackageError";
  }
}

export type ExpandedPackageResult = {
  /** Files to upload (originals plus expanded ZIP members). */
  files: File[];
  /** Names of ZIP archives that were expanded. */
  expandedArchives: string[];
  /** Inner entries skipped because they are unsupported/system files. */
  skippedEntries: string[];
};

const IGNORED_BASENAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

export function getFileExtension(name: string): string {
  const base = name.split("/").pop() ?? name;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function isZipFile(file: { name: string; type?: string }): boolean {
  const ext = getFileExtension(file.name);
  if (ext === "zip") return true;
  const type = (file.type ?? "").toLowerCase();
  return type === "application/zip" || type === "application/x-zip-compressed";
}

export function isSupportedDocumentName(name: string): boolean {
  const ext = getFileExtension(name);
  return (SUPPORTED_PACKAGE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isIgnoredPackagePath(path: string): boolean {
  if (!path || path.endsWith("/")) return true;
  if (path.startsWith("__MACOSX/") || path.includes("/__MACOSX/")) return true;
  const base = path.split("/").pop() ?? "";
  if (!base) return true;
  if (base.startsWith(".")) return true;
  if (IGNORED_BASENAMES.has(base)) return true;
  return false;
}

export function packageEntryFileName(path: string): string {
  const base = (path.split("/").pop() ?? path).trim();
  return base || "document";
}

function mimeForExtension(ext: string): string {
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "txt":
      return "text/plain";
    case "rtf":
      return "application/rtf";
    case "html":
    case "htm":
      return "text/html";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

function toFile(name: string, blob: Blob): File {
  const type = blob.type && blob.type !== "" ? blob.type : mimeForExtension(getFileExtension(name));
  return new File([blob], name, { type });
}

/**
 * Expands one ZIP archive into supported inner documents.
 * Throws DocumentPackageError (Russian message) on empty archives or when
 * conservative zip-bomb limits are exceeded — never uploads partially.
 */
export async function expandZipPackage(
  file: File | Blob,
  archiveName = "архив",
): Promise<{ files: File[]; skippedEntries: string[] }> {
  let zip: JSZip;
  try {
    const buffer = await file.arrayBuffer();
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocumentPackageError(`Не удалось прочитать архив «${archiveName}». Файл повреждён или защищён паролем.`);
  }

  const candidates: Array<{ path: string; entry: JSZip.JSZipObject }> = [];
  const skippedEntries: string[] = [];

  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    if (isIgnoredPackagePath(relPath)) return;
    if (!isSupportedDocumentName(relPath)) {
      skippedEntries.push(packageEntryFileName(relPath));
      return;
    }
    candidates.push({ path: relPath, entry });
  });

  if (candidates.length === 0) {
    throw new DocumentPackageError(
      `В архиве «${archiveName}» нет поддерживаемых документов (PDF, DOC, DOCX, TXT, RTF, HTML, JPG, PNG, WEBP, XLS, XLSX).`,
    );
  }

  if (candidates.length > PACKAGE_LIMITS.maxEntries) {
    throw new DocumentPackageError(
      `В архиве «${archiveName}» слишком много файлов: ${candidates.length}. Максимум — ${PACKAGE_LIMITS.maxEntries}. Разделите архив и загрузите частями.`,
    );
  }

  const files: File[] = [];
  let totalBytes = 0;

  for (const { path, entry } of candidates) {
    const blob = await entry.async("blob");
    const name = packageEntryFileName(path);

    if (blob.size > PACKAGE_LIMITS.maxEntryBytes) {
      throw new DocumentPackageError(
        `Файл «${name}» в архиве «${archiveName}» больше ${Math.round(PACKAGE_LIMITS.maxEntryBytes / (1024 * 1024))} МБ. Загрузите его отдельно.`,
      );
    }

    totalBytes += blob.size;
    if (totalBytes > PACKAGE_LIMITS.maxTotalBytes) {
      throw new DocumentPackageError(
        `Общий размер распакованных файлов архива «${archiveName}» превышает ${Math.round(PACKAGE_LIMITS.maxTotalBytes / (1024 * 1024))} МБ. Разделите архив и загрузите частями.`,
      );
    }

    if (blob.size === 0) {
      skippedEntries.push(name);
      continue;
    }

    files.push(toFile(name, blob));
  }

  if (files.length === 0) {
    throw new DocumentPackageError(
      `В архиве «${archiveName}» нет поддерживаемых документов (PDF, DOC, DOCX, TXT, RTF, HTML, JPG, PNG, WEBP, XLS, XLSX).`,
    );
  }

  return { files, skippedEntries };
}

/**
 * Takes files picked by the user and returns the flat list to upload:
 * non-ZIP files pass through unchanged, ZIP packages are expanded and the
 * container itself is never uploaded.
 */
export async function expandSelectedDocumentFiles(
  selected: File[],
): Promise<ExpandedPackageResult> {
  const files: File[] = [];
  const expandedArchives: string[] = [];
  const skippedEntries: string[] = [];

  for (const file of selected) {
    if (!isZipFile(file)) {
      files.push(file);
      continue;
    }
    const expanded = await expandZipPackage(file, file.name);
    expandedArchives.push(file.name);
    files.push(...expanded.files);
    skippedEntries.push(...expanded.skippedEntries);
  }

  return { files, expandedArchives, skippedEntries };
}
