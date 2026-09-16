#!/usr/bin/env python3
"""Produce a bounded, hash-only, fail-closed legacy legal-source queue."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import unicodedata
from collections import defaultdict
from pathlib import Path


LEGACY_VERIFICATION_FIELDS = {
    "verification_status",
    "official_status",
    "official_origin_verified",
    "content_verified",
    "temporal_verified",
    "substantive_use_allowed",
    "verification_basis",
}


def normalized_digest(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).replace("\u00a0", " ")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def as_nonnegative_int(value):
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, str) and value.isdecimal():
        return int(value)
    return None


def group_integrity(rows, candidate):
    expected_chunks = candidate.get("legacy_chunks")
    indexed_rows = [(as_nonnegative_int(row.get("chunk_index")), row) for row in rows]
    indices = [index for index, _ in indexed_rows]
    declared_totals = {as_nonnegative_int(row.get("chunks_total")) for row in rows}
    declared_totals.discard(None)
    unique_sorted_indices = sorted(set(index for index in indices if index is not None))
    expected_indices = list(range(expected_chunks)) if isinstance(expected_chunks, int) else []
    complete = (
        expected_chunks is not None
        and len(rows) == expected_chunks
        and len(indices) == len(set(indices))
        and all(index is not None for index in indices)
        and unique_sorted_indices == expected_indices
        and declared_totals == {expected_chunks}
    )
    ordered_content_sha256 = None
    if complete:
        ordered_rows = [row for _, row in sorted(indexed_rows, key=lambda item: item[0])]
        ordered_content_sha256 = normalized_digest("\n".join(row.get("content") or "" for row in ordered_rows))

    return {
        "source_group_id": candidate["source_group_id"],
        "manifest_legacy_chunks": expected_chunks,
        "returned_chunks": len(rows),
        "declared_chunks_total": sorted(declared_totals),
        "chunk_indices": unique_sorted_indices,
        "legacy_reconstruction_complete": complete,
        "legacy_ordered_content_sha256": ordered_content_sha256,
        "official_content_comparison_eligible": False,
        "substantive_use_allowed": False,
        "result": (
            "legacy_reconstruction_complete_official_evidence_pending"
            if complete
            else "legacy_reconstruction_incomplete_fail_closed"
        ),
    }


def legacy_verification_metadata_conflict(row):
    if not {"verification_status", "official_status"}.issubset(row):
        return None
    return (
        row.get("verification_status") == "official_verified"
        and (
            row.get("official_status") != "official_verified"
            or not all(
                row.get(field) is True
                for field in (
                    "official_origin_verified",
                    "content_verified",
                    "temporal_verified",
                    "substantive_use_allowed",
                )
            )
        )
    )


def artifact_row(row, candidate):
    safe = {
        key: value
        for key, value in row.items()
        if key not in {"content", "official_url", *LEGACY_VERIFICATION_FIELDS}
    }
    safe["stored_source_url"] = row.get("official_url")
    safe["candidate_official_url"] = candidate.get("official_url")
    safe["candidate_official_origin_observed"] = False
    safe["stored_legacy_verification_status"] = row.get("verification_status")
    safe["stored_legacy_official_status"] = row.get("official_status")
    safe["stored_legacy_official_origin_observed"] = row.get("official_origin_verified")
    safe["stored_legacy_content_verified"] = row.get("content_verified")
    safe["stored_legacy_temporal_verified"] = row.get("temporal_verified")
    safe["stored_legacy_substantive_use_allowed"] = row.get("substantive_use_allowed")
    safe["legacy_verification_metadata_observed"] = {
        "verification_status",
        "official_status",
        "official_origin_verified",
        "content_verified",
        "temporal_verified",
        "substantive_use_allowed",
    }.issubset(row)
    safe["legacy_verification_metadata_conflict"] = legacy_verification_metadata_conflict(row)
    safe["queue_effective_verification_status"] = "identity_unresolved"
    safe["queue_effective_official_origin_verified"] = False
    safe["queue_effective_content_verified"] = False
    safe["queue_effective_temporal_verified"] = False
    safe["queue_effective_substantive_use_allowed"] = False
    safe["queue_required_evidence"] = [
        "canonical_identity",
        "official_origin",
        "exact_normalized_content",
        "temporal_applicability_and_freshness",
    ]
    safe["content_length"] = len(row.get("content") or "")
    return safe


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    candidates = {item["source_group_id"]: item for item in manifest["candidates"] if "source_group_id" in item}
    groups = list(candidates)
    if not groups:
        raise SystemExit("manifest candidates require source_group_id")

    import psycopg

    with psycopg.connect(os.environ["DATABASE_URL"]) as connection, connection.cursor() as cursor:
        cursor.execute("select * from public.kati_legacy_legal_source_content_rows(%s)", (groups,))
        columns = [column.name for column in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    rows_by_group = defaultdict(list)
    for row in rows:
        rows_by_group[row["source_group_id"]].append(row)
    artifact_rows = [artifact_row(row, candidates[row["source_group_id"]]) for row in rows]
    conflicted_groups = sorted(
        {row["source_group_id"] for row in artifact_rows if row["legacy_verification_metadata_conflict"]}
    )
    unobservable_groups = sorted(
        {row["source_group_id"] for row in artifact_rows if not row["legacy_verification_metadata_observed"]}
    )
    report = {
        "read_only": True,
        "raw_content_exported": False,
        "substantive_use_allowed": False,
        "manifest_groups": len(groups),
        "legacy_verification_metadata_conflicted_groups": conflicted_groups,
        "legacy_verification_metadata_conflict_count": len(conflicted_groups),
        "legacy_verification_metadata_observation_complete": not unobservable_groups,
        "legacy_verification_metadata_unobservable_groups": unobservable_groups,
        "groups": [group_integrity(rows_by_group[group_id], candidate) for group_id, candidate in candidates.items()],
        "rows": artifact_rows,
    }
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
