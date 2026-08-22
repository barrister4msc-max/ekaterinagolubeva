import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dir, "../migrations/20260820214000_fns_open_data_debtam_company_facts.sql"),
  "utf8",
);

describe("FNS Open Data DEBTAM storage contract", () => {
  it("preserves one-to-many point-in-time debt rows without real seed data", () => {
    expect(sql).toContain("create table if not exists fns_open_data.company_tax_debts");
    expect(sql).toContain("debt_row_ordinal integer not null");
    expect(sql).toContain("primary key (dataset_id, data_as_of, document_id, debt_row_ordinal)");
    expect(sql).toContain("dataset_id = '7707329152-debtam'");
    expect(sql).not.toMatch(/insert\s+into\s+fns_open_data\.company_tax_debts/i);
  });

  it("stores exact decimal components and official provenance only", () => {
    for (const field of ["tax_debt_amount", "penalty_amount", "fine_amount", "total_debt_amount"]) {
      expect(sql).toContain(`${field} numeric(20,2) not null`);
    }
    expect(sql).toContain("source_sha256 ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("file\\.nalog\\.ru");
    expect(sql).toContain("inn ~ '^[0-9]{10}$'");
  });

  it("keeps RPCs service-role-only and returns all rows at latest eligible observation date", () => {
    expect(sql).toContain("public.fns_open_data_debtam_is_available()");
    expect(sql).toContain("public.fns_open_data_get_tax_debts(");
    expect(sql.match(/set search_path = pg_catalog/g)?.length).toBe(2);
    expect(sql).toContain("select max(d.data_as_of) as data_as_of");
    expect(sql).toContain("join latest l on l.data_as_of = d.data_as_of");
    expect(sql).toContain("order by d.debt_row_ordinal, d.tax_name");
    expect(sql).toContain("grant execute on function public.fns_open_data_get_tax_debts(text, date) to service_role");
  });

  it("does not promote DEBTAM into legal-source storage", () => {
    expect(sql).not.toMatch(/legal_source_registry/i);
    expect(sql).not.toMatch(/trusted_sources/i);
    expect(sql).not.toMatch(/rawsource/i);
  });
});
