#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("repair_legacy_legal_sources.py")
MIGRATION = SCRIPT.parent.parent / "supabase/migrations/20260917220605_guarded_legacy_legal_source_repair_rpc.sql"
COUNT_FIX_MIGRATION = SCRIPT.parent.parent / "supabase/migrations/20260919100000_fix_guarded_legacy_repair_legacy_counts.sql"
OCR_FIX_MIGRATION = SCRIPT.parent.parent / "supabase/migrations/20260920120000_pin_vas53_rederived_ocr_contract.sql"
spec = importlib.util.spec_from_file_location("repair", SCRIPT)
repair = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(repair)


def item(key: str) -> dict:
    spec = repair.REPAIR_SPECS[key]
    text = ("Тестовый полный текст для строгой проверки.\n\n" * 12).strip()
    digest = hashlib.sha256(text.encode()).hexdigest()
    suffix = "fns.doc" if spec["source_type"] == "fns_letter" else "vas.pdf"
    return {
        "canonical_document_key": key,
        "legacy_source_group_id": spec["legacy_source_group_id"],
        "storage_object_name": f"KATI_TEST_{suffix}",
        "storage_size_bytes": 1234,
        "storage_sha256": "a" * 64,
        "normalized_file_name": suffix,
        "original_file_name": suffix,
        "title": "Тестовый источник",
        "source_type": spec["source_type"],
        "document_type": spec["document_type"],
        "authority": spec["authority"],
        "document_number": spec["document_number"],
        "document_date": spec["document_date"],
        "source_url": spec["source_url"],
        "official_source_domain": spec["official_source_domain"],
        "historical_VAS": bool(spec.get("historical_VAS", False)),
        "source_class": "user_supplied_retrieval_snapshot",
        "metadata_status": "official_metadata_verified",
        "verification_status": repair.FAIL_CLOSED_STATUS,
        "file_mime": "application/msword" if spec["source_type"] == "fns_letter" else "application/pdf",
        "extraction_method": "ocr" if spec["source_type"] == "court_practice" else "word_text",
        "ocr_status": "completed",
        "extraction_status": "completed",
        "text_content": text,
        "text_sha256": digest,
        "original_sha256": "b" * 64,
        "normalized_sha256": "c" * 64,
    }


