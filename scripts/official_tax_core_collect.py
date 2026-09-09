#!/usr/bin/env python3
"""Create a fail-closed manifest from reviewed official Tax Core pages.

This collector does not write the database and does not use Law7. It permits
only declared FNS, Minfin and VSRF HTTPS hosts, records provenance and emits a
manifest for scripts/official_tax_core_import.py.
"""
from __future__ import annotations
import argparse, hashlib, html, json, re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

DATASET_KEY = "official_tax_core"
ALLOWED_HOSTS = {
    "fns": {"nalog.gov.ru", "www.nalog.gov.ru"},
    "minfin": {"minfin.gov.ru", "www.minfin.gov.ru"},
    "vsrf": {"vsrf.ru", "www.vsrf.ru"},
}
ALLOWED_TYPES = {
    "fns": {"fns_letter"},
    "minfin": {"minfin_letter"},
    "vsrf": {"vsrf_plenum", "vsrf_review", "vsrf_case"},
}

class PageText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(); self.parts: list[str] = []; self.title = ""; self.in_title = False
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.in_title = self.in_title or tag == "title"
    def handle_endtag(self, tag: str) -> None:
        if tag == "title": self.in_title = False
    def handle_data(self, data: str) -> None:
        self.parts.append(data)
        if self.in_title: self.title += data

def clean(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()

def official_url(provider: str, value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS[provider]

def fetch(provider: str, value: str) -> tuple[str, str]:
    if not official_url(provider, value):
        raise ValueError("URL is outside the official provider allow-list")
    req = Request(value, headers={"User-Agent": "KATI-Lawyer-Official-Collector/1.0"})
    with urlopen(req, timeout=45) as response:  # nosec B310: allow-list checked
        final = response.geturl()
        if not official_url(provider, final):
            raise ValueError("redirect left official host allow-list")
        if response.headers.get_content_type() not in {"text/html", "text/plain"}:
            raise ValueError("official document is not extractable text")
        return final, response.read().decode("utf-8", errors="replace")

def identity(text: str) -> tuple[str | None, str | None]:
    number = re.search(r"(?:№|N)\s*([А-ЯA-Z0-9@./-]+)", text)
    dated = re.search(r"(?:от|Дата(?:\s+письма)?\s*:)\s*(\d{2}\.\d{2}\.\d{4})", text)
    return (number.group(1) if number else None, dated.group(1) if dated else None)

def collect(seed: dict[str, Any]) -> dict[str, Any]:
    if seed.get("dataset_key") != DATASET_KEY or not isinstance(seed.get("sources"), list):
        raise ValueError("seed must contain official_tax_core sources")
    sources: list[dict[str, Any]] = []; seen: set[tuple[str, str, str]] = set()
    for item in seed["sources"]:
        provider, source_type, requested = item.get("provider"), item.get("source_type"), item.get("official_url")
        if provider not in ALLOWED_HOSTS or source_type not in ALLOWED_TYPES[provider] or not isinstance(requested, str):
            raise ValueError("unsupported provider/source type")
        final, body = fetch(provider, requested)
        parser = PageText(); parser.feed(body); content = clean(" ".join(parser.parts))
        number, published = identity(content)
        number = item.get("document_number") or number
        published = item.get("publication_date") or (datetime.strptime(published, "%d.%m.%Y").date().isoformat() if published else None)
        title = clean(str(item.get("title") or parser.title))
        if not title or not isinstance(number, str) or not isinstance(published, str) or len(content) < 200:
            raise ValueError("official page lacks verifiable title, number, date, or text")
        key = (provider, number, published)
        if key in seen: raise ValueError("duplicate official source identity")
        seen.add(key)
        sources.append({"provider": provider, "source_type": source_type, "title": title,
          "official_url": final, "document_number": number, "publication_date": published,
          "content": content, "content_sha256": hashlib.sha256(content.encode()).hexdigest(),
          "provenance": {"source_page_url": final, "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "official_origin_verified": True, "content_verified": True, "temporal_verified": False,
            "substantive_use_allowed": False}})
    return {"dataset_key": DATASET_KEY, "sources": sources}

def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--seed", type=Path, required=True); parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(); manifest = collect(json.loads(args.seed.read_text(encoding="utf-8")))
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"records": len(manifest["sources"]), "db_writes": False}, ensure_ascii=False)); return 0
if __name__ == "__main__": raise SystemExit(main())
