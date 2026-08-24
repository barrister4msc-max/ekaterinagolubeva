import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dir, "../migrations/20260821001000_fns_open_data_debtam_text_rpc.sql"),
  "utf8",
);

describe("FNS DEBTAM runtime RPC contract", () => {
  it("returns monetary values as text and keeps latest-observation semantics", () => {
    expect(sql).toContain("public.fns_open_data_get_tax_debts_text(");
    expect(sql).toContain("tax_debt_amount text");
    expect(sql).toContain("penalty_amount text");
    expect(sql).toContain("fine_amount text");
    expect(sql).toContain("total_debt_amount text");
    expect(sql).toContain("d.tax_debt_amount::text");
    expect(sql).toContain("select max(d.data_as_of) as data_as_of");
    expect(sql).toContain("order by d.debt_row_ordinal, d.tax_name");
  });

  it("is service-role-only with hardened search_path", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = pg_catalog");
    expect(sql).toContain("revoke all on function public.fns_open_data_get_tax_debts_text(text, date) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.fns_open_data_get_tax_debts_text(text, date) to service_role");
  });

  it("does not touch the legal source registry", () => {
    expect(sql).not.toMatch(/legal_source_registry/i);
    expect(sql).not.toMatch(/trusted_sources/i);
  });
});
