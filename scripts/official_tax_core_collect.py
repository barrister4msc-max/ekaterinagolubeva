#!/usr/bin/env python3
"""Download the requested official Tax Core corpus without database writes.

Each official card may expose an original attachment, an inline official text,
or both.  These are deliberately kept as distinct source artefacts: an HTML
snapshot is never represented as a source DOCX/PDF, and an original attachment
is never renamed.  The output contains original files, card snapshots,
index.csv, manifest.json and errors.csv.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import time
from collections import deque
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qsl, quote_plus, urlencode, urljoin, urlparse, urlunparse
from urllib.request import Request, urlopen

FNS_ROOT = "https://www.nalog.gov.ru/rn77/about_fts/about_nalog/"
MINFIN_ROOT = "https://minfin.gov.ru/ru/perfomance/tax_relations/Answers/"
VSRF_ROOT = "https://vsrf.ru/"
VSRF_QUERIES = [
    "налог", "налоговый", "НК РФ", "54.1", "НДС", "дробление бизнеса",
    "налоговая выгода", "взыскание", "камеральная проверка",
    "выездная проверка", "требование", "ЕНС", "жалоба",
]
ALLOWED = {
    "fns": {"nalog.gov.ru", "www.nalog.gov.ru"},
    "minfin": {"minfin.gov.ru", "www.minfin.gov.ru"},
    "vsrf": {"vsrf.ru", "www.vsrf.ru"},
}
ATTACHMENT_RE = re.compile(r"\.(?:docx?|pdf|rtf|odt|xlsx?|zip)(?:$|[?#])", re.I)
FNS_CARD_RE = re.compile(r"/rn\d+/about_fts/about_nalog/(\d+)/?$")
VSRF_DOC_RE = re.compile(r"/(?:documents/(?:all|reviews|own|arbitration)|files)/(\d+)/?$")
DATE_RE = re.compile(r"(?:от|Дата(?:\s+письма)?\s*:)\s*(\d{2}\.\d{2}\.\d{4})", re.I)
NUMBER_RE = re.compile(r"(?:№|N)\s*([А-ЯA-Z0-9@./-]+)")


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self._anchor_href: str | None = None
        self._anchor_parts: list[str] = []
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_d = dict(attrs)
        if tag == "title":
            self._in_title = True
        if tag == "a" and attrs_d.get("href"):
            self._anchor_href = attrs_d["href"]
            self._anchor_parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        if tag == "a" and self._anchor_href:
            self.links.append((self._anchor_href, clean(" ".join(self._anchor_parts))))
            self._anchor_href = None
            self._anchor_parts = []

    def handle_data(self, value: str) -> None:
        self.parts.append(value)
        if self._in_title:
            self.title += value
        if self._anchor_href:
            self._anchor_parts.append(value)


class OfficialText(HTMLParser):
    """Extract visible document body text while excluding site chrome/forms."""

    _SKIP = {"script", "style", "noscript", "svg", "form", "nav", "header", "footer"}
    _CONTENT_HINT = re.compile(r"(?:article|content|document|detail|news|text|main)", re.I)

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip_depth = 0
        self._content_depth = 0
        self._stack: list[tuple[str, bool]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_d = dict(attrs)
        if tag in self._SKIP:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        marker = " ".join(filter(None, [attrs_d.get("id"), attrs_d.get("class")]))
        is_content = tag in {"main", "article"} or bool(self._CONTENT_HINT.search(marker))
        self._stack.append((tag, is_content))
        if is_content:
            self._content_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if not self._stack:
            return
        open_tag, was_content = self._stack.pop()
        if open_tag != tag:
            # Malformed markup: retain a fail-closed extraction rather than
            # guessing an element hierarchy.
            self._stack.clear()
            self._content_depth = 0
            return
        if was_content and self._content_depth:
            self._content_depth -= 1

    def handle_data(self, value: str) -> None:
        if not self._skip_depth and self._content_depth:
            self.parts.append(value)


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def canonical_url(value: str) -> str:
    p = urlparse(value)
    query = urlencode(sorted(parse_qsl(p.query, keep_blank_values=True)), doseq=True)
    return urlunparse((p.scheme, p.netloc.lower(), p.path, "", query, ""))


def is_allowed(provider: str, value: str) -> bool:
    p = urlparse(value)
    return p.scheme == "https" and (p.hostname or "").lower() in ALLOWED[provider]


def fetch(provider: str, url: str, *, retries: int = 4) -> tuple[str, str, bytes]:
    if not is_allowed(provider, url):
        raise ValueError(f"outside allow-list: {url}")
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "KATI-Lawyer-Official-Collector/1.1 (+official-source archival)"})
            with urlopen(req, timeout=60) as response:  # nosec B310: strict host allow-list above
                final = response.geturl()
                if not is_allowed(provider, final):
                    raise ValueError(f"redirect left allow-list: {final}")
                payload = response.read()
                ctype = response.headers.get_content_type() or "application/octet-stream"
                time.sleep(0.18)
                return final, ctype, payload
        except Exception as exc:  # noqa: BLE001 - recorded in errors.csv
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {url}: {last}")


def parse_page(payload: bytes) -> Page:
    parser = Page()
    parser.feed(payload.decode("utf-8", errors="replace"))
    return parser


def extract_official_text(payload: bytes) -> str:
    """Return a conservative main-text extraction suitable for a HTML snapshot."""
    parser = OfficialText()
    parser.feed(payload.decode("utf-8", errors="replace"))
    return clean(" ".join(parser.parts))


def has_substantive_official_text(text: str) -> bool:
    """Avoid treating navigation, search results, or a bare card header as a document."""
    if len(text) < 800:
        return False
    return bool(re.search(r"\b(?:письм|приказ|постановлен|определени|налог|суд|стать[ья])", text, re.I))


def identity(text: str) -> tuple[str, str]:
    number = NUMBER_RE.search(text)
    date = DATE_RE.search(text)
    return (number.group(1) if number else "", date.group(1) if date else "")


def safe_basename(url: str) -> str:
    name = Path(urlparse(url).path).name
    return name or ""


def write_file(provider_dir: Path, page_key: str, url: str, payload: bytes) -> str:
    basename = safe_basename(url)
    if not basename:
        raise ValueError(f"attachment has no filename: {url}")
    folder = provider_dir / page_key
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / basename
    if path.exists() and path.read_bytes() != payload:
        # Never rename an official file. Put a collision into a distinct URL-hash folder.
        folder = provider_dir / page_key / hashlib.sha256(url.encode()).hexdigest()[:12]
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / basename
    path.write_bytes(payload)
    return path.as_posix()


def write_raw_snapshot(provider_dir: Path, page_key: str, payload: bytes) -> str:
    """Persist the official card as received; it is not an attachment substitute."""
    folder = provider_dir / page_key
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "card.html"
    path.write_bytes(payload)
    return path.as_posix()


def canonical_document_identity(provider: str, card_url: str, number: str, date: str, title: str) -> str:
    """Stable identity shared by a card's attachment and inline HTML artefacts."""
    # The official card is the canonical binding point.  Attachment labels may
    # differ from the card title, so deliberately do not include them here.
    key = "|".join([provider, canonical_url(card_url), clean(number), clean(date)])
    return f"{provider}:{hashlib.sha256(key.encode('utf-8')).hexdigest()}"


