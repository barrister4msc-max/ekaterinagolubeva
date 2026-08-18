#!/usr/bin/env python3
"""Controlled read-only export from a Law7 PostgreSQL database into KATI mirror JSON.

This is KATI-owned bridge code. It does not import or execute upstream Law7 code.
It reads the public Law7 data contract (`consolidated_codes`,
`code_article_versions`, `amendment_applications`) and emits the normalized JSON
already accepted by `scripts/law7_mirror_import.py`.

Scope is intentionally fixed for the first real-data PoC: NK_RF articles
54.1, 88, 89, 93, 100 and 101. Source access is transaction READ ONLY.

`source_commit` is the existing mirror-contract field name. For this bridge it
must contain an exact immutable source revision: either a Law7 Git commit or a
verified backup SHA256. It must never be filled with an unrelated repository
HEAD merely to satisfy provenance.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable

SOURCE_REPOSITORY = "mikhashev/law7"
DATASET_KEY = "law7_codes_poc"
ALLOWED_CODE = "NK_RF"
ALLOWED_ARTICLES = ("54.1", "88", "89", "93", "100", "101")


def iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    text = str(value).strip()
    return text[:10] if text else None


def text_array(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple)):
        raise ValueError("expected PostgreSQL text[] value")
    return [str(item).strip() for item in value if str(item).strip()]


def optional_nonblank_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def ensure_allowlist(code: str, articles: Iterable[str]) -> tuple[str, list[str]]:
    normalized_code = code.strip()
    normalized_articles = [str(item).strip() for item in articles if str(item).strip()]
    if normalized_code != ALLOWED_CODE:
        raise ValueError(f"controlled PoC only allows code {ALLOWED_CODE}")
    unknown = [item for item in normalized_articles if item not in ALLOWED_ARTICLES]
    if unknown:
        raise ValueError(f"articles outside controlled allowlist: {', '.join(unknown)}")
    if not normalized_articles:
        raise ValueError("at least one allowlisted article is required")
    return normalized_code, list(dict.fromkeys(normalized_articles))


def fetch_rows(source_database_url: str, code: str, articles: list[str]) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("psycopg is required for controlled Law7 export") from exc

    with psycopg.connect(source_database_url, row_factory=dict_row) as conn:
        conn.execute("set transaction read only")
        with conn.cursor() as cur:
            cur.execute(
                """
                select code, name, short_name, description, original_eo_number,
                       original_date, official_url
                from consolidated_codes
                where code = %s
                """,
                (code,),
            )
            code_row = cur.fetchone()
            if not code_row:
                raise RuntimeError(f"Law7 source does not contain code {code}")

            cur.execute(
                """
                select code_id, article_number, version_date, article_text,
                       article_title, amendment_eo_number, amendment_date,
                       is_current, is_repealed, repealed_date, text_hash
                from code_article_versions
                where code_id = %s
                  and article_number = any(%s)
                order by article_number, version_date
                """,
                (code, articles),
            )
            version_rows = list(cur.fetchall())

            cur.execute(
                """
                select code_id, amendment_eo_number, amendment_date,
                       amendment_type, articles_affected, articles_added,
                       articles_modified, articles_repealed
                from amendment_applications
                where code_id = %s
                  and status = 'applied'
                  and (
                    coalesce(articles_affected, '{}') && %s::text[] or
                    coalesce(articles_added, '{}') && %s::text[] or
                    coalesce(articles_modified, '{}') && %s::text[] or
                    coalesce(articles_repealed, '{}') && %s::text[]
                  )
                order by amendment_date, amendment_eo_number
                """,
                (code, articles, articles, articles, articles),
            )
            amendment_rows = list(cur.fetchall())

        conn.rollback()  # explicit: the source connection must remain read-only/no-op

    return dict(code_row), [dict(row) for row in version_rows], [dict(row) for row in amendment_rows]


def build_dataset(
    source_commit: str,
    code_row: dict[str, Any],
    version_rows: list[dict[str, Any]],
    amendment_rows: list[dict[str, Any]],
    selected_articles: list[str],
) -> dict[str, Any]:
    found = {str(row.get("article_number", "")).strip() for row in version_rows}
    missing = [article for article in selected_articles if article not in found]
    if missing:
        raise RuntimeError(f"Law7 source is missing selected articles: {', '.join(missing)}")

    code = str(code_row["code"]).strip()
    return {
        "dataset_key": DATASET_KEY,
        "source_repository": SOURCE_REPOSITORY,
        "source_commit": source_commit,
        "codes": [{
            "code": code,
            "name": str(code_row["name"]).strip(),
            "short_name": code_row.get("short_name"),
            "description": code_row.get("description"),
            "original_eo_number": code_row.get("original_eo_number"),
            "original_date": iso(code_row.get("original_date")),
            "official_url": code_row.get("official_url"),
        }],
        "article_versions": [{
            "code_id": str(row["code_id"]).strip(),
            "article_number": str(row["article_number"]).strip(),
            "version_date": iso(row.get("version_date")),
            "article_text": str(row.get("article_text") or "").strip(),
            "article_title": row.get("article_title"),
            "amendment_eo_number": row.get("amendment_eo_number"),
            "amendment_date": iso(row.get("amendment_date")),
            "is_current": row.get("is_current") is True,
            "is_repealed": row.get("is_repealed") is True,
            "repealed_date": iso(row.get("repealed_date")),
            "text_hash": optional_nonblank_text(row.get("text_hash")),
        } for row in version_rows],
        "amendments": [{
            "code_id": str(row["code_id"]).strip(),
            "amendment_eo_number": str(row["amendment_eo_number"]).strip(),
            "amendment_date": iso(row.get("amendment_date")),
            "amendment_type": row.get("amendment_type"),
            "articles_affected": text_array(row.get("articles_affected")),
            "articles_added": text_array(row.get("articles_added")),
            "articles_modified": text_array(row.get("articles_modified")),
            "articles_repealed": text_array(row.get("articles_repealed")),
        } for row in amendment_rows],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-database-url", default=os.getenv("LAW7_SOURCE_DATABASE_URL", ""))
    parser.add_argument("--source-commit", default=os.getenv("LAW7_SOURCE_COMMIT", ""))
    parser.add_argument("--code", default=ALLOWED_CODE)
    parser.add_argument("--articles", nargs="+", default=list(ALLOWED_ARTICLES))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    try:
        code, articles = ensure_allowlist(args.code, args.articles)
        source_url = args.source_database_url.strip()
        source_commit = args.source_commit.strip()
        if not source_url:
            raise ValueError("LAW7_SOURCE_DATABASE_URL (or --source-database-url) is required")
        if not source_commit:
            raise ValueError("LAW7_SOURCE_COMMIT (or --source-commit) is required for exact source provenance")

        code_row, versions, amendments = fetch_rows(source_url, code, articles)
        dataset = build_dataset(source_commit, code_row, versions, amendments, articles)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({
            "dataset_key": DATASET_KEY,
            "source_repository": SOURCE_REPOSITORY,
            "source_commit": source_commit,
            "code": code,
            "articles": articles,
            "article_versions": len(dataset["article_versions"]),
            "amendments": len(dataset["amendments"]),
            "output": str(args.output),
            "source_mode": "read_only",
        }, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print(f"controlled Law7 export failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
