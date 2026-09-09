import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const importerPath = "scripts/garant_nk_internal_kb_import.py";
const importer = readFileSync(importerPath, "utf8");

describe("GARANT NK internal law knowledge writer", () => {
  test("is scoped to the existing internal KB and never Law7", () => {
    expect(importer).toContain('DATASET_KEY = "private_garant_nk_snapshot"');
    expect(importer).toContain('"target_table": "public.legal_law_chunks"');
    expect(importer).toContain("law7_mirror_touched");
    expect(importer).toContain("law7_mirror_import_allowed");
    expect(importer).not.toMatch(/insert\s+into\s+law7_mirror/i);
    expect(importer).not.toMatch(/update\s+law7_mirror/i);
    expect(importer).not.toMatch(/delete\s+from\s+law7_mirror/i);
  });

  test("dry-runs an admitted two-part payload without a database connection", () => {
    const program = String.raw`
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

def row(code_id, article_number, text):
    return {
      "code_id": code_id, "article_number": article_number, "article_title": "Статья " + article_number,
      "article_text": text, "text_hash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
      "is_repealed": False,
    }

payload = {
  "dataset_key": "private_garant_nk_snapshot",
  "source_provider_id": "garant_user_supplied",
  "source_commit": "a" * 64,
  "admission": {
    "target_table": "public.legal_law_chunks",
    "source_namespace": "garant_user_supplied_nk",
    "law7_mirror_import_allowed": False,
    "requires_owner_license_confirmation": True,
    "requires_existing_kb_admission_writer": True,
  },
  "provenance": {
    "snapshot_date": "2026-09-09",
    "official_origin_verified": False,
    "content_verified": False,
    "temporal_verified": False,
    "substantive_use_allowed": False,
    "license_scope_requires_owner_confirmation": True,
  },
  "article_versions": [
    row("NK_RF", "1", "Текст части первой."),
    row("NK_RF_2", "143", "Текст части второй."),
  ],
}
with tempfile.TemporaryDirectory() as tmp:
  path = Path(tmp) / "payload.json"
  path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
  result = subprocess.run(
    ["python", "scripts/garant_nk_internal_kb_import.py", "--input", str(path)],
    capture_output=True, text=True, check=False,
  )
  print(json.dumps({"status": result.returncode, "stdout": result.stdout, "stderr": result.stderr}))
`;
    const result = spawnSync("python", ["-c", program], { encoding: "utf8" });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const execution = JSON.parse(result.stdout);
    expect(execution.status, execution.stderr || execution.stdout).toBe(0);
    const output = JSON.parse(execution.stdout);
    expect(output.mode).toBe("dry_run");
    expect(output.target_table).toBe("public.legal_law_chunks");
    expect(output.rows).toBe(2);
    expect(output.law7_mirror_touched).toBe(false);
    expect(output.embeddings_requested).toBe(false);
    expect(output.substantive_use_allowed).toBe(false);
  });

  test("requires explicit apply and owner-license confirmation", () => {
    expect(importer).toContain('parser.add_argument("--apply", action="store_true")');
    expect(importer).toContain('parser.add_argument("--confirm-license", default="")');
    expect(importer).toContain("DATABASE_URL is required for --apply");
    expect(importer).toContain("I_CONFIRM_LICENSED_GARANT_INTERNAL_USE");
  });
});