def add_record(records: list[dict], *, provider: str, source_type: str, title: str,
               number: str, date: str, card_url: str, attachment_url: str = "",
               attachment_path: str = "", raw_snapshot: str = "", content: bytes = b"",
               status: str = "") -> None:
    identity_key = canonical_document_identity(provider, card_url, number, date, title)
    content_sha256 = hashlib.sha256(content).hexdigest() if content else ""
    records.append({
        "organ": {"fns": "ФНС России", "minfin": "Минфин России", "vsrf": "Верховный Суд РФ"}[provider],
        "provider": provider,
        "source_type": source_type,
        "number": number,
        "date": date,
        "title": title,
        "canonical_document_id": identity_key,
        "card_url": card_url,
        # Legacy aliases are retained for the existing importer; new callers use
        # the explicit attachment/raw-snapshot fields below.
        "file_url": attachment_url,
        "file": attachment_path,
        "attachment_url": attachment_url,
        "raw_snapshot": raw_snapshot,
        "status": status,
        "source_file_sha256": content_sha256 if source_type == "official_attachment" else "",
        "content_sha256": content_sha256,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "official_origin_verified": True,
        "content_verified": False,
        "temporal_verified": False,
        "substantive_use_allowed": False,
    })


def attachments(provider: str, page_url: str, page: Page) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for href, text in page.links:
        absolute = urljoin(page_url, href)
        if not is_allowed(provider, absolute) or not ATTACHMENT_RE.search(absolute):
            continue
        key = canonical_url(absolute)
        if key in seen:
            continue
        seen.add(key)
        out.append((absolute, text))
    return out


