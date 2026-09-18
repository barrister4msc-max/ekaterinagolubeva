#!/usr/bin/env python3
"""Replace two incomplete legacy legal-source groups under a fail-closed gate.

This program is intentionally scoped to the two approved repair identities:

* FNS letter № БВ-4-7/3060@ dated 2021-03-10; and
* Plenum of the Supreme Arbitration Court №53 dated 2006-10-12.

It never writes ``legal_law_chunks`` or ``legal_source_registry``, does not
request embeddings, and cannot grant any verification/admission status.  On an
apply run it first requires the private Storage verifier to prove the exact
object name, byte count and SHA-256; then it atomically deactivates the
specified legacy manual-text group and creates a new complete snapshot group.
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


DATASET_KEY = "guarded_legacy_legal_source_repair_v1"
BUCKET = "communication-attachments"
ROW_NAMESPACE = uuid.UUID("45428dd8-778d-44c4-ac4f-7f2f429f2293")
STORAGE_VERIFIER_URL_ENV = "KATI_STORAGE_VERIFIER_URL"
STORAGE_VERIFIER_TOKEN_ENV = "KATI_GUARDED_INTAKE_VERIFY_TOKEN"
SAFE_OBJECT_NAME = re.compile(r"^[A-Za-z0-9._-]+$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
FAIL_CLOSED_STATUS = "metadata_officially_verified_content_pending"
REPAIR_RPC = "private.kati_apply_guarded_legacy_legal_source_repair"
AUDIT_RPC = "private.kati_guarded_legacy_legal_source_repair_audit"

# This table is the complete scope of this repair.  A manifest that introduces
# another document, modifies a legacy identity or assigns a different official
# source is rejected before any database or Storage access.
REPAIR_SPECS: dict[str, dict[str, Any]] = {
    "ru:fns:letter:BV-4-7/3060@:2021-03-10": {
        "legacy_source_group_id": "7f3d94f2-46e9-4cfe-8aad-54db9b361701",
        "legacy_rows": 2,
        "source_type": "fns_letter",
        "document_type": "fns_letter",
        "authority": "ФНС России",
        "document_number": "БВ-4-7/3060@",
        "document_date": "2021-03-10",
        "source_url": "https://www.nalog.gov.ru/rn77/about_fts/about_nalog/10687108/",
        "official_source_domain": "nalog.gov.ru",
    },
    "ru:court_practice:plenum_vas:53:2006-10-12": {
        "legacy_source_group_id": "95ad0b44-3e3b-4409-b771-958dfecce61d",
        "legacy_rows": 6,
        "source_type": "court_practice",
        "document_type": "plenum_resolution",
        "authority": "Высший Арбитражный Суд Российской Федерации",
        "document_number": "53",
        "document_date": "2006-10-12",
        "source_url": "https://vsrf.ru/documents/arbitration/18938/",
        "official_source_domain": "vsrf.ru",
        "historical_VAS": True,
    },
}


def text_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_manifest(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("dataset_key") != DATASET_KEY:
        raise ValueError(f"expected dataset_key={DATASET_KEY}")
    sources = payload.get("sources")
    if not isinstance(sources, list) or len(sources) != len(REPAIR_SPECS):
        raise ValueError("manifest must contain exactly the two approved repair sources")
    return sources


def chunk_text(text: str, target: int = 1800) -> list[str]:
    clean = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", clean) if p.strip()]

    def split_long_paragraph(paragraph: str) -> list[str]:
        pieces: list[str] = []
        remaining = paragraph
        while len(remaining) > target:
            window = remaining[: target + 1]
            cut = max(window.rfind(". "), window.rfind("! "), window.rfind("? "))
            if cut > target // 3:
                cut += 1
            else:
                cut = window.rfind(" ")
            if cut <= 0:
                cut = target
            pieces.append(remaining[:cut].strip())
            remaining = remaining[cut:].lstrip()
        if remaining:
            pieces.append(remaining)
        return pieces

    chunks: list[str] = []
    buffer = ""
    for paragraph in paragraphs:
        for piece in split_long_paragraph(paragraph):
            candidate = f"{buffer}\n\n{piece}" if buffer else piece
            if len(candidate) > target and buffer:
                chunks.append(buffer)
                buffer = piece
            else:
                buffer = candidate
    if buffer:
        chunks.append(buffer)
    return chunks


def require_sha(item: dict[str, Any], key: str) -> str:
    value = item.get(key)
    if not isinstance(value, str) or not SHA256.fullmatch(value.lower()):
        raise ValueError(f"{key} must be a SHA-256")
    return value.lower()


def normalize(item: dict[str, Any]) -> dict[str, Any]:
    key = item.get("canonical_document_key")
    if not isinstance(key, str) or key not in REPAIR_SPECS:
        raise ValueError("canonical_document_key is outside the approved repair scope")
    spec = REPAIR_SPECS[key]

    for name in (
        "storage_object_name",
        "normalized_file_name",
        "title",
        "source_class",
        "metadata_status",
        "verification_status",
        "file_mime",
        "extraction_method",
        "ocr_status",
        "extraction_status",
        "text_content",
    ):
        if not isinstance(item.get(name), str) or not item[name].strip():
            raise ValueError(f"missing or empty required field: {name}")

    for name in (
        "legacy_source_group_id",
        "source_type",
        "document_type",
        "authority",
        "document_number",
        "document_date",
        "source_url",
        "official_source_domain",
    ):
        if item.get(name) != spec[name]:
            raise ValueError(f"{name} does not match the approved {key} identity")

    object_name = item["storage_object_name"].strip()
    if "/" in object_name or not SAFE_OBJECT_NAME.fullmatch(object_name):
        raise ValueError("unsafe Storage object name")
    size = item.get("storage_size_bytes")
    if not isinstance(size, int) or size <= 0:
        raise ValueError("storage_size_bytes must be a positive integer")
    if item["source_class"] != "user_supplied_retrieval_snapshot":
        raise ValueError("source_class must be user_supplied_retrieval_snapshot")
    if item["metadata_status"] != "official_metadata_verified":
        raise ValueError("metadata_status must be official_metadata_verified")
    if item["verification_status"] != FAIL_CLOSED_STATUS:
        raise ValueError("verification_status must remain fail-closed")
    if item["ocr_status"] != "completed" or item["extraction_status"] != "completed":
        raise ValueError("OCR/extraction must be completed")
    if item["file_mime"] not in {"application/msword", "application/pdf"}:
        raise ValueError("unsupported file_mime")

    text = item["text_content"]
    if len(text.strip()) < 200:
        raise ValueError("text_content is too short")
    text_hash = require_sha(item, "text_sha256")
    if text_sha256(text) != text_hash:
        raise ValueError("text_sha256 mismatch")
    original_hash = require_sha(item, "original_sha256")
    normalized_hash = require_sha(item, "normalized_sha256")
    storage_hash = require_sha(item, "storage_sha256")

    identity = f"repair:{key}:{normalized_hash}"
    source_group_id = str(uuid.uuid5(ROW_NAMESPACE, identity))
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("text_content produced no chunks")

    return {
        **item,
        "canonical_document_key": key,
        "storage_object_name": object_name,
        "text_content": text,
        "text_sha256": text_hash,
        "original_sha256": original_hash,
        "normalized_sha256": normalized_hash,
        "storage_sha256": storage_hash,
        "source_group_id": source_group_id,
        "chunks": chunks,
    }


def normalize_all(path: Path) -> list[dict[str, Any]]:
    rows = [normalize(item) for item in load_manifest(path)]
    if {row["canonical_document_key"] for row in rows} != set(REPAIR_SPECS):
        raise ValueError("manifest must include every approved repair identity exactly once")
    if len({row["storage_object_name"] for row in rows}) != len(rows):
        raise ValueError("duplicate Storage object name")
    if len({row["source_group_id"] for row in rows}) != len(rows):
        raise ValueError("duplicate deterministic source group")
    return rows


def preflight_storage(rows: list[dict[str, Any]]) -> None:
    url = os.environ.get(STORAGE_VERIFIER_URL_ENV, "").strip()
    token = os.environ.get(STORAGE_VERIFIER_TOKEN_ENV, "").strip()
    if not url or not token:
        raise RuntimeError("guarded Storage verifier configuration is required")
    expected = {
        row["storage_object_name"]: {
            "size_bytes": row["storage_size_bytes"],
            "sha256": row["storage_sha256"],
        }
        for row in rows
    }
    request = Request(
        url,
        data=json.dumps({
            "bucket": BUCKET,
            "objects": [
                {"name": name, **proof} for name, proof in expected.items()
            ],
        }).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-kati-intake-verifier-token": token,
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("guarded Storage verifier did not confirm source objects") from exc

    received = result.get("objects") if isinstance(result, dict) else None
    actual: dict[str, dict[str, Any]] = {}
    if isinstance(received, list):
        for item in received:
            if isinstance(item, dict) and isinstance(item.get("name"), str):
                actual[item["name"]] = {
                    "size_bytes": item.get("size_bytes"),
                    "sha256": str(item.get("sha256", "")).lower(),
                }
    if (
        not isinstance(result, dict)
        or result.get("verified") is not True
        or result.get("bucket") != BUCKET
        or actual != expected
        or len(received or []) != len(expected)
    ):
        raise ValueError("guarded Storage verifier returned an invalid hash inventory")


def rpc_payload(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return the deliberately minimal input accepted by the private RPC.

    Source identity, verification state, source type and all other metadata are
    pinned in the database function.  The workflow supplies only the already
    hash-verified Storage reference and content chunks whose digests are also
    pinned by that function.
    """
    return [
        {
            "canonical_document_key": row["canonical_document_key"],
            "source_group_id": row["source_group_id"],
            "legacy_source_group_id": row["legacy_source_group_id"],
            "storage_object_name": row["storage_object_name"],
            "storage_size_bytes": row["storage_size_bytes"],
            "storage_sha256": row["storage_sha256"],
            "chunks": [{"content": content} for content in row["chunks"]],
        }
        for row in rows
    ]


