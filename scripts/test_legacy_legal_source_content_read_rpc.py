import pathlib, unittest
p=pathlib.Path(__file__).resolve().parents[1]/"supabase/migrations/20260914220000_legacy_legal_source_content_read_rpc.sql"
class TestRpc(unittest.TestCase):
 def test_is_bounded_read_only(self):
  s=p.read_text()
  self.assertIn("security definer",s); self.assertIn("array[",s)
  self.assertNotIn("update ",s.lower()); self.assertNotIn("insert ",s.lower())
  self.assertIn("revoke all",s.lower())
if __name__=="__main__": unittest.main()
