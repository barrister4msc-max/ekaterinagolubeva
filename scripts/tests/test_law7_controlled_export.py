from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXPORTER_PATH = ROOT / "scripts" / "law7_controlled_export.py"
IMPORTER_PATH = ROOT / "scripts" / "law7_mirror_import.py"
FIXTURE_PATH = ROOT / "scripts" / "tests" / "fixtures" / "law7_tax_core_dry_run.json"

spec = importlib.util.spec_from_file_location("law7_controlled_export", EXPORTER_PATH)
assert spec and spec.loader
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


def code_row(code: str) -> dict:
    return {"code": code, "name": f"Code {code}"}


def version_row(code: str, article: str = "1", version_date: str = "2026-01-01", text: str = "text") -> dict:
    return {
        "code_id": code,
        "article_number": article,
        "version_date": version_date,
        "article_text": text,
        "is_current": True,
        "is_repealed": False,
        "text_hash": None,
    }


class Law7TaxCoreExporterTests(unittest.TestCase):
    def test_tax_core_allowlist_accepts_only_explicit_codes(self) -> None:
        selected = exporter.normalize_codes(["NK_RF", "NK_RF_2", "KAS_RF", "NK_RF"])
        self.assertEqual(selected, ["NK_RF", "NK_RF_2", "KAS_RF"])
        with self.assertRaisesRegex(ValueError, "outside TAX CORE allowlist"):
            exporter.normalize_codes(["UK_RF"])

    def test_immutable_source_revision_requires_git_sha_or_backup_sha256(self) -> None:
        self.assertEqual(exporter.validate_source_revision("a" * 40), "a" * 40)
        self.assertEqual(exporter.validate_source_revision("B" * 64), "b" * 64)
        with self.assertRaisesRegex(ValueError, "exact 40-hex"):
            exporter.validate_source_revision("main")

    def test_missing_required_code_fails_closed(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "missing selected codes"):
            exporter.build_dataset(
                dataset_key=exporter.TAX_CORE_DATASET_KEY,
                source_commit="a" * 64,
                code_rows=[code_row("NK_RF")],
                version_rows=[version_row("NK_RF")],
                amendment_rows=[],
                required_codes=["NK_RF", "NK_RF_2"],
            )

    def test_conditional_kas_can_be_reported_not_available(self) -> None:
        dataset = exporter.build_dataset(
            dataset_key=exporter.TAX_CORE_DATASET_KEY,
            source_commit="a" * 64,
            code_rows=[code_row("NK_RF")],
            version_rows=[version_row("NK_RF")],
            amendment_rows=[],
            required_codes=["NK_RF", "KAS_RF"],
            unavailable_codes=["KAS_RF"],
        )
        self.assertEqual([row["code"] for row in dataset["codes"]], ["NK_RF"])
        self.assertEqual(dataset["unavailable_codes"], ["KAS_RF"])

    def test_duplicate_article_version_is_rejected(self) -> None:
        duplicate = version_row("NK_RF", "54.1", "2017-08-19")
        with self.assertRaisesRegex(RuntimeError, "duplicate Law7 article version"):
            exporter.build_dataset(
                dataset_key=exporter.TAX_CORE_DATASET_KEY,
                source_commit="a" * 64,
                code_rows=[code_row("NK_RF")],
                version_rows=[duplicate, dict(duplicate)],
                amendment_rows=[],
                required_codes=["NK_RF"],
            )

    def test_blank_article_text_and_missing_version_date_fail_closed(self) -> None:
        with self.assertRaisesRegex(ValueError, "article_text must be non-empty"):
            exporter.build_dataset(
                dataset_key=exporter.TAX_CORE_DATASET_KEY,
                source_commit="a" * 64,
                code_rows=[code_row("NK_RF")],
                version_rows=[version_row("NK_RF", text="   ")],
                amendment_rows=[],
                required_codes=["NK_RF"],
            )
        missing_date = version_row("NK_RF")
        missing_date["version_date"] = None
        with self.assertRaisesRegex(RuntimeError, "missing version_date"):
            exporter.build_dataset(
                dataset_key=exporter.TAX_CORE_DATASET_KEY,
                source_commit="a" * 64,
                code_rows=[code_row("NK_RF")],
                version_rows=[missing_date],
                amendment_rows=[],
                required_codes=["NK_RF"],
            )

    def test_blank_hash_is_filled_deterministically(self) -> None:
        dataset = exporter.build_dataset(
            dataset_key=exporter.TAX_CORE_DATASET_KEY,
            source_commit="a" * 64,
            code_rows=[code_row("NK_RF")],
            version_rows=[version_row("NK_RF", text="deterministic")],
            amendment_rows=[],
            required_codes=["NK_RF"],
        )
        text_hash = dataset["article_versions"][0]["text_hash"]
        self.assertEqual(len(text_hash), 64)

    def test_duplicate_amendment_is_rejected(self) -> None:
        amendment = {
            "code_id": "NK_RF",
            "amendment_eo_number": "163-FZ",
            "amendment_date": "2017-07-18",
            "articles_affected": [],
            "articles_added": ["54.1"],
            "articles_modified": [],
            "articles_repealed": [],
        }
        with self.assertRaisesRegex(RuntimeError, "duplicate Law7 amendment"):
            exporter.build_dataset(
                dataset_key=exporter.TAX_CORE_DATASET_KEY,
                source_commit="a" * 64,
                code_rows=[code_row("NK_RF")],
                version_rows=[version_row("NK_RF")],
                amendment_rows=[amendment, dict(amendment)],
                required_codes=["NK_RF"],
            )

    def test_existing_importer_accepts_tax_core_fixture_in_dry_run(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(IMPORTER_PATH), "--input", str(FIXTURE_PATH)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        summary = json.loads(completed.stdout)
        self.assertEqual(summary["dataset_key"], "law7_codes")
        self.assertEqual(summary["codes"], 2)
        self.assertEqual(summary["article_versions"], 2)
        self.assertEqual(summary["amendments"], 1)
        self.assertEqual(summary["mode"], "dry-run")


if __name__ == "__main__":
    unittest.main()
