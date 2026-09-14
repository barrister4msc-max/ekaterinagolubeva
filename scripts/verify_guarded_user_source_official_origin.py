#!/usr/bin/env python3
"""Fail-closed official-origin verifier for the five guarded user-source documents.

The verifier has a deliberately narrow job: check a fixed official URL and exact
identity markers.  It never compares complete document text and never enables
temporal or substantive use.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

EXPECTED_GROUPS = 5
EXPECTED_CHUNKS = 171
IDENTITY_SCOPE = "guarded_user_supplied_v1"
VERIFIER = "guarded_official_origin_verifier_v1"


@dataclass(frozen=True)
class SourceSpec:
    source_group_id: str
    canonical_document_key: str
    url: str
    expected_http_status: int
    title_marker: str | None = None
    date_marker: str | None = None


SPECS = (
    SourceSpec(
        "d6b6bfb9-6a2a-52eb-9f59-5a9260db0a0c",
        "ru:court_practice:document:53:2006-10-12",
        "https://vsrf.ru/documents/arbitration/18938/",
        404,
    ),
    SourceSpec(
        "16887b7d-3714-52bd-8138-491a10a22043",
        "ru:court_practice:document:57:2013-07-30",
        "https://www.vsrf.ru/documents/arbitration/17922/",
        404,
    ),
    SourceSpec(
        "5a12d4f2-9b84-545e-be36-c1b63138a73f",
        "ru:court_practice:review:vsrf:2015-10-21:chapter-23-tax-code",
        "https://vsrf.ru/documents/all/15154/",
        200,
        "Обзор практики рассмотрения судами дел, связанных с применением главы 23 Налогового кодекса Российской Федерации",
        "21 октября 2015",
    ),
    SourceSpec(
        "8377b26c-aaff-5300-a769-838148e43cf3",
        "ru:court_practice:document:48:2019-11-26",
        "https://www.vsrf.ru/documents/own/28483/",
        404,
    ),
    SourceSpec(
        "ef0d1258-a1b2-5c30-9adf-ca1ed52c8031",
        "ru:court_practice:review:vsrf:2023-12-13:tax-benefit",
        "https://www.vsrf.ru/documents/all/33229/",
        200,
        "Обзор практики применения арбитражными судами положений законодательства о налогах и сборах, связанных с оценкой обоснованности налоговой выгоды",
        "13 декабря 2023",
    ),
)


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip().casefold()


def fetch(url: str) -> tuple[int, str]:
    request = Request(url, headers={"User-Agent": "KATI-LAWYER-Official-Origin-Verifier/1.0"})
    try:
        with urlopen(request, timeout=30) as response:
            return int(response.status), response.read(4_000_000).decode("utf-8", errors="replace")
    except HTTPError as error:
        return int(error.code), error.read(4096).decode("utf-8", errors="replace")


def verify_spec(spec: SourceSpec) -> dict[str, object]:
    status, body = fetch(spec.url)
    if status != spec.expected_http_status:
        raise RuntimeError(
            f"{spec.canonical_document_key}: expected HTTP {spec.expected_http_status}, got {status}"
        )

    if status == 404:
        return {
            "source_group_id": spec.source_group_id,
            "canonical_document_key": spec.canonical_document_key,
            "official_url": spec.url,
            "http_status": status,
            "result": "official_url_unresolved",
            "official_origin_verified": False,
            "document_identity_verified": False,
            "content_verified": False,
            "temporal_verified": False,
            "substantive_use_allowed": False,
        }

    page = normalized(body)
    assert spec.title_marker and spec.date_marker
    if normalized(spec.title_marker) not in page or normalized(spec.date_marker) not in page:
        raise RuntimeError(f"{spec.canonical_document_key}: official page does not match exact title/date")

    return {
        "source_group_id": spec.source_group_id,
        "canonical_document_key": spec.canonical_document_key,
        "official_url": spec.url,
        "http_status": status,
        "result": "official_origin_identity_verified_content_pending",
        "official_origin_verified": True,
        "document_identity_verified": True,
        "content_verified": False,
        "temporal_verified": False,
        "substantive_use_allowed": False,
    }


def preflight(conn) -> None:
    group_ids = [spec.source_group_id for spec in SPECS]
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              count(distinct metadata->>'source_group_id'),
              count(*),
              bool_and(coalesce((metadata->>'content_verified')::boolean, false) = false),
              bool_and(coalesce((metadata->>'temporal_verified')::boolean, false) = false),
              bool_and(coalesce((metadata->>'substantive_use_allowed')::boolean, false) = false),
              bool_and(coalesce((metadata->>'use_in_generation')::boolean, false) = false)
            from public.legal_knowledge_chunks
            where is_active = true and metadata->>'source_group_id' = any(%s)
            """,
            (group_ids,),
        )
        groups, chunks, content_false, temporal_false, substantive_false, generation_false = cur.fetchone()

    if (groups, chunks) != (EXPECTED_GROUPS, EXPECTED_CHUNKS):
        raise RuntimeError(f"expected {EXPECTED_GROUPS} groups / {EXPECTED_CHUNKS} chunks, got {groups} / {chunks}")
    if not all((content_false, temporal_false, substantive_false, generation_false)):
        raise RuntimeError("batch is not in the required fail-closed pre-verification state")


def apply(conn, results: list[dict[str, object]]) -> None:
    payload = json.dumps(results, ensure_ascii=False)
    with conn.cursor() as cur:
        cur.execute(
            "select public.kati_persist_guarded_user_source_official_origin(%s::jsonb)",
            (payload,),
        )
        (updated_rows,) = cur.fetchone()
    if updated_rows != EXPECTED_GROUPS:
        raise RuntimeError(f"guarded origin RPC updated {updated_rows} rows; expected {EXPECTED_GROUPS}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    results = [verify_spec(spec) for spec in SPECS]
    report = {
        "verifier": VERIFIER,
        "mode": "apply" if args.apply else "dry_run",
        "source_groups": EXPECTED_GROUPS,
        "results": results,
        "verified_origin_identity": sum(bool(item["official_origin_verified"]) for item in results),
        "url_unresolved": sum(item["result"] == "official_url_unresolved" for item in results),
        "content_verified": 0,
        "temporal_verified": 0,
        "substantive_use_allowed": 0,
        "fail_closed": True,
    }

    if args.apply:
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL is required for --apply")
        import psycopg

        with psycopg.connect(database_url) as connection:
            preflight(connection)
            apply(connection, results)
            connection.commit()

    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
