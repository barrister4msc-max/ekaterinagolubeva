import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const functionPath = join(testsDirectory, "../functions/extract-external-research-text/index.ts");

describe("extract-external-research-text safety boundary", () => {
  test("requires authenticated admin or exact service role before extraction", async () => {
    const source = await Bun.file(functionPath).text();
    const authIndex = source.indexOf("await authorizeRequest(req, supabase)");
    const bodyIndex = source.indexOf("await req.json()");

    expect(source).toContain("accessToken === SERVICE_ROLE");
    expect(source).toContain("supabase.auth.getUser(accessToken)");
    expect(source).toContain('"is_admin_or_superadmin"');
    expect(authIndex).toBeGreaterThan(0);
    expect(authIndex).toBeLessThan(bodyIndex);
  });

  test("has an explicit external research purpose and no documents-table persistence", async () => {
    const source = await Bun.file(functionPath).text();

    expect(source).toContain('body.purpose !== "external_legal_research"');
    expect(source).toContain('persisted: false');
    expect(source).toContain('fact_extraction_eligible: false');
    expect(source).not.toContain('.from("documents")');
    expect(source).not.toContain('.from("document_intake_sessions")');
    expect(source).not.toContain('.update(');
    expect(source).not.toContain('.insert(');
  });

  test("bounds binary input and only admits PDF/images", async () => {
    const source = await Bun.file(functionPath).text();

    expect(source).toContain("MAX_FILE_BYTES = 10 * 1024 * 1024");
    expect(source).toContain('"application/pdf"');
    expect(source).toContain('"image/jpeg"');
    expect(source).toContain('"image/png"');
    expect(source).toContain('"image/webp"');
    expect(source).toContain('"unsupported_legacy_doc"');
  });

  test("OCR prompt forbids analysis and added facts", async () => {
    const source = await Bun.file(functionPath).text();

    expect(source).toContain("Верни только текст без анализа, выводов, пересказа и добавления фактов");
  });
});
