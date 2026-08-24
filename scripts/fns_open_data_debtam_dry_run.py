#!/usr/bin/env python3
"""Controlled read-only parser for FNS Open Data DEBTAM ZIP/XML releases.

No network code and no database client. The parser consumes an already-downloaded
official FNS archive, validates the observed XML contract, and emits factual-only
normalized debt rows. It never treats DEBTAM as a live balance or legal authority.
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

EXPECTED_FORMAT_VERSION = "4.01"
DATASET_ID = "7707329152-debtam"
SOURCE_TYPE = "fns_open_data"
SOURCE_FAMILY = "factual_official_data"
INN_RE = re.compile(r"^\d{10}$")
MONEY_RE = re.compile(r"^\d+(?:\.\d{1,2})?$")
MAX_ZIP_MEMBERS = 10_000
MAX_MEMBER_UNCOMPRESSED_BYTES = 1_500_000_000
MAX_TOTAL_UNCOMPRESSED_BYTES = 5_000_000_000
MAX_COMPRESSION_RATIO = 250


@dataclass(frozen=True)
class DebtFact:
    inn: str
    organization_name: str
    tax_name: str
    tax_debt_amount: str
    penalty_amount: str
    fine_amount: str
    total_debt_amount: str
    document_id: str
    document_date: str | None
    data_as_of: str | None
    debt_row_ordinal: int
    dataset_id: str = DATASET_ID
    source_type: str = SOURCE_TYPE
    source_family: str = SOURCE_FAMILY
    factual_only: bool = True
    legal_authority: bool = False
    substantive_use_allowed: bool = False
    use_as_legal_source: bool = False


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


def normalize_money(raw: str | None, *, field: str, inn: str) -> str:
    value = (raw or "").strip()
    if not MONEY_RE.fullmatch(value):
        raise ValueError(f"invalid_money:{inn}:{field}:{value}")
    try:
        amount = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError(f"invalid_money:{inn}:{field}:{value}") from exc
    if amount < 0:
        raise ValueError(f"negative_money:{inn}:{field}:{value}")
    return format(amount.quantize(Decimal("0.01")), "f")


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


def parse_document_element(elem: ET.Element) -> list[DebtFact]:
    taxpayer: ET.Element | None = None
    debt_rows: list[ET.Element] = []
    for child in list(elem):
        name = local_name(child.tag)
        if name == "СведНП":
            taxpayer = child
        elif name == "СведНедоим":
            debt_rows.append(child)

    if taxpayer is None:
        raise ValueError("document_missing_taxpayer")
    if not debt_rows:
        raise ValueError("document_missing_debt_rows")

    inn = (taxpayer.attrib.get("ИННЮЛ") or "").strip()
    org_name = (taxpayer.attrib.get("НаимОрг") or "").strip()
    document_id = (elem.attrib.get("ИдДок") or "").strip()
    if not INN_RE.fullmatch(inn):
        raise ValueError(f"invalid_inn:{inn}")
    if not org_name:
        raise ValueError(f"missing_organization_name:{inn}")
    if not document_id:
        raise ValueError(f"missing_document_id:{inn}")

    document_date = normalize_ru_date(elem.attrib.get("ДатаДок"))
    data_as_of = normalize_ru_date(elem.attrib.get("ДатаСост"))
    facts: list[DebtFact] = []
    for ordinal, row in enumerate(debt_rows, start=1):
        tax_name = (row.attrib.get("НаимНалог") or "").strip()
        if not tax_name:
            raise ValueError(f"missing_tax_name:{inn}:{ordinal}")
        facts.append(DebtFact(
            inn=inn,
            organization_name=org_name,
            tax_name=tax_name,
            tax_debt_amount=normalize_money(row.attrib.get("СумНедНалог"), field="СумНедНалог", inn=inn),
            penalty_amount=normalize_money(row.attrib.get("СумПени"), field="СумПени", inn=inn),
            fine_amount=normalize_money(row.attrib.get("СумШтраф"), field="СумШтраф", inn=inn),
            total_debt_amount=normalize_money(row.attrib.get("ОбщСумНедоим"), field="ОбщСумНедоим", inn=inn),
            document_id=document_id,
            document_date=document_date,
            data_as_of=data_as_of,
            debt_row_ordinal=ordinal,
        ))
    return facts


def iter_debtam_xml(stream: BinaryIO, *, limit: int | None = None) -> Iterator[DebtFact]:
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
            for fact in parse_document_element(elem):
                yield fact
                emitted += 1
                if limit is not None and emitted >= limit:
                    elem.clear()
                    return
            elem.clear()
    if not seen_root:
        raise ValueError("xml_has_no_root")


def parse_debtam_zip(path: Path, *, limit: int | None = None) -> Iterator[DebtFact]:
    emitted = 0
    with zipfile.ZipFile(path, "r") as zf:
        for info in validate_zip_manifest(zf):
            remaining = None if limit is None else max(limit - emitted, 0)
            if remaining == 0:
                return
            with zf.open(info, "r") as stream:
                for fact in iter_debtam_xml(stream, limit=remaining):
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
    facts = list(parse_debtam_zip(args.input, limit=args.limit))
    if not facts:
        raise SystemExit("no_debtam_records_parsed")
    if args.emit_records:
        for fact in facts:
            print(json.dumps(asdict(fact), ensure_ascii=False, sort_keys=True))
    summary = {
        "dataset_id": DATASET_ID,
        "rows_parsed": len(facts),
        "unique_inn": len({fact.inn for fact in facts}),
        "source_type": SOURCE_TYPE,
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
