#!/usr/bin/env python3
"""KATI LAWYER Law7 mirror importer.

This is KATI-owned glue code. It does not import or execute upstream Law7 MCP/
pipeline code. Input is a normalized JSON document matching the private
`law7_mirror` contract.

Dry-run is the default. Database writes require both --apply and DATABASE_URL.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

ALLOWED_DATASET_KEYS = {"law7_codes_poc", "law7_codes"}
MAX_CODES = 32
MAX_ARTICLE_VERSIONS = 25_000
MAX_AMENDMENTS = 25_000


def load_dataset(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("dataset root must be an object")
    return raw


def require_text(value: Any, field: str, *, max_len: int = 20_000) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    value = value.strip()
    if len(value) > max_len:
        raise ValueError(f"{field} exceeds {max_len} characters")
    return value


def optional_text(value: Any, field: str, *, max_len: int = 20_000) -> str | None:
    if value is None:
        return None
    return require_text(value, field, max_len=max_len)


def validate_date(value: Any, field: str) -> str | None:
    if value is None:
        return None
    text = require_text(value, field, max_len=10)
    parts = text.split("-")
    if len(parts) != 3 or tuple(map(len, parts)) != (4, 2, 2) or not all(p.isdigit() for p in parts):
        raise ValueError(f"{field} must be YYYY-MM-DD")
    return text


def normalize(dataset: dict[str, Any]) -> dict[str, Any]:
    dataset_key = require_text(dataset.get("dataset_key"), "dataset_key", max_len=64)
    if dataset_key not in ALLOWED_DATASET_KEYS:
        raise ValueError(f"unsupported dataset_key: {dataset_key}")
    source_repository = require_text(dataset.get("source_repository"), "source_repository", max_len=200)
    source_commit = require_text(dataset.get("source_commit"), "source_commit", max_len=64)

    codes = dataset.get("codes", [])
    versions = dataset.get("article_versions", [])
    amendments = dataset.get("amendments", [])
    if not isinstance(codes, list) or not isinstance(versions, list) or not isinstance(amendments, list):
        raise ValueError("codes/article_versions/amendments must be arrays")
    if len(codes) > MAX_CODES:
        raise ValueError(f"too many codes: {len(codes)} > {MAX_CODES}")
    if len(versions) > MAX_ARTICLE_VERSIONS:
        raise ValueError(f"too many article versions: {len(versions)} > {MAX_ARTICLE_VERSIONS}")
    if len(amendments) > MAX_AMENDMENTS:
        raise ValueError(f"too many amendments: {len(amendments)} > {MAX_AMENDMENTS}")

    normalized_codes: list[dict[str, Any]] = []
    code_ids: set[str] = set()
    for i, row in enumerate(codes):
        if not isinstance(row, dict):
            raise ValueError(f"codes[{i}] must be an object")
        code = require_text(row.get("code"), f"codes[{i}].code", max_len=50)
        if code in code_ids:
            raise ValueError(f"duplicate code: {code}")
        code_ids.add(code)
        normalized_codes.append({
            "code": code,
            "name": require_text(row.get("name"), f"codes[{i}].name", max_len=500),
            "short_name": optional_text(row.get("short_name"), f"codes[{i}].short_name", max_len=100),
            "description": optional_text(row.get("description"), f"codes[{i}].description"),
            "original_eo_number": optional_text(row.get("original_eo_number"), f"codes[{i}].original_eo_number", max_len=100),
            "original_date": validate_date(row.get("original_date"), f"codes[{i}].original_date"),
            "official_url": optional_text(row.get("official_url"), f"codes[{i}].official_url", max_len=2000),
        })

    normalized_versions: list[dict[str, Any]] = []
    version_keys: set[tuple[str, str, str]] = set()
    for i, row in enumerate(versions):
        if not isinstance(row, dict):
            raise ValueError(f"article_versions[{i}] must be an object")
        code_id = require_text(row.get("code_id"), f"article_versions[{i}].code_id", max_len=50)
        if code_id not in code_ids:
            raise ValueError(f"article_versions[{i}] references unknown code {code_id}")
        article = require_text(row.get("article_number"), f"article_versions[{i}].article_number", max_len=50)
        version_date = validate_date(row.get("version_date"), f"article_versions[{i}].version_date")
        assert version_date is not None
        key = (code_id, article, version_date)
        if key in version_keys:
            raise ValueError(f"duplicate article version: {key}")
        version_keys.add(key)
        article_text = require_text(row.get("article_text"), f"article_versions[{i}].article_text", max_len=200_000)
        text_hash = optional_text(row.get("text_hash"), f"article_versions[{i}].text_hash", max_len=128)
        if text_hash is None:
            text_hash = hashlib.sha256(article_text.encode("utf-8")).hexdigest()
        normalized_versions.append({
            "code_id": code_id,
            "article_number": article,
            "version_date": version_date,
            "article_text": article_text,
            "article_title": optional_text(row.get("article_title"), f"article_versions[{i}].article_title", max_len=1000),
            "amendment_eo_number": optional_text(row.get("amendment_eo_number"), f"article_versions[{i}].amendment_eo_number", max_len=100),
            "amendment_date": validate_date(row.get("amendment_date"), f"article_versions[{i}].amendment_date"),
            "is_current": row.get("is_current") is True,
            "is_repealed": row.get("is_repealed") is True,
            "repealed_date": validate_date(row.get("repealed_date"), f"article_versions[{i}].repealed_date"),
            "text_hash": text_hash,
        })

    normalized_amendments: list[dict[str, Any]] = []
    amendment_keys: set[tuple[str, str]] = set()
    for i, row in enumerate(amendments):
        if not isinstance(row, dict):
            raise ValueError(f"amendments[{i}] must be an object")
        code_id = require_text(row.get("code_id"), f"amendments[{i}].code_id", max_len=50)
        if code_id not in code_ids:
            raise ValueError(f"amendments[{i}] references unknown code {code_id}")
        eo = require_text(row.get("amendment_eo_number"), f"amendments[{i}].amendment_eo_number", max_len=100)
        key = (code_id, eo)
        if key in amendment_keys:
            raise ValueError(f"duplicate amendment: {key}")
        amendment_keys.add(key)

        def text_array(field: str) -> list[str]:
            value = row.get(field, [])
            if not isinstance(value, list):
                raise ValueError(f"amendments[{i}].{field} must be an array")
            return [require_text(item, f"amendments[{i}].{field}", max_len=50) for item in value[:500]]

        normalized_amendments.append({
            "code_id": code_id,
            "amendment_eo_number": eo,
            "amendment_date": validate_date(row.get("amendment_date"), f"amendments[{i}].amendment_date"),
            "amendment_type": optional_text(row.get("amendment_type"), f"amendments[{i}].amendment_type", max_len=50),
            "articles_affected": text_array("articles_affected"),
            "articles_added": text_array("articles_added"),
            "articles_modified": text_array("articles_modified"),
            "articles_repealed": text_array("articles_repealed"),
        })

    return {
        "dataset_key": dataset_key,
        "source_repository": source_repository,
        "source_commit": source_commit,
        "codes": normalized_codes,
        "article_versions": normalized_versions,
        "amendments": normalized_amendments,
    }


def apply_dataset(dataset: dict[str, Any], database_url: str) -> None:
    try:
        import psycopg
    except ImportError as exc:  # pragma: no cover - CI dry-run has no DB dependency
        raise RuntimeError("psycopg is required for --apply") from exc

    source_commit = dataset["source_commit"]
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into law7_mirror.sync_state(dataset_key, status, source_repository, source_commit, started_at, metadata)
                values (%s, 'running', %s, %s, now(), %s::jsonb)
                on conflict (dataset_key) do update set
                  status = excluded.status,
                  source_repository = excluded.source_repository,
                  source_commit = excluded.source_commit,
                  started_at = excluded.started_at,
                  completed_at = null,
                  metadata = excluded.metadata,
                  updated_at = now()
                """,
                (dataset["dataset_key"], dataset["source_repository"], source_commit, json.dumps({"importer": "kati-law7-mirror-v1"})),
            )

            for row in dataset["codes"]:
                cur.execute(
                    """
                    insert into law7_mirror.codes
                      (code, name, short_name, description, original_eo_number, original_date, official_url, source_commit, source_updated_at, imported_at)
                    values (%(code)s, %(name)s, %(short_name)s, %(description)s, %(original_eo_number)s, %(original_date)s, %(official_url)s, %(source_commit)s, now(), now())
                    on conflict (code) do update set
                      name = excluded.name,
                      short_name = excluded.short_name,
                      description = excluded.description,
                      original_eo_number = excluded.original_eo_number,
                      original_date = excluded.original_date,
                      official_url = excluded.official_url,
                      source_commit = excluded.source_commit,
                      source_updated_at = excluded.source_updated_at,
                      imported_at = now()
                    """,
                    {**row, "source_commit": source_commit},
                )

            for row in dataset["article_versions"]:
                cur.execute(
                    """
                    insert into law7_mirror.article_versions
                      (code_id, article_number, version_date, article_text, article_title, amendment_eo_number, amendment_date,
                       is_current, is_repealed, repealed_date, text_hash, source_commit, imported_at)
                    values (%(code_id)s, %(article_number)s, %(version_date)s, %(article_text)s, %(article_title)s,
                            %(amendment_eo_number)s, %(amendment_date)s, %(is_current)s, %(is_repealed)s, %(repealed_date)s,
                            %(text_hash)s, %(source_commit)s, now())
                    on conflict (code_id, article_number, version_date) do update set
                      article_text = excluded.article_text,
                      article_title = excluded.article_title,
                      amendment_eo_number = excluded.amendment_eo_number,
                      amendment_date = excluded.amendment_date,
                      is_current = excluded.is_current,
                      is_repealed = excluded.is_repealed,
                      repealed_date = excluded.repealed_date,
                      text_hash = excluded.text_hash,
                      source_commit = excluded.source_commit,
                      imported_at = now()
                    """,
                    {**row, "source_commit": source_commit},
                )

            for row in dataset["amendments"]:
                cur.execute(
                    """
                    insert into law7_mirror.amendments
                      (code_id, amendment_eo_number, amendment_date, amendment_type, articles_affected, articles_added,
                       articles_modified, articles_repealed, source_commit, imported_at)
                    values (%(code_id)s, %(amendment_eo_number)s, %(amendment_date)s, %(amendment_type)s,
                            %(articles_affected)s, %(articles_added)s, %(articles_modified)s, %(articles_repealed)s,
                            %(source_commit)s, now())
                    on conflict (code_id, amendment_eo_number) do update set
                      amendment_date = excluded.amendment_date,
                      amendment_type = excluded.amendment_type,
                      articles_affected = excluded.articles_affected,
                      articles_added = excluded.articles_added,
                      articles_modified = excluded.articles_modified,
                      articles_repealed = excluded.articles_repealed,
                      source_commit = excluded.source_commit,
                      imported_at = now()
                    """,
                    {**row, "source_commit": source_commit},
                )

            cur.execute(
                """
                update law7_mirror.sync_state
                set status = 'completed',
                    codes_count = %s,
                    article_versions_count = %s,
                    amendments_count = %s,
                    completed_at = now(),
                    updated_at = now()
                where dataset_key = %s
                """,
                (len(dataset["codes"]), len(dataset["article_versions"]), len(dataset["amendments"]), dataset["dataset_key"]),
            )
        conn.commit()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--apply", action="store_true", help="Write to DATABASE_URL; default is dry-run")
    args = parser.parse_args()

    dataset = normalize(load_dataset(args.input))
    summary = {
        "dataset_key": dataset["dataset_key"],
        "source_repository": dataset["source_repository"],
        "source_commit": dataset["source_commit"],
        "codes": len(dataset["codes"]),
        "article_versions": len(dataset["article_versions"]),
        "amendments": len(dataset["amendments"]),
        "mode": "apply" if args.apply else "dry-run",
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if not args.apply:
        return 0

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL is required with --apply", file=sys.stderr)
        return 2
    apply_dataset(dataset, database_url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
