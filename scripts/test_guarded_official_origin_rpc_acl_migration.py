import pathlib
import unittest


MIGRATION = (
    pathlib.Path(__file__).resolve().parents[1]
    / "supabase"
    / "migrations"
    / "20260920075803_revoke_guarded_official_origin_rpc_public_execute.sql"
)

FUNCTION = "public.kati_persist_guarded_user_source_official_origin(jsonb)"


class GuardedOfficialOriginRpcAclMigrationTests(unittest.TestCase):
    def test_is_privilege_only_and_revokes_every_api_role(self):
        sql = MIGRATION.read_text(encoding="utf-8").lower()

        self.assertIn(
            f"revoke all on function {FUNCTION} from public, anon, authenticated, service_role",
            " ".join(sql.split()),
        )
        self.assertIn(
            f"grant execute on function {FUNCTION} to kati_internal_kb_writer",
            " ".join(sql.split()),
        )

        for forbidden in (
            "create function",
            "create or replace function",
            "alter function",
            "insert ",
            "update ",
            "delete ",
            "create policy",
            "alter policy",
            "drop policy",
        ):
            self.assertNotIn(forbidden, sql)


if __name__ == "__main__":
    unittest.main()
