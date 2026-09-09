#!/usr/bin/env python3
"""Read-only admission and audit gate for the approved Law7 TAX CORE corpus.

This program never writes to PostgreSQL.  The only permitted Law7 mirror writer
is scripts/law7_mirror_import.py, invoked separately after this gate succeeds.
"""
from __future__ import annotations
import argparse, hashlib, json, os, sys
from pathlib import Path
from typing import Any

DATASET_KEY = "law7_codes"
SOURCE_REPOSITORY = "mikhashev/law7"
SOURCE_COMMIT = "70a1d8fc6b27b67ad7f12f03f017d02b5f68a0c895447159039800965895f8b2"
CORPUS_MANIFEST_SHA256 = "8c2cbe47f3bb9b153ef590e472cc43d22808efafc911b7ca3c3cf4ece996343f"
EXPECTED_CODES = ("APK_RF", "BK_RF", "GK_RF", "GK_RF_2", "KONST_RF", "KoAP_RF", "NK_RF", "NK_RF_2")
EXPECTED_COUNTS = {"codes": 8, "article_versions": 2866, "amendments": 0}

def fail(message: str) -> None:
    raise ValueError(message)

def required_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(f"{label} must be a non-empty string")
    return value.strip()

def article_hash(row: dict[str, Any]) -> str:
    supplied = row.get("text_hash")
    text = required_text(row.get("article_text"), "article_text")
    computed = hashlib.sha256(text.encode("utf-8")).hexdigest()
    if supplied != computed:
        fail("article text_hash does not match article_text")
    return computed

def dataset_manifest_sha256(dataset: dict[str, Any]) -> str:
    rows = dataset.get("article_versions")
    if not isinstance(rows, list):
        fail("article_versions must be an array")
    tokens: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            fail("article_versions must contain objects")
        tokens.append("\x1f".join((
            required_text(row.get("code_id"), "code_id"),
            required_text(row.get("article_number"), "article_number"),
            required_text(row.get("version_date"), "version_date"),
            article_hash(row),
        )))
    if len(tokens) != len(set(tokens)):
        fail("duplicate article version key")
    return hashlib.sha256("\n".join(sorted(tokens)).encode("utf-8")).hexdigest()

def audit_dataset(dataset: dict[str, Any]) -> None:
    if dataset.get("dataset_key") != DATASET_KEY:
        fail("unexpected dataset_key")
    if dataset.get("source_repository") != SOURCE_REPOSITORY:
        fail("unexpected source_repository")
    if dataset.get("source_commit") != SOURCE_COMMIT:
        fail("unexpected source_commit")
    codes = dataset.get("codes")
    versions = dataset.get("article_versions")
    amendments = dataset.get("amendments")
    if not isinstance(codes, list) or not isinstance(versions, list) or not isinstance(amendments, list):
        fail("dataset arrays are malformed")
    if not all(isinstance(row, dict) for row in codes):
        fail("codes must contain objects")
    actual_counts = {"codes": len(codes), "article_versions": len(versions), "amendments": len(amendments)}
    if actual_counts != EXPECTED_COUNTS:
        fail(f"unexpected corpus counts: {actual_counts}")
    code_ids = tuple(sorted(required_text(row.get("code"), "code") for row in codes))
    if code_ids != EXPECTED_CODES:
        fail("unexpected TAX CORE code set")
    if dataset_manifest_sha256(dataset) != CORPUS_MANIFEST_SHA256:
        fail("corpus manifest does not match the Preview-audited corpus")

