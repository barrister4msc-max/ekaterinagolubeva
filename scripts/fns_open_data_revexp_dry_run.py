#!/usr/bin/env python3
"""Controlled read-only parser for FNS Open Data REVEXP ZIP/XML releases."""
from __future__ import annotations

import argparse, json, re, sys, zipfile
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import BinaryIO, Iterator
from xml.etree import ElementTree as ET

EXPECTED_FORMAT_VERSION = "4.01"
DATASET_ID = "7707329152-revexp"
SOURCE_TYPE = "fns_open_data"
SOURCE_FAMILY = "factual_official_data"
INN_RE = re.compile(r"^\d{10}$")
MONEY_RE = re.compile(r"^-?\d+(?:\.\d{1,2})?$")

@dataclass(frozen=True)
class FinancialStatementFact:
    inn: str
    organization_name: str
    income_amount: str
    expense_amount: str
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


def normalize_money(raw: str | None, *, field: str, inn: str) -> str:
    value = (raw or "").strip()
    if not MONEY_RE.fullmatch(value):
        raise ValueError(f"invalid_money:{inn}:{field}:{value}")
    try:
        amount = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError(f"invalid_money:{inn}:{field}:{value}") from exc
    return format(amount.quantize(Decimal("0.01")), "f")


def parse_document_element(elem: ET.Element) -> FinancialStatementFact:
    taxpayer = None
    statement = None
    for child in list(elem):
        name = local_name(child.tag)
        if name == "СведНП": taxpayer = child
        elif name == "СведДохРасх": statement = child
    if taxpayer is None: raise ValueError("document_missing_taxpayer")
    if statement is None: raise ValueError("document_missing_financial_statement")
    inn = (taxpayer.attrib.get("ИННЮЛ") or "").strip()
    org = (taxpayer.attrib.get("НаимОрг") or "").strip()
    doc_id = (elem.attrib.get("ИдДок") or "").strip()
    if not INN_RE.fullmatch(inn): raise ValueError(f"invalid_inn:{inn}")
    if not org: raise ValueError(f"missing_organization_name:{inn}")
    if not doc_id: raise ValueError(f"missing_document_id:{inn}")
    reporting = normalize_ru_date(elem.attrib.get("ДатаСост"), required=True)
    assert reporting is not None
    return FinancialStatementFact(
        inn=inn,
        organization_name=org,
        income_amount=normalize_money(statement.attrib.get("СумДоход"), field="СумДоход", inn=inn),
        expense_amount=normalize_money(statement.attrib.get("СумРасход"), field="СумРасход", inn=inn),
        document_id=doc_id,
        document_date=normalize_ru_date(elem.attrib.get("ДатаДок")),
        reporting_date=reporting,
    )


def iter_revexp_xml(stream: BinaryIO, *, limit: int | None = None) -> Iterator[FinancialStatementFact]:
    seen_root = False
    emitted = 0
    for event, elem in ET.iterparse(stream, events=("start", "end")):
        name = local_name(elem.tag)
        if event == "start" and not seen_root:
            if name != "Файл": raise ValueError(f"unexpected_root:{name}")
            version = (elem.attrib.get("ВерсФорм") or "").strip()
            if version != EXPECTED_FORMAT_VERSION: raise ValueError(f"unexpected_format_version:{version}")
            seen_root = True
            continue
        if event == "end" and name == "Документ":
            yield parse_document_element(elem)
            emitted += 1
            elem.clear()
            if limit is not None and emitted >= limit: return
    if not seen_root: raise ValueError("xml_has_no_root")


def parse_revexp_zip(path: Path, *, limit: int | None = None) -> Iterator[FinancialStatementFact]:
    emitted = 0
    with zipfile.ZipFile(path, "r") as zf:
        infos = [i for i in zf.infolist() if not i.is_dir() and i.filename.lower().endswith(".xml")]
        if not infos: raise ValueError("zip_has_no_xml_members")
        for info in infos:
            remaining = None if limit is None else limit - emitted
            if remaining is not None and remaining <= 0: return
            with zf.open(info, "r") as stream:
                for fact in iter_revexp_xml(stream, limit=remaining):
                    yield fact
                    emitted += 1


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(); p.add_argument("--input", required=True, type=Path); p.add_argument("--limit", type=int, default=25); p.add_argument("--emit-records", action="store_true")
    args = p.parse_args(argv)
    facts = list(parse_revexp_zip(args.input, limit=args.limit))
    if not facts: raise SystemExit("no_revexp_records_parsed")
    if args.emit_records:
        for f in facts: print(json.dumps(asdict(f), ensure_ascii=False, sort_keys=True))
    print(json.dumps({"dataset_id":DATASET_ID,"rows_parsed":len(facts),"unique_inn":len({f.inn for f in facts}),"factual_only":True,"legal_authority":False,"substantive_use_allowed":False,"db_writes":False}, ensure_ascii=False, sort_keys=True))
    return 0

if __name__ == "__main__": raise SystemExit(main(sys.argv[1:]))
