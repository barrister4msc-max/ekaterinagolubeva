import importlib.util
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).with_name("verify_guarded_user_source_official_origin.py")
SPEC = importlib.util.spec_from_file_location("verify_guarded_user_source_official_origin", MODULE_PATH)
assert SPEC and SPEC.loader
verifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verifier)


class GuardedOfficialOriginVerifierTests(unittest.TestCase):
    def test_batch_is_exact_and_bounded(self):
        self.assertEqual(len(verifier.SPECS), 5)
        self.assertEqual(verifier.EXPECTED_GROUPS, 5)
        self.assertEqual(verifier.EXPECTED_CHUNKS, 171)
        self.assertEqual(len({item.source_group_id for item in verifier.SPECS}), 5)

    def test_404_remains_fail_closed(self):
        source = verifier.SPECS[0]
        original_fetch = verifier.fetch
        verifier.fetch = lambda _: (404, "")
        try:
            result = verifier.verify_spec(source)
        finally:
            verifier.fetch = original_fetch
        self.assertEqual(result["result"], "official_url_unresolved")
        self.assertFalse(result["official_origin_verified"])
        self.assertFalse(result["content_verified"])
        self.assertFalse(result["temporal_verified"])
        self.assertFalse(result["substantive_use_allowed"])

    def test_official_page_requires_exact_title_and_date(self):
        source = verifier.SPECS[2]
        body = f"<h1>{source.title_marker}</h1><p>{source.date_marker}</p>"
        original_fetch = verifier.fetch
        verifier.fetch = lambda _: (200, body)
        try:
            result = verifier.verify_spec(source)
        finally:
            verifier.fetch = original_fetch
        self.assertTrue(result["official_origin_verified"])
        self.assertTrue(result["document_identity_verified"])
        self.assertFalse(result["content_verified"])
        self.assertFalse(result["temporal_verified"])
        self.assertFalse(result["substantive_use_allowed"])

    def test_unexpected_status_stops_before_any_write(self):
        source = verifier.SPECS[4]
        original_fetch = verifier.fetch
        verifier.fetch = lambda _: (503, "")
        try:
            with self.assertRaisesRegex(RuntimeError, "expected HTTP 200"):
                verifier.verify_spec(source)
        finally:
            verifier.fetch = original_fetch


if __name__ == "__main__":
    unittest.main()
