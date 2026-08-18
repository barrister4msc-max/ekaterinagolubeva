import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const exporter = readFileSync("scripts/law7_controlled_export.py", "utf8");
const importer = readFileSync("scripts/law7_mirror_import.py", "utf8");
const workflow = readFileSync(".github/workflows/law7-controlled-real-data-poc.yml", "utf8");
const temporalGuard = readFileSync("supabase/migrations/20260818152000_law7_mirror_temporal_fail_closed.sql", "utf8");

describe("Law7 controlled real-data export contract", () => {
  test("legacy NK RF six-article PoC remains backward-compatible", () => {
    expect(exporter).toContain('POC_CODE = "NK_RF"');
    for (const article of ["54.1", "88", "89", "93", "100", "101"]) {
      expect(exporter).toContain(`"${article}"`);
    }
    expect(exporter).toContain("articles outside controlled PoC allowlist");
    expect(workflow).toContain("--code NK_RF");
    expect(workflow).toContain("--articles 54.1 88 89 93 100 101");
  });

  test("TAX CORE export is explicit-code allowlisted and includes conditional KAS RF", () => {
    for (const code of [
      "NK_RF",
      "NK_RF_2",
      "APK_RF",
      "KoAP_RF",
      "BK_RF",
      "GK_RF",
      "GK_RF_2",
      "KONST_RF",
    ]) {
      expect(exporter).toContain(`"${code}"`);
    }
    expect(exporter).toContain('CONDITIONAL_TAX_CORE_CODES = ("KAS_RF",)');
    expect(exporter).toContain("codes outside TAX CORE allowlist");
    expect(exporter).toContain('selection.add_argument(\n        "--codes"');
  });

  test("Law7 source access is explicit read-only and provenance is immutable", () => {
    expect(exporter).toContain('conn.execute("set transaction read only")');
    expect(exporter).toContain("conn.rollback()");
    expect(exporter).toContain("LAW7_SOURCE_COMMIT");
    expect(exporter).toContain('SOURCE_REPOSITORY = "mikhashev/law7"');
    expect(exporter).toContain("40-hex Law7 Git commit or 64-hex verified backup SHA256");
  });

  test("export targets the real Law7 consolidated data contract", () => {
    expect(exporter).toContain("from consolidated_codes");
    expect(exporter).toContain("from code_article_versions");
    expect(exporter).toContain("from amendment_applications");
    expect(exporter).toContain("status = 'applied'");
    expect(exporter).toContain("where code_id = any(%s)");
  });

  test("blank upstream text hashes are normalized deterministically", () => {
    expect(exporter).toContain("optional_nonblank_text");
    expect(exporter).toContain('hashlib.sha256(article_text.encode("utf-8")).hexdigest()');
    expect(importer).toContain('hashlib.sha256(article_text.encode("utf-8")).hexdigest()');
  });

  test("unverified historical coverage still fails closed", () => {
    expect(temporalGuard).toContain("historical_coverage' = 'verified");
    expect(temporalGuard).toContain("p_as_of_date is null");
    expect(workflow).toContain("historical_coverage\\\":\\\"unverified");
    expect(workflow).toContain("law7_mirror_is_available");
    expect(workflow).toContain("law7_mirror_query_laws");
    expect(workflow).toContain("law7_mirror_get_article_version");
    expect(workflow).toContain('= "0"');
  });

  test("existing KATI importer remains the only mirror writer", () => {
    expect(workflow).toContain("scripts/law7_mirror_import.py");
    expect(importer).toContain("DATABASE_URL is required with --apply");
    expect(exporter).not.toContain("insert into law7_mirror");
  });

  test("manual PoC workflow cannot target production by secret name", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("LAW7_POC_MIRROR_DATABASE_URL");
    expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("SUPABASE_DB_URL");
  });
});
