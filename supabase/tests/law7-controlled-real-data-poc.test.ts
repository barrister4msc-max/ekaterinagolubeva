import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const exporter = readFileSync("scripts/law7_controlled_export.py", "utf8");
const importer = readFileSync("scripts/law7_mirror_import.py", "utf8");
const workflow = readFileSync(".github/workflows/law7-controlled-real-data-poc.yml", "utf8");

describe("Law7 controlled real-data PoC contract", () => {
  test("export is fixed to the first NK RF allowlist", () => {
    expect(exporter).toContain('ALLOWED_CODE = "NK_RF"');
    for (const article of ["54.1", "88", "89", "93", "100", "101"]) {
      expect(exporter).toContain(`"${article}"`);
    }
    expect(exporter).toContain("articles outside controlled allowlist");
  });

  test("Law7 source access is explicit read-only and provenance is required", () => {
    expect(exporter).toContain("set transaction read only");
    expect(exporter).toContain("conn.rollback()");
    expect(exporter).toContain("LAW7_SOURCE_COMMIT");
    expect(exporter).toContain('SOURCE_REPOSITORY = "mikhashev/law7"');
  });

  test("export targets the real Law7 consolidated data contract", () => {
    expect(exporter).toContain("from consolidated_codes");
    expect(exporter).toContain("from code_article_versions");
    expect(exporter).toContain("from amendment_applications");
    expect(exporter).toContain("status = 'applied'");
  });

  test("blank upstream text hashes are normalized for deterministic importer hashing", () => {
    expect(exporter).toContain("optional_nonblank_text");
    expect(exporter).toContain('"text_hash": optional_nonblank_text(row.get("text_hash"))');
    expect(importer).toContain('hashlib.sha256(article_text.encode("utf-8")).hexdigest()');
  });

  test("existing KATI importer remains the only mirror writer", () => {
    expect(workflow).toContain("scripts/law7_mirror_import.py");
    expect(importer).toContain("DATABASE_URL is required with --apply");
    expect(exporter).not.toContain("law7_mirror.codes");
    expect(exporter).not.toContain("insert into law7_mirror");
  });

  test("manual workflow cannot target production by secret name", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("LAW7_POC_MIRROR_DATABASE_URL");
    expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("SUPABASE_DB_URL");
  });
});
