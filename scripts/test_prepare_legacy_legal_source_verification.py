import importlib.util
import pathlib
import unittest


path = pathlib.Path(__file__).with_name("prepare_legacy_legal_source_verification.py")
spec = importlib.util.spec_from_file_location("queue", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TestQueue(unittest.TestCase):
    candidate = {"source_group_id": "group-1", "legacy_chunks": 2, "official_url": "https://official.example/document"}

    def test_complete_group_has_deterministic_hash_and_stays_fail_closed(self):
        rows = [
            {"chunk_index": 1, "chunks_total": 2, "content": " second"},
            {"chunk_index": 0, "chunks_total": 2, "content": "first "},
        ]
        result = module.group_integrity(rows, self.candidate)
        self.assertTrue(result["legacy_reconstruction_complete"])
        self.assertEqual(result["chunk_indices"], [0, 1])
        self.assertEqual(result["legacy_ordered_content_sha256"], module.normalized_digest("first \n second"))
        self.assertFalse(result["official_content_comparison_eligible"])
        self.assertFalse(result["substantive_use_allowed"])

    def test_missing_chunk_cannot_be_reconstructed_or_hashed(self):
        result = module.group_integrity(
            [{"chunk_index": 0, "chunks_total": 2, "content": "restricted text"}], self.candidate
        )
        self.assertFalse(result["legacy_reconstruction_complete"])
        self.assertIsNone(result["legacy_ordered_content_sha256"])
        self.assertEqual(result["result"], "legacy_reconstruction_incomplete_fail_closed")

    def test_artifact_excludes_source_content_and_separates_urls(self):
        row = {
            "chunk_id": "chunk-1",
            "content": "restricted source text",
            "content_hash": "sha256:abc",
            "official_url": "https://secondary.example/legacy",
            "verification_status": "official_verified",
            "official_status": "unverified",
            "official_origin_verified": True,
            "content_verified": False,
            "temporal_verified": False,
            "substantive_use_allowed": False,
            "verification_basis": "legacy claim",
        }
        result = module.artifact_row(row, self.candidate)
        self.assertNotIn("content", result)
        self.assertNotIn("official_url", result)
        self.assertNotIn("verification_status", result)
        self.assertNotIn("official_status", result)
        self.assertNotIn("verification_basis", result)
        self.assertEqual(result["stored_source_url"], "https://secondary.example/legacy")
        self.assertEqual(result["candidate_official_url"], "https://official.example/document")
        self.assertFalse(result["candidate_official_origin_observed"])
        self.assertEqual(result["stored_legacy_verification_status"], "official_verified")
        self.assertTrue(result["legacy_verification_metadata_observed"])
        self.assertTrue(result["legacy_verification_metadata_conflict"])
        self.assertEqual(result["queue_effective_verification_status"], "identity_unresolved")
        self.assertFalse(result["queue_effective_substantive_use_allowed"])

    def test_complete_legacy_flags_do_not_create_a_conflict_by_themselves(self):
        row = {
            "verification_status": "official_verified",
            "official_status": "official_verified",
            "official_origin_verified": True,
            "content_verified": True,
            "temporal_verified": True,
            "substantive_use_allowed": True,
        }
        self.assertFalse(module.legacy_verification_metadata_conflict(row))

    def test_missing_rpc_metadata_is_reported_as_unobservable_not_clean(self):
        result = module.artifact_row({"chunk_id": "chunk-1", "content": "restricted source text"}, self.candidate)
        self.assertFalse(result["legacy_verification_metadata_observed"])
        self.assertIsNone(result["legacy_verification_metadata_conflict"])


if __name__ == "__main__":
    unittest.main()
