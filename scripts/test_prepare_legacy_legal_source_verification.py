import importlib.util,pathlib,tempfile,unittest,json
p=pathlib.Path(__file__).with_name("prepare_legacy_legal_source_verification.py")
s=importlib.util.spec_from_file_location("q",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class T(unittest.TestCase):
 def test_manifest_is_exactly_bounded(self):
  d=json.loads((pathlib.Path(__file__).parents[1]/"config/legacy-legal-source-verification-manifest.json").read_text())
  self.assertEqual(len(d["candidates"]),8)
  self.assertEqual(len({x["source_group_id"] for x in d["candidates"]}),8)
if __name__=="__main__":unittest.main()
