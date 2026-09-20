import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelFacingDocumentText, prepareSafeAiFillDocuments } from "../functions/document-intake-ai-fill/redaction-safety";
import { resolveAiFillPrivacyDecision } from "../functions/document-intake-ai-fill/privacy-policy";
import { parseFailure, providerHttpFailure } from "../functions/_shared/ai-privacy-diagnostics";

const CANARY = "Иванова Анна ИНН 7701234567 — исходный текст документа";

function allowedScope(overrides: Record<string, unknown> = {}) {
  return {
    authenticated: true,
    isAdmin: true,
    userId: "user-1",
    serverOriginalOcrEnabled: true,
    session: { id: "session-1", created_by: null, matter_id: null, client_id: null },
    documents: [{ intake_session_id: "session-1", uploaded_by: null, matter_id: null, client_id: null }],
    ...overrides,
  };
}

describe("Stage 01B server privacy decision", () => {
  test("blocks unauthenticated and cross-matter requests before a provider input can be built", () => {
    expect(resolveAiFillPrivacyDecision(allowedScope({ authenticated: false })).mode).toBe("blocked");
    expect(resolveAiFillPrivacyDecision(allowedScope({
      session: { id: "session-1", created_by: null, matter_id: "matter-a", client_id: null },
      documents: [{ intake_session_id: "session-1", uploaded_by: null, matter_id: "matter-b", client_id: null }],
    })).mode).toBe("blocked");
  });

  test("a client-supplied flag cannot elevate privacy permission", () => {
    const decision = resolveAiFillPrivacyDecision({
      ...allowedScope({ authenticated: false }),
      allow_unredacted_text: true,
    } as any);
    expect(decision.mode).toBe("blocked");
  });

  test("an allowed sole-user scope preserves original AI-fill input without a browser bypass", () => {
    const decision = resolveAiFillPrivacyDecision(allowedScope());
    expect(decision.mode).toBe("original_by_permission");
    const payload = buildModelFacingDocumentText(prepareSafeAiFillDocuments([{
      id: "doc-1",
      ocr_text: "[COMPANY_1]",
      metadata: { original_ocr_text: CANARY },
    }], decision.mode));
    expect(payload).toContain(CANARY);
  });

  test("the server can force the safe redacted mode without changing client input", () => {
    expect(resolveAiFillPrivacyDecision(allowedScope({ serverOriginalOcrEnabled: false })).mode).toBe("safe");
  });
});

describe("Stage 01B diagnostics", () => {
  test("provider and parse diagnostics retain only allowlisted metadata", () => {
    const serialized = JSON.stringify([
      providerHttpFailure("gemini-2.5-flash", 503, CANARY),
      parseFailure(CANARY),
    ]);
    expect(serialized).not.toContain(CANARY);
    expect(serialized).toContain("response_chars");
  });

  test("source contracts remove raw Gemini/OCR logging and client elevation", async () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const files = [
      "../functions/document-intake-ai-fill/index.ts",
      "../functions/analyze-document-legal-position/index.ts",
      "../functions/analyze-document-legal-position/gemini-fallback.ts",
      "../functions/review-generated-legal-document/index.ts",
      "../functions/review-generated-legal-document/gemini-fallback.ts",
      "../functions/generate-legal-document-v2/index.ts",
      "../../src/components/document-builder/intake-form.tsx",
    ];
    const source = await Promise.all(files.map((path) => Bun.file(join(root, path)).text()));
    const joined = source.join("\n");
    expect(joined).not.toContain("RAW GEMINI:");
    expect(joined).not.toContain("raw_response_preview");
    expect(joined).not.toContain("allow_unredacted_text");
    expect(joined).not.toContain("allowUnredactedText");
  });
});
