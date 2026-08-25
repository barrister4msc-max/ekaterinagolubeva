import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const HARDENING_MIGRATION = "20260825220000_fns_factual_storage_rls_hardening.sql";
const hardening = readFileSync(`supabase/migrations/${HARDENING_MIGRATION}`, "utf8");

const factualTables = [
  "sync_state",
  "company_tax_regimes",
  "company_tax_debts",
  "company_financial_statements",
  "company_average_headcount",
  "company_tax_offences",
] as const;

describe("FNS factual storage RLS contract", () => {
  test("hardens every current factual relation without public policies", () => {
    for (const table of factualTables) {
      expect(hardening).toContain(`array['fns_open_data', '${table}']`);
      expect(hardening).toContain("enable row level security");
      expect(hardening).toContain("revoke all on table");
      expect(hardening).toContain("grant select, insert, update, delete on table");
    }

    expect(hardening.toLowerCase()).not.toContain("create policy");
    expect(hardening.toLowerCase()).not.toContain("grant select on table");
  });

  test("future fns_open_data company tables cannot bypass the hardening list", () => {
    const migrationFiles = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql"));
    const discovered = new Set<string>();

    for (const file of migrationFiles) {
      const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
      for (const match of sql.matchAll(/create table(?: if not exists)? fns_open_data\\.(company_[a-z0-9_]+)/gi)) {
        discovered.add(match[1]);
      }
    }

    for (const table of discovered) {
      expect(hardening).toContain(`array['fns_open_data', '${table}']`);
    }
  });
});