def query_audit(database_url: str) -> dict[str, Any]:
    import psycopg
    query = """
    with actual as (
      select encode(digest(string_agg(token, E'\\n' order by token), 'sha256'), 'hex') as manifest
      from (
        select code_id || E'\\x1f' || article_number || E'\\x1f' || version_date::text || E'\\x1f' || lower(text_hash) as token
        from law7_mirror.article_versions
      ) manifest_tokens
    )
    select
      (to_regnamespace('law7_mirror') is not null
       and to_regprocedure('public.law7_mirror_is_available()') is not null) as contract_present,
      coalesce((select status from law7_mirror.sync_state where dataset_key = %s), '') as status,
      coalesce((select source_repository from law7_mirror.sync_state where dataset_key = %s), '') as source_repository,
      coalesce((select source_commit from law7_mirror.sync_state where dataset_key = %s), '') as source_commit,
      (select count(*) from law7_mirror.codes) as codes,
      (select count(*) from law7_mirror.article_versions) as article_versions,
      (select count(*) from law7_mirror.amendments) as amendments,
      (select count(*) from (select code_id, article_number, version_date from law7_mirror.article_versions group by 1,2,3 having count(*) > 1) duplicates) as duplicate_versions,
      (select count(*) from (select code_id, article_number from law7_mirror.article_versions where is_current group by 1,2 having count(*) > 1) multiple_current),
      (select count(*) from law7_mirror.article_versions av left join law7_mirror.codes c on c.code = av.code_id where c.code is null) as orphan_code_refs,
      (select count(*) from law7_mirror.article_versions where btrim(article_text) = '') as blank_text,
      (select count(*) from law7_mirror.article_versions where text_hash is null or btrim(text_hash) = '') as missing_hashes,
      (select count(*) from law7_mirror.article_versions where text_hash <> encode(digest(article_text, 'sha256'), 'hex')) as hash_mismatches,
      (select count(*) from law7_mirror.temporal_verifications) as temporal_verifications,
      (select count(*) from public.law7_mirror_get_article_version('NK_RF', '54.1', null)) as latest_retrieval,
      (select count(*) from public.law7_mirror_get_article_version('NK_RF', '54.1', date '2021-01-01')) as historical_retrieval,
      actual.manifest
    from actual
    """
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("set transaction read only")
            cursor.execute(query, (DATASET_KEY, DATASET_KEY, DATASET_KEY))
            columns = [column.name for column in cursor.description]
            return dict(zip(columns, cursor.fetchone(), strict=True))

def validate_preflight(audit: dict[str, Any]) -> None:
    if not audit["contract_present"]:
        fail("Production Law7 mirror contract is absent")
    counts = {key: int(audit[key]) for key in EXPECTED_COUNTS}
    if counts == {"codes": 0, "article_versions": 0, "amendments": 0}:
        return
    validate_post_import(audit)

def validate_post_import(audit: dict[str, Any]) -> None:
    if not audit["contract_present"]:
        fail("Law7 mirror contract is absent")
    if audit["status"] != "completed" or audit["source_repository"] != SOURCE_REPOSITORY or audit["source_commit"] != SOURCE_COMMIT:
        fail("sync_state provenance is not the approved corpus")
    if {key: int(audit[key]) for key in EXPECTED_COUNTS} != EXPECTED_COUNTS:
        fail("mirror corpus counts do not match the approved corpus")
    if any(int(audit[key]) for key in ("duplicate_versions", "multiple_current", "orphan_code_refs", "blank_text", "missing_hashes", "hash_mismatches", "temporal_verifications")):
        fail("mirror integrity or temporal isolation check failed")
    if audit["manifest"] != CORPUS_MANIFEST_SHA256:
        fail("mirror corpus manifest does not match the Preview-audited corpus")
    if int(audit["latest_retrieval"]) != 1 or int(audit["historical_retrieval"]) != 0:
        fail("Law7 retrieval temporal contract failed")

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path)
    parser.add_argument("--database-phase", choices=("preflight", "post-import"))
    args = parser.parse_args()
    try:
        if bool(args.dataset) == bool(args.database_phase):
            fail("choose exactly one of --dataset or --database-phase")
        if args.dataset:
            audit_dataset(json.loads(args.dataset.read_text(encoding="utf-8")))
        else:
            database_url = os.environ.get("DATABASE_URL")
            if not database_url:
                fail("DATABASE_URL is required for a database audit")
            audit = query_audit(database_url)
            (validate_preflight if args.database_phase == "preflight" else validate_post_import)(audit)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Law7 production gate failed: {error}", file=sys.stderr)
        return 1
    print("Law7 production gate passed")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
