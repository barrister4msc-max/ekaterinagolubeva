import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mayReplaceAnswerWithAi } from "../functions/document-intake-ai-fill/answer-write-policy.ts";

const testsDirectory = dirname(fileURLToPath(import.meta.url));

describe("document intake write safety", () => {
  test("AI may insert an answer when the field is empty", () => {
    expect(mayReplaceAnswerWithAi(null, { confidence: 0.75 })).toBe(true);
  });

  test("AI may refresh only an unverified AI-owned answer when confidence improves", () => {
    expect(
      mayReplaceAnswerWithAi({
        id: "answer-1",
        value_source: "ai_document",
        is_verified: false,
        confidence: 0.7,
      }, { confidence: 0.8 }),
    ).toBe(true);
    expect(
      mayReplaceAnswerWithAi({
        id: "answer-1",
        value_source: "ai_document",
        is_verified: false,
        confidence: 0.8,
      }, { confidence: 0.8 }),
    ).toBe(false);
  });

  test("manual, registry, preserved, and verified answers are protected", () => {
    for (const valueSource of ["manual", "registry", "document_preserved"]) {
      expect(
        mayReplaceAnswerWithAi({
          id: `answer-${valueSource}`,
          value_source: valueSource,
          is_verified: false,
          confidence: 0.9,
        }, { confidence: 1 }),
      ).toBe(false);
    }
    expect(
      mayReplaceAnswerWithAi({
        id: "answer-verified",
        value_source: "ai_document",
        is_verified: true,
        confidence: 0.2,
      }, { confidence: 1 }),
    ).toBe(false);
  });

  test("OCR claim is service-role-only and precedes file download", async () => {
    const migration = await Bun.file(
      join(testsDirectory, "../migrations/20260821231500_claim_document_text_extraction.sql"),
    ).text();
    const followUpMigration = await Bun.file(
      join(testsDirectory, "../migrations/20260822120000_pr69_idempotency_quality_and_archive_lease.sql"),
    ).text();
    const source = await Bun.file(
      join(testsDirectory, "../functions/extract-document-text/index.ts"),
    ).text();

    expect(migration).toContain("for update");
    expect(migration).toContain("revoke all on function public.claim_document_text_extraction");
    expect(migration).toContain("grant execute on function public.claim_document_text_extraction");
    expect(migration).toContain("to service_role");
    expect(followUpMigration).toContain("claim_document_intake_ai_fill");
    expect(followUpMigration).toContain("complete_document_intake_ai_fill");
    expect(followUpMigration).toContain("claim_archive_item_text_extraction");

    const claim = source.indexOf('rpc("claim_document_text_extraction"');
    const archiveClaim = source.indexOf('rpc("claim_archive_item_text_extraction"');
    expect(source).toContain('text_extraction_lease_until: null');
    expect(source).toContain('ocr_error: "no_storage_path"');
    const download = source.indexOf("downloadFile(supabase, doc.storage_path)");
    expect(claim).toBeGreaterThan(-1);
    expect(archiveClaim).toBeGreaterThan(-1);
    expect(download).toBeGreaterThan(claim);
  });

  test("client and AI-fill use stable idempotency", async () => {
    const intake = await Bun.file(
      join(testsDirectory, "../../src/components/document-builder/intake-form.tsx"),
    ).text();
    const aiFill = await Bun.file(
      join(testsDirectory, "../functions/document-intake-ai-fill/index.ts"),
    ).text();

    expect(intake).toContain("aiFillRequestId");
    expect(intake).toContain("request_id: aiFillRequestId");
    expect(aiFill).toContain("claim_document_intake_ai_fill");
    expect(aiFill).toContain("complete_document_intake_ai_fill");
  });

  test("client resumes and waits for an existing OCR lease", async () => {
    const source = await Bun.file(
      join(testsDirectory, "../../src/components/document-builder/intake-form.tsx"),
    ).text();

    expect(source).toContain('data?.extraction_status === "processing"');
    expect(source).toContain("waitForPersistedExtraction(documentId, 190_000)");
    expect(source).toContain('d.extraction_status === "processing"');
  });
});
