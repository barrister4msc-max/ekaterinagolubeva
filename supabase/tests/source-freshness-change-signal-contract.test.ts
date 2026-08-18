import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260818203000_source_freshness_change_signal_contract.sql",
  "utf8",
);

describe("PR39 Source Freshness persistence contract", () => {
  test("reuses existing lifecycle tables and does not create a new registry", () => {
    expect(migration).toContain("alter table public.legal_regulatory_monitored_sources");
    expect(migration).toContain("alter table public.legal_regulatory_update_logs");
    expect(migration).toContain("alter table public.legal_regulatory_update_alerts");
    expect(migration).toContain("alter table public.legal_source_verification_logs");
    expect(migration).not.toContain("create table");
    expect(migration).not.toContain("freshness_registry");
  });

  test("canonical identity stays legal_source_registry", () => {
    expect(migration).toContain("source_registry_id uuid");
    expect(migration).toContain("references public.legal_source_registry(id)");
    expect(migration).toContain("registry.official_url = monitored.source_url");
    expect(migration).toContain("not exists");
  });

  test("FreshnessState is not persisted as CHANGED", () => {
    expect(migration).not.toContain("freshness_state");
    expect(migration).not.toContain("'CURRENT', 'RECHECK_DUE', 'CHANGED'");
  });

  test("recheck outcome is typed separately from verification status and fails closed", () => {
    expect(migration).toContain("recheck_outcome");
    expect(migration).toContain("'UNCHANGED', 'SOURCE_CHANGED', 'STATUS_CHANGED', 'UNAVAILABLE', 'UNRESOLVED'");
    expect(migration).toContain("observations are insufficient for a reliable comparison");
    expect(migration).toContain("Separate from verification workflow status");
  });

  test("issue-level position update is a distinct signal", () => {
    expect(migration).toContain("signal_type");
    expect(migration).toContain("'SOURCE_CHANGED', 'STATUS_CHANGED', 'POSITION_UPDATE_AVAILABLE'");
    expect(migration).toContain("research_issue_id");
    expect(migration).toContain("research_issue_text");
  });

  test("migration does not schedule, fetch, reanalyse, or mutate analysis snapshots", () => {
    expect(migration.toLowerCase()).not.toContain("cron.schedule");
    expect(migration.toLowerCase()).not.toContain("http_get");
    expect(migration.toLowerCase()).not.toContain("net.http");
    expect(migration).not.toContain("document_intake_ai_runs set");
    expect(migration).not.toContain("generated_legal_documents set");
  });
});
