#!/usr/bin/env python3
"""Fail-closed normalized content comparator for a single legal-source candidate."""
from __future__ import annotations
import argparse, hashlib, json, re, unicodedata
from pathlib import Path

def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()

def digest(text: str) -> str:
    return hashlib.sha256(normalize(text).encode("utf-8")).hexdigest()

def compare(stored: str, official: str) -> dict:
    stored_normalized, official_normalized = normalize(stored), normalize(official)
    exact = stored_normalized == official_normalized
    return {
      "verification_method": "normalized_sha256_exact_v1",
      "stored_sha256": digest(stored), "official_sha256": digest(official),
      "content_verified": exact, "temporal_verified": False,
      "substantive_use_allowed": False,
      "result": "content_exact_match_temporal_pending" if exact else "content_mismatch",
    }

def main() -> int:
    p=argparse.ArgumentParser()
    p.add_argument("--stored-text", required=True); p.add_argument("--official-text", required=True)
    p.add_argument("--output", required=True)
    a=p.parse_args()
    report=compare(Path(a.stored_text).read_text(encoding="utf-8"), Path(a.official_text).read_text(encoding="utf-8"))
    Path(a.output).write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0
if __name__ == "__main__": raise SystemExit(main())
