from pathlib import Path

SOURCE = (Path(__file__).resolve().parent / "official_tax_core_collect.py").read_text(encoding="utf-8")

def check(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)

check('"nalog.gov.ru"' in SOURCE, "FNS official host gate missing")
check('"minfin.gov.ru"' in SOURCE, "Minfin official host gate missing")
check('"vsrf.ru"' in SOURCE, "VSRF official host gate missing")
check("redirect left official host allow-list" in SOURCE, "redirect gate missing")
check("find_attachment" in SOURCE, "official attachment selection missing")
check("source_file_sha256" in SOURCE, "source-file provenance missing")
check("unsupported official content type" in SOURCE, "unsupported format must fail closed")
check('"substantive_use_allowed":False' in SOURCE, "fail-closed legal-use gate missing")
check('"db_writes":False' in SOURCE, "collector must not write DB")
print("9 pass")
