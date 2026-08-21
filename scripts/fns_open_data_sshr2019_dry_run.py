#!/usr/bin/env python3
"""Controlled read-only parser for FNS Open Data SSHR2019 ZIP/XML releases."""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import BinaryIO, Iterator
from xml.etree import ElementTree as ET

EXPECTED_FORMAT_VERSION = "4.01"
DATASET_ID = "7707329152-sshr2019"
SOURCE_TYPE = "fns_open_data"
SOURCE_FAMILY = "factual_official_data"
INN_RE = re.compile(r"^\d{10}$")
INT_RE = re.compile(r"^\d+$")
MAX_XML_MEMBERS = 10000
MAX_MEMBER_UNCOMPRESSED = 128 * 1024 * 1024
MAX_TOTAL_UNCOMPRESSED = 8 * 1024 * 1024 * 1024


@dataclass(frozen=True)
class AverageHeadcountFact:
    inn: str
    organization_name: str
    average_headcount: int
    document_id: str
    document_date: str | None
    reporting_date: str
    dataset_id: str = DATASET_ID
    source_type: str = SOURCE_TYPE
    source_family: str = SOURCE_FAMILY
    factual_only: bool = True
    legal_authority: bool = False
    substantive_use_allowed: bool = False
    use_as_legal_source: bool = False
    current_employee_count_claim_allowed: bool = False


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def normalize_ru_date(value: str | None, *, required: bool = False) -> str | None:
    if not value:
        if required:
            raise ValueError("missing_required_date")
        return None
    m = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{4})", value.strip())
    if not m:
        raise ValueError(f"unexpected_date_format:{value}")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"


def parse_headcount(raw: str | None, *, inn: str) -> int:
    value = (raw or "").strip()
    if not INT_RE.fullmatch(value):
        raise ValueError(f"invalid_average_headcount:{inn}:{value}")
    count = int(value)
    if count < 0:
        raise ValueError(f"negative_average_headcount:{inn}:{value}")
    return count


def parse_document_element(elem: ET.Element) -> AverageHeadcountFact:
    taxpayer = None
    headcount = None
    for child in list(elem):
        name = local_name(child.tag)
        if name == "СведНП":
            taxpayer = child
        elif name == "СведССЧР":
            headcount = child

    if taxpayer is None:
        raise ValueError("document_missing_taxpayer")
    if headcount is None:
        raise ValueError("document_missing_headcount")

    inn = (taxpayer.attrib.get("ИННЮЛ") or "").strip()
    org = (taxpayer.attrib.get("НаимОрг") or "").strip()
    doc_id = (elem.attrib.get("ИдДок") or "").strip()
    if not INN_RE.fullmatch(inn):
        raise ValueError(f"invalid_inn:{inn}")
    if not org:
        raise ValueError(f"missing_organization_name:{inn}")
    if not doc_id:
        raise ValueError(f"missing_document_id:{inn}")

    reporting_date = normalize_ru_date(elem.attrib.get("ДатаСост"), required=True)
    assert reporting_date is not None
    return AverageHeadcountFact(
        inn=inn,
        organization_name=org,
        average_headcount=parse_headcount(headcount.attrib.get("КолРаб"), inn=inn),
        document_id=doc_id,
        document_date=normalize_ru_date(elem.attrib.get("ДатаДок")),
        reporting_date=reporting_date,
    )


def iter_sshr2019_xml(stream: BinaryIO, *, limit: int | None = None) -> Iterator[AverageHeadcountFact]:
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


def _validated_xml_members(zf: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    infos = [i for i in zf.infolist() if not i.is_dir() and i.filename.lower().endswith(".xml")]
    if not infos:
        raise ValueError("zip_has_no_xml_members")
    if len(infos) > MAX_XML_MEMBERS:
        raise ValueError(f"zip_too_many_xml_members:{len(infos)}")
    total = 0
    for info in infos:
        if info.file_size > MAX_MEMBER_UNCOMPRESSED:
            raise ValueError(f"zip_member_too_large:{info.filename}:{info.file_size}")
        total += info.file_size
        if total > MAX_TOTAL_UNCOMPRESSED:
            raise ValueError(f"zip_total_uncompressed_too_large:{total}")
    return infos


def parse_sshr2019_zip(path: Path, *, limit: int | None = None) -> Iterator[AverageHeadcountFact]:
    emitted = 0
    with zipfile.ZipFile(path, "r") as zf:
        for info in _validated_xml_members(zf):
            remaining = None if limit is None else limit - emitted
            if remaining is not None and remaining <= 0:
                return
            with zf.open(info, "r") as stream:
                for fact in iter_sshr2019_xml(stream, limit=remaining):
                    yield fact
                    emitted += 1


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--emit-records", action="store_true")
    args = parser.parse_args(argv)

    facts = list(parse_sshr2019_zip(args.input, limit=args.limit))
    if not facts:
        raise SystemExit("no_sshr2019_records_parsed")
    if args.emit_records:
        for fact in facts:
            print(json.dumps(asdict(fact), ensure_ascii=False, sort_keys=True))
    print(json.dumps({
        "dataset_id": DATASET_ID,
        "rows_parsed": len(facts),
        "unique_inn": len({f.inn for f in facts}),
        "zero_headcount_rows": sum(f.average_headcount == 0 for f in facts),
        "factual_only": True,
        "legal_authority": False,
        "substantive_use_allowed": False,
        "db_writes": False,
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