def apply(rows: list[dict[str, Any]]) -> dict[str, Any]:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for --apply")
    import psycopg

    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        # This external preflight completes before the first database mutation.
        preflight_storage(rows)
        cursor.execute(
            f"select {REPAIR_RPC}(%s::jsonb)",
            (json.dumps(rpc_payload(rows), ensure_ascii=False),),
        )
        (result,) = cursor.fetchone()
    if not isinstance(result, dict) or result.get("fail_closed") is not True:
        raise RuntimeError("guarded repair RPC did not return a fail-closed result")
    return result


def audit() -> dict[str, Any]:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for --audit")
    import psycopg

    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute(f"select {AUDIT_RPC}()")
        (result,) = cursor.fetchone()
    if not isinstance(result, dict):
        raise RuntimeError("guarded repair audit RPC returned an invalid result")
    if not (
        result.get("source_groups") == 2
        and result.get("heads") == 2
        and isinstance(result.get("chunks"), int)
        and result["chunks"] > 2
        and result.get("legacy_active_rows") == 0
        and result.get("fail_closed") is True
    ):
        raise RuntimeError("guarded repair audit did not prove the required fail-closed state")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--audit", action="store_true")
    args = parser.parse_args()
    if args.apply and args.audit:
        parser.error("--apply and --audit cannot be used together")
    rows = normalize_all(args.input)
    result: dict[str, Any] = {
        "mode": "dry_run",
        "sources": len(rows),
        "expected_chunks": sum(len(row["chunks"]) for row in rows),
        "legacy_groups": [row["legacy_source_group_id"] for row in rows],
        "storage_bucket": BUCKET,
        "legal_law_chunks_touched": False,
        "legal_source_registry_touched": False,
        "embeddings_requested": False,
        "fail_closed": True,
    }
    if args.apply:
        result = {"mode": "apply", **apply(rows), **{k: v for k, v in result.items() if k not in {"mode", "sources", "expected_chunks"}}}
    elif args.audit:
        result = {"mode": "audit", **audit(), **{k: v for k, v in result.items() if k not in {"mode", "sources", "expected_chunks"}}}
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
