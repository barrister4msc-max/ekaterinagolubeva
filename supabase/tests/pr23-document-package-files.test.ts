import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DocumentPackageError,
  expandSelectedDocumentFiles,
  expandZipPackage,
  isIgnoredPackagePath,
  isSupportedDocumentName,
  isZipFile,
  packageEntryFileName,
  PACKAGE_LIMITS,
} from "../../src/lib/document-package-files";

const testsDirectory = dirname(fileURLToPath(import.meta.url));

function textFile(name: string, content = "hello"): File {
  return new File([content], name, { type: "text/plain" });
}

async function zipFile(
  entries: Array<[string, string | Uint8Array]>,
  name = "package.zip",
): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of entries) zip.file(path, content);
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], name, { type: "application/zip" });
}

describe("PR23 package helpers", () => {
  test("classifies zip containers and supported documents", () => {
    expect(isZipFile({ name: "a.ZIP" })).toBe(true);
    expect(isZipFile({ name: "a.pdf", type: "application/zip" })).toBe(true);
    expect(isZipFile({ name: "a.pdf", type: "application/pdf" })).toBe(false);
    expect(isSupportedDocumentName("dir/File.DOCX")).toBe(true);
    expect(isSupportedDocumentName("dir/file.rar")).toBe(false);
    expect(packageEntryFileName("a/b/возражения.pdf")).toBe("возражения.pdf");
  });

  test("ignores system and directory entries", () => {
    expect(isIgnoredPackagePath("__MACOSX/._a.pdf")).toBe(true);
    expect(isIgnoredPackagePath("folder/__MACOSX/a.pdf")).toBe(true);
    expect(isIgnoredPackagePath("folder/")).toBe(true);
    expect(isIgnoredPackagePath("folder/.DS_Store")).toBe(true);
    expect(isIgnoredPackagePath("folder/a.pdf")).toBe(false);
  });

  test("regular files pass through unchanged", async () => {
    const a = textFile("a.txt");
    const b = textFile("b.pdf");
    const result = await expandSelectedDocumentFiles([a, b]);
    expect(result.files).toEqual([a, b]);
    expect(result.expandedArchives).toEqual([]);
  });

  test("zip with nested folders expands supported files with inner base names", async () => {
    const archive = await zipFile(
      [
        ["Bromnitskiy/DSK/vozrazheniya.txt", "текст возражений"],
        ["Bromnitskiy/приложения/akt.html", "<p>акт</p>"],
        ["readme.txt", "заметка"],
      ],
      "KATI_LAWYER_test.zip",
    );
    const result = await expandSelectedDocumentFiles([textFile("plain.txt"), archive]);
    const names = result.files.map((f) => f.name).sort();
    expect(names).toEqual(["akt.html", "plain.txt", "readme.txt", "vozrazheniya.txt"]);
    expect(result.expandedArchives).toEqual(["KATI_LAWYER_test.zip"]);
    expect(result.files.some((f) => f.name.endsWith(".zip"))).toBe(false);
  });

  test("unsupported and system entries are ignored", async () => {
    const archive = await zipFile([
      ["docs/ok.pdf", "%PDF-1.4 test"],
      ["docs/inner.rar", "binary"],
      ["__MACOSX/._ok.pdf", "junk"],
      ["docs/.DS_Store", "junk"],
    ]);
    const { files, skippedEntries } = await expandZipPackage(archive, archive.name);
    expect(files.map((f) => f.name)).toEqual(["ok.pdf"]);
    expect(skippedEntries).toContain("inner.rar");
    expect(skippedEntries).not.toContain("._ok.pdf");
  });

  test("archive without supported documents is rejected", async () => {
    const archive = await zipFile([["docs/inner.rar", "binary"]], "empty.zip");
    await expect(expandZipPackage(archive, "empty.zip")).rejects.toBeInstanceOf(
      DocumentPackageError,
    );
  });

  test("entry-count limit rejects instead of partial upload", async () => {
    const entries: Array<[string, string]> = [];
    for (let i = 0; i <= PACKAGE_LIMITS.maxEntries; i += 1) {
      entries.push([`docs/file_${i}.txt`, "x"]);
    }
    const archive = await zipFile(entries, "many.zip");
    await expect(expandZipPackage(archive, "many.zip")).rejects.toThrow(/слишком много файлов/);
  });

  test("per-entry size limit rejects", async () => {
    const big = "a".repeat(PACKAGE_LIMITS.maxEntryBytes + 1024);
    const archive = await zipFile([["docs/big.txt", big]], "big.zip");
    await expect(expandZipPackage(archive, "big.zip")).rejects.toThrow(/больше 25 МБ/);
  });

  test("total expanded size limit rejects", async () => {
    const chunk = "a".repeat(20 * 1024 * 1024);
    const entries: Array<[string, string]> = [];
    for (let i = 0; i < 8; i += 1) entries.push([`docs/part_${i}.txt`, chunk]);
    const archive = await zipFile(entries, "total.zip");
    await expect(expandZipPackage(archive, "total.zip")).rejects.toThrow(/Общий размер/);
  });
});

describe("PR23 wiring regression", () => {
  test("ordinary template card click advances to step 2", async () => {
    const source = await Bun.file(
      join(testsDirectory, "../../src/routes/workspace.document-builder.tsx"),
    ).text();
    const cardClick = source.match(
      /onClick=\{\(\) => \{\s*setSelectedCode\(t\.code\);\s*setStep\(2\);\s*\}\}/,
    );
    expect(cardClick).not.toBeNull();
  });

  test("intake upload accepts .zip and expands packages before upload", async () => {
    const source = await Bun.file(
      join(testsDirectory, "../../src/components/document-builder/intake-form.tsx"),
    ).text();
    expect(source).toContain(".png,.webp,.zip");
    expect(source).toContain("expandSelectedDocumentFiles(selectedFiles)");
    const expandAt = source.indexOf("expandSelectedDocumentFiles(selectedFiles)");
    const uploadAt = source.indexOf("await stageSingleFile(file, session.id)");
    expect(expandAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(expandAt);
  });
});
