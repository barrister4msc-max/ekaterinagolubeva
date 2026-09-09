#!/usr/bin/env python3
"""Convert a user-supplied GARANT ODT export into a normalized private-source admission payload.

The converter is deterministic and excludes GARANT editorial/change-history styles.
It does not assert official verification or grant substantive-use permission.
It is intentionally incompatible with the Law7 mirror importer.
"""

from __future__ import annotations

import hashlib
import json
import argparse
import re
import sys
import zipfile
from datetime import date
from pathlib import Path
from xml.etree.ElementTree import iterparse

TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0"
META_NS = "urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
DC_NS = "http://purl.org/dc/elements/1.1/"
BLOCK_TAGS = {f"{{{TEXT_NS}}}p", f"{{{TEXT_NS}}}h"}
ARTICLE_STYLE = "s15"
STRUCTURE_STYLE = "s3"
EXCLUDED_STYLES = {"s9", "s9header", "s22", "s22header", "s52", "s52header"}
ARTICLE_RE = re.compile(r"^Статья\s+(\d+(?:[.\-]\d+)*)\.\s*(.*)$")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def meta_value(archive: zipfile.ZipFile, tag: str) -> str | None:
    from xml.etree.ElementTree import parse

    with archive.open("meta.xml") as stream:
        root = parse(stream).getroot()
    value = root.find(f".//{tag}")
    return value.text.strip() if value is not None and value.text else None


def extract(path: Path, snapshot_date: str, minimum_articles: int = 700) -> dict:
    source_hash = file_sha256(path)
    codes = {
        "NK_RF": {
            "code": "NK_RF",
            "name": "Налоговый кодекс Российской Федерации часть первая",
            "short_name": "НК РФ часть I",
            "description": "User-supplied consolidated GARANT export; retrieval-only pending official verification",
            "original_eo_number": "146-ФЗ",
            "original_date": "1998-07-31",
            "official_url": None,
        },
        "NK_RF_2": {
            "code": "NK_RF_2",
            "name": "Налоговый кодекс Российской Федерации часть вторая",
            "short_name": "НК РФ часть II",
            "description": "User-supplied consolidated GARANT export; retrieval-only pending official verification",
            "original_eo_number": "117-ФЗ",
            "original_date": "2000-08-05",
            "official_url": None,
        },
    }
    articles: list[dict] = []
    current_code: str | None = None
    current: dict | None = None

    def finish() -> None:
        nonlocal current
        if current is None:
            return
        text = "\n".join(current.pop("paragraphs")).strip()
        if not text:
            raise ValueError(f"empty article: {current['code_id']} {current['article_number']}")
        if "ГАРАНТ:" in text or "Информация об изменениях:" in text:
            raise ValueError(f"editorial material leaked into article: {current['article_number']}")
        current["article_text"] = text
        current["text_hash"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
        articles.append(current)
        current = None

    with zipfile.ZipFile(path) as archive:
        creator = meta_value(archive, f"{{{META_NS}}}initial-creator")
        description = meta_value(archive, f"{{{DC_NS}}}description")
        if creator != 'НПП "Гарант-Сервис"' or description != "Документ экспортирован из системы ГАРАНТ":
            raise ValueError("ODT is not the expected GARANT export format")

        with archive.open("content.xml") as stream:
            for _, element in iterparse(stream, events=("end",)):
                if element.tag not in BLOCK_TAGS:
                    continue
                style = element.attrib.get(f"{{{TEXT_NS}}}style-name", "")
                text = "".join(element.itertext()).strip()
                element.clear()
                if not text:
                    continue
                if style == STRUCTURE_STYLE and text == "Часть первая":
                    finish()
                    current_code = "NK_RF"
                    continue
                if style == STRUCTURE_STYLE and text == "Часть вторая":
                    finish()
                    current_code = "NK_RF_2"
                    continue
                if style == STRUCTURE_STYLE:
                    finish()
                    continue
                if style == ARTICLE_STYLE:
                    finish()
                    match = ARTICLE_RE.match(text)
                    if not match or current_code is None:
                        raise ValueError(f"unrecognized article heading: {text[:120]}")
                    article_number = match.group(1).replace("-", ".")
                    current = {
                        "code_id": current_code,
                        "article_number": article_number,
                        "version_date": snapshot_date,
                        "article_title": text,
                        "amendment_eo_number": None,
                        "amendment_date": None,
                        "is_current": True,
                        "is_repealed": bool(re.search(r"утратил[аио]? силу|не действует", text, re.I)),
                        "repealed_date": None,
                        "paragraphs": [text],
                    }
                    continue
                if current is not None and style not in EXCLUDED_STYLES:
                    current["paragraphs"].append(text)
        finish()

    keys = [(row["code_id"], row["article_number"]) for row in articles]
    if len(keys) != len(set(keys)):
        duplicates = sorted(key for key in set(keys) if keys.count(key) > 1)
        raise ValueError(f"duplicate article identities: {duplicates[:20]}")
    if {row["code_id"] for row in articles} != {"NK_RF", "NK_RF_2"}:
        raise ValueError("both NK parts are required")
    if len(articles) < minimum_articles:
        raise ValueError(f"unexpectedly small corpus: {len(articles)} articles")

    return {
        # This namespace is deliberately distinct from law7_codes. GARANT
        # content may enter only KATI's existing internal legal knowledge base,
        # never law7_mirror or its single-writer importer.
        "dataset_key": "private_garant_nk_snapshot",
        "source_repository": "user-supplied/garant-export",
        "source_commit": source_hash,
        "source_provider_id": "garant_user_supplied",
        "source_class": "user_supplied_retrieval_snapshot",
        "admission": {
            "target_table": "public.legal_law_chunks",
            "source_namespace": "garant_user_supplied_nk",
            "law7_mirror_import_allowed": False,
            "requires_owner_license_confirmation": True,
            "requires_existing_kb_admission_writer": True,
        },
        "codes": list(codes.values()),
        "article_versions": articles,
        "amendments": [],
        "provenance": {
            "container": "odt",
            "generator": "Garant",
            "source_file_sha256": source_hash,
            "snapshot_date": snapshot_date,
            "latest_amendment_listed": "2026-08-04",
            "official_origin_verified": False,
            "content_verified": False,
            "temporal_verified": False,
            "substantive_use_allowed": False,
            "license_scope_requires_owner_confirmation": True,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--snapshot-date", default=date.today().isoformat())
    args = parser.parse_args()
    source = args.input
    output = args.output
    snapshot_date = args.snapshot_date
    payload = extract(source, snapshot_date)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    counts = {}
    max_lengths = {}
    for code in ("NK_RF", "NK_RF_2"):
        rows = [row for row in payload["article_versions"] if row["code_id"] == code]
        counts[code] = len(rows)
        max_lengths[code] = max(len(row["article_text"]) for row in rows)
    print(json.dumps({
        "source_file_sha256": payload["source_commit"],
        "payload_sha256": file_sha256(output),
        "articles": counts,
        "max_article_chars": max_lengths,
        "bytes": output.stat().st_size,
        "safety": payload["provenance"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
