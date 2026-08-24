#!/usr/bin/env python3
"""Controlled read-only parser for FNS Open Data SNR ZIP/XML releases.

This script deliberately has no database client and no network code. It accepts
an already-downloaded official FNS ZIP, streams XML members with Python stdlib,
and emits factual-only normalized records/summary. It never extracts ZIP
members to disk and never treats these facts as legal authority.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import BinaryIO, Iterator
from xml.etree import ElementTree as ET

EXPECTED_FORMAT_VERSION = "4.02"
DATASET_ID = "7707329152-snr"
SOURCE_TYPE = "fns_open_data"
SOURCE_FAMILY = "factual_official_data"
INN_RE = re.compile(r"^\d{10}$")
MAX_ZIP_MEMBERS = 10_000
MAX_MEMBER_UNCOMPRESSED_BYTES = 1_500_000_000
MAX_TOTAL_UNCOMPRESSED_BYTES = 5_000_000_000
MAX_COMPRESSION_RATIO = 250

REGIME_ATTRS = {
    "ПризнЕСХН": "eshn",
    "ПризнУСН": "usn",
    "ПризнАУСН": "ausn",
    "ПризнСРП": "srp",
}


@dataclass(frozen=True)
class SnrFact:
    inn: str
    organization_name: str
    regimes: tuple[str, ...]
    document_id: str | None
    document_date: str | None
    data_as_of: str | None
    dataset_id: str = DATASET_ID
    source_type: str = SOURCE_TYPE
    source_family: str = SOURCE_FAMILY
    factual_only: bool = True
    legal_authority: bool = False
    substantive_use_allowed: bool = False


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def normalize_ru_date(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip()
    match = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{4})", raw)
    if not match:
        raise ValueError(f"unexpected_date_format:{raw}")
    return f"{match.group(3)}-{match.group(2)}-{match.group(1)}"


def validate_zip_manifest(zf: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    infos = [info for info in zf.infolist() if not info.is_dir()]
    if not infos:
        raise ValueError("zip_has_no_files")
    if len(infos) > MAX_ZIP_MEMBERS:
        raise ValueError(f"too_many_zip_members:{len(infos)}")

    total = 0
    xml_infos: list[zipfile.ZipInfo] = []
    for info in infos:
        total += info.file_size
        if info.file_size > MAX_MEMBER_UNCOMPRESSED_BYTES:
            raise ValueError(f"zip_member_too_large:{info.filename}:{info.file_size}")
        if total > MAX_TOTAL_UNCOMPRESSED_BYTES:
            raise ValueError(f"zip_uncompressed_total_too_large:{total}")
        if info.compress_size > 0 and info.file_size / info.compress_size > MAX_COMPRESSION_RATIO:
            raise ValueError(f"suspicious_compression_ratio:{info.filename}")
        if info.filename.lower().endswith(".xml"):
            xml_infos.append(info)
    if not xml_infos:
        raise ValueError("zip_has_no_xml_members")
    return xml_infos


def parse_document_element(elem: ET.Element) -> SnrFact:
    taxpayer = None
    regimes_elem = None
    for child in list(elem):
        name = local_name(child.tag)
        if name == "СведНП":
            taxpayer = child
        elif name == "СведСНР":
            regimes_elem = child

    if taxpayer is None:
        raise ValueError("document_missing_taxpayer")
    if regimes_elem is None:
        raise ValueError("document_missing_snr")

    inn = (taxpayer.attrib.get("ИННЮЛ") or "").strip()
    org_name = (taxpayer.attrib.get("НаимОрг") or "").strip()
    if not INN_RE.fullmatch(inn):
        raise ValueError(f"invalid_inn:{inn}")
    if not org_name:
        raise ValueError(f"missing_organization_name:{inn}")

    active: list[str] = []
    for attr, normalized in REGIME_ATTRS.items():
        value = regimes_elem.attrib.get(attr)
        if value not in {"0", "1"}:
            raise ValueError(f"invalid_regime_flag:{inn}:{attr}:{value}")
        if value == "1":
            active.append(normalized)

    return SnrFact(
        inn=inn,
        organization_name=org_name,
        regimes=tuple(active),
        document_id=(elem.attrib.get("ИдДок") or "").strip() or None,
        document_date=normalize_ru_date(elem.attrib.get("ДатаДок")),
        data_as_of=normalize_ru_date(elem.attrib.get("ДатаСост")),
    )


def iter_snr_xml(stream: BinaryIO, *, limit: int | None = None) -> Iterator[SnrFact]:
    seen_root = False
    emitted = 0
    for event, elem in ET.iterparse(stream, events=("start", "end")):
        name = local_name(elem.tag)
        if event == "start" and not seen_root:
            if name != "Файл":
                raise ValueError(f"unexpected_root:{name}")
            version = (elem.attrib.get("ВерсФорм") or "").strip()
            if version != EXPECTED_FORMAT_VERSION:
                raise ValueError(f"unexpected_format_version:{version}")
            seen_root = True
            continue

        if event == "end" and name == "Документ":
            yield parse_document_element(elem)
            emitted += 1
            elem.clear()
            if limit is not None and emitted >= limit:
                return

    if not seen_root:
        raise ValueError("xml_has_no_root")


def parse_snr_zip(path: Path, *, limit: int | None = None) -> Iterator[SnrFact]:
    emitted = 0
    with zipfile.ZipFile(path, "r") as zf:
        for info in validate_zip_manifest(zf):
            remaining = None if limit is None else max(limit - emitted, 0)
            if remaining == 0:
                return
            with zf.open(info, "r") as stream:
                for fact in iter_snr_xml(stream, limit=remaining):
                    yield fact
                    emitted += 1
                    if limit is not None and emitted >= limit:
                        return


def fact_to_json(fact: SnrFact) -> dict[str, object]:
    result = asdict(fact)
    result["regimes"] = list(fact.regimes)
    return result


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path, help="Local official FNS SNR ZIP")
    parser.add_argument("--limit", type=int, default=25, help="Maximum records to parse (default 25)")
    parser.add_argument("--emit-records", action="store_true", help="Print normalized sample records")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.limit < 1 or args.limit > 10_000:
        raise SystemExit("--limit must be between 1 and 10000")
    if not args.input.is_file():
        raise SystemExit(f"input_not_found:{args.input}")

    facts = list(parse_snr_zip(args.input, limit=args.limit))
    if not facts:
        raise SystemExit("no_snr_records_parsed")

    if args.emit_records:
        for fact in facts:
            print(json.dumps(fact_to_json(fact), ensure_ascii=False, sort_keys=True))

    summary = {
        "dataset_id": DATASET_ID,
        "records_parsed": len(facts),
        "unique_inn": len({fact.inn for fact in facts}),
        "regime_counts": {
            regime: sum(regime in fact.regimes for fact in facts)
            for regime in sorted(set(REGIME_ATTRS.values()))
        },
        "source_type": SOURCE_TYPE,
        "source_family": SOURCE_FAMILY,
        "factual_only": True,
        "legal_authority": False,
        "substantive_use_allowed": False,
        "db_writes": False,
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
