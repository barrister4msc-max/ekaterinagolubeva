import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const functionPath = join(testsDirectory, "../functions/extract-document-text/index.ts");

describe("extract-document-text short text files", () => {
  test("does not reject a non-empty DOCX by an arbitrary 50-character threshold", async () => {
    const source = (await Bun.file(functionPath).text()).replace(/\r\n/g, "\n");
    expect(source).toContain("text.length === 0");
    expect(source).toContain('detected.kind === "image" || detected.kind === "pdf"');
    expect(source).toContain("else if (textLength > 0)");
    expect(source).not.toContain("else if (textLength >= 50)");
  });

  test("sanitizes binary PDF control bytes and always prefers the OCR fallback for PDFs", async () => {
    const source = (await Bun.file(functionPath).text()).replace(/\r\n/g, "\n");
    expect(source).toContain("sanitizeExtractedText");
    expect(source).toContain('.replace(/\\u0000/g, "")');
    expect(source).toMatch(/detected\.kind === "image"\s*\|\|\s*detected\.kind === "pdf"\s*\|\|\s*\(?\s*text\.length === 0/);
    expect(source).toContain("const fallbackText = sanitizeExtractedText(fallback.text)");
    expect(source).toContain("isUsablePdfTextLayer");
    expect(source).toContain("readable / value.length >= 0.82 && words >= 10");
    expect(source).toContain('status = "ocr_required";\n      text = "";');
  });
});
