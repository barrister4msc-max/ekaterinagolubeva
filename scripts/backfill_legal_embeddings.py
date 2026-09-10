#!/usr/bin/env python3
"""Guarded embedding backfill for KATI internal legal sources.

Default mode is dry-run. --apply requires DATABASE_URL and GEMINI_API_KEY.
The script never changes verification/admission flags. It only fills the
1536-dimensional embedding column and metadata.embedding_status/model fields.
"""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request

MODEL = "gemini-embedding-001"
DIMENSIONS = 1536
ALLOWED_TABLES = {"legal_law_chunks", "legal_knowledge_chunks"}


def embed(text: str, api_key: str) -> list[float]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:embedContent?key={api_key}"
    payload = json.dumps({
        "content": {"parts": [{"text": text}]},
        "outputDimensionality": DIMENSIONS,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"embedding HTTP {exc.code}: {detail}") from exc
    values = body.get("embedding", {}).get("values")
    if not isinstance(values, list) or len(values) != DIMENSIONS:
        raise RuntimeError(f"unexpected embedding dimensions: {len(values) if isinstance(values, list) else 'missing'}")
    return [float(v) for v in values]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--table", choices=sorted(ALLOWED_TABLES), default="legal_law_chunks")
    p.add_argument("--source-namespace", default="garant_user_supplied_nk")
    p.add_argument("--limit", type=int, default=1000)
    p.add_argument("--apply", action="store_true")
    p.add_argument("--sleep-ms", type=int, default=150)
    args = p.parse_args()

    if not (1 <= args.limit <= 5000):
        raise SystemExit("--limit must be 1..5000")

    db = os.environ.get("DATABASE_URL", "").strip()
    if not db:
        raise SystemExit("DATABASE_URL is required")

    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(db, row_factory=dict_row) as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            select id, title, content, metadata
            from public.{args.table}
            where is_active = true
              and embedding is null
              and coalesce(metadata->>'embedding_status','pending') = 'pending'
              and metadata->>'source_namespace' = %s
            order by id
            limit %s
            """,
            (args.source_namespace, args.limit),
        )
        rows = cur.fetchall()

        summary = {
            "mode": "apply" if args.apply else "dry_run",
            "table": args.table,
            "source_namespace": args.source_namespace,
            "pending_rows": len(rows),
            "model": MODEL,
            "dimensions": DIMENSIONS,
            "verification_flags_touched": False,
        }
        print(json.dumps(summary, ensure_ascii=False))
        if not args.apply or not rows:
            return 0

        key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not key:
            raise SystemExit("GEMINI_API_KEY is required for --apply")

        updated = 0
        for row in rows:
            text = (row.get("content") or "").strip()
            if not text:
                raise RuntimeError(f"empty content for {row['id']}")
            vector = embed(text, key)
            meta = dict(row.get("metadata") or {})
            # Preserve all legal verification/admission metadata verbatim.
            meta["embedding_status"] = "completed"
            meta["embedding_provider"] = "gemini"
            meta["embedding_model"] = MODEL
            meta["embedding_dimensions"] = DIMENSIONS
            cur.execute(
                f"update public.{args.table} set embedding=%s, metadata=%s::jsonb where id=%s and embedding is null",
                (vector, json.dumps(meta, ensure_ascii=False), row["id"]),
            )
            if cur.rowcount != 1:
                raise RuntimeError(f"concurrent update or missing row: {row['id']}")
            updated += 1
            if args.sleep_ms:
                time.sleep(args.sleep_ms / 1000)
        conn.commit()
        print(json.dumps({"updated": updated, "verification_flags_touched": False}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
