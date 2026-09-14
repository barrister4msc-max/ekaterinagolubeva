import pathlib
import unittest


MIGRATION = (
    pathlib.Path(__file__).resolve().parents[1]
    / "supabase"
    / "migrations"
    / "20260914210000_fix_guarded_official_origin_rpc_count.sql"
)


class GuardedOfficialOriginRpcMigrationTests(unittest.TestCase):
    def test_return_count_is_not_overwritten_by_statement_row_count(self):
        sql = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("row_count_value integer;", sql)
        self.assertIn("updated_count integer := 0;", sql)
        self.assertIn("get diagnostics row_count_value = row_count;", sql)
        self.assertIn("if row_count_value <> 1 then", sql)
        self.assertIn("updated_count := updated_count + 1;", sql)
        self.assertIn("return updated_count;", sql)
        self.assertNotIn("get diagnostics updated_rows = row_count;", sql)


if __name__ == "__main__":
    unittest.main()