def collect_fns(out: Path, records: list[dict], errors: list[dict]) -> dict:
    cards: dict[str, str] = {}
    live_total = None
    empty_pages = 0
    for page_no in range(1, 250):
        url = FNS_ROOT if page_no == 1 else f"{FNS_ROOT}{page_no}.html"
        try:
            final, ctype, payload = fetch("fns", url)
            if ctype != "text/html":
                raise ValueError(f"catalog page is {ctype}")
            page = parse_page(payload)
            text = clean(" ".join(page.parts))
            if page_no == 1:
                m = re.search(r"всего:\s*(\d+)", text, re.I)
                live_total = int(m.group(1)) if m else None
            before = len(cards)
            for href, _ in page.links:
                absolute = urljoin(final, href)
                m = FNS_CARD_RE.search(urlparse(absolute).path.rstrip("/") + "/")
                if m:
                    cards[m.group(1)] = absolute
            if len(cards) == before:
                empty_pages += 1
                if empty_pages >= 2:
                    break
            else:
                empty_pages = 0
        except Exception as exc:  # noqa: BLE001
            errors.append({"provider": "fns", "stage": "catalog", "url": url, "error": str(exc)})
            if page_no > 120:
                break

    provider_dir = out / "fns"
    for idx, (card_id, card_url) in enumerate(sorted(cards.items(), key=lambda x: int(x[0])), 1):
        try:
            final, ctype, payload = fetch("fns", card_url)
            if ctype != "text/html":
                raise ValueError(f"card is {ctype}")
            page = parse_page(payload)
            text = clean(" ".join(page.parts))
            number, date = identity(text)
            h1 = re.search(r"Письмо\s+от\s+\d{2}\.\d{2}\.\d{4}\s+№\s*([^\s]+)", text, re.I)
            if h1 and not number:
                number = h1.group(1)
            title = clean(page.title) or f"Письмо ФНС {number}".strip()
            status = "Утратило актуальность" if "Утратило актуальность" in text and "Актуально" not in text[:400] else ""
            atts = attachments("fns", final, page)
            page_key = card_id
            inline_text = extract_official_text(payload)
            raw_snapshot = write_raw_snapshot(provider_dir, page_key, payload) if has_substantive_official_text(inline_text) else ""
            saved_attachments = 0
            # Preserve every official attachment with its original filename.
            for file_url, link_text in atts:
                try:
                    file_final, _, file_payload = fetch("fns", file_url)
                    file_path = write_file(provider_dir, page_key, file_final, file_payload)
                    add_record(records, provider="fns", source_type="official_attachment", title=title,
                               number=number, date=date, card_url=final, attachment_url=file_final,
                               attachment_path=file_path, raw_snapshot=raw_snapshot, content=file_payload, status=status)
                    saved_attachments += 1
                except Exception as exc:  # noqa: BLE001
                    errors.append({"provider": "fns", "stage": "file", "url": file_url, "error": str(exc)})
            if raw_snapshot:
                add_record(records, provider="fns", source_type="inline_official_html", title=title,
                           number=number, date=date, card_url=final, raw_snapshot=raw_snapshot,
                           content=inline_text.encode("utf-8"), status=status)
            if not saved_attachments and not raw_snapshot:
                errors.append({"provider": "fns", "stage": "content", "url": final,
                               "error": "no official attachment and no substantive inline official text"})
            if idx % 100 == 0:
                print(f"FNS cards processed: {idx}/{len(cards)}", flush=True)
        except Exception as exc:  # noqa: BLE001
            errors.append({"provider": "fns", "stage": "card", "url": card_url, "error": str(exc)})
    return {"catalog_total": live_total, "cards_discovered": len(cards)}


