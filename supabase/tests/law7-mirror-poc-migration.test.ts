import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  import.meta.dir,
  "../migrations/20260818133000_law7_mirror_poc.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("Law7 mirror PoC migration safety", () => {
  test("creates a technical mirror without replacing canonical KATI registries", () => {
    expect(sql).toContain("create schema if not exists law7_mirror");
    expect(sql).toContain("law7_mirror.codes");
    expect(sql).toContain("law7_mirror.article_versions");
    expect(sql).toContain("law7_mirror.amendments");
    expect(sql).toContain("law7_mirror.sync_state");
    expect(sql).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.legal_source_registry/i);
    expect(sql).not.toMatch(/drop\s+table\s+(?:if\s+exists\s+)?public\.legal_source_registry/i);
  });

  test("keeps mirror data and RPC execution service-role only", () => {
    expect(sql).toContain("revoke all on schema law7_mirror from public, anon, authenticated");
    expect(sql).toContain("grant usage on schema law7_mirror to service_role");
    expect(sql).toContain("revoke all on all tables in schema law7_mirror from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on all tables in schema law7_mirror to service_role");
    expect(sql).toContain("grant execute on function public.law7_mirror_is_available() to service_role");
    expect(sql).toContain("grant execute on function public.law7_mirror_get_article_version(text, text, date) to service_role");
    expect(sql).toContain("grant execute on function public.law7_mirror_trace_amendment_history(text, text, integer) to service_role");
    expect(sql).toContain("grant execute on function public.law7_mirror_query_laws(text, integer) to service_role");
    expect(sql).not.toMatch(/grant\s+execute[\s\S]{0,120}\b(?:anon|authenticated)\b/i);
  });

  test("is fail-closed until a completed non-empty sync exists", () => {
    expect(sql).toContain("where s.status = 'completed'");
    expect(sql).toContain("and s.article_versions_count > 0");
  });

  test("contains no real Law7 article seed data", () => {
    expect(sql).not.toMatch(/insert\s+into\s+law7_mirror\.article_versions/i);
    expect(sql).not.toMatch(/insert\s+into\s+law7_mirror\.amendments/i);
    expect(sql).not.toMatch(/insert\s+into\s+law7_mirror\.codes/i);
  });
});
