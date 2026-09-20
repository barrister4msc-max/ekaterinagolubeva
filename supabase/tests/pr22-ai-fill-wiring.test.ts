import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const aiFillPath = join(
  testsDirectory,
  "../functions/document-intake-ai-fill/index.ts",
);

describe("PR22 AI-fill server boundary wiring", () => {
  test("routes documents through the server privacy gate before Gemini", async () => {
    const source = await Bun.file(aiFillPath).text();
    const gateCall = source.indexOf("prepareSafeAiFillDocuments(documents, privacyDecision.mode)");
    const geminiCall = source.indexOf("extractAnswersWithGemini({");

    expect(gateCall).toBeGreaterThan(-1);
    expect(geminiCall).toBeGreaterThan(gateCall);
    expect(source).not.toContain("metadata.original_ocr_text");
    expect(source).not.toContain("file_name:");
    expect(source).not.toContain("allow_unredacted_text");
    expect(source).toContain("resolveAiFillPrivacyDecision");
    expect(source).toContain("buildModelFacingDocumentText(readyDocuments)");
  });
});