def collect_minfin(out: Path, records: list[dict], errors: list[dict]) -> dict:
    provider_dir = out / "minfin"
    queue = deque([MINFIN_ROOT])
    visited: set[str] = set()
    file_seen: set[str] = set()
    pages = 0
    while queue and pages < 5000:
        url = queue.popleft()
        key = canonical_url(url)
        if key in visited:
            continue
        visited.add(key)
        try:
            final, ctype, payload = fetch("minfin", url)
            if ctype != "text/html":
                continue
            pages += 1
            page = parse_page(payload)
            text = clean(" ".join(page.parts))
            number, date = identity(text)
            title = clean(page.title)
            page_key = hashlib.sha256(final.encode()).hexdigest()[:12]
            inline_text = extract_official_text(payload)
            raw_snapshot = write_raw_snapshot(provider_dir, page_key, payload) if has_substantive_official_text(inline_text) else ""
            saved_attachments = 0
            for href, link_text in page.links:
                absolute = urljoin(final, href)
                if not is_allowed("minfin", absolute):
                    continue
                path = urlparse(absolute).path
                if ATTACHMENT_RE.search(absolute):
                    fkey = canonical_url(absolute)
                    if fkey in file_seen:
                        continue
                    file_seen.add(fkey)
                    try:
                        file_final, _, file_payload = fetch("minfin", absolute)
                        file_path = write_file(provider_dir, page_key, file_final, file_payload)
                        add_record(records, provider="minfin", source_type="official_attachment",
                                   title=title or link_text, number=number, date=date, card_url=final,
                                   attachment_url=file_final, attachment_path=file_path,
                                   raw_snapshot=raw_snapshot, content=file_payload)
                        saved_attachments += 1
                    except Exception as exc:  # noqa: BLE001
                        errors.append({"provider": "minfin", "stage": "file", "url": absolute, "error": str(exc)})
                elif path.startswith("/ru/perfomance/tax_relations/Answers/"):
                    queue.append(absolute)
            if raw_snapshot:
                add_record(records, provider="minfin", source_type="inline_official_html",
                           title=title, number=number, date=date, card_url=final,
                           raw_snapshot=raw_snapshot, content=inline_text.encode("utf-8"))
            if (number or date) and not saved_attachments and not raw_snapshot:
                errors.append({"provider": "minfin", "stage": "content", "url": final,
                               "error": "no official attachment and no substantive inline official text"})
        except Exception as exc:  # noqa: BLE001
            errors.append({"provider": "minfin", "stage": "page", "url": url, "error": str(exc)})
    if queue:
        errors.append({"provider": "minfin", "stage": "crawl", "url": MINFIN_ROOT, "error": "5000-page safety cap reached"})
    return {"pages_crawled": pages, "files_discovered": len(file_seen)}


def vsrf_search_url(query: str) -> str:
    return (
        "https://vsrf.ru/search/?keyword=" + quote_plus(query) +
        "&search_section_active=documents&search_sections%5B%5D=documents"
    )


