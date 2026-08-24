from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "20260823090000_fns_open_data_taxoffence_company_facts.sql"
SQL = MIGRATION.read_text(encoding="utf-8")


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    check("create table if not exists fns_open_data.company_tax_offences" in SQL, "private factual table missing")
    check("7707329152-taxoffence" in SQL, "dataset identity missing")
    check("fns_taxoffence_source_url_official" in SQL, "official URL guard missing")
    check("fns_taxoffence_source_sha256" in SQL, "provenance hash guard missing")
    check("grant select, insert, update, delete on fns_open_data.company_tax_offences to service_role" in SQL, "service-role grant missing")
    check("revoke all on fns_open_data.company_tax_offences from public, anon, authenticated" in SQL, "public revoke missing")
    check("create or replace function public.fns_open_data_get_tax_offences" in SQL, "lookup RPC missing")
    check("revoke all on function public.fns_open_data_get_tax_offences(text, date) from public, anon, authenticated" in SQL, "RPC revoke missing")
    check("grant execute on function public.fns_open_data_get_tax_offences(text, date) to service_role" in SQL, "RPC service-role grant missing")
    check("factual_only=true" in SQL and "legal_authority=false" in SQL, "factual-only boundary missing")
    print("10 pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
