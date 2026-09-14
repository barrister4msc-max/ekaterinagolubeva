import importlib.util, pathlib, unittest
p=pathlib.Path(__file__).with_name("compare_legacy_legal_source_content.py")
s=importlib.util.spec_from_file_location("cmp",p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
class TestComparator(unittest.TestCase):
 def test_whitespace_is_exact_but_never_admits(self):
  r=m.compare("Статья  54.1\nНК РФ", "Статья 54.1 НК РФ")
  self.assertTrue(r["content_verified"]); self.assertFalse(r["temporal_verified"]); self.assertFalse(r["substantive_use_allowed"])
 def test_change_is_not_verified(self):
  self.assertEqual(m.compare("редакция А","редакция Б")["result"],"content_mismatch")
if __name__=="__main__": unittest.main()
