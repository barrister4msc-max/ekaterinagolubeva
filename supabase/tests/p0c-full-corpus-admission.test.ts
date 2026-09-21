import { describe, expect, test } from "bun:test";
import {
  buildFullCorpusFingerprint,
  evaluateFullCorpusAdmission,
  matchesFullCorpusAdmissionSnapshot,
} from "../functions/_shared/full-corpus-admission";

const document = (
  id: string,
  extraction_status: string,
  ocr_text = "достаточный извлечённый текст",
  page_index_progress?: Record<string, unknown>,
) => ({
  id,
  ocr_text,
  metadata: {
    extraction_status,
    ...(page_index_progress ? { page_index_progress } : {}),
  },
});

describe("Stage 13L-1 full-corpus admission", () => {
  test("allows a completed packet and records a metadata-only fingerprint", () => {
    const result = evaluateFullCorpusAdmission([
      document("a", "completed"),
      document("large", "completed", "полный OCR", {
        complete: true,
        percent: 100,
        indexedPages: 600,
        totalPages: 600,
      }),
    ]);

    expect(result.allowed).toBe(true);
    expect(result.blocked_document_count).toBe(0);
    expect(result.document_ids).toEqual(["a", "large"]);
    expect(result.fingerprint).not.toContain("полный OCR");
  });

  test("blocks a partial large PDF even when another packet member is ready", () => {
    const result = evaluateFullCorpusAdmission([
      document("ready", "completed"),
      document("large", "partial_pages", "частичный текст", {
        complete: false,
        percent: 50,
        indexedPages: 300,
        totalPages: 600,
      }),
    ]);

    expect(result.allowed).toBe(false);
    expect(result.blocked_document_count).toBe(1);
    expect(result.block_reasons).toEqual(["partial_pages"]);
  });

  test("blocks a completed status when its declared page index is incomplete", () => {
    const result = evaluateFullCorpusAdmission([
      document("large", "completed", "частичный текст", {
        complete: false,
        percent: 99,
        indexedPages: 594,
        totalPages: 600,
      }),
    ]);

    expect(result.allowed).toBe(false);
    expect(result.block_reasons).toEqual(["page_index_incomplete"]);
  });

  test("changes the fingerprint when any packet member changes admission state", () => {
    const complete = [document("a", "completed"), document("b", "completed")];
    const pending = [document("a", "completed"), document("b", "pending", "")];
    expect(buildFullCorpusFingerprint(complete)).not.toBe(buildFullCorpusFingerprint(pending));
  });

  test("rejects a final corpus snapshot that changed after admission", () => {
    const admitted = evaluateFullCorpusAdmission([
      document("a", "completed"),
      document("b", "completed"),
    ]);
    const afterUpload = evaluateFullCorpusAdmission([
      document("a", "completed"),
      document("b", "completed"),
      document("late", "completed"),
    ]);
    const afterExtractionChanged = evaluateFullCorpusAdmission([
      document("a", "completed"),
      document("b", "partial_pages", "частичный текст"),
    ]);

    expect(matchesFullCorpusAdmissionSnapshot(admitted, admitted)).toBe(true);
    expect(matchesFullCorpusAdmissionSnapshot(admitted, afterUpload)).toBe(false);
    expect(matchesFullCorpusAdmissionSnapshot(admitted, afterExtractionChanged)).toBe(false);
  });

  test("all AI-consuming server entry points contain the full-corpus guard", async () => {
    const aiFill = await Bun.file("supabase/functions/document-intake-ai-fill/index.ts").text();
    const analysis = await Bun.file("supabase/functions/analyze-document-legal-position/index.ts").text();
    const generator = await Bun.file("supabase/functions/generate-legal-document-v2/index.ts").text();

    expect(aiFill).toContain("evaluateFullCorpusAdmission(documents)");
    expect(aiFill).toContain("full_corpus_document_set_mismatch");
    expect(aiFill).toContain("full_corpus_incomplete");
    expect(analysis).toContain("evaluateFullCorpusAdmission(fullCorpusDocuments ?? [])");
    expect(analysis).toContain("full_corpus_incomplete");
    expect(analysis).toContain("full_corpus_document_limit");
    expect(analysis).toContain("matchesFullCorpusAdmissionSnapshot(corpusAdmission, consumedCorpusAdmission)");
    expect(analysis).toContain("full_corpus_changed");
    expect(generator).toContain("evaluateFullCorpusAdmission(fullCorpusDocuments ?? [])");
    expect(generator).toContain("full_corpus_incomplete");
  });
});
