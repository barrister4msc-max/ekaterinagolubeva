import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const functionPath = join(testsDirectory, "../functions/extract-document-text/index.ts");

describe("extract-document-text short text files", () => {
  test("does not reject a non-empty DOCX by an arbitrary 50-character threshold", async () => {
    const source = await Bun.file(functionPath).text();
    expect(source).toContain("text.trim().length === 0");
    expect(source).toContain('detected.kind === "image" || detected.kind === "pdf"');
    expect(source).toContain("else if (textLength > 0)");
    expect(source).not.toContain("else if (textLength >= 50)");
  });
});
