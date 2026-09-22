import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(testsDirectory, "../..");
const migrationPath = join(
  root,
  "supabase/migrations/20260922120000_stage13l2b_durable_ocr_jobs.sql",
);
const leaseCounterFixMigrationPath = join(
  root,
  "supabase/migrations/20260922120554_fix_stage13l2b_lease_counter.sql",
);
const extractorPath = join(root, "supabase/functions/extract-document-text/index.ts");

describe("Stage 13L-2B durable OCR job contract", () => {
  test("migration provides a private, fenced document job lease and atomic persistence", async () => {
    const source = (await Bun.file(migrationPath).text()).replace(/\r\n/g, "\n");
    expect(source).toContain("create table public.document_ocr_jobs");
    expect(source).toContain("document_id uuid not null unique references public.documents(id)");
    expect(source).toContain("'needs_manual_review'");
    expect(source).toContain("for update");
    expect(source).toContain("lease_token is distinct from p_lease_token");
    expect(source).toContain("update public.documents");
    expect(source).toContain("revoke all on function public.kati_claim_document_ocr_job");
    expect(source).toContain(
      "grant execute on function public.kati_persist_document_ocr_checkpoint",
    );
  });

  test("PDF OCR claims a job before using its checkpoint and never writes after a lost lease", async () => {
    const source = (await Bun.file(extractorPath).text()).replace(/\r\n/g, "\n");
    expect(source).toContain("claimDurablePdfOcrJob(supabase, documentId)");
    expect(source).toContain("durablePdfJob?.checkpoint?.page_index ?? existingMeta.page_index");
    expect(source).toContain("persistDurablePdfOcrCheckpoint");
    expect(source).toContain('error: "ocr_checkpoint_lease_lost"');
    expect(source).toContain('status = "needs_manual_review"');
    expect(source).toContain('extractionError = "pdf_ocr_retry_exhausted"');
  });

  test("lease counter update qualifies the table column and cannot collide with the RETURNS TABLE output", async () => {
    const source = (await Bun.file(leaseCounterFixMigrationPath).text()).replace(/\r\n/g, "\n");
    expect(source).toContain("create or replace function public.kati_claim_document_ocr_job");
    expect(source).toContain("as job");
    expect(source).toContain("invocation_count = job.invocation_count + 1");
  });
});
