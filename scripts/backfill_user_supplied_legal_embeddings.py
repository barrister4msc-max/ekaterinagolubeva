#!/usr/bin/env python3
"""Fail-closed embedding backfill for an exact user-supplied source batch.

The command accepts only explicit source_group_id values. It writes embeddings
and embedding bookkeeping, never legal verification or admission fields.
Database writes happen in one transaction: an embedding-provider failure rolls
the batch back instead of leaving a partially indexed source set.
"""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from typing import Any

MODEL = "gemini-embedding-001"
DIMENSIONS = 1536
TABLE = "public.legal_knowledge_chunks"
REQUIRED_METADATA = {
    "source_class": "user_supplied_retrieval_snapshot",
    "ingest_mode": "existing_storage_guarded",
    "storage_bucket": "communication-attachments",
    "official_origin_verified": "false",
    "content_verified": "false",
    "substantive_use_allowed": "false",
    "use_in_generation": "false",
    "embedding_status": "pending",
}


def parse_group_ids(raw: str) -> list[str]:
    try:
        values = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("source-groups-json must be a JSON array") from exc
    if not isinstance(values, list) or not 1 <= len(values) <= 50:
        raise ValueError("source-groups-json must contain 1..50 values")

    group_ids: list[str] = []
    for value in values:
        if not isinstance(value, str):
            raise ValueError("source group IDs must be strings")
        try:
            normalized = str(uuid.UUID(value))
        except ValueError as exc:
            raise ValueError("source group ID is not a UUID") from exc
        group_ids.append(normalized)

    if len(set(group_ids)) != len(group_ids):
        raise ValueError("source group IDs must be unique")
    return group_ids


def metadata_value(row: dict[str, Any], key: str) -> str | None:
    metadata = row.get("metadata")
    if not isinstance(metadata, dict):
        return None
    value = metadata.get(key)
    return value if isinstance(value, str) else None


def validate_rows(
    rows: list[dict[str, Any]],
    group_ids: list[str],
    expected_groups: int,
    expected_chunks: int,
) -> None:
    if len(group_ids) != expected_groups:
        raise ValueError("explicit source group count does not match expected-source-groups")
    if len(rows) != expected_chunks:
        raise ValueError(f"expected {expected_chunks} pending chunks, found {len(rows)}")

    seen_groups = {metadata_value(row, "source_group_id") for row in rows}
    if seen_groups != set(group_ids):
        raise ValueError("selected rows do not exactly cover the requested source groups")

    source_heads = 0
    for row in rows:
        if not isinstance(row.get("content"), str) or not row["content"].strip():
            raise ValueError(f"empty content for {row.get('id')}")
        for key, expected in REQUIRED_METADATA.items():
            if metadata_value(row, key) != expected:
                raise ValueError(f"source safety contract mismatch for {row.get('id')}: {key}")
        if metadata_value(row, "is_source_head") == "true":
            source_heads += 1

    if source_heads != expected_groups:
        raise ValueError(f"expected {expected_groups} source heads, found {source_heads}")


def embed(text: str, api_key: str) -> list[float]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:embedContent?key={api_key}"
    payload = json.dumps(
        {
            "content": {"parts": [{"text": text}]},
            "outputDimensionality": DIMENSIONS,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"embedding HTTP {exc.code}: {detail}") from exc

    values = body.get("embedding", {}).get("values")
    if not isinstance(values, list) or len(values) != DIMENSIONS:
        raise RuntimeError(
            f"unexpected embedding dimensions: {len(values) if isinstance(values, list) else 'missing'}"
        )
    return [float(value) for value in values]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-groups-json", required=True)
    parser.add_argument("--expected-source-groups", type=int, required=True)
    parser.add_argument("--expected-chunks", type=int, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--sleep-ms", type=int, default=150)
    args = parser.parse_args()

    if not (1 <= args.expected_source_groups <= 50):
        raise SystemExit("--expected-source-groups must be 1..50")
    if not (1 <= args.expected_chunks <= 5000):
        raise SystemExit("--expected-chunks must be 1..5000")
    if args.sleep_ms < 0:
        raise SystemExit("--sleep-ms must be non-negative")

    group_ids = parse_group_ids(args.source_groups_json)
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database_url, row_factory=dict_row) as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, title, content, metadata
            from public.legal_knowledge_chunks
            where is_active is true
              and embedding is null
              and metadata->>'source_group_id' = any(%s)
              and metadata->>'source_class' = 'user_supplied_retrieval_snapshot'
              and metadata->>'ingest_mode' = 'existing_storage_guarded'
              and metadata->>'storage_bucket' = 'communication-attachments'
              and metadata->>'official_origin_verified' = 'false'
              and metadata->>'content_verified' = 'false'
              and metadata->>'substantive_use_allowed' = 'false'
              and metadata->>'use_in_generation' = 'false'
              and metadata->>'embedding_status' = 'pending'
            order by id
            """,
            (group_ids,),
        )
        rows = cur.fetchall()
        validate_rows(rows, group_ids, args.expected_source_groups, args.expected_chunks)

        summary = {
            "mode": "apply" if args.apply else "dry_run",
            "source_groups": len(group_ids),
            "pending_chunks": len(rows),
            "model": MODEL,
            "dimensions": DIMENSIONS,
            "verification_flags_touched": False,
            "substantive_use_allowed": False,
            "use_in_generation": False,
        }
        print(json.dumps(summary, ensure_ascii=False))
        if not args.apply:
            return 0

        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            raise SystemExit("GEMINI_API_KEY is required for --apply")

        updated = 0
        for row in rows:
            vector = embed(row["content"].strip(), api_key)
            metadata = dict(row["metadata"])
            metadata.update(
                {
                    "embedding_status": "completed",
                    "embedding_provider": "gemini",
                    "embedding_model": MODEL,
                    "embedding_dimensions": DIMENSIONS,
                }
            )
            cur.execute(
                """
                update public.legal_knowledge_chunks
                   set embedding = %s,
                       metadata = %s::jsonb
                 where id = %s
                   and embedding is null
                   and metadata->>'source_group_id' = any(%s)
                   and metadata->>'source_class' = 'user_supplied_retrieval_snapshot'
                   and metadata->>'ingest_mode' = 'existing_storage_guarded'
                   and metadata->>'storage_bucket' = 'communication-attachments'
                   and metadata->>'official_origin_verified' = 'false'
                   and metadata->>'content_verified' = 'false'
                   and metadata->>'substantive_use_allowed' = 'false'
                   and metadata->>'use_in_generation' = 'false'
                   and metadata->>'embedding_status' = 'pending'
                """,
                (vector, json.dumps(metadata, ensure_ascii=False), row["id"], group_ids),
            )
            if cur.rowcount != 1:
                raise RuntimeError(f"concurrent update or safety contract mismatch for {row['id']}")
            updated += 1
            if args.sleep_ms:
                time.sleep(args.sleep_ms / 1000)

        conn.commit()
        print(json.dumps({"updated": updated, "atomic_batch": True}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
