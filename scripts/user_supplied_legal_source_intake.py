#!/usr/bin/env python3
"""Guarded intake of already-uploaded user-supplied legal sources.

This importer binds existing objects in the private Supabase Storage bucket
`communication-attachments` to complete text chunks in
`public.legal_knowledge_chunks`.

Safety contract:
- never writes public.legal_law_chunks;
- never creates public.legal_source_registry rows;
- requires the Storage object to exist and match the expected byte size;
- requires non-empty full extracted/OCR text with a matching SHA-256;
- creates all source groups/chunks in one database transaction;
- uses deterministic UUIDv5 identities for idempotency;
- hard-forces fail-closed provenance flags until a separate official-content
  verification/admission step is completed;
- never requests embeddings.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DATASET_KEY = "user_supplied_legal_sources"
BUCKET = "communication-attachments"
STORAGE_VERIFIER_URL_ENV = "KATI_STORAGE_VERIFIER_URL"
STORAGE_VERIFIER_TOKEN_ENV = "KATI_GUARDED_INTAKE_VERIFY_TOKEN"
ROW_NAMESPACE = uuid.UUID("094c0d1f-45cb-4f8a-b3d6-476383c52009")
ALLOWED_SOURCE_TYPES = {"court_practice", "vs_review"}
ALLOWED_VERIFICATION = {
    "needs_review",
    "needs_official_verification",
    "metadata_officially_verified_content_pending",
}
SAFE_OBJECT_NAME = re.compile(r"^[A-Za-z0-9._-]+$")


def digest_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_manifest(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("dataset_key") != DATASET_KEY:
        raise ValueError(f"expected dataset_key={DATASET_KEY}")
    sources = payload.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("manifest sources must be a non-empty list")
    if len(sources) > 50:
        raise ValueError("manifest contains too many sources")
    return sources


def chunk_text(text: str, target: int = 1800) -> list[str]:
    clean = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not clean:
        return []
    paragraphs = re.split(r"\n\s*\n", clean)
    chunks: list[str] = []
    buf = ""
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        candidate = f"{buf}\n\n{paragraph}" if buf else paragraph
        if len(candidate) > target and buf:
            chunks.append(buf.strip())
            buf = paragraph
        else:
            buf = candidate
    if buf.strip():
        chunks.append(buf.strip())
    return chunks


def normalize(item: dict[str, Any]) -> dict[str, Any]:
    required_strings = (
        "storage_object_name",
        "normalized_file_name",
        "title",
        "authority",
        "document_type",
        "document_date",
        "source_type",
        "source_class",
        "metadata_status",
        "verification_status",
        "extraction_method",
        "ocr_status",
        "extraction_status",
        "text_content",
        "text_sha256",
        "original_sha256",
        "normalized_sha256",
    )
    for key in required_strings:
        if not isinstance(item.get(key), str) or not item[key].strip():
            raise ValueError(f"missing or empty required field: {key}")

    object_name = item["storage_object_name"].strip()
    if "/" in object_name or not SAFE_OBJECT_NAME.fullmatch(object_name):
        raise ValueError(f"unsafe Storage object name: {object_name}")

    source_type = item["source_type"].strip()
    if source_type not in ALLOWED_SOURCE_TYPES:
        raise ValueError(f"unsupported source_type: {source_type}")

    if item["source_class"] != "user_supplied_retrieval_snapshot":
        raise ValueError("source_class must be user_supplied_retrieval_snapshot")
    if item["verification_status"] not in ALLOWED_VERIFICATION:
        raise ValueError("verification_status is not fail-closed")
    if item["ocr_status"] != "completed" or item["extraction_status"] != "completed":
        raise ValueError("OCR/extraction must be completed before intake")

    size = item.get("storage_size_bytes")
    if not isinstance(size, int) or size <= 0:
        raise ValueError("storage_size_bytes must be a positive integer")

    text = item["text_content"].strip()
    if len(text) < 200:
        raise ValueError("text_content is too short")
    if digest_text(text) != item["text_sha256"].lower():
        raise ValueError("text_sha256 mismatch")

    for key in ("original_sha256", "normalized_sha256", "text_sha256"):
        value = item[key].lower()
        if not re.fullmatch(r"[0-9a-f]{64}", value):
            raise ValueError(f"{key} is not SHA-256")

    identity = f"{object_name}:{item['normalized_sha256'].lower()}"
    group_id = str(uuid.uuid5(ROW_NAMESPACE, "group:" + identity))
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("text_content produced no chunks")

    return {
        **item,
        "storage_object_name": object_name,
        "source_type": source_type,
        "text_content": text,
        "text_sha256": item["text_sha256"].lower(),
        "original_sha256": item["original_sha256"].lower(),
        "normalized_sha256": item["normalized_sha256"].lower(),
        "source_group_id": group_id,
        "chunks": chunks,
    }


def preflight_storage(rows: list[dict[str, Any]]) -> None:
    verifier_url = os.environ.get(STORAGE_VERIFIER_URL_ENV, "").strip()
    verifier_token = os.environ.get(STORAGE_VERIFIER_TOKEN_ENV, "").strip()
    if not verifier_url or not verifier_token:
        raise RuntimeError("guarded Storage verifier configuration is required")

    expected = {
        row["storage_object_name"]: row["storage_size_bytes"]
        for row in rows
    }
    payload = json.dumps(
        {
            "bucket": BUCKET,
            "objects": [
                {"name": name, "size_bytes": size}
                for name, size in expected.items()
            ],
        }
    ).encode("utf-8")
    request = Request(
        verifier_url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-kati-intake-verifier-token": verifier_token,
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("guarded Storage verifier did not confirm source objects") from exc

    received = result.get("objects") if isinstance(result, dict) else None
    actual: dict[str, int] = {}
    if isinstance(received, list):
        for item in received:
            if isinstance(item, dict) and isinstance(item.get("name"), str) and isinstance(item.get("size_bytes"), int):
                actual[item["name"]] = item["size_bytes"]

    if (
        not isinstance(result, dict)
        or result.get("verified") is not True
        or result.get("bucket") != BUCKET
        or actual != expected
        or len(received or []) != len(expected)
    ):
        raise ValueError("guarded Storage verifier returned an invalid source inventory")


def preflight_duplicates(cur: Any, rows: list[dict[str, Any]]) -> None:
    group_ids = [r["source_group_id"] for r in rows]
    cur.execute(
        """
        select distinct metadata->>'source_group_id'
        from public.legal_knowledge_chunks
        where metadata->>'source_group_id' = any(%s)
        """,
        (group_ids,),
    )
    existing = sorted(x for (x,) in cur.fetchall() if x)
    if existing:
        raise ValueError(f"source groups already exist: {existing}")


def apply(rows: list[dict[str, Any]]) -> dict[str, Any]:
    db = os.environ.get("DATABASE_URL", "").strip()
    if not db:
        raise RuntimeError("DATABASE_URL is required for --apply")

    import psycopg

    inserted_rows = 0
    with psycopg.connect(db) as conn, conn.cursor() as cur:
        # Fail before any write if the scoped Storage verifier, duplicate identity,
        # or text/hash contract is wrong. The enclosing transaction keeps the
        # batch all-or-nothing.
        preflight_storage(rows)
        preflight_duplicates(cur, rows)

        sql = """
          insert into public.legal_knowledge_chunks
            (id, category, title, content, metadata, is_active, source_type)
          values
            (%s, %s, %s, %s, %s::jsonb, true, 'manual_source')
        """

        for row in rows:
            chunks = row["chunks"]
            base_meta = {
                "source_group_id": row["source_group_id"],
                "source_type": row["source_type"],
                "source_class": "user_supplied_retrieval_snapshot",
                "title": row["title"],
                "authority": row["authority"],
                "court_level": row.get("court_level"),
                "document_type": row["document_type"],
                "document_number": row.get("document_number"),
                "document_date": row["document_date"],
                "historical_VAS": bool(row.get("historical_VAS", False)),
                "binary_source": row.get("binary_source"),
                "source_url": row.get("source_url"),
                "official_source_domain": row.get("official_source_domain"),
                "storage_bucket": BUCKET,
                "storage_object_name": row["storage_object_name"],
                "file_path": row["storage_object_name"],
                "file_name": row["normalized_file_name"],
                "original_file_name": row.get("original_file_name"),
                "normalized_file_name": row["normalized_file_name"],
                "file_mime": "application/pdf",
                "storage_size_bytes": row["storage_size_bytes"],
                "original_sha256": row["original_sha256"],
                "normalized_sha256": row["normalized_sha256"],
                "text_sha256": row["text_sha256"],
                "pages_total": row.get("pages_total"),
                "extraction_method": row["extraction_method"],
                "ocr_required": bool(row.get("ocr_required", False)),
                "ocr_status": "completed",
                "extraction_status": "completed",
                "ocr_text_length": len(row["text_content"]),
                "metadata_status": row["metadata_status"],
                "official_metadata_verified": bool(row.get("official_metadata_verified", False)),
                "official_status": "unverified",
                "verification_status": row["verification_status"],
                # These four values are intentionally hard-coded fail-closed.
                "official_origin_verified": False,
                "content_verified": False,
                "substantive_use_allowed": False,
                "use_in_generation": False,
                "trust_level": row.get("trust_level", "high"),
                "ingest_mode": "existing_storage_guarded",
                "embedding_status": "pending",
                "structured_extraction_status": row.get("structured_extraction_status"),
                "derived_fields_provenance": row.get("derived_fields_provenance"),
                "cited_nk_articles": row.get("cited_nk_articles", []),
                "cited_nk_article_page_refs": row.get("cited_nk_article_page_refs", {}),
                "cited_acts_sample": row.get("cited_acts_sample", []),
                "detected_document_or_case_numbers_sample": row.get("detected_document_or_case_numbers_sample", []),
                "numbered_paragraphs_detected": row.get("numbered_paragraphs_detected", []),
                "notes": row.get("notes"),
                "chunks_total": len(chunks),
            }
            for idx, content in enumerate(chunks):
                chunk_id = str(uuid.uuid5(ROW_NAMESPACE, f"chunk:{row['source_group_id']}:{idx}"))
                metadata = {
                    **base_meta,
                    "chunk_index": idx,
                    "is_source_head": idx == 0,
                }
                cur.execute(
                    sql,
                    (
                        chunk_id,
                        "tax",
                        row["title"],
                        content,
                        json.dumps(metadata, ensure_ascii=False),
                    ),
                )
                inserted_rows += 1
        # psycopg context commits only if every preflight/write succeeds.

    return {
        "sources": len(rows),
        "chunks": inserted_rows,
        "law_chunks_touched": False,
        "registry_touched": False,
        "substantive_use_allowed": False,
        "use_in_generation": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    rows = [normalize(x) for x in load_manifest(args.input)]
    if len({r["storage_object_name"] for r in rows}) != len(rows):
        raise ValueError("duplicate storage_object_name in manifest")
    if len({r["source_group_id"] for r in rows}) != len(rows):
        raise ValueError("duplicate source identity in manifest")

    result: dict[str, Any] = {
        "mode": "dry_run",
        "sources": len(rows),
        "expected_chunks": sum(len(r["chunks"]) for r in rows),
        "storage_bucket": BUCKET,
        "law_chunks_touched": False,
        "registry_touched": False,
        "substantive_use_allowed": False,
        "use_in_generation": False,
    }
    if args.apply:
        result = {"mode": "apply", **apply(rows)}

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
