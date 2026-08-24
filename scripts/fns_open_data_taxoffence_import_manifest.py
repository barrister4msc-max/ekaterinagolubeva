#!/usr/bin/env python3
"""Prepare a deterministic TAXOFFENCE import manifest.

This command never connects to Supabase and never writes database rows. It
validates the official archive, parses the factual records through the existing
streaming parser, and emits a stable JSONL payload plus a release manifest for
a separately reviewed server-side import job.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict
from pathlib import Path

from fns_open_data_taxoffence_dry_run import ARCHIVE_SHA256, parse_zip


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--expected-archive-sha256", default=ARCHIVE_SHA256)
    parser.add_argument("--limit", type=int)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.input.is_file():
        raise SystemExit(f"input_not_found:{args.input}")
    if args.limit is not None and not 1 <= args.limit <= 10000:
        raise SystemExit("--limit must be between 1 and 10000")

    observed_sha256 = sha256_file(args.input)
    expected_sha256 = args.expected_archive_sha256.lower()
    if observed_sha256 != expected_sha256:
        raise SystemExit(f"archive_sha256_mismatch:{observed_sha256}")

    facts = list(parse_zip(args.input, limit=args.limit))
    if not facts:
        raise SystemExit("no_taxoffence_records_parsed")

    keys = [(f.dataset_id, f.data_as_of, f.document_id) for f in facts]
    if len(keys) != len(set(keys)):
        raise SystemExit("duplicate_import_key")

    facts.sort(key=lambda f: (f.dataset_id, f.data_as_of, f.document_id))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as stream:
        for fact in facts:
            row = {
                "inn": fact.inn,
                "organization_name": fact.organization_name,
                "fine_amount": fact.fine_amount,
                "document_id": fact.document_id,
                "document_date": fact.document_date,
                "data_as_of": fact.data_as_of,
                "format_version": fact.format_version,
                "dataset_id": fact.dataset_id,
                "source_url": fact.source_url,
                "source_sha256": fact.source_sha256,
            }
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

    manifest = {
        "archive_sha256": observed_sha256,
        "dataset_id": facts[0].dataset_id,
        "data_as_of_values": sorted({f.data_as_of for f in facts}),
        "format_versions": sorted({f.format_version for f in facts}),
        "records": len(facts),
        "unique_inn": len({f.inn for f in facts}),
        "db_writes": False,
        "factual_only": True,
        "legal_authority": False,
        "substantive_use_allowed": False,
        "import_status": "prepared_not_applied",
    }
    print(json.dumps(manifest, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
