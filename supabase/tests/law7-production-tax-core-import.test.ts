import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const gate = readFileSync("scripts/law7_tax_core_production_gate.py", "utf8");
const workflow = readFileSync(".github/workflows/law7-production-tax-core-import.yml", "utf8");

describe("Law7 Production TAX CORE import gate", () => {
  test("pins the exact Preview-audited provenance and corpus manifest", () => {
    expect(gate).toContain('SOURCE_COMMIT = "70a1d8fc6b27b67ad7f12f03f017d02b5f68a0c895447159039800965895f8b2"');
    expect(gate).toContain('CORPUS_MANIFEST_SHA256 = "8c2cbe47f3bb9b153ef590e472cc43d22808efafc911b7ca3c3cf4ece996343f"');
    expect(gate).toContain('EXPECTED_COUNTS = {"codes": 8, "article_versions": 2866, "amendments": 0}');
    expect(gate).toContain("article text_hash does not match article_text");
  });
  test("reconstructs the read-only source from the exact immutable backup", () => {
    expect(workflow).not.toContain("secrets.LAW7_SOURCE_DATABASE_URL");
    expect(workflow).toContain("1DPLpFpuwUZbLZEGo2TxnCAcLRdb2V1aD");
    expect(workflow).toContain('test "$(sha256sum law7-backup.tar.gz');
    expect(workflow).toContain("postgresql/law7.dump");
    expect(workflow).toContain("--table=public.consolidated_codes");
    expect(workflow).toContain("--table=public.code_article_versions");
    expect(workflow).toContain("--table=public.amendment_applications");
  });
  test("does not introduce another Production mirror writer", () => {
    expect(gate).toContain("set transaction read only");
    expect(gate).not.toMatch(/\b(insert|update|delete|truncate|alter|create)\b/i);
    expect(workflow).toContain("scripts/law7_mirror_import.py --input verified-tax-core.json --apply");
    expect(workflow).not.toContain("psql \"$DATABASE_URL\"");
    expect(workflow).not.toContain("pg_restore --dbname \"$DATABASE_URL\"");
  });
  test("requires manual main-branch confirmation and protected environment", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("IMPORT_LAW7_TAX_CORE_TO_PRODUCTION");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("name: law7-production");
    expect(workflow).toContain("LAW7_PRODUCTION_MIRROR_DATABASE_URL");
    expect(workflow).toContain("cancel-in-progress: false");
  });
  test("rejects a partial mirror before the sole writer could run", () => {
    const script = "import importlib.util; s=importlib.util.spec_from_file_location('g','scripts/law7_tax_core_production_gate.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); a={'contract_present':True,'codes':1,'article_versions':0,'amendments':0,'status':'','source_repository':'','source_commit':''};\ntry:\n m.validate_preflight(a)\nexcept ValueError:\n raise SystemExit(0)\nraise SystemExit(1)";
    const result = spawnSync("python", ["-c", script], { encoding: "utf8" });
    expect(result.status).toBe(0);
  });
});
