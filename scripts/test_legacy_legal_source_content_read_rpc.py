import pathlib, unittest
p=pathlib.Path(__file__).resolve().parents[1]/"supabase/migrations/20260914220000_legacy_legal_source_content_read_rpc.sql"
class TestRpc(unittest.TestCase):
 def test_is_manifest_bounded_and_read_only(self):
  s=p.read_text().lower()
  self.assertIn("p_group_ids text[]",s); self.assertIn("1 to 32 manifest source groups",s)
  self.assertIn("source_type in",s); self.assertIn("registry_id",s)
  self.assertNotIn("update ",s); self.assertNotIn("insert ",s); self.assertNotIn("delete ",s)
  self.assertIn("revoke all",s)
if __name__=="__main__": unittest.main()
