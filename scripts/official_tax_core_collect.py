#!/usr/bin/env python3
"""Build a fail-closed official Tax Core manifest; no database writes."""
from __future__ import annotations
import argparse, hashlib, html, json, re, subprocess, tempfile, zipfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

DATASET_KEY = "official_tax_core"
ALLOWED_HOSTS = {"fns":{"nalog.gov.ru","www.nalog.gov.ru"},"minfin":{"minfin.gov.ru","www.minfin.gov.ru"},"vsrf":{"vsrf.ru","www.vsrf.ru"}}
ALLOWED_TYPES = {"fns":{"fns_letter"},"minfin":{"minfin_letter"},"vsrf":{"vsrf_plenum","vsrf_review","vsrf_case"}}

class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(); self.parts:list[str]=[]; self.links:list[str]=[]; self.title=""; self.in_title=False
    def handle_starttag(self, tag:str, attrs:list[tuple[str,str|None]]) -> None:
        if tag=="title": self.in_title=True
        if tag=="a" and (href:=dict(attrs).get("href")): self.links.append(href)
    def handle_endtag(self, tag:str) -> None:
        if tag=="title": self.in_title=False
    def handle_data(self, value:str) -> None:
        self.parts.append(value)
        if self.in_title: self.title+=value

def clean(value:str)->str: return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>"," ",value))).strip()
def allowed(provider:str, value:str)->bool:
    parsed=urlparse(value); return parsed.scheme=="https" and parsed.hostname in ALLOWED_HOSTS[provider]
def digest(value:bytes)->str: return hashlib.sha256(value).hexdigest()
def fetch(provider:str, value:str)->tuple[str,str,bytes]:
    if not allowed(provider,value): raise ValueError("URL is outside the official provider allow-list")
    with urlopen(Request(value,headers={"User-Agent":"KATI-Lawyer-Official-Collector/1.0"}),timeout=45) as response: # nosec B310
        final=response.geturl()
        if not allowed(provider,final): raise ValueError("redirect left official host allow-list")
        return final,response.headers.get_content_type(),response.read()
def extract(content_type:str,payload:bytes)->str:
    if content_type in {"text/html","text/plain"}:
        page=Page(); page.feed(payload.decode("utf-8",errors="replace")); return clean(" ".join(page.parts))
    if content_type=="application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        with zipfile.ZipFile(BytesIO(payload)) as archive: return clean(archive.read("word/document.xml").decode("utf-8",errors="replace"))
    command=["antiword","-m","UTF-8.txt"] if content_type=="application/msword" else ["pdftotext","-","-"] if content_type=="application/pdf" else None
    if command is None: raise ValueError(f"unsupported official content type: {content_type}")
    if content_type=="application/pdf":
        return clean(subprocess.run(command,input=payload,capture_output=True,check=True).stdout.decode("utf-8",errors="replace"))
    with tempfile.NamedTemporaryFile(suffix=".doc") as source:
        source.write(payload); source.flush(); return clean(subprocess.run(command+[source.name],capture_output=True,check=True,text=True).stdout)
def find_attachment(provider:str,page_url:str,links:list[str])->str:
    matches=[urljoin(page_url,x) for x in links if re.search(r"\.(?:docx?|pdf)(?:$|[?#])",x,re.I)]
    matches=[x for x in matches if allowed(provider,x)]
    if len(matches)!=1: raise ValueError("official page has no unique allow-listed document link")
    return matches[0]
def identity(value:str)->tuple[str|None,str|None]:
    number=re.search(r"(?:№|N)\s*([А-ЯA-Z0-9@./-]+)",value); dated=re.search(r"(?:от|Дата(?:\s+письма)?\s*:)\s*(\d{2}\.\d{2}\.\d{4})",value)
    return (number.group(1) if number else None,dated.group(1) if dated else None)
def collect(seed:dict[str,Any])->dict[str,Any]:
    if seed.get("dataset_key")!=DATASET_KEY or not isinstance(seed.get("sources"),list): raise ValueError("seed must contain official_tax_core sources")
    records=[]; seen=set()
    for item in seed["sources"]:
        provider,source_type,page_url=item.get("provider"),item.get("source_type"),item.get("official_url")
        if provider not in ALLOWED_HOSTS or source_type not in ALLOWED_TYPES[provider] or not isinstance(page_url,str): raise ValueError("unsupported provider/source type")
        source_page,kind,page_payload=fetch(provider,page_url)
        if kind!="text/html": raise ValueError("official source page must be HTML")
        page=Page(); page.feed(page_payload.decode("utf-8",errors="replace"))
        document_url=item.get("document_url") or find_attachment(provider,source_page,page.links)
        if not isinstance(document_url,str): raise ValueError("missing official document URL")
        document_url,document_kind,file_payload=fetch(provider,document_url); content=extract(document_kind,file_payload)
        number,page_date=identity(clean(" ".join(page.parts)))
        number=item.get("document_number") or number; published=item.get("publication_date") or (datetime.strptime(page_date,"%d.%m.%Y").date().isoformat() if page_date else None)
        title=clean(str(item.get("title") or page.title))
        if not title or not isinstance(number,str) or not isinstance(published,str) or len(content)<200: raise ValueError("official document lacks verifiable identity or full text")
        key=(provider,number,published)
        if key in seen: raise ValueError("duplicate official source identity")
        seen.add(key); records.append({"provider":provider,"source_type":source_type,"title":title,"official_url":document_url,"document_number":number,"publication_date":published,"content":content,"content_sha256":hashlib.sha256(content.encode()).hexdigest(),"provenance":{"source_page_url":source_page,"document_url":document_url,"source_file_sha256":digest(file_payload),"retrieved_at":datetime.now(timezone.utc).isoformat(),"official_origin_verified":True,"content_verified":True,"temporal_verified":False,"substantive_use_allowed":False}})
    return {"dataset_key":DATASET_KEY,"sources":records}
def main()->int:
    parser=argparse.ArgumentParser(); parser.add_argument("--seed",type=Path,required=True); parser.add_argument("--output",type=Path,required=True); args=parser.parse_args()
    manifest=collect(json.loads(args.seed.read_text(encoding="utf-8"))); args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8"); print(json.dumps({"records":len(manifest["sources"]),"db_writes":False})); return 0
if __name__=="__main__": raise SystemExit(main())
