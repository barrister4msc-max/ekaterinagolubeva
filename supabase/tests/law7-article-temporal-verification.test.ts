import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260818173000_law7_article_temporal_verifications.sql",
  "utf8",
);

describe("Law7 per-version temporal verification gate", () => {
  test("verification is scoped to article, version row, text hash and effective interval", () => {
    expect(migration).toContain("law7_mirror.temporal_verifications");
    expect(migration).toContain("code_id text not null");
    expect(migration).toContain("article_number text not null");
    expect(migration).toContain("version_date date not null");
    expect(migration).toContain("verified_text_hash text not null");
    expect(migration).toContain("effective_from date not null");
    expect(migration).toContain("effective_to date");
    expect(migration).toContain("tv.verified_text_hash = v.text_hash");
    expect(migration).toContain("tv.effective_from <= p_as_of_date");
  });

  test("historical unlock no longer depends on broad sync_state metadata", () => {
    const getArticle = migration.slice(
      migration.indexOf("create or replace function public.law7_mirror_get_article_version"),
      migration.indexOf("create or replace function public.law7_mirror_trace_amendment_history"),
    );
    const history = migration.slice(
      migration.indexOf("create or replace function public.law7_mirror_trace_amendment_history"),
    );

    expect(getArticle).not.toContain("from law7_mirror.sync_state");
    expect(getArticle).not.toContain("metadata ->> 'historical_coverage'");
    expect(history).not.toContain("from law7_mirror.sync_state");
    expect(history).not.toContain("metadata ->> 'historical_coverage'");
  });

  test("only explicit verified records can unlock date-specific lookup/history", () => {
    expect(migration).toContain("tv.status = 'verified'");
    expect(migration).toContain("verified_at is not null");
    expect(migration).toContain("official_document_number text not null");
    expect(migration).toContain("official_document_date date not null");
    expect(migration).toContain("official_publication_url text not null");
    expect(migration).toContain("official_provider in ('pravo', 'kremlin')");
  });

  test("verification records are private and service-role controlled", () => {
    expect(migration).toContain(
      "revoke all on law7_mirror.temporal_verifications from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on law7_mirror.temporal_verifications to service_role",
    );
  });

  test("migration does not seed or auto-verify any legal document", () => {
    expect(migration).not.toContain("163-ФЗ");
    expect(migration).not.toContain("54.1");
    expect(migration).not.toContain("insert into law7_mirror.temporal_verifications");
  });
});
