import importlib.util
import json
import pathlib
import unittest

path = pathlib.Path(__file__).with_name("prepare_legacy_legal_source_verification.py")
spec = importlib.util.spec_from_file_location("queue", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class TestQueue(unittest.TestCase):
    def test_manifest_is_exactly_bounded(self):
        manifest = json.loads(
            (pathlib.Path(__file__).parents[1] / "config/legacy-legal-source-verification-manifest.json").read_text()
        )
        self.assertEqual(len(manifest["candidates"]), 8)
        self.assertEqual(len({item["source_group_id"] for item in manifest["candidates"]}), 8)

    def test_artifact_excludes_source_content(self):
        row = {"chunk_id": "chunk-1", "content": "restricted source text", "content_hash": "sha256:abc"}
        self.assertEqual(
            module.artifact_row(row),
            {"chunk_id": "chunk-1", "content_hash": "sha256:abc", "content_length": 22},
        )

if __name__ == "__main__":
    unittest.main()
