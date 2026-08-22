#!/usr/bin/env python3
"""Read-only release probe for the official FNS TAXOFFENCE archive.

The probe downloads only the URLs published in the official FNS dataset card,
streams SHA-256 calculation, validates basic ZIP/XML/XSD structure, and emits a
JSON report. It has no database client, no Supabase credentials, no import path,
and never extracts archive members to disk.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

DATASET_ID = "7707329152-taxoffence"
ARCHIVE_URL = (
    "https://data.nalog.ru/opendata/7707329152-taxoffence/"
    "data-20251201-structure-20191201.zip"
)
XSD_URL = (
    "https://data.nalog.ru/opendata/7707329152-taxoffence/"
    "structure-20181201.xsd"
)
MAX_DOWNLOAD_BYTES = 2_000_000_000
MAX_ZIP_MEMBERS = 10_000
MAX_TOTAL_UNCOMPRESSED_BYTES = 5_000_000_000
MAX_MEMBER_UNCOMPRESSED_BYTES = 1_500_000_000
MAX_COMPRESSION_RATIO = 250


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path) -> int:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "KATI-LAWYER-official-source-probe/1.0"},
    )
    total = 0
    with urllib.request.urlopen(request, timeout=60) as response, destination.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_DOWNLOAD_BYTES:
                raise ValueError(f"download_too_large:{url}:{total}")
            output.write(chunk)
    if total == 0:
        raise ValueError(f"empty_download:{url}")
    return total


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def validate_xsd(path: Path) -> dict[str, object]:
    root = ET.parse(path).getroot()
    root_name = local_name(root.tag)
    if root_name != "schema":
        raise ValueError(f"unexpected_xsd_root:{root_name}")
    return {
        "root": root_name,
        "target_namespace": root.attrib.get("targetNamespace"),
    }


def validate_archive(path: Path) -> dict[str, object]:
    xml_members: list[zipfile.ZipInfo] = []
    total_uncompressed = 0
    with zipfile.ZipFile(path, "r") as archive:
        members = [info for info in archive.infolist() if not info.is_dir()]
        if not members:
            raise ValueError("zip_has_no_files")
        if len(members) > MAX_ZIP_MEMBERS:
            raise ValueError(f"too_many_zip_members:{len(members)}")

        for info in members:
            if info.filename.startswith("/") or ".." in Path(info.filename).parts:
                raise ValueError(f"unsafe_zip_member:{info.filename}")
            if info.file_size > MAX_MEMBER_UNCOMPRESSED_BYTES:
                raise ValueError(f"zip_member_too_large:{info.filename}:{info.file_size}")
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES:
                raise ValueError(f"zip_uncompressed_total_too_large:{total_uncompressed}")
            if info.compress_size and info.file_size / info.compress_size > MAX_COMPRESSION_RATIO:
                raise ValueError(f"suspicious_compression_ratio:{info.filename}")
            if info.filename.lower().endswith(".xml"):
                xml_members.append(info)

        if not xml_members:
            raise ValueError("zip_has_no_xml_members")

        with archive.open(xml_members[0], "r") as stream:
            root_event, root_element = next(
                event for event, element in ET.iterparse(stream, events=("start",))
                for root_event, root_element in [(event, element)]
            )

    return {
        "member_count": len(members),
        "xml_member_count": len(xml_members),
        "total_uncompressed_bytes": total_uncompressed,
        "first_xml_root": local_name(root_element.tag),
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, help="Use a previously downloaded official ZIP")
    parser.add_argument("--xsd", type=Path, help="Use a previously downloaded official XSD")
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download the exact URLs published in the official FNS card",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if not args.download and (args.archive is None or args.xsd is None):
        raise SystemExit("provide --download or both --archive and --xsd")
    if args.download and (args.archive is not None or args.xsd is not None):
        raise SystemExit("--download cannot be combined with local paths")

    with tempfile.TemporaryDirectory(prefix="kati-taxoffence-probe-") as temporary:
        root = Path(temporary)
        archive_path = args.archive
        xsd_path = args.xsd
        if args.download:
            archive_path = root / "taxoffence.zip"
            xsd_path = root / "taxoffence.xsd"
            archive_bytes = download(ARCHIVE_URL, archive_path)
            xsd_bytes = download(XSD_URL, xsd_path)
        else:
            assert archive_path is not None and xsd_path is not None
            if not archive_path.is_file() or not xsd_path.is_file():
                raise SystemExit("local_probe_input_not_found")
            archive_bytes = archive_path.stat().st_size
            xsd_bytes = xsd_path.stat().st_size

        xsd_report = validate_xsd(xsd_path)
        archive_report = validate_archive(archive_path)
        report = {
            "dataset_id": DATASET_ID,
            "archive_url": ARCHIVE_URL,
            "xsd_url": XSD_URL,
            "archive_bytes": archive_bytes,
            "archive_sha256": sha256_file(archive_path),
            "xsd_bytes": xsd_bytes,
            "xsd_sha256": sha256_file(xsd_path),
            "xsd": xsd_report,
            "archive": archive_report,
            "network_scope": "official_fns_urls_only",
            "db_writes": False,
            "production_import": False,
            "substantive_use_allowed": False,
        }
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
