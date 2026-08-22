#!/usr/bin/env python3
"""Deterministic read-only parser for the verified FNS TAXOFFENCE ZIP/XML release.

The parser accepts a locally downloaded official archive, validates the observed
XML contract, streams each member without extracting it to disk, and emits
factual-only records. It has no network code, database client, or legal-source
promotion path.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import BinaryIO, Iterator
from xml.etree import ElementTree as ET

DATASET_ID = "7707329152-taxoffence"
SOURCE_TYPE = "fns_open_data"
SOURCE_FAMILY = "factual_official_data"
ARCHIVE_URL = (
    "https://data.nalog.ru/opendata/7707329152-taxoffence/"
    "data-20251201-structure-20191201.zip"
)
ARCHIVE_SHA256 = "1a388022e0db361dc1cc78d65b4eb6f5f08a1d1fc59a9c6d035e1e8b4b4e384b"
INN_RE = re.compile(r"^\d{10}$")
DATE_RE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{4})$")
MAX_ZIP_MEMBERS = 10_000
MAX_MEMBER_UNCOMPRESSED_BYTES = 1_500_000_000
MAX_TOTAL_UNCOMPRESSED_BYTES = 5_000_000_000
MAX_COMPRESSION_RATIO = 250


@dataclass(frozen=True)
class TaxOffenceFact:
    inn: str
    organization_name: str
    fine_amount: str
    fine_amount_raw: str
    document_id: str
    document_date: str
    data_as_of: str
    format_version: str
    dataset_id: str = DATASET_ID
    source_type: str = SOURCE_TYPE
    source_family: str = SOURCE_FAMILY
    source_url: str = ARCHIVE_URL
    source_sha256: str = ARCHIVE_SHA256
    fact_kind: str = "tax_offence"
    factual_only: bool = True
    legal_authority: bool = False
    substantive_use_allowed: bool = False
    use_as_legal_source: bool = False


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def normalize_date(value: str, field: str) -> str:
    match = DATE_RE.fullmatch(value.strip())
    if not match:
        raise ValueError(f"unexpected_date_format:{field}:{value}")
    return f"{match.group(3)}-{match.group(2)}-{match.group(1)}"


def parse_fine(raw: str, inn: str) -> str:
    value = raw.strip()
    if not re.fullmatch(r"\d+(?:\.\d+)?", value):
        raise ValueError(f"invalid_fine_amount:{inn}:{raw}")
    try:
        amount = Decimal(value)
    except InvalidOperation as error:
        raise ValueError(f"invalid_fine_amount:{inn}:{raw}") from error
    if not amount.is_finite() or amount < 0:
        raise ValueError(f"invalid_fine_amount:{inn}:{raw}")
    return format(amount, "f")


def validate_zip_manifest(zf: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    infos = [info for info in zf.infolist() if not info.is_dir()]
    if not infos:
        raise ValueError("zip_has_no_files")
    if len(infos) > MAX_ZIP_MEMBERS:
        raise ValueError(f"too_many_zip_members:{len(infos)}")

    total = 0
    xml_infos: list[zipfile.ZipInfo] = []
    for info in infos:
        if info.filename.startswith("/") or ".." in Path(info.filename).parts:
            raise ValueError(f"unsafe_zip_member:{info.filename}")
        if info.file_size > MAX_MEMBER_UNCOMPRESSED_BYTES:
            raise ValueError(f"zip_member_too_large:{info.filename}:{info.file_size}")
        total += info.file_size
        if total > MAX_TOTAL_UNCOMPRESSED_BYTES:
            raise ValueError(f"zip_uncompressed_total_too_large:{total}")
        if info.compress_size and info.file_size / info.compress_size > MAX_COMPRESSION_RATIO:
            raise ValueError(f"suspicious_compression_ratio:{info.filename}")
        if info.filename.lower().endswith(".xml"):
            xml_infos.append(info)
    if not xml_infos:
        raise ValueError("zip_has_no_xml_members")
    return xml_infos


def parse_document(elem: ET.Element, format_version: str) -> TaxOffenceFact:
    taxpayer_nodes = [child for child in list(elem) if local_name(child.tag) == "СведНП"]
    offence_nodes = [child for child in list(elem) if local_name(child.tag) == "СведНаруш"]
    if len(taxpayer_nodes) != 1:
        raise ValueError("document_requires_exactly_one_taxpayer")
    if len(offence_nodes) != 1:
        raise ValueError("document_requires_exactly_one_offence")

    taxpayer = taxpayer_nodes[0]
    offence = offence_nodes[0]
    inn = (taxpayer.attrib.get("ИННЮЛ") or "").strip()
    organization_name = (taxpayer.attrib.get("НаимОрг") or "").strip()
    if not INN_RE.fullmatch(inn):
        raise ValueError(f"invalid_inn:{inn}")
    if not organization_name:
        raise ValueError(f"missing_organization_name:{inn}")

    fine_raw = (offence.attrib.get("СумШтраф") or "").strip()
    if not fine_raw:
        raise ValueError(f"missing_fine_amount:{inn}")
    fine_amount = parse_fine(fine_raw, inn)

    document_id = (elem.attrib.get("ИдДок") or "").strip()
    document_date = (elem.attrib.get("ДатаДок") or "").strip()
    data_as_of = (elem.attrib.get("ДатаСост") or "").strip()
    if not document_id:
        raise ValueError(f"missing_document_id:{inn}")
    if not document_date:
        raise ValueError(f"missing_document_date:{inn}")
    if not data_as_of:
        raise ValueError(f"missing_data_as_of:{inn}")

    return TaxOffenceFact(
        inn=inn,
        organization_name=organization_name,
        fine_amount=fine_amount,
        fine_amount_raw=fine_raw,
        document_id=document_id,
        document_date=normalize_date(document_date, "ДатаДок"),
        data_as_of=normalize_date(data_as_of, "ДатаСост"),
        format_version=format_version,
    )


def iter_xml(stream: BinaryIO, *, limit: int | None = None) -> Iterator[TaxOffenceFact]:
    root_seen = False
    format_version: str | None = None
    emitted = 0
    for event, elem in ET.iterparse(stream, events=("start", "end")):
        name = local_name(elem.tag)
        if event == "start" and not root_seen:
            if name != "Файл":
                raise ValueError(f"unexpected_root:{name}")
            format_version = (elem.attrib.get("ВерсФорм") or "").strip()
            if not format_version:
                raise ValueError("missing_format_version")
            root_seen = True
            continue
        if event == "end" and name == "Документ":
            assert format_version is not None
            yield parse_document(elem, format_version)
            emitted += 1
            elem.clear()
            if limit is not None and emitted >= limit:
                return
    if not root_seen:
        raise ValueError("xml_has_no_root")


def parse_zip(path: Path, *, limit: int | None = None) -> Iterator[TaxOffenceFact]:
    emitted = 0
    with zipfile.ZipFile(path, "r") as archive:
        for info in validate_zip_manifest(archive):
            remaining = None if limit is None else max(limit - emitted, 0)
            if remaining == 0:
                return
            with archive.open(info, "r") as stream:
                for fact in iter_xml(stream, limit=remaining):
                    yield fact
                    emitted += 1
                    if limit is not None and emitted >= limit:
                        return


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--emit-records", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.limit < 1 or args.limit > 10_000:
        raise SystemExit("--limit must be between 1 and 10000")
    if not args.input.is_file():
        raise SystemExit(f"input_not_found:{args.input}")

    facts = list(parse_zip(args.input, limit=args.limit))
    if not facts:
        raise SystemExit("no_taxoffence_records_parsed")

    if args.emit_records:
        for fact in facts:
            print(json.dumps(asdict(fact), ensure_ascii=False, sort_keys=True))

    total_fine = sum((Decimal(fact.fine_amount) for fact in facts), Decimal("0"))
    summary = {
        "dataset_id": DATASET_ID,
        "records_parsed": len(facts),
        "unique_inn": len({fact.inn for fact in facts}),
        "total_fine_amount": format(total_fine, "f"),
        "data_as_of_values": sorted({fact.data_as_of for fact in facts}),
        "format_versions": sorted({fact.format_version for fact in facts}),
        "source_family": SOURCE_FAMILY,
        "factual_only": True,
        "legal_authority": False,
        "substantive_use_allowed": False,
        "use_as_legal_source": False,
        "db_writes": False,
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
