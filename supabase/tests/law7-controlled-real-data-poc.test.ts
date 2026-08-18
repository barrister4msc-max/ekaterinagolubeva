import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const exporterPath = "scripts/law7_controlled_export.py";
const exporter = readFileSync(exporterPath, "utf8");
const importer = readFileSync("scripts/law7_mirror_import.py", "utf8");
const workflow = readFileSync(".github/workflows/law7-controlled-real-data-poc.yml", "utf8");
const temporalGuard = readFileSync("supabase/migrations/20260818152000_law7_mirror_temporal_fail_closed.sql", "utf8");

function runExporterContract(script: string) {
  const completed = spawnSync("python", ["-c", script], {
    encoding: "utf8",
  });
  expect(completed.status).toBe(0);
  return completed.stdout.trim();
}

describe("Law7 controlled real-data PoC contract", () => {
  test("legacy NK RF six-article PoC remains behaviorally allowlisted", () => {
    const result = runExporterContract(`
import importlib.util, json
spec = importlib.util.spec_from_file_location("law7_controlled_export", "${exporterPath}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
code, articles = module.ensure_poc_allowlist("NK_RF", ["54.1", "88", "89", "93", "100", "101"])
blocked = False
try:
    module.ensure_poc_allowlist("NK_RF", ["54.1", "102"])
except ValueError:
    blocked = True
print(json.dumps({"code": code, "articles": articles, "blocked": blocked}))
`);
    const parsed = JSON.parse(result);
    expect(parsed.code).toBe("NK_RF");
    expect(parsed.articles).toEqual(["54.1", "88", "89", "93", "100", "101"]);
    expect(parsed.blocked).toBe(true);
  });

  test("TAX CORE allowlist is explicit and rejects unrelated codes", () => {
    const result = runExporterContract(`
import importlib.util, json
spec = importlib.util.spec_from_file_location("law7_controlled_export", "${exporterPath}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
selected = module.normalize_codes(["NK_RF", "NK_RF_2", "APK_RF", "KoAP_RF", "BK_RF", "GK_RF", "GK_RF_2", "KONST_RF", "KAS_RF"])
blocked = False
try:
    module.normalize_codes(["UK_RF"])
except ValueError:
    blocked = True
print(json.dumps({"selected": selected, "blocked": blocked}))
`);
    const parsed = JSON.parse(result);
    expect(parsed.selected).toEqual([
      "NK_RF",
      "NK_RF_2",
      "APK_RF",
      "KoAP_RF",
      "BK_RF",
      "GK_RF",
      "GK_RF_2",
      "KONST_RF",
      "KAS_RF",
    ]);
    expect(parsed.blocked).toBe(true);
  });

  test("Law7 source access is explicit read-only and provenance is required", () => {
    expect(exporter).toContain("set transaction read only");
    expect(exporter).toContain("conn.rollback()");
    expect(exporter).toContain("LAW7_SOURCE_COMMIT");
    expect(exporter).toContain('SOURCE_REPOSITORY = "mikhashev/law7"');

    const result = runExporterContract(`
import importlib.util, json
spec = importlib.util.spec_from_file_location("law7_controlled_export", "${exporterPath}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
accepted = module.validate_source_revision("a" * 40)
blocked = False
try:
    module.validate_source_revision("main")
except ValueError:
    blocked = True
print(json.dumps({"accepted": accepted, "blocked": blocked}))
`);
    const parsed = JSON.parse(result);
    expect(parsed.accepted).toBe("a".repeat(40));
    expect(parsed.blocked).toBe(true);
  });

  test("export targets the real Law7 consolidated data contract", () => {
    expect(exporter).toContain("from consolidated_codes");
    expect(exporter).toContain("from code_article_versions");
    expect(exporter).toContain("from amendment_applications");
    expect(exporter).toContain("status = 'applied'");
  });

  test("blank upstream text hashes are deterministically normalized", () => {
    const result = runExporterContract(`
import importlib.util, json
spec = importlib.util.spec_from_file_location("law7_controlled_export", "${exporterPath}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
dataset = module.build_dataset(
    dataset_key=module.TAX_CORE_DATASET_KEY,
    source_commit="a" * 64,
    code_rows=[{"code": "NK_RF", "name": "НК РФ"}],
    version_rows=[{
        "code_id": "NK_RF",
        "article_number": "54.1",
        "version_date": "2017-08-19",
        "article_text": "deterministic",
        "text_hash": None,
        "is_current": True,
        "is_repealed": False,
    }],
    amendment_rows=[],
    required_codes=["NK_RF"],
)
print(json.dumps({"hash": dataset["article_versions"][0]["text_hash"]}))
`);
    const parsed = JSON.parse(result);
    expect(parsed.hash).toHaveLength(64);
    expect(importer).toContain('hashlib.sha256(article_text.encode("utf-8")).hexdigest()');
  });

  test("unverified historical coverage fails closed without disabling general retrieval", () => {
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

  test("manual workflow cannot target production by secret name", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("LAW7_POC_MIRROR_DATABASE_URL");
    expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("SUPABASE_DB_URL");
  });
});
