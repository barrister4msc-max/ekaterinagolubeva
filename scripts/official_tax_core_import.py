#!/usr/bin/env python3
"""Import reviewed official FNS, Minfin and Supreme Court tax documents into KATI.

The importer accepts a reviewed JSON manifest with the exact text fetched from an
official source page. It never invents documents, never writes Law7, never
requests embeddings, and leaves substantive legal use disabled pending temporal
and content verification.
"""
from __future__ import annotations
import argparse, hashlib, json, os, uuid
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

DATASET_KEY = "official_tax_core"
NAMESPACE = "official_tax_core"
ROW_NAMESPACE = uuid.UUID("6f72ec71-3a45-4c0d-bb54-10aa9aeff06b")
ALLOWED_HOSTS = {
    "fns": {"nalog.gov.ru", "www.nalog.gov.ru"},
    "minfin": {"minfin.gov.ru", "www.minfin.gov.ru"},
    "vsrf": {"vsrf.ru", "www.vsrf.ru"},
}
ALLOWED_TYPES = {"fns_letter", "minfin_letter", "vsrf_plenum", "vsrf_review", "vsrf_case"}

def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def load(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("dataset_key") != DATASET_KEY:
        raise ValueError("expected official_tax_core manifest")
    sources = payload.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("manifest sources must be a non-empty list")
    return sources

def normalize(item: dict) -> dict:
    required = ("provider", "source_type", "title", "official_url", "document_number",
                "publication_date", "content", "content_sha256")
    if any(not isinstance(item.get(k), str) or not item[k].strip() for k in required):
        raise ValueError("source has missing required field")
    provider = item["provider"]
    if provider not in ALLOWED_HOSTS or item["source_type"] not in ALLOWED_TYPES:
        raise ValueError("unsupported provider or source type")
    parsed = urlparse(item["official_url"])
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS[provider]:
        raise ValueError("official URL hostname does not match provider")
    try:
        date.fromisoformat(item["publication_date"])
    except ValueError as exc:
        raise ValueError("publication_date must be YYYY-MM-DD") from exc
    content = item["content"].strip()
    if len(content) < 200 or digest(content) != item["content_sha256"]:
        raise ValueError("content hash mismatch or document is too short")
    identity = f"{provider}:{item['source_type']}:{item['document_number']}:{item['publication_date']}"
    registry_id = str(uuid.uuid5(ROW_NAMESPACE, "registry:" + identity))
    chunk_id = str(uuid.uuid5(ROW_NAMESPACE, "chunk:" + identity))
    authority = {"fns": "ФНС России", "minfin": "Минфин России", "vsrf": "Верховный Суд Российской Федерации"}[provider]
    return {
        "registry_id": registry_id, "chunk_id": chunk_id, "provider": provider,
        "source_type": item["source_type"], "title": item["title"].strip(),
        "official_url": item["official_url"], "document_number": item["document_number"].strip(),
        "publication_date": item["publication_date"], "content": content,
        "content_hash": item["content_sha256"], "authority_name": authority,
    }

def apply(rows: list[dict]) -> None:
    db = os.environ.get("DATABASE_URL", "").strip()
    if not db:
        raise RuntimeError("DATABASE_URL is required for --apply")
    import psycopg
    registry_sql = """
      insert into public.legal_source_registry
      (id,title,source_type,official_url,external_id,authority_name,authority_level,
       jurisdiction,practice_area,citation,document_number,publication_date,
       is_external,is_official,is_active,current_status,verification_status,last_checked_at,metadata)
      values (%s,%s,%s,%s,%s,%s,'supporting','RU','tax',
       %s,%s,%s,true,true,true,'active','official_origin_verified',now(),%s::jsonb)
      on conflict (id) do update set title=excluded.title, official_url=excluded.official_url,
       citation=excluded.citation, document_number=excluded.document_number,
       publication_date=excluded.publication_date, is_official=true, is_active=true,
       current_status='active', verification_status='official_origin_verified',
       last_checked_at=now(), metadata=excluded.metadata, updated_at=now()
    """
    chunk_sql = """
      insert into public.legal_knowledge_chunks
      (id,category,title,content,metadata,is_active,source_type)
      values (%s,'tax',%s,%s,%s::jsonb,true,%s)
      on conflict (id) do update set title=excluded.title, content=excluded.content,
       metadata=excluded.metadata, is_active=true, source_type=excluded.source_type
    """
    with psycopg.connect(db) as conn, conn.cursor() as cur:
        for r in rows:
            metadata = {
              "source_namespace": NAMESPACE, "source_provider_id": r["provider"],
              "source_registry_id": r["registry_id"], "official_url": r["official_url"],
              "content_sha256": r["content_hash"], "official_origin_verified": True,
              "content_verified": True, "temporal_verified": False,
              "substantive_use_allowed": False, "embedding_status": "pending",
            }
            citation = f"{r['authority_name']} от {r['publication_date']} № {r['document_number']}"
            cur.execute(registry_sql, (r["registry_id"], r["title"], r["source_type"],
              r["official_url"], r["document_number"], r["authority_name"], citation,
              r["document_number"], r["publication_date"], json.dumps(metadata)))
            cur.execute(chunk_sql, (r["chunk_id"], r["title"], r["content"],
              json.dumps(metadata), r["source_type"]))

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()
    rows = [normalize(x) for x in load(args.input)]
    if len({r["registry_id"] for r in rows}) != len(rows):
        raise ValueError("duplicate source identity in manifest")
    if args.apply:
        apply(rows)
    print(json.dumps({"mode":"apply" if args.apply else "dry_run", "rows":len(rows),
      "source_namespace":NAMESPACE, "law7_mirror_touched":False,
      "substantive_use_allowed":False}, ensure_ascii=False))
if __name__ == "__main__":
    raise SystemExit(main())
