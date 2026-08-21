import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dir, "../migrations/20260821190000_fns_open_data_sshr2019_company_facts.sql"),
  "utf8",
);

describe("FNS SSHR2019 private storage contract", () => {
  test("stores literal average-headcount semantics and preserves zero", () => {
    expect(sql).toContain("fns_open_data.company_average_headcount");
    expect(sql).toContain("average_headcount bigint not null");
    expect(sql).toContain("fns_sshr2019_headcount_nonnegative check (average_headcount >= 0)");
    expect(sql).toContain("reporting_date date not null");
    expect(sql).toContain("primary key (dataset_id, reporting_date, document_id)");
    expect(sql).not.toMatch(/\b(current_employees|employees|fte|payroll)\s+(bigint|integer|numeric|text)/i);
  });

  test("lookup returns latest eligible reporting date without inventing current state", () => {
    expect(sql).toContain("fns_open_data_get_average_headcount");
    expect(sql).toContain("select max(s.reporting_date) as reporting_date");
    expect(sql).toContain("p_as_of_date is null or s.reporting_date <= p_as_of_date");
    expect(sql).toContain("s.average_headcount");
  });

  test("is service-role only and factual-only by contract", () => {
    expect(sql).toContain("revoke all on fns_open_data.company_average_headcount from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.fns_open_data_get_average_headcount(text, date) to service_role");
    expect(sql).toContain("legal_authority=false");
    expect(sql).toContain("substantive_use_allowed=false");
  });

  test("extends sync state only by the verified SSHR2019 dataset", () => {
    expect(sql).toContain("'7707329152-snr', '7707329152-debtam', '7707329152-revexp', '7707329152-sshr2019'");
  });
});
