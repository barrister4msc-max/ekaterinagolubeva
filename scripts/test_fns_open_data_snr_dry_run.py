#!/usr/bin/env python3
import importlib.util
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("fns_open_data_snr_dry_run.py")
spec = importlib.util.spec_from_file_location("fns_snr", MODULE_PATH)
assert spec and spec.loader
fns_snr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fns_snr)

VALID_XML = '''<?xml version="1.0" encoding="UTF-8"?>
<Файл ИдФайл="sample" ВерсФорм="4.02" ТипИнф="ОТКРДАННЫЕ1" КолДок="2">
  <ИдОтпр><ФИООтв Фамилия="Иванов" Имя="Иван"/></ИдОтпр>
  <Документ ИдДок="doc-1" ДатаДок="25.06.2026" ДатаСост="01.06.2026">
    <СведНП НаимОрг="ООО Ромашка" ИННЮЛ="7701234567"/>
    <СведСНР ПризнЕСХН="0" ПризнУСН="1" ПризнАУСН="0" ПризнСРП="0"/>
  </Документ>
  <Документ ИдДок="doc-2" ДатаДок="25.06.2026" ДатаСост="01.06.2026">
    <СведНП НаимОрг="АО Пример" ИННЮЛ="7712345678"/>
    <СведСНР ПризнЕСХН="1" ПризнУСН="0" ПризнАУСН="1" ПризнСРП="0"/>
  </Документ>
</Файл>'''


class SnrDryRunTests(unittest.TestCase):
    def test_stream_parser_normalizes_factual_records(self):
        records = list(fns_snr.iter_snr_xml(io.BytesIO(VALID_XML.encode("utf-8"))))
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0].inn, "7701234567")
        self.assertEqual(records[0].regimes, ("usn",))
        self.assertEqual(records[0].data_as_of, "2026-06-01")
        self.assertFalse(records[0].legal_authority)
        self.assertFalse(records[0].substantive_use_allowed)
        self.assertTrue(records[0].factual_only)
        self.assertEqual(records[1].regimes, ("eshn", "ausn"))

    def test_zip_parser_never_extracts_and_honors_limit(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "sample.zip"
            with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.writestr("nested/data.xml", VALID_XML)
            records = list(fns_snr.parse_snr_zip(path, limit=1))
            self.assertEqual(len(records), 1)
            self.assertFalse((Path(td) / "nested").exists())

    def test_rejects_wrong_format_version(self):
        bad = VALID_XML.replace('ВерсФорм="4.02"', 'ВерсФорм="9.99"')
        with self.assertRaisesRegex(ValueError, "unexpected_format_version"):
            list(fns_snr.iter_snr_xml(io.BytesIO(bad.encode("utf-8"))))

    def test_rejects_invalid_regime_flag(self):
        bad = VALID_XML.replace('ПризнУСН="1"', 'ПризнУСН="2"', 1)
        with self.assertRaisesRegex(ValueError, "invalid_regime_flag"):
            list(fns_snr.iter_snr_xml(io.BytesIO(bad.encode("utf-8"))))

    def test_rejects_invalid_inn(self):
        bad = VALID_XML.replace('ИННЮЛ="7701234567"', 'ИННЮЛ="bad"', 1)
        with self.assertRaisesRegex(ValueError, "invalid_inn"):
            list(fns_snr.iter_snr_xml(io.BytesIO(bad.encode("utf-8"))))


if __name__ == "__main__":
    unittest.main()
