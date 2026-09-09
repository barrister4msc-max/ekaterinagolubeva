import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const adapterPath = "scripts/garant_odt_nk_export.py";
const adapter = readFileSync(adapterPath, "utf8");

function runPython(source: string) {
  const result = spawnSync("python", ["-c", source], { encoding: "utf8" });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

describe("user-supplied GARANT ODT NK adapter", () => {
  test("excludes editorial layers and remains retrieval-only", () => {
    expect(adapter).toContain('"s9", "s9header"');
    expect(adapter).toContain('"s22", "s22header"');
    expect(adapter).toContain('"substantive_use_allowed": False');
    expect(adapter).toContain('"official_origin_verified": False');
    expect(adapter).toContain('"content_verified": False');
    expect(adapter).toContain('"temporal_verified": False');
    expect(adapter).toContain('"license_scope_requires_owner_confirmation": True');
  });

  test("normalizes both NK parts without leaking GARANT annotations", () => {
    const output = runPython(String.raw`
import importlib.util
import json
import tempfile
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("adapter", "${adapterPath}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

meta = """<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
 xmlns:dc="http://purl.org/dc/elements/1.1/">
 <office:meta>
  <meta:initial-creator>НПП &quot;Гарант-Сервис&quot;</meta:initial-creator>
  <dc:description>Документ экспортирован из системы ГАРАНТ</dc:description>
 </office:meta>
</office:document-meta>"""
content = """<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
 <office:body><office:text>
  <text:p text:style-name="s3">Часть первая</text:p>
  <text:p text:style-name="s15">Статья 1. Первая</text:p>
  <text:p text:style-name="s9header">ГАРАНТ:</text:p>
  <text:p text:style-name="s9">Комментарий</text:p>
  <text:p text:style-name="s22header">Информация об изменениях:</text:p>
  <text:p text:style-name="s22">Старая редакция</text:p>
  <text:p text:style-name="s1">Нормативный текст первой части.</text:p>
  <text:p text:style-name="s3">Часть вторая</text:p>
  <text:p text:style-name="s15">Статья 143. Вторая</text:p>
  <text:p text:style-name="s1">Нормативный текст второй части.</text:p>
 </office:text></office:body>
</office:document-content>"""

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "nk.odt"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("meta.xml", meta)
        archive.writestr("content.xml", content)
    payload = module.extract(path, "2026-09-09", minimum_articles=2)
    print(json.dumps({
        "codes": [row["code_id"] for row in payload["article_versions"]],
        "texts": [row["article_text"] for row in payload["article_versions"]],
        "source": payload["source_repository"],
        "allowed": payload["provenance"]["substantive_use_allowed"],
    }, ensure_ascii=False))
`);
    const parsed = JSON.parse(output);
    expect(parsed.codes).toEqual(["NK_RF", "NK_RF_2"]);
    expect(parsed.texts.join(" ")).toContain("Нормативный текст");
    expect(parsed.texts.join(" ")).not.toContain("Комментарий");
    expect(parsed.texts.join(" ")).not.toContain("Старая редакция");
    expect(parsed.source).toBe("user-supplied/garant-export");
    expect(parsed.allowed).toBe(false);
  });

  test("uses deterministic SHA256 provenance and targets the existing internal law knowledge base", () => {
    expect(adapter).toContain('"dataset_key": "private_garant_nk_snapshot"');
    expect(adapter).toContain('"target_table": "public.legal_law_chunks"');
    expect(adapter).toContain('"law7_mirror_import_allowed": False');
    expect(adapter).not.toContain('"dataset_key": "law7_codes"');
    expect(adapter).toContain("hashlib.sha256");
    expect(adapter).toContain('"source_file_sha256"');
    expect(adapter).toContain('"NK_RF_2"');
  });
});
