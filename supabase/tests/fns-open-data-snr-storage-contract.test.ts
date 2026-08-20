import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dir, "../migrations/20260820173000_fns_open_data_snr_company_facts.sql"),
  "utf8",
);

describe("FNS Open Data SNR storage contract", () => {
  it("uses a private service-role-only schema and seeds no real data", () => {
    expect(sql).toContain("create schema if not exists fns_open_data");
    expect(sql).toContain("revoke all on schema fns_open_data from public, anon, authenticated");
    expect(sql).toContain("grant usage on schema fns_open_data to service_role");
    expect(sql).toContain("revoke all on all tables in schema fns_open_data from public, anon, authenticated");
    expect(sql).not.toMatch(/insert\s+into\s+fns_open_data\.company_tax_regimes/i);
  });

  it("pins SNR identity and immutable provenance", () => {
    expect(sql).toContain("dataset_id = '7707329152-snr'");
    expect(sql).toContain("source_sha256 ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("source_url like 'https://%'");
    expect(sql).toContain("inn ~ '^[0-9]{10}$'");
  });

  it("exposes only bounded service-role RPCs", () => {
    expect(sql).toContain("public.fns_open_data_snr_is_available()");
    expect(sql).toContain("public.fns_open_data_get_tax_regime(");
    expect(sql).toContain("grant execute on function public.fns_open_data_snr_is_available() to service_role");
    expect(sql).toContain("grant execute on function public.fns_open_data_get_tax_regime(text, date) to service_role");
    expect(sql).toContain("limit 1");
  });

  it("does not create or mutate the canonical legal source registry", () => {
    expect(sql).not.toMatch(/create\s+table\s+.*legal_source_registry/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.legal_source_registry/i);
    expect(sql).not.toMatch(/update\s+public\.legal_source_registry/i);
  });
});
