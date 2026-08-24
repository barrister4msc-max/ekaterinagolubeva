#!/usr/bin/env python3
"""Synthetic regression tests for the TAXOFFENCE parser."""

from __future__ import annotations

import io
import tempfile
import zipfile
from pathlib import Path

from fns_open_data_taxoffence_dry_run import parse_zip


VALID_XML = """<?xml version="1.0" encoding="UTF-8"?>
<Файл ВерсФорм="4.01">
  <Документ ИдДок="D-1" ДатаДок="01.12.2024" ДатаСост="31.12.2024">
    <СведНП ИННЮЛ="1234567890" НаимОрг="ООО Ромашка"/>
    <СведНаруш СумШтраф="1250.50"/>
  </Документ>
  <Документ ИдДок="D-2" ДатаДок="02.12.2024" ДатаСост="31.12.2024">
    <СведНП ИННЮЛ="0987654321" НаимОрг="ООО Берёзка"/>
    <СведНаруш СумШтраф="0"/>
  </Документ>
</Файл>
"""


def make_zip(xml: str) -> Path:
    temporary = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    temporary.close()
    path = Path(temporary.name)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("taxoffence-001.xml", xml.encode("utf-8"))
    return path


def test_valid_records_preserve_decimal_and_factual_boundary() -> None:
    path = make_zip(VALID_XML)
    try:
        facts = list(parse_zip(path))
        assert len(facts) == 2
        assert facts[0].inn == "1234567890"
        assert facts[0].fine_amount == "1250.50"
        assert facts[0].document_date == "2024-12-01"
        assert facts[0].data_as_of == "2024-12-31"
        assert facts[1].fine_amount == "0"
        assert facts[0].factual_only is True
        assert facts[0].legal_authority is False
        assert facts[0].substantive_use_allowed is False
        assert facts[0].use_as_legal_source is False
    finally:
        path.unlink(missing_ok=True)


def test_limit_is_bounded() -> None:
    path = make_zip(VALID_XML)
    try:
        facts = list(parse_zip(path, limit=1))
        assert len(facts) == 1
    finally:
        path.unlink(missing_ok=True)


def test_invalid_inn_fails_closed() -> None:
    path = make_zip(VALID_XML.replace("1234567890", "123"))
    try:
        try:
            list(parse_zip(path))
        except ValueError as error:
            assert str(error).startswith("invalid_inn:")
        else:
            raise AssertionError("invalid INN was accepted")
    finally:
        path.unlink(missing_ok=True)


if __name__ == "__main__":
    for test in (
        test_valid_records_preserve_decimal_and_factual_boundary,
        test_limit_is_bounded,
        test_invalid_inn_fails_closed,
    ):
        test()
    print("3 pass")
