import importlib.util
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).with_name("audit_legal_source_verification.py")
MIGRATION_PATH = MODULE_PATH.parent.parent / "supabase" / "migrations" / "20260914154500_fix_legal_source_verification_audit_rpc.sql"
SPEC = importlib.util.spec_from_file_location("audit_legal_source_verification", MODULE_PATH)
assert SPEC and SPEC.loader
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


class LegalSourceVerificationAuditTests(unittest.TestCase):
    def test_normalizes_number_notation_without_fuzzy_matching(self):
        self.assertEqual(audit.normalized_document_number("№ БВ-4-7/8051@ "), "бв-4-7/8051@")
        self.assertEqual(audit.normalized_document_number("N 146-ФЗ"), "146-фз")
        self.assertNotEqual(audit.normalized_document_number("53"), audit.normalized_document_number("57"))

    def test_queue_requires_complete_identity_before_registry_mapping(self):
        self.assertEqual(
            audit.verification_queue_status({
                "source_type": "fns_letter",
                "title": "Письмо ФНС",
                "document_date": "2024-10-18",
                "document_number": "СД-4-2/11836@",
                "registry_candidate_count": 1,
            }),
            "exact_registry_candidate",
        )
        self.assertEqual(
            audit.verification_queue_status({
                "source_type": "fns_letter",
                "title": "Письмо ФНС",
                "document_date": "",
                "document_number": "СД-4-2/11836@",
            }),
            "identity_incomplete",
        )

    def test_review_can_be_queued_without_document_number(self):
        self.assertEqual(
            audit.verification_queue_status({
                "source_type": "manual_source",
                "title": "Обзор судебной практики Верховного Суда Российской Федерации",
                "document_date": "2023-12-13",
                "document_number": "",
            }),
            "registry_entry_missing",
        )

    def test_manual_and_law_snapshot_never_self_promote(self):
        self.assertEqual(
            audit.verification_queue_status({"source_type": "manual"}),
            "not_external_legal_source",
        )
        self.assertEqual(
            audit.verification_queue_status({"source_type": "law_snapshot"}),
            "article_level_identity_required",
        )

    def test_report_counts_chunks_not_just_source_groups(self):
        report = audit.build_report([
            {"source_type": "manual", "chunk_count": 3},
            {
                "source_type": "court_practice",
                "title": "Постановление",
                "document_number": "53",
                "document_date": "2006-10-12",
                "registry_candidate_count": 0,
                "chunk_count": 6,
            },
        ])
        self.assertTrue(report["read_only"])
        self.assertFalse(report["persistent_verification_flags_touched"])
        self.assertEqual(report["chunks_by_queue_status"]["not_external_legal_source"], 3)
        self.assertEqual(report["chunks_by_queue_status"]["registry_entry_missing"], 6)

    def test_audit_reads_only_limited_rpc_projection(self):
        self.assertIn("kati_legal_source_verification_audit_rows", audit.QUERY)
        self.assertNotIn("legal_source_registry", audit.QUERY)

        migration = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        self.assertIn("language sql", migration)
        self.assertIn("security definer", migration)
        self.assertIn("grouped.title", migration)
        self.assertIn("revoke all on function", migration)
        self.assertIn("grant execute on function", migration)
        self.assertIn("kati_internal_kb_writer", migration)
        self.assertNotIn("grant select on public.legal_source_registry", migration)


if __name__ == "__main__":
    unittest.main()
