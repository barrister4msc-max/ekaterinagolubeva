#!/usr/bin/env python3
"""Controlled read-only export from a Law7 PostgreSQL database into KATI mirror JSON.

This is KATI-owned bridge code. It does not import or execute upstream Law7 code.
It reads the public Law7 data contract (`consolidated_codes`,
`code_article_versions`, `amendment_applications`) and emits normalized JSON
accepted by `scripts/law7_mirror_import.py`.

Two explicit modes are supported:
- legacy PoC: `--code NK_RF --articles 54.1 88 89 93 100 101`;
- TAX CORE corpus: `--codes ...`, exporting all article versions and all applied
  amendments for the selected allowlisted codes.

Source access is always transaction READ ONLY. `source_commit` must be an exact
immutable Law7 Git commit (40 hex) or verified backup SHA256 (64 hex).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Sequence

SOURCE_REPOSITORY = "mikhashev/law7"
POC_DATASET_KEY = "law7_codes_poc"
TAX_CORE_DATASET_KEY = "law7_codes"

POC_CODE = "NK_RF"
POC_ARTICLES = ("54.1", "88", "89", "93", "100", "101")

TAX_CORE_CODES = (
    "NK_RF",
    "NK_RF_2",
    "APK_RF",
    "KoAP_RF",
    "BK_RF",
    "GK_RF",
    "GK_RF_2",
    "KONST_RF",
)
CONDITIONAL_TAX_CORE_CODES = ("KAS_RF",)
ALL_ALLOWED_CODES = frozenset((*TAX_CORE_CODES, *CONDITIONAL_TAX_CORE_CODES))
IMMUTABLE_REVISION_RE = re.compile(r"^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$")


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


def require_nonblank_text(value: Any, field: str) -> str:
    text = optional_nonblank_text(value)
    if text is None:
        raise ValueError(f"{field} must be non-empty")
    return text


def normalize_codes(codes: Iterable[str]) -> list[str]:
    normalized = [str(item).strip() for item in codes if str(item).strip()]
    if not normalized:
        raise ValueError("at least one explicit TAX CORE code is required")
    deduped = list(dict.fromkeys(normalized))
    unknown = [code for code in deduped if code not in ALL_ALLOWED_CODES]
    if unknown:
        raise ValueError(f"codes outside TAX CORE allowlist: {', '.join(unknown)}")
    return deduped


def ensure_poc_allowlist(code: str, articles: Iterable[str]) -> tuple[str, list[str]]:
    normalized_code = code.strip()
    normalized_articles = [str(item).strip() for item in articles if str(item).strip()]
    if normalized_code != POC_CODE:
        raise ValueError(f"controlled PoC only allows code {POC_CODE}")
    unknown = [item for item in normalized_articles if item not in POC_ARTICLES]
    if unknown:
        raise ValueError(f"articles outside controlled PoC allowlist: {', '.join(unknown)}")
    if not normalized_articles:
        raise ValueError("at least one allowlisted PoC article is required")
    return normalized_code, list(dict.fromkeys(normalized_articles))


def validate_source_revision(source_commit: str) -> str:
    revision = source_commit.strip()
    if not IMMUTABLE_REVISION_RE.fullmatch(revision):
        raise ValueError(
            "source_commit must be an exact 40-hex Law7 Git commit or 64-hex verified backup SHA256"
        )
    return revision.lower()


def _load_source_driver():
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("psycopg is required for controlled Law7 export") from exc
    return psycopg, dict_row


def fetch_poc_rows(
    source_database_url: str,
    code: str,
    articles: list[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    psycopg, dict_row = _load_source_driver()
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
        conn.rollback()

    return [dict(code_row)], [dict(row) for row in version_rows], [dict(row) for row in amendment_rows], []


def fetch_tax_core_rows(
    source_database_url: str,
    requested_codes: list[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    psycopg, dict_row = _load_source_driver()
    conditional = set(CONDITIONAL_TAX_CORE_CODES)

    with psycopg.connect(source_database_url, row_factory=dict_row) as conn:
        conn.execute("set transaction read only")
        with conn.cursor() as cur:
            cur.execute(
                """
                select code, name, short_name, description, original_eo_number,
                       original_date, official_url
                from consolidated_codes
                where code = any(%s)
                order by code
                """,
                (requested_codes,),
            )
            code_rows = [dict(row) for row in cur.fetchall()]
            found_codes = {str(row["code"]).strip() for row in code_rows}
            missing_required = [
                code for code in requested_codes
                if code not in found_codes and code not in conditional
            ]
            unavailable = [
                code for code in requested_codes
                if code not in found_codes and code in conditional
            ]
            if missing_required:
                raise RuntimeError(
                    f"Law7 source is missing required selected codes: {', '.join(missing_required)}"
                )

            candidate_codes = [code for code in requested_codes if code in found_codes]
            if not candidate_codes:
                raise RuntimeError("Law7 source contains none of the selected TAX CORE codes")

            cur.execute(
                """
                select code_id, article_number, version_date, article_text,
                       article_title, amendment_eo_number, amendment_date,
                       is_current, is_repealed, repealed_date, text_hash
                from code_article_versions
                where code_id = any(%s)
                order by code_id, article_number, version_date
                """,
                (candidate_codes,),
            )
            version_rows = [dict(row) for row in cur.fetchall()]
            codes_with_versions = {
                str(row.get("code_id", "")).strip()
                for row in version_rows
                if str(row.get("code_id", "")).strip()
            }

            missing_corpus_required = [
                code for code in candidate_codes
                if code not in codes_with_versions and code not in conditional
            ]
            if missing_corpus_required:
                raise RuntimeError(
                    "Law7 source has no imported article corpus for required selected codes: "
                    + ", ".join(missing_corpus_required)
                )

            unavailable.extend(
                code for code in candidate_codes
                if code not in codes_with_versions and code in conditional
            )
            available_codes = [code for code in candidate_codes if code in codes_with_versions]
            available_set = set(available_codes)
            code_rows = [
                row for row in code_rows
                if str(row.get("code", "")).strip() in available_set
            ]
            version_rows = [
                row for row in version_rows
                if str(row.get("code_id", "")).strip() in available_set
            ]

            cur.execute(
                """
                select code_id, amendment_eo_number, amendment_date,
                       amendment_type, articles_affected, articles_added,
                       articles_modified, articles_repealed
                from amendment_applications
                where code_id = any(%s)
                  and status = 'applied'
                order by code_id, amendment_date, amendment_eo_number
                """,
                (available_codes,),
            )
            amendment_rows = [dict(row) for row in cur.fetchall()]
        conn.rollback()

    return code_rows, version_rows, amendment_rows, list(dict.fromkeys(unavailable))


def build_dataset(
    *,
    dataset_key: str,
    source_commit: str,
    code_rows: Sequence[dict[str, Any]],
    version_rows: Sequence[dict[str, Any]],
    amendment_rows: Sequence[dict[str, Any]],
    required_codes: Sequence[str],
    required_articles: Sequence[str] | None = None,
    unavailable_codes: Sequence[str] = (),
) -> dict[str, Any]:
    code_map: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(code_rows):
        code = require_nonblank_text(row.get("code"), f"codes[{index}].code")
        if code in code_map:
            raise RuntimeError(f"duplicate Law7 code row: {code}")
        code_map[code] = dict(row)

    missing_codes = [
        code for code in required_codes
        if code not in code_map and code not in unavailable_codes
    ]
    if missing_codes:
        raise RuntimeError(f"Law7 source is missing selected codes: {', '.join(missing_codes)}")

    version_keys: set[tuple[str, str, str]] = set()
    normalized_versions: list[dict[str, Any]] = []
    for index, row in enumerate(version_rows):
        code_id = require_nonblank_text(row.get("code_id"), f"article_versions[{index}].code_id")
        if code_id not in code_map:
            raise RuntimeError(f"article version references unselected code: {code_id}")
        article_number = require_nonblank_text(
            row.get("article_number"), f"article_versions[{index}].article_number"
        )
        version_date = iso(row.get("version_date"))
        if not version_date:
            raise RuntimeError(f"article version missing version_date: {code_id} {article_number}")
        article_text = require_nonblank_text(
            row.get("article_text"), f"article_versions[{index}].article_text"
        )
        key = (code_id, article_number, version_date)
        if key in version_keys:
            raise RuntimeError(f"duplicate Law7 article version: {key}")
        version_keys.add(key)

        text_hash = optional_nonblank_text(row.get("text_hash"))
        if text_hash is None:
            text_hash = hashlib.sha256(article_text.encode("utf-8")).hexdigest()

        normalized_versions.append({
            "code_id": code_id,
            "article_number": article_number,
            "version_date": version_date,
            "article_text": article_text,
            "article_title": row.get("article_title"),
            "amendment_eo_number": row.get("amendment_eo_number"),
            "amendment_date": iso(row.get("amendment_date")),
            "is_current": row.get("is_current") is True,
            "is_repealed": row.get("is_repealed") is True,
            "repealed_date": iso(row.get("repealed_date")),
            "text_hash": text_hash,
        })

    versions_by_code = {code: 0 for code in code_map}
    for row in normalized_versions:
        versions_by_code[row["code_id"]] += 1
    empty_corpus = [code for code, count in versions_by_code.items() if count == 0]
    if empty_corpus:
        raise RuntimeError(f"selected codes have no article versions: {', '.join(empty_corpus)}")

    if required_articles is not None:
        found_articles = {
            row["article_number"]
            for row in normalized_versions
            if row["code_id"] == POC_CODE
        }
        missing_articles = [
            article for article in required_articles if article not in found_articles
        ]
        if missing_articles:
            raise RuntimeError(
                f"Law7 source is missing selected articles: {', '.join(missing_articles)}"
            )

    amendment_keys: set[tuple[str, str]] = set()
    normalized_amendments: list[dict[str, Any]] = []
    for index, row in enumerate(amendment_rows):
        code_id = require_nonblank_text(row.get("code_id"), f"amendments[{index}].code_id")
        if code_id not in code_map:
            raise RuntimeError(f"amendment references unselected code: {code_id}")
        eo = require_nonblank_text(
            row.get("amendment_eo_number"), f"amendments[{index}].amendment_eo_number"
        )
        key = (code_id, eo)
        if key in amendment_keys:
            raise RuntimeError(f"duplicate Law7 amendment: {key}")
        amendment_keys.add(key)
        normalized_amendments.append({
            "code_id": code_id,
            "amendment_eo_number": eo,
            "amendment_date": iso(row.get("amendment_date")),
            "amendment_type": row.get("amendment_type"),
            "articles_affected": text_array(row.get("articles_affected")),
            "articles_added": text_array(row.get("articles_added")),
            "articles_modified": text_array(row.get("articles_modified")),
            "articles_repealed": text_array(row.get("articles_repealed")),
        })

    normalized_codes = []
    for code in required_codes:
        if code not in code_map:
            continue
        row = code_map[code]
        normalized_codes.append({
            "code": code,
            "name": require_nonblank_text(row.get("name"), f"code[{code}].name"),
            "short_name": row.get("short_name"),
            "description": row.get("description"),
            "original_eo_number": row.get("original_eo_number"),
            "original_date": iso(row.get("original_date")),
            "official_url": row.get("official_url"),
        })

    return {
        "dataset_key": dataset_key,
        "source_repository": SOURCE_REPOSITORY,
        "source_commit": source_commit,
        "codes": normalized_codes,
        "article_versions": normalized_versions,
        "amendments": normalized_amendments,
        "unavailable_codes": list(dict.fromkeys(unavailable_codes)),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-database-url", default=os.getenv("LAW7_SOURCE_DATABASE_URL", ""))
    parser.add_argument("--source-commit", default=os.getenv("LAW7_SOURCE_COMMIT", ""))
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--code", help="Legacy controlled PoC mode; only NK_RF is allowed")
    selection.add_argument(
        "--codes",
        nargs="+",
        help="Explicit TAX CORE allowlist selection; exports all article versions",
    )
    parser.add_argument("--articles", nargs="+", help="Legacy PoC articles; valid only with --code")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    try:
        source_url = args.source_database_url.strip()
        source_commit = validate_source_revision(args.source_commit)
        if not source_url:
            raise ValueError("LAW7_SOURCE_DATABASE_URL (or --source-database-url) is required")

        if args.code is not None:
            articles = args.articles if args.articles is not None else list(POC_ARTICLES)
            code, articles = ensure_poc_allowlist(args.code, articles)
            code_rows, versions, amendments, unavailable = fetch_poc_rows(source_url, code, articles)
            dataset = build_dataset(
                dataset_key=POC_DATASET_KEY,
                source_commit=source_commit,
                code_rows=code_rows,
                version_rows=versions,
                amendment_rows=amendments,
                required_codes=[code],
                required_articles=articles,
                unavailable_codes=unavailable,
            )
            selected_codes = [code]
            selected_articles = articles
            mode = "legacy_poc"
        else:
            if args.articles:
                raise ValueError("--articles is only valid with legacy --code mode")
            selected_codes = normalize_codes(args.codes or [])
            code_rows, versions, amendments, unavailable = fetch_tax_core_rows(source_url, selected_codes)
            dataset = build_dataset(
                dataset_key=TAX_CORE_DATASET_KEY,
                source_commit=source_commit,
                code_rows=code_rows,
                version_rows=versions,
                amendment_rows=amendments,
                required_codes=selected_codes,
                unavailable_codes=unavailable,
            )
            selected_articles = None
            mode = "tax_core"

        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({
            "dataset_key": dataset["dataset_key"],
            "source_repository": SOURCE_REPOSITORY,
            "source_commit": source_commit,
            "mode": mode,
            "requested_codes": selected_codes,
            "exported_codes": [row["code"] for row in dataset["codes"]],
            "unavailable_codes": dataset["unavailable_codes"],
            "articles": selected_articles,
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
