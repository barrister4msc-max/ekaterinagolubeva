import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260909120000_law7_mirror_rls_hardening.sql",
  "utf8",
);

const tables = [
  "codes",
  "article_versions",
  "amendments",
  "sync_state",
  "temporal_verifications",
] as const;

describe("Law7 mirror RLS hardening", () => {
  test("retains the private service-role-only boundary", () => {
    expect(migration).toContain(
      "revoke all on schema law7_mirror from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke all on all tables in schema law7_mirror from public, anon, authenticated;",
    );
    expect(migration).toContain("grant usage on schema law7_mirror to service_role;");
    expect(migration).toContain(
      "grant select, insert, update, delete on all tables in schema law7_mirror to service_role;",
    );
  });

  test("enables RLS on every physical mirror table", () => {
    for (const table of tables) {
      expect(migration).toContain(
        `alter table law7_mirror.${table} enable row level security;`,
      );
    }
  });

  test("permits only service_role through explicit all-operation policies", () => {
    for (const table of tables) {
      expect(migration).toContain(
        `on law7_mirror.${table} for all to service_role\n  using (true) with check (true);`,
      );
    }
    expect(migration).not.toContain("for all to anon");
    expect(migration).not.toContain("for all to authenticated");
    expect(migration).not.toContain("force row level security");
  });
});
