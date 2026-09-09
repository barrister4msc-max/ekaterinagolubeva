#!/usr/bin/env python3
"""Admit a reviewed GARANT NK snapshot into KATI's existing internal law KB.

This is not a Law7 writer. It accepts only the private GARANT namespace and
writes idempotently to public.legal_law_chunks when --apply is explicitly used.
No embeddings, AI inference, or legal verification are performed here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import uuid
from pathlib import Path
from typing import Any

DATASET_KEY = "private_garant_nk_snapshot"
SOURCE_NAMESPACE = "garant_user_supplied_nk"
LICENSE_CONFIRMATION = "I_CONFIRM_LICENSED_GARANT_INTERNAL_USE"
MAX_ARTICLES = 2_000
ROW_NAMESPACE = uuid.UUID("8aa8f377-584a-4e49-a384-80409c0cdcb9")

CODE_NAMES = {
    "NK_RF": "Налоговый кодекс Российской Федерации часть первая",
    "NK_RF_2": "Налоговый кодекс Российской Федерации часть вторая",
}


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def load_payload(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("dataset_key") != DATASET_KEY:
        raise ValueError("payload must use the private_garant_nk_snapshot dataset")
    if raw.get("source_provider_id") != "garant_user_supplied":
        raise ValueError("payload provider is not the admitted GARANT user-supplied source")
    admission = raw.get("admission")
    if not isinstance(admission, dict):
        raise ValueError("missing admission contract")
    if admission.get("target_table") != "public.legal_law_chunks":
        raise ValueError("payload target is not the existing internal law knowledge base")
    if admission.get("source_namespace") != SOURCE_NAMESPACE:
        raise ValueError("unexpected source namespace")
    if admission.get("law7_mirror_import_allowed") is not False:
        raise ValueError("GARANT payload must never be eligible for Law7 import")
    provenance = raw.get("provenance")
    if not isinstance(provenance, dict):
        raise ValueError("missing provenance")
    for flag in (
        "official_origin_verified",
        "content_verified",
        "temporal_verified",
        "substantive_use_allowed",
    ):
        if provenance.get(flag) is not False:
            raise ValueError(f"unsafe provenance flag: {flag}")
    if provenance.get("license_scope_requires_owner_confirmation") is not True:
        raise ValueError("owner license confirmation requirement is missing")
    return raw


def normalize_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    source_commit = payload.get("source_commit")
    snapshot_date = payload.get("provenance", {}).get("snapshot_date")
    if not isinstance(source_commit, str) or len(source_commit) != 64:
        raise ValueError("invalid source_commit")
    if not isinstance(snapshot_date, str) or len(snapshot_date) != 10:
        raise ValueError("invalid snapshot_date")
    articles = payload.get("article_versions")
    if not isinstance(articles, list) or not (1 <= len(articles) <= MAX_ARTICLES):
        raise ValueError("invalid article count")

    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for article in articles:
        if not isinstance(article, dict):
            raise ValueError("invalid article record")
        code_id = article.get("code_id")
        article_number = article.get("article_number")
        content = article.get("article_text")
        title = article.get("article_title")
        expected_hash = article.get("text_hash")
        if code_id not in CODE_NAMES or not isinstance(article_number, str) or not isinstance(content, str) or not isinstance(title, str):
            raise ValueError("invalid article identity")
        if not content.strip() or sha256_text(content) != expected_hash:
            raise ValueError(f"text hash mismatch: {code_id} {article_number}")
        identity = (code_id, article_number)
        if identity in seen:
            raise ValueError(f"duplicate article identity: {code_id} {article_number}")
        seen.add(identity)
        stable_id = uuid.uuid5(ROW_NAMESPACE, f"{SOURCE_NAMESPACE}:{code_id}:{article_number}")
        rows.append({
            "id": str(stable_id),
            "code_name": CODE_NAMES[code_id],
            "article": article_number,
            "part": "I" if code_id == "NK_RF" else "II",
            "title": title,
            "content": content,
            "content_hash": expected_hash,
            "is_active": not bool(article.get("is_repealed")),
            "source_name": "ГАРАНТ — пользовательский лицензированный экспорт",
            "source_url": None,
            "source_checked_at": snapshot_date,
            "metadata": {
                "source_namespace": SOURCE_NAMESPACE,
                "source_provider_id": "garant_user_supplied",
                "source_class": "user_supplied_retrieval_snapshot",
                "source_snapshot_sha256": source_commit,
                "source_snapshot_date": snapshot_date,
                "official_origin_verified": False,
                "content_verified": False,
                "temporal_verified": False,
                "substantive_use_allowed": False,
                "license_scope_owner_confirmed": True,
                "embedding_status": "pending",
            },
        })
    if {row["part"] for row in rows} != {"I", "II"}:
        raise ValueError("both NK parts are required")
    return rows


def apply(rows: list[dict[str, Any]]) -> None:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for --apply")
    import psycopg

    columns = (
        "id, code_name, article, part, title, content, content_hash, is_active, "
        "source_name, source_url, source_checked_at, metadata"
    )
    values = [
        (
            row["id"], row["code_name"], row["article"], row["part"], row["title"],
            row["content"], row["content_hash"], row["is_active"], row["source_name"],
            row["source_url"], row["source_checked_at"], json.dumps(row["metadata"]),
        )
        for row in rows
    ]
    sql = f"""
      insert into public.legal_law_chunks ({columns})
      values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
      on conflict (id) do update set
        code_name = excluded.code_name,
        article = excluded.article,
        part = excluded.part,
        title = excluded.title,
        content = excluded.content,
        content_hash = excluded.content_hash,
        is_active = excluded.is_active,
        source_name = excluded.source_name,
        source_url = excluded.source_url,
        source_checked_at = excluded.source_checked_at,
        metadata = excluded.metadata,
        updated_at = now()
    """
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "update public.legal_law_chunks set is_active = false, updated_at = now() "
                "where metadata ->> 'source_namespace' = %s",
                (SOURCE_NAMESPACE,),
            )
            cursor.executemany(sql, values)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-license", default="")
    args = parser.parse_args()

    payload = load_payload(args.input)
    rows = normalize_rows(payload)
    if args.apply:
        if args.confirm_license != LICENSE_CONFIRMATION:
            raise SystemExit("exact --confirm-license is required for --apply")
        apply(rows)

    print(json.dumps({
        "mode": "apply" if args.apply else "dry_run",
        "target_table": "public.legal_law_chunks",
        "rows": len(rows),
        "active_rows": sum(1 for row in rows if row["is_active"]),
        "source_namespace": SOURCE_NAMESPACE,
        "law7_mirror_touched": False,
        "embeddings_requested": False,
        "substantive_use_allowed": False,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
