import pathlib
import unittest

migration = (
    pathlib.Path(__file__).resolve().parents[1]
    / "supabase/migrations/20260914230000_fix_legacy_content_read_rpc_hash_and_grants.sql"
)

class TestLegacyContentReadRpcFix(unittest.TestCase):
    def test_hash_and_execution_scope_are_fail_closed(self):
        sql = migration.read_text().lower()
        self.assertIn("extensions.digest(k.content, 'sha256')", sql)
        self.assertIn("revoke all on function public.kati_legacy_legal_source_content_rows(text[]) from public, anon, authenticated, service_role", sql)
        self.assertIn("grant execute on function public.kati_legacy_legal_source_content_rows(text[]) to kati_internal_kb_writer", sql)
        self.assertNotIn("insert ", sql)
        self.assertNotIn("update ", sql)
        self.assertNotIn("delete ", sql)

if __name__ == "__main__":
    unittest.main()
