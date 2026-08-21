import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dir, "../migrations/20260821103000_fns_open_data_revexp_company_facts.sql"),
  "utf8",
);

describe("FNS REVEXP private storage contract", () => {
  test("stores exact statement fields with numeric money and structured identity", () => {
    expect(sql).toContain("fns_open_data.company_financial_statements");
    expect(sql).toContain("income_amount numeric(20,2) not null");
    expect(sql).toContain("expense_amount numeric(20,2) not null");
    expect(sql).toContain("reporting_date date not null");
    expect(sql).toContain("primary key (dataset_id, reporting_date, document_id)");
    expect(sql).not.toContain("turnover");
    expect(sql).not.toContain("taxable_income");
  });

  test("returns decimal values as text at JS boundary", () => {
    expect(sql).toContain("fns_open_data_get_financial_statement_text");
    expect(sql).toContain("s.income_amount::text");
    expect(sql).toContain("s.expense_amount::text");
  });

  test("is service-role only and factual-only by contract", () => {
    expect(sql).toContain("revoke all on fns_open_data.company_financial_statements from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.fns_open_data_get_financial_statement_text(text, date) to service_role");
    expect(sql).toContain("legal_authority=false");
    expect(sql).toContain("substantive_use_allowed=false");
  });

  test("extends sync state only to the verified factual datasets", () => {
    expect(sql).toContain("'7707329152-snr', '7707329152-debtam', '7707329152-revexp'");
  });
});
