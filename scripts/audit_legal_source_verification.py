#!/usr/bin/env python3
"""Read-only canonical-identity audit for KATI legal-source verification.

This tool never updates source metadata, registry rows, embeddings, or admission
flags. It creates a deterministic queue for official identity/content/temporal
verification and is safe to run against Production with read-only credentials.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from typing import Any, Iterable

EXTERNAL_TYPES = {
    "law_full_text",
    "court_practice",
    "fns_letter",
    "minfin_letter",
    "manual_source",
}
NON_EXTERNAL_TYPES = {
    "manual",
    "manual_seed",
    "ekaterina_practice",
    "law_full_text_placeholder",
}


def normalized_document_number(value: object) -> str:
    """Normalize harmless notation differences without performing fuzzy matching."""
    raw = unicodedata.normalize("NFKC", str(value or "").replace("№", "")).lower()
    compact = re.sub(r"[^0-9a-zа-я@/\-]", "", raw)
    return re.sub(r"^n(?=\d)", "", compact)


def looks_like_review(title: object) -> bool:
    return bool(re.search(r"(обзор|review)", str(title or ""), flags=re.IGNORECASE))


def verification_queue_status(row: dict[str, Any]) -> str:
    """Classify a group without asserting any legal verification result."""
    if row.get("registry_id"):
        return "linked_existing_registry"

    source_type = str(row.get("source_type") or "")
    if source_type in NON_EXTERNAL_TYPES:
        return "not_external_legal_source"
    if source_type == "law_snapshot":
        return "article_level_identity_required"

    title = str(row.get("title") or "").strip()
    document_date = str(row.get("document_date") or "").strip()
    document_number = normalized_document_number(row.get("document_number"))
    if source_type not in EXTERNAL_TYPES:
        return "source_type_unclassified"
    if not title or not document_date or (not document_number and not looks_like_review(title)):
        return "identity_incomplete"

    candidate_count = int(row.get("registry_candidate_count") or 0)
    if candidate_count == 1:
        return "exact_registry_candidate"
    if candidate_count > 1:
        return "ambiguous_registry_candidate"
    return "registry_entry_missing"


def build_report(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    queue = []
    totals: dict[str, int] = {}
    for row in rows:
        item = dict(row)
        item["verification_queue_status"] = verification_queue_status(item)
        totals[item["verification_queue_status"]] = totals.get(item["verification_queue_status"], 0) + int(
            item.get("chunk_count") or 0
        )
        queue.append(item)
    return {
        "report_version": "legal-source-verification-audit-v1",
        "read_only": True,
        "persistent_verification_flags_touched": False,
        "groups": len(queue),
        "chunks_by_queue_status": totals,
        "queue": queue,
    }


QUERY = r"""
with source_rows as (
  select
    'legal_law_chunks'::text as source_table,
    id::text as id,
    title,
    'law_snapshot'::text as source_type,
    metadata,
    coalesce(metadata->>'source_namespace', '<missing>') as source_namespace,
    coalesce(metadata->>'legal_source_registry_id', metadata->>'source_registry_id') as registry_id,
    coalesce(metadata->>'document_number', metadata->>'letter_number') as document_number,
    coalesce(metadata->>'document_date', metadata->>'publication_date', metadata->>'letter_date') as document_date,
    coalesce(metadata->>'official_url', metadata->>'source_url') as source_url
  from public.legal_law_chunks
  where is_active = true
    and (%(scope)s in ('all', 'laws'))
  union all
  select
    'legal_knowledge_chunks'::text,
    id::text,
    title,
    coalesce(source_type, 'unknown'),
    metadata,
    coalesce(metadata->>'source_namespace', '<missing>'),
    coalesce(metadata->>'legal_source_registry_id', metadata->>'source_registry_id'),
    coalesce(metadata->>'document_number', metadata->>'letter_number'),
    coalesce(metadata->>'document_date', metadata->>'publication_date', metadata->>'letter_date'),
    coalesce(metadata->>'official_url', metadata->>'source_url')
  from public.legal_knowledge_chunks
  where is_active = true
    and (%(scope)s in ('all', 'knowledge'))
),
grouped as (
  select
    source_table,
    case
      when source_table = 'legal_law_chunks' then source_namespace
      else coalesce(metadata->>'source_group_id', 'ungrouped:' || id)
    end as source_group_key,
    count(*)::int as chunk_count,
    (array_agg(title order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as title,
    (array_agg(source_type order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as source_type,
    (array_agg(source_namespace order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as source_namespace,
    (array_agg(registry_id order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as registry_id,
    (array_agg(document_number order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as document_number,
    (array_agg(document_date order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as document_date,
    (array_agg(source_url order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as source_url
  from source_rows
  group by source_table,
    case
      when source_table = 'legal_law_chunks' then source_namespace
      else coalesce(metadata->>'source_group_id', 'ungrouped:' || id)
    end
),
candidate_rows as (
  select
    g.*,
    coalesce(c.candidate_count, 0)::int as registry_candidate_count,
    coalesce(c.candidate_ids, array[]::text[]) as registry_candidate_ids
  from grouped g
  left join lateral (
    select
      count(*)::int as candidate_count,
      array_agg(r.id::text order by r.id) as candidate_ids
    from public.legal_source_registry r
    where g.registry_id is null
      and (
        (
          nullif(g.document_number, '') is not null
          and nullif(g.document_date, '') is not null
          and regexp_replace(
                regexp_replace(lower(regexp_replace(g.document_number, '[^[:alnum:]@/-]', '', 'g')), '^n([0-9])', '\\1'),
                '\\s+', '', 'g'
              ) =
              regexp_replace(
                regexp_replace(lower(regexp_replace(coalesce(r.document_number, ''), '[^[:alnum:]@/-]', '', 'g')), '^n([0-9])', '\\1'),
                '\\s+', '', 'g'
              )
          and r.publication_date::text = g.document_date
        )
        or (
          nullif(g.title, '') is not null
          and nullif(g.document_date, '') is not null
          and lower(trim(r.title)) = lower(trim(g.title))
          and r.publication_date::text = g.document_date
        )
      )
  ) c on true
)
select
  source_table, source_group_key, chunk_count, title, source_type, source_namespace,
  registry_id, document_number, document_date, source_url,
  registry_candidate_count, registry_candidate_ids
from candidate_rows
order by source_table, chunk_count desc, title;
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", choices=("all", "laws", "knowledge"), default="all")
    parser.add_argument("--output", help="Optional path for the JSON report")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database_url, row_factory=dict_row) as conn, conn.cursor() as cursor:
        cursor.execute(QUERY, {"scope": args.scope})
        report = build_report(cursor.fetchall())

    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(text + "\n")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
