#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

def artifact_row(row, candidate):
    safe = {
        key: value
        for key, value in row.items()
        if key not in {"content", "official_url"}
    }
    safe["stored_source_url"] = row.get("official_url")
    safe["candidate_official_url"] = candidate.get("official_url")
    safe["candidate_official_origin_observed"] = False
    safe["content_length"] = len(row.get("content") or "")
    return safe

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    candidates = {
        item["source_group_id"]: item
        for item in manifest["candidates"]
        if "source_group_id" in item
    }
    groups = list(candidates)
    if not groups:
        raise SystemExit("manifest candidates require source_group_id")

    import psycopg

    with psycopg.connect(os.environ["DATABASE_URL"]) as connection, connection.cursor() as cursor:
        cursor.execute("select * from public.kati_legacy_legal_source_content_rows(%s)", (groups,))
        columns = [column.name for column in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    report = {
        "read_only": True,
        "raw_content_exported": False,
        "substantive_use_allowed": False,
        "manifest_groups": len(groups),
        "rows": [artifact_row(row, candidates[row["source_group_id"]]) for row in rows],
    }
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

if __name__ == "__main__":
    main()
