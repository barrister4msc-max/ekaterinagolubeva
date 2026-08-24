from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "fns_open_data_taxoffence_import_manifest.py"
SOURCE = SCRIPT.read_text(encoding="utf-8")


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    check("from fns_open_data_taxoffence_dry_run import ARCHIVE_SHA256, parse_zip" in SOURCE, "existing parser is not reused")
    check("archive_sha256_mismatch" in SOURCE, "archive hash gate missing")
    check("duplicate_import_key" in SOURCE, "idempotency key validation missing")
    check('"db_writes": False' in SOURCE, "read-only output boundary missing")
    check('"import_status": "prepared_not_applied"' in SOURCE, "non-applied status missing")
    check("source_sha256" in SOURCE, "row provenance missing")
    check("args.output.parent.mkdir" in SOURCE, "output directory handling missing")
    print("7 pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
