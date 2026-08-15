import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  new URL(
    "../migrations_legacy/20260809170000_t0b_allow_deprecated_template_session_restore.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("deprecated template session access policy", () => {
  test("grants only authenticated SELECT access", () => {
    assert.match(
      migration,
      /ON\s+public\.legal_document_templates\s+FOR\s+SELECT\s+TO\s+authenticated/i,
    );
    assert.doesNotMatch(migration, /TO\s+(?:anon|public)\b/i);
  });

  test("requires an RLS-visible saved intake session with the same template code", () => {
    assert.match(
      migration,
      /EXISTS\s*\([\s\S]*FROM\s+public\.document_intake_sessions\s+AS\s+intake_session[\s\S]*intake_session\.template_code\s*=\s*legal_document_templates\.code/i,
    );
  });

  test("does not broaden access based on inactive status alone", () => {
    assert.doesNotMatch(migration, /is_active\s*=\s*false/i);
  });
});
