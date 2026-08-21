import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mayReplaceAnswerWithAi } from "../functions/document-intake-ai-fill/answer-write-policy.ts";

const testsDirectory = dirname(fileURLToPath(import.meta.url));

describe("document intake write safety", () => {
  test("AI may insert an answer when the field is empty", () => {
    expect(mayReplaceAnswerWithAi(null)).toBe(true);
  });

  test("AI may refresh only an unverified AI-owned answer", () => {
    expect(
      mayReplaceAnswerWithAi({
        id: "answer-1",
        value_source: "ai_document",
        is_verified: false,
      }),
    ).toBe(true);
  });

  test("manual, registry, preserved, and verified answers are protected", () => {
    for (const valueSource of ["manual", "registry", "document_preserved"]) {
      expect(
        mayReplaceAnswerWithAi({
          id: `answer-${valueSource}`,
          value_source: valueSource,
          is_verified: false,
        }),
      ).toBe(false);
    }
    expect(
      mayReplaceAnswerWithAi({
        id: "answer-verified",
        value_source: "ai_document",
        is_verified: true,
      }),
    ).toBe(false);
  });

  test("OCR claim is service-role-only and precedes file download", async () => {
    const migration = await Bun.file(
      join(testsDirectory, "../migrations/20260821231500_claim_document_text_extraction.sql"),
    ).text();
    const source = await Bun.file(
      join(testsDirectory, "../functions/extract-document-text/index.ts"),
    ).text();

    expect(migration).toContain("for update");
    expect(migration).toContain("revoke all on function public.claim_document_text_extraction");
    expect(migration).toContain("grant execute on function public.claim_document_text_extraction");
    expect(migration).toContain("to service_role");

    const claim = source.indexOf('rpc("claim_document_text_extraction"');
    const download = source.indexOf("downloadFile(supabase, doc.storage_path)");
    expect(claim).toBeGreaterThan(-1);
    expect(download).toBeGreaterThan(claim);
  });
});
