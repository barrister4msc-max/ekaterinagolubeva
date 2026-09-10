from pathlib import Path
import importlib.util
import tempfile
import csv


MODULE_PATH = Path(__file__).resolve().parent / "official_tax_core_collect.py"
SPEC = importlib.util.spec_from_file_location("collector", MODULE_PATH)
collector = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(collector)


def check(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


INLINE_HTML = ("""
<html><head><title>Письмо ФНС России</title></head><body>
<nav>site menu and search</nav>
<main class='document-content'>
  <h1>Письмо ФНС России от 10.03.2021 № БВ-4-7/3060@</h1>
  <p>О практике применения статьи 54.1 Налогового кодекса Российской Федерации.</p>
  <p>""" + ("Официальный текст. " * 100) + """</p>
</main><footer>footer</footer></body></html>
""").encode("utf-8")


def test_inline_text_only() -> None:
    text = collector.extract_official_text(INLINE_HTML)
    check("site menu" not in text and "footer" not in text, "site chrome leaked into inline text")
    check(collector.has_substantive_official_text(text), "substantive inline official text was rejected")
    with tempfile.TemporaryDirectory() as temp:
        out = Path(temp) / "fns"
        snapshot = collector.write_raw_snapshot(out, "123", INLINE_HTML)
        records = []
        collector.add_record(
            records, provider="fns", source_type="inline_official_html", title="Письмо ФНС России",
            number="БВ-4-7/3060@", date="10.03.2021", card_url="https://www.nalog.gov.ru/rn77/about_fts/about_nalog/10687108/",
            raw_snapshot=snapshot, content=text.encode("utf-8"),
        )
        check(records[0]["attachment_url"] == "", "inline document must not pretend to have an attachment")
        check(records[0]["raw_snapshot"].endswith("card.html"), "raw HTML snapshot was not recorded")
        check(bool(records[0]["content_sha256"]), "inline content hash missing")


def test_attachment_and_inline_share_identity() -> None:
    records = []
    args = dict(
        provider="vsrf", title="Постановление Пленума", number="53", date="12.10.2006",
        card_url="https://vsrf.ru/documents/123/",
    )
    collector.add_record(records, source_type="official_attachment", attachment_url="https://vsrf.ru/files/53.pdf",
                         attachment_path="out/vsrf/123/53.pdf", raw_snapshot="out/vsrf/123/card.html", content=b"%PDF", **args)
    collector.add_record(records, source_type="inline_official_html", raw_snapshot="out/vsrf/123/card.html",
                         content=b"official inline text", **args)
    check(records[0]["canonical_document_id"] == records[1]["canonical_document_id"], "related artefacts need one canonical identity")
    check(records[0]["source_file_sha256"] and not records[1]["source_file_sha256"], "attachment and inline hashes were conflated")


def def test_malformed_html_and_vsrf_discovery_patterns() -> None:
    broken = ("<div class='publication-content'><p>Письмо ФНС " + ("налоговый текст " * 120) + "<br><p>конец").encode()
    check(collector.has_substantive_official_text(collector.extract_official_text(broken)), "unbalanced official HTML was discarded")
    check(collector.is_vsrf_detail_url("https://vsrf.ru/documents/own/12345/"), "published VSRF detail URL rejected")
    check(not collector.is_vsrf_detail_url("https://vsrf.ru/documents/own/?category=made_up"), "VSRF catalogue listing treated as detail")


test_fail_closed_only_when_both_representations_absent() -> None:
    check(not collector.has_substantive_official_text("Короткая карточка"), "short card must not pass as full document")
    check(collector.is_allowed("fns", "https://www.nalog.gov.ru/rn77/about_fts/about_nalog/10687108/"), "official host rejected")
    check(not collector.is_allowed("fns", "https://example.invalid/document.docx"), "foreign host accepted")


def test_output_columns_match_manifest_contract() -> None:
    with tempfile.TemporaryDirectory() as temp:
        out = Path(temp) / "out"
        out.mkdir()
        collector.write_outputs(out, [], [], {})
        with (out / "index.csv").open(encoding="utf-8-sig", newline="") as f:
            headers = next(csv.reader(f))
        for field in ("source_type", "card_url", "attachment_url", "raw_snapshot", "content_sha256"):
            check(field in headers, f"index.csv missing {field}")


test_inline_text_only()
test_attachment_and_inline_share_identity()
test_fail_closed_only_when_both_representations_absent()
test_output_columns_match_manifest_contract()
print("5 pass")
