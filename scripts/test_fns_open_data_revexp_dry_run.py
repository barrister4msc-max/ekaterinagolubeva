#!/usr/bin/env python3
from __future__ import annotations

import io, unittest, zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

from fns_open_data_revexp_dry_run import iter_revexp_xml, normalize_money, parse_revexp_zip


def xml_doc(*, version: str = "4.01", income: str = "11623000.00", expense: str = "10969000.00") -> bytes:
    return (
        f'<?xml version="1.0" encoding="UTF-8"?><Файл ВерсФорм="{version}">'
        '<Документ ИдДок="doc-1" ДатаДок="25.07.2026" ДатаСост="31.12.2025">'
        '<СведНП НаимОрг="ООО Тест" ИННЮЛ="7701234567"/>'
        f'<СведДохРасх СумДоход="{income}" СумРасход="{expense}"/>'
        '</Документ></Файл>'
    ).encode("utf-8")


class RevexpParserTests(unittest.TestCase):
    def test_parses_exact_structured_statement(self) -> None:
        facts = list(iter_revexp_xml(io.BytesIO(xml_doc())))
        self.assertEqual(len(facts), 1)
        f = facts[0]
        self.assertEqual(f.inn, "7701234567")
        self.assertEqual(f.reporting_date, "2025-12-31")
        self.assertEqual(f.income_amount, "11623000.00")
        self.assertEqual(f.expense_amount, "10969000.00")
        self.assertFalse(f.legal_authority)
        self.assertFalse(f.substantive_use_allowed)
        self.assertFalse(f.use_as_legal_source)

    def test_rejects_schema_drift(self) -> None:
        with self.assertRaisesRegex(ValueError, "unexpected_format_version"):
            list(iter_revexp_xml(io.BytesIO(xml_doc(version="9.99"))))

    def test_preserves_negative_values_if_official_row_contains_them(self) -> None:
        self.assertEqual(normalize_money("-10.50", field="x", inn="7701234567"), "-10.50")

    def test_rejects_excess_decimal_scale(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid_money"):
            normalize_money("1.001", field="x", inn="7701234567")

    def test_zip_parser(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "revexp.zip"
            with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.writestr("sample.xml", xml_doc())
            facts = list(parse_revexp_zip(path, limit=10))
            self.assertEqual(len(facts), 1)
            self.assertEqual(facts[0].document_id, "doc-1")


if __name__ == "__main__": unittest.main()