def collect_vsrf(out: Path, records: list[dict], errors: list[dict]) -> dict:
    provider_dir = out / "vsrf"
    detail_urls: set[str] = set()
    search_pages = 0
    for query in VSRF_QUERIES:
        queue = deque([vsrf_search_url(query)])
        visited: set[str] = set()
        while queue and len(visited) < 80:
            url = queue.popleft()
            key = canonical_url(url)
            if key in visited:
                continue
            visited.add(key)
            try:
                final, ctype, payload = fetch("vsrf", url)
                if ctype != "text/html":
                    continue
                search_pages += 1
                page = parse_page(payload)
                for href, _ in page.links:
                    absolute = urljoin(final, href)
                    if not is_allowed("vsrf", absolute):
                        continue
                    path = urlparse(absolute).path.rstrip("/") + "/"
                    if VSRF_DOC_RE.search(path):
                        detail_urls.add(absolute)
                    elif path.startswith("/search/") and "keyword=" in urlparse(absolute).query:
                        queue.append(absolute)
            except Exception as exc:  # noqa: BLE001
                errors.append({"provider": "vsrf", "stage": "search", "url": url, "error": str(exc)})

    # Add plenums/reviews category pages by year so historically important materials are not search-ranking dependent.
    for year in range(2014, datetime.now().year + 1):
        for seed in (
            f"https://vsrf.ru/documents/own/?category=resolutions_plenum_supreme_court_russian&year={year}",
            f"https://vsrf.ru/documents/reviews/?category=practice&year={year}",
        ):
            try:
                final, ctype, payload = fetch("vsrf", seed)
                if ctype != "text/html":
                    continue
                page = parse_page(payload)
                for href, _ in page.links:
                    absolute = urljoin(final, href)
                    if is_allowed("vsrf", absolute) and VSRF_DOC_RE.search(urlparse(absolute).path.rstrip("/") + "/"):
                        # Filter later by tax keywords; plenums 53/57 references are also retained if matched.
                        detail_urls.add(absolute)
            except Exception as exc:  # noqa: BLE001
                errors.append({"provider": "vsrf", "stage": "category", "url": seed, "error": str(exc)})

    keywords = [q.casefold() for q in VSRF_QUERIES]
    matched_details = 0
    for idx, detail in enumerate(sorted(detail_urls), 1):
        try:
            final, ctype, payload = fetch("vsrf", detail)
            if ctype != "text/html":
                # Direct official file discovered from search.
                text_hint = detail.casefold()
                if not any(k in text_hint for k in keywords):
                    continue
                file_path = write_file(provider_dir, hashlib.sha256(detail.encode()).hexdigest()[:12], final, payload)
                add_record(records, provider="vsrf", source_type="official_attachment", title=safe_basename(final),
                           number="", date="", card_url=final, attachment_url=final,
                           attachment_path=file_path, content=payload)
                continue
            page = parse_page(payload)
            text = clean(" ".join(page.parts))
            folded = text.casefold()
            if not any(k in folded for k in keywords):
                continue
            matched_details += 1
            number, date = identity(text)
            title = clean(page.title)
            lower_title = title.casefold()
            atts = attachments("vsrf", final, page)
            # VSRF sometimes exposes a direct stor_pdf link without an extension.
            for href, link_text in page.links:
                absolute = urljoin(final, href)
                if is_allowed("vsrf", absolute) and "/lk/practice/stor_pdf" in urlparse(absolute).path:
                    if all(canonical_url(absolute) != canonical_url(x[0]) for x in atts):
                        atts.append((absolute, link_text))
            page_key = re.sub(r"\D", "", urlparse(final).path)[-12:] or hashlib.sha256(final.encode()).hexdigest()[:12]
            inline_text = extract_official_text(payload)
            raw_snapshot = write_raw_snapshot(provider_dir, page_key, payload) if has_substantive_official_text(inline_text) else ""
            saved_attachments = 0
            for file_url, link_text in atts:
                try:
                    file_final, _, file_payload = fetch("vsrf", file_url)
                    file_path = write_file(provider_dir, page_key, file_final, file_payload)
                    add_record(records, provider="vsrf", source_type="official_attachment", title=title or link_text,
                               number=number, date=date, card_url=final, attachment_url=file_final,
                               attachment_path=file_path, raw_snapshot=raw_snapshot, content=file_payload)
                    saved_attachments += 1
                except Exception as exc:  # noqa: BLE001
                    errors.append({"provider": "vsrf", "stage": "file", "url": file_url, "error": str(exc)})
            if raw_snapshot:
                add_record(records, provider="vsrf", source_type="inline_official_html", title=title,
                           number=number, date=date, card_url=final, raw_snapshot=raw_snapshot,
                           content=inline_text.encode("utf-8"))
            if not saved_attachments and not raw_snapshot:
                errors.append({"provider": "vsrf", "stage": "content", "url": final,
                               "error": "no official attachment and no substantive inline official text"})
            if idx % 100 == 0:
                print(f"VSRF candidate details processed: {idx}/{len(detail_urls)}", flush=True)
        except Exception as exc:  # noqa: BLE001
            errors.append({"provider": "vsrf", "stage": "detail", "url": detail, "error": str(exc)})

    # Explicit historical markers requested by the user. We do not fabricate a file URL:
    # if not discovered on VSRF, they remain a gap in errors.csv for manual official-source resolution.
    required_historic = [
        ("ВАС РФ Пленум № 53", "12.10.2006", "обоснованность налоговой выгоды"),
        ("ВАС РФ Пленум № 57", "30.07.2013", "части первой Налогового кодекса"),
    ]
    corpus_text = "\n".join((r["title"] + " " + r["number"] + " " + r["date"]).casefold() for r in records if r["provider"] == "vsrf")
    for label, date, marker in required_historic:
        if marker.casefold() not in corpus_text and label.split("№")[-1].strip().casefold() not in corpus_text:
            errors.append({"provider": "vsrf", "stage": "required_historic", "url": VSRF_ROOT, "error": f"not resolved to a downloadable official VSRF file: {label} ({date})"})
    return {"search_pages": search_pages, "candidate_details": len(detail_urls), "matched_details": matched_details}


def write_outputs(out: Path, records: list[dict], errors: list[dict], stats: dict) -> None:
    fieldnames = [
        "organ", "provider", "source_type", "canonical_document_id", "number", "date", "title", "status",
        "card_url", "attachment_url", "raw_snapshot", "content_sha256", "source_file_sha256",
        # Compatibility aliases for the existing importer contract.
        "file", "file_url",
    ]
    with (out / "index.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)
    err_fields = ["provider", "stage", "url", "error"]
    with (out / "errors.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=err_fields)
        writer.writeheader()
        writer.writerows(errors)
    manifest = {
        "dataset_key": "official_tax_core_archive",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "official_only": True,
        "db_writes": False,
        "records": records,
        "stats": stats,
        "errors_count": len(errors),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path("official-tax-core"))
    args = parser.parse_args()
    out = args.output_dir
    out.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    errors: list[dict] = []
    stats = {
        "fns": collect_fns(out, records, errors),
        "minfin": collect_minfin(out, records, errors),
        "vsrf": collect_vsrf(out, records, errors),
    }
    write_outputs(out, records, errors, stats)
    print(json.dumps({"records": len(records), "errors": len(errors), "stats": stats, "db_writes": False}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
