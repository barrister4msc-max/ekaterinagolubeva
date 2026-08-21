#!/usr/bin/env python3
from __future__ import annotations

import io
import tempfile
import unittest
import zipfile
from pathlib import Path

import fns_open_data_sshr2019_dry_run as mod


def xml(*, inn: str = "7701234567", org: str = "ООО ТЕСТ", count: str = "0", version: str = "4.01", reporting: str = "31.12.2025", doc_date: str = "25.07.2026", doc_id: str = "doc-1") -> bytes:
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<Файл ВерсФорм="{version}">
  <Документ ИдДок="{doc_id}" ДатаДок="{doc_date}" ДатаСост="{reporting}">
    <СведНП НаимОрг="{org}" ИННЮЛ="{inn}" />
    <СведССЧР КолРаб="{count}" />
  </Документ>
</Файл>'''.encode()


class SshrParserTest(unittest.TestCase):
    def test_zero_is_valid_and_dates_are_normalized(self):
        facts = list(mod.iter_sshr2019_xml(io.BytesIO(xml(count="0"))))
        self.assertEqual(len(facts), 1)
        fact = facts[0]
        self.assertEqual(fact.average_headcount, 0)
        self.assertEqual(fact.reporting_date, "2025-12-31")
        self.assertEqual(fact.document_date, "2026-07-25")
        self.assertFalse(fact.legal_authority)
        self.assertFalse(fact.substantive_use_allowed)
        self.assertFalse(fact.current_employee_count_claim_allowed)

    def test_positive_integer_preserved(self):
        fact = list(mod.iter_sshr2019_xml(io.BytesIO(xml(count="1775"))))[0]
        self.assertEqual(fact.average_headcount, 1775)

    def test_invalid_inn_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "invalid_inn"):
            list(mod.iter_sshr2019_xml(io.BytesIO(xml(inn="123"))))

    def test_non_integer_headcount_fails_closed(self):
        for raw in ("", "1.0", "-1", "abc"):
            with self.subTest(raw=raw):
                with self.assertRaisesRegex(ValueError, "invalid_average_headcount"):
                    list(mod.iter_sshr2019_xml(io.BytesIO(xml(count=raw))))

    def test_schema_version_drift_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "unexpected_format_version"):
            list(mod.iter_sshr2019_xml(io.BytesIO(xml(version="5.00"))))

    def test_missing_required_structured_fields_fail_closed(self):
        bad = b'''<\xd0\xa4\xd0\xb0\xd0\xb9\xd0\xbb \xd0\x92\xd0\xb5\xd1\x80\xd1\x81\xd0\xa4\xd0\xbe\xd1\x80\xd0\xbc="4.01"><\xd0\x94\xd0\xbe\xd0\xba\xd1\x83\xd0\xbc\xd0\xb5\xd0\xbd\xd1\x82 \xd0\x98\xd0\xb4\xd0\x94\xd0\xbe\xd0\xba="x" \xd0\x94\xd0\xb0\xd1\x82\xd0\xb0\xd0\xa1\xd0\xbe\xd1\x81\xd1\x82="31.12.2025"><\xd0\xa1\xd0\xb2\xd0\xb5\xd0\xb4\xd0\x9d\xd0\x9f \xd0\x9d\xd0\xb0\xd0\xb8\xd0\xbc\xd0\x9e\xd1\x80\xd0\xb3="X" \xd0\x98\xd0\x9d\xd0\x9d\xd0\xae\xd0\x9b="7701234567"/></\xd0\x94\xd0\xbe\xd0\xba\xd1\x83\xd0\xbc\xd0\xb5\xd0\xbd\xd1\x82></\xd0\xa4\xd0\xb0\xd0\xb9\xd0\xbb>'''
        with self.assertRaisesRegex(ValueError, "document_missing_headcount"):
            list(mod.iter_sshr2019_xml(io.BytesIO(bad)))

    def test_zip_parser_preserves_multiple_rows(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "data.zip"
            with zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr("a.xml", xml(inn="7701234567", count="0", doc_id="a"))
                z.writestr("b.xml", xml(inn="7707654321", count="12", doc_id="b"))
            facts = list(mod.parse_sshr2019_zip(p))
            self.assertEqual([(f.inn, f.average_headcount) for f in facts], [("7701234567", 0), ("7707654321", 12)])


if __name__ == "__main__":
    unittest.main()
