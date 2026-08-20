#!/usr/bin/env python3
from __future__ import annotations

import io
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

from fns_open_data_debtam_dry_run import (
    DebtFact,
    iter_debtam_xml,
    normalize_money,
    parse_debtam_zip,
)


def xml_doc(*, version: str = "4.01", rows: str | None = None) -> bytes:
    debt_rows = rows or (
        '<СведНедоим НаимНалог="Налог A" СумНедНалог="100.00" СумПени="2.50" '
        'СумШтраф="0.00" ОбщСумНедоим="102.50"/>'
        '<СведНедоим НаимНалог="Налог B" СумНедНалог="0.00" СумПени="10.00" '
        'СумШтраф="5.00" ОбщСумНедоим="15.00"/>'
    )
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<Файл ВерсФорм="{version}">'
        '<Документ ИдДок="doc-1" ДатаДок="25.07.2026" ДатаСост="01.07.2026">'
        '<СведНП НаимОрг="ООО Тест" ИННЮЛ="7701234567"/>'
        f'{debt_rows}'
        '</Документ></Файл>'
    ).encode("utf-8")


class DebtamParserTests(unittest.TestCase):
    def test_one_document_emits_all_debt_rows_with_stable_ordinals(self) -> None:
        facts = list(iter_debtam_xml(io.BytesIO(xml_doc())))
        self.assertEqual(len(facts), 2)
        self.assertEqual([f.debt_row_ordinal for f in facts], [1, 2])
        self.assertEqual(facts[0].inn, "7701234567")
        self.assertEqual(facts[0].data_as_of, "2026-07-01")
        self.assertEqual(facts[0].tax_debt_amount, "100.00")
        self.assertEqual(facts[1].fine_amount, "5.00")
        self.assertFalse(facts[0].legal_authority)
        self.assertFalse(facts[0].substantive_use_allowed)
        self.assertFalse(facts[0].use_as_legal_source)

    def test_rejects_schema_drift_in_format_version(self) -> None:
        with self.assertRaisesRegex(ValueError, "unexpected_format_version"):
            list(iter_debtam_xml(io.BytesIO(xml_doc(version="9.99"))))

    def test_rejects_negative_or_high_scale_money(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid_money|negative_money"):
            normalize_money("-1.00", field="x", inn="7701234567")
        with self.assertRaisesRegex(ValueError, "invalid_money"):
            normalize_money("1.001", field="x", inn="7701234567")

    def test_zero_component_money_is_allowed(self) -> None:
        self.assertEqual(normalize_money("0.00", field="x", inn="7701234567"), "0.00")

    def test_zip_parser_preserves_one_to_many_rows(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "debtam.zip"
            with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.writestr("sample.xml", xml_doc())
            facts = list(parse_debtam_zip(path, limit=10))
            self.assertEqual(len(facts), 2)
            self.assertEqual({f.tax_name for f in facts}, {"Налог A", "Налог B"})


if __name__ == "__main__":
    unittest.main()
