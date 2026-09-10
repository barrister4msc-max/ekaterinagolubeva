#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("user_supplied_legal_source_intake.py")
spec = importlib.util.spec_from_file_location("intake", SCRIPT)
intake = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(intake)


def base_item():
    text = ("Проверочный текст судебного акта. Статья 54.1 НК РФ.\n\n" * 8).strip()
    text_sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
    fake_pdf_sha = "a" * 64
    return {
        "storage_object_name": "KATI_TEST.pdf",
        "storage_size_bytes": 1234,
        "normalized_file_name": "Тестовый_акт.pdf",
        "original_file_name": "original.pdf",
        "title": "Тестовый судебный акт",
        "authority": "Верховный Суд Российской Федерации",
        "court_level": "supreme_court",
        "document_type": "plenum_resolution",
        "document_number": "1",
        "document_date": "2026-01-01",
        "source_type": "court_practice",
        "source_class": "user_supplied_retrieval_snapshot",
        "metadata_status": "official_metadata_verified",
        "official_metadata_verified": True,
        "verification_status": "metadata_officially_verified_content_pending",
        "official_origin_verified": False,
        "content_verified": False,
        "substantive_use_allowed": False,
        "use_in_generation": False,
        "extraction_method": "pdf_text",
        "ocr_required": False,
        "ocr_status": "completed",
        "extraction_status": "completed",
        "text_content": text,
        "text_sha256": text_sha,
        "original_sha256": fake_pdf_sha,
        "normalized_sha256": fake_pdf_sha,
    }


class IntakeContractTests(unittest.TestCase):
    def test_valid_item_is_normalized_and_chunked(self):
        row = intake.normalize(base_item())
        self.assertEqual(row["storage_object_name"], "KATI_TEST.pdf")
        self.assertEqual(row["source_type"], "court_practice")
        self.assertTrue(row["chunks"])
        self.assertEqual(len(row["source_group_id"]), 36)

    def test_rejects_unsafe_storage_path(self):
        item = base_item()
        item["storage_object_name"] = "../KATI_TEST.pdf"
        with self.assertRaisesRegex(ValueError, "unsafe Storage object name"):
            intake.normalize(item)

    def test_rejects_missing_text(self):
        item = base_item()
        item["text_content"] = ""
        item["text_sha256"] = hashlib.sha256(b"").hexdigest()
        with self.assertRaises(ValueError):
            intake.normalize(item)

    def test_rejects_text_hash_mismatch(self):
        item = base_item()
        item["text_sha256"] = "b" * 64
        with self.assertRaisesRegex(ValueError, "text_sha256 mismatch"):
            intake.normalize(item)

    def test_rejects_non_fail_closed_verification_status(self):
        item = base_item()
        item["verification_status"] = "official_content_verified"
        with self.assertRaisesRegex(ValueError, "verification_status is not fail-closed"):
            intake.normalize(item)

    def test_rejects_wrong_source_class(self):
        item = base_item()
        item["source_class"] = "official_source"
        with self.assertRaisesRegex(ValueError, "source_class"):
            intake.normalize(item)

    def test_rejects_wrong_source_type(self):
        item = base_item()
        item["source_type"] = "federal_law"
        with self.assertRaisesRegex(ValueError, "unsupported source_type"):
            intake.normalize(item)

    def test_manifest_requires_dataset_key(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "manifest.json"
            p.write_text(json.dumps({"dataset_key": "wrong", "sources": [base_item()]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "dataset_key"):
                intake.load_manifest(p)

    def test_group_identity_is_deterministic(self):
        a = intake.normalize(base_item())
        b = intake.normalize(base_item())
        self.assertEqual(a["source_group_id"], b["source_group_id"])


if __name__ == "__main__":
    unittest.main()