class RepairContractTests(unittest.TestCase):
    def setUp(self):
        self._repair_specs = repair.REPAIR_SPECS
        text = ("Тестовый полный текст для строгой проверки.\n\n" * 12).strip()
        chunks = repair.chunk_text(text)
        replacement = {}
        for key, spec in repair.REPAIR_SPECS.items():
            replacement[key] = dict(spec)
            if "expected_text_sha256" in spec:
                replacement[key]["expected_text_sha256"] = hashlib.sha256(text.encode()).hexdigest()
                replacement[key]["expected_chunk_sha256"] = [
                    hashlib.sha256(chunk.encode()).hexdigest() for chunk in chunks
                ]
        repair.REPAIR_SPECS = replacement

    def tearDown(self):
        repair.REPAIR_SPECS = self._repair_specs

    def test_accepts_exact_two_source_scope(self):
        rows = [repair.normalize(item(key)) for key in repair.REPAIR_SPECS]
        self.assertEqual({row["source_type"] for row in rows}, {"fns_letter", "court_practice"})
        self.assertTrue(all(row["chunks"] for row in rows))

    def test_rejects_extra_identity(self):
        bad = item(next(iter(repair.REPAIR_SPECS)))
        bad["canonical_document_key"] = "ru:fns:letter:invented"
        with self.assertRaisesRegex(ValueError, "approved repair scope"):
            repair.normalize(bad)

    def test_rejects_identity_mutation(self):
        bad = item(next(iter(repair.REPAIR_SPECS)))
        bad["document_date"] = "2021-03-11"
        with self.assertRaisesRegex(ValueError, "document_date"):
            repair.normalize(bad)

    def test_rejects_verified_or_admitted_status(self):
        bad = item(next(iter(repair.REPAIR_SPECS)))
        bad["verification_status"] = "official_content_verified"
        with self.assertRaisesRegex(ValueError, "fail-closed"):
            repair.normalize(bad)

    def test_manifest_requires_exactly_two_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps({"dataset_key": repair.DATASET_KEY, "sources": [item(next(iter(repair.REPAIR_SPECS)))]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "exactly the two"):
                repair.load_manifest(path)

    def test_storage_preflight_requires_hash_inventory(self):
        rows = [repair.normalize(item(key)) for key in repair.REPAIR_SPECS]

        class Response:
            def read(self):
                return json.dumps({"verified": True, "bucket": repair.BUCKET, "objects": []}).encode()
            def __enter__(self): return self
            def __exit__(self, *_): return False

        with patch.dict("os.environ", {repair.STORAGE_VERIFIER_URL_ENV: "https://verifier.example", repair.STORAGE_VERIFIER_TOKEN_ENV: "token"}, clear=True), patch.object(repair, "urlopen", return_value=Response()):
            with self.assertRaisesRegex(ValueError, "hash inventory"):
                repair.preflight_storage(rows)

    def test_storage_preflight_accepts_exact_hash_inventory(self):
        rows = [repair.normalize(item(key)) for key in repair.REPAIR_SPECS]

        class Response:
            def read(self):
                objects = [
                    {"name": row["storage_object_name"], "size_bytes": row["storage_size_bytes"], "sha256": row["storage_sha256"]}
                    for row in rows
                ]
                return json.dumps({"verified": True, "bucket": repair.BUCKET, "objects": objects}).encode()
            def __enter__(self): return self
            def __exit__(self, *_): return False

        with patch.dict("os.environ", {repair.STORAGE_VERIFIER_URL_ENV: "https://verifier.example", repair.STORAGE_VERIFIER_TOKEN_ENV: "token"}, clear=True), patch.object(repair, "urlopen", return_value=Response()):
            repair.preflight_storage(rows)

    def test_group_ids_are_deterministic(self):
        key = next(iter(repair.REPAIR_SPECS))
        self.assertEqual(repair.normalize(item(key))["source_group_id"], repair.normalize(item(key))["source_group_id"])

    def test_rpc_payload_is_minimal_and_exactly_scoped(self):
        rows = [repair.normalize(item(key)) for key in repair.REPAIR_SPECS]
        payload = repair.rpc_payload(rows)
        self.assertEqual(len(payload), 2)
        self.assertEqual(
            set(payload[0]),
            {
                "canonical_document_key",
                "source_group_id",
                "legacy_source_group_id",
                "storage_object_name",
                "storage_size_bytes",
                "storage_sha256",
                "chunks",
            },
        )
        self.assertTrue(all(set(chunk) == {"content"} for row in payload for chunk in row["chunks"]))

    def test_private_rpc_migration_is_narrow_and_fail_closed(self):
        sql = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("private.kati_apply_guarded_legacy_legal_source_repair", sql)
        self.assertIn("private.kati_guarded_legacy_legal_source_repair_audit", sql)
        self.assertIn("security definer", sql)
        self.assertIn("set search_path = pg_catalog, public, extensions", sql)
        self.assertIn("revoke all on schema private from public", sql)
        self.assertIn("grant execute on function private.kati_apply_guarded_legacy_legal_source_repair", sql)
        self.assertIn("'content_verified', false", sql)
        self.assertIn("'temporal_verified', false", sql)
        self.assertIn("'substantive_use_allowed', false", sql)
        self.assertIn("'use_in_generation', false", sql)
        self.assertNotIn("legal_law_chunks\n", sql)
        self.assertNotIn("legal_source_registry\n", sql)

    def test_corrective_migration_has_only_the_observed_legacy_cardinality_change(self):
        original = MIGRATION.read_text(encoding="utf-8")
        corrective = COUNT_FIX_MIGRATION.read_text(encoding="utf-8")
        original_function = original[original.index("create or replace function private.kati_apply"):original.index("$function$;", original.index("create or replace function private.kati_apply")) + len("$function$;")]
        corrective_function = corrective[corrective.index("create or replace function private.kati_apply"):corrective.index("$function$;", corrective.index("create or replace function private.kati_apply")) + len("$function$;")]
        self.assertIn("v_expected_legacy_rows := 1;", corrective_function)
        self.assertIn("v_expected_legacy_rows := 5;", corrective_function)
        self.assertEqual(
            corrective_function
            .replace("v_expected_legacy_rows := 1;", "v_expected_legacy_rows := 2;")
            .replace("v_expected_legacy_rows := 5;", "v_expected_legacy_rows := 6;"),
            original_function,
        )

    def test_repair_spec_matches_observed_production_legacy_cardinality(self):
        self.assertEqual(
            repair.REPAIR_SPECS["ru:fns:letter:BV-4-7/3060@:2021-03-10"]["legacy_rows"],
            1,
        )
        self.assertEqual(
            repair.REPAIR_SPECS["ru:court_practice:plenum_vas:53:2006-10-12"]["legacy_rows"],
            5,
        )

    def test_rejects_vas_transcript_outside_pinned_extraction_contract(self):
        key = "ru:court_practice:plenum_vas:53:2006-10-12"
        bad = item(key)
        bad["text_content"] += " изменено"
        bad["text_sha256"] = hashlib.sha256(bad["text_content"].encode()).hexdigest()
        with self.assertRaisesRegex(ValueError, "pinned extraction contract"):
            repair.normalize(bad)

    def test_ocr_recovery_migration_changes_only_vas_transcript_fingerprint(self):
        previous = COUNT_FIX_MIGRATION.read_text(encoding="utf-8")
        corrective = OCR_FIX_MIGRATION.read_text(encoding="utf-8")
        previous_function = previous[previous.index("create or replace function private.kati_apply"):previous.index("$function$;", previous.index("create or replace function private.kati_apply")) + len("$function$;")]
        corrective_function = corrective[corrective.index("create or replace function private.kati_apply"):corrective.index("$function$;", corrective.index("create or replace function private.kati_apply")) + len("$function$;")]
        changes = {
            "bcd100705214768ec63a91401359e954277a97ad04f47a63bc66f41edb62d96e": "480b74ff3bb7ea2aee5b5b7547af266e4e96216fbdc724019d2247ae1938ac59",
            "2d9959f5ed0ce77860e4de349330ddcc5d103ac9dfc839e65783a24862f87541": "c5f4aceddd79fabbccf335a90abc3f640e334e2fb431104b9a8ccc2a6a140459",
            "b232401c49bfb68f2f2787a2a34a7a221a6de55f71a0a640c978c6d9f0b44d53": "ce3b616bfd1e0acf1df0d7f0a05c410ada0bc54ea3014bd47cd75e44b385aba3",
            "4fddb7e1efd0b8b4aa4bff9a4812aeb741e39cde902ad776bf26b5723da40e27": "3d203b4c81e08ddd77475bf035c4bef452c470134a0e62adc88f6b6bb00d22da",
            "54c9ca14a2e5e6ff6422cf10da176932214036fab4d54f8bca615b2f0640daaf": "3844690a5e968a83dfdad9477fb90418d706074f1c851c0e698bcb97b990719e",
            "9e961a9a66139a65ce4f9a241308070c66d5d147df7408a421ac3c25ee23f058": "2003402b2d6dd0af429f2e08572273f4e2ced247034e33ca67391dc9d3cd9ce8",
            "50cdaa4f6a56ff78a0f4405c7d4176d1ee7dc5065a7fc5d2506ed8c1b801e8b9": "f82195e6b7bc536307a449738184190f9eb859cffe57c44db1930dd77943a0d5",
        }
        for current, prior in changes.items():
            self.assertIn(current, corrective_function)
            corrective_function = corrective_function.replace(current, prior)
        self.assertEqual(corrective_function, previous_function)

    def test_long_unbroken_paragraph_is_bounded(self):
        chunks = repair.chunk_text(("слово " * 1000).strip(), target=200)
        self.assertGreater(len(chunks), 10)
        self.assertTrue(all(len(chunk) <= 200 for chunk in chunks))


if __name__ == "__main__":
    unittest.main()
