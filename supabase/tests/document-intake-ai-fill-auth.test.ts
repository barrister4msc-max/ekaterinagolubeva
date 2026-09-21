import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const functionPath = join(testsDirectory, "../functions/document-intake-ai-fill/index.ts");

describe("document-intake-ai-fill authorization boundary", () => {
  test("validates the bearer token and admin role before reading identifiers", async () => {
    const source = await Bun.file(functionPath).text();
    const getUser = source.indexOf("supabase.auth.getUser(accessToken)");
    const roleCheck = source.indexOf('"is_admin_or_superadmin"');
    const requestBody = source.indexOf("await req.json()");

    expect(getUser).toBeGreaterThan(-1);
    expect(roleCheck).toBeGreaterThan(getUser);
    expect(requestBody).toBeGreaterThan(roleCheck);
    expect(source).toContain('error: "Unauthorized" }, 401');
    expect(source).toContain('error: "Forbidden" }, 403');
  });

  test("does not authorize from user-editable metadata", async () => {
    const source = await Bun.file(functionPath).text();

    expect(source).not.toMatch(/user_metadata|raw_user_meta_data/);
  });

  test("fills only the complete server-authoritative document package", async () => {
    const source = await Bun.file(functionPath).text();

    expect(source).toContain("document_ids");
    expect(source).toContain("sessionDocumentIds");
    expect(source).toContain("requestedExactlyMatchesSession");
    expect(source).toContain("full_corpus_document_set_mismatch");
    expect(source).toContain("full_corpus_incomplete");
    expect(source).not.toContain("documentTextForAiFill.length < 50");
  });

  test("rejects malformed Russian tax identifiers", async () => {
    const source = await Bun.file(functionPath).text();

    expect(source).toContain('["taxpayer_inn", "counterparty_inn"]');
    expect(source).toContain("digits.length !== 10 && digits.length !== 12");
    expect(source).toContain("digits.length !== 13");
    expect(source).toContain("digits.length !== 15");
  });

  test("never lets an AI rerun overwrite a non-AI answer source", async () => {
    const source = await Bun.file(functionPath).text();
    const allowedAnswers = source.indexOf("const allowedAnswers = answers.filter");
    const sourceGuard = source.indexOf(
      'if (existingSource && existingSource !== "ai_document") return false;',
      allowedAnswers,
    );
    const aiUpsert = source.indexOf('value_source: "ai_document"', sourceGuard);

    expect(allowedAnswers).toBeGreaterThan(-1);
    expect(sourceGuard).toBeGreaterThan(allowedAnswers);
    expect(aiUpsert).toBeGreaterThan(sourceGuard);
  });
});
