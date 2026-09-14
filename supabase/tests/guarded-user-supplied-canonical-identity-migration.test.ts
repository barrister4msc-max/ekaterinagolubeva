import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  import.meta.dir,
  "../migrations/20260914160000_guarded_user_supplied_canonical_identity.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("guarded user-supplied canonical identity migration", () => {
  test("maps exactly the five audited source groups and 171 chunks", () => {
    expect(sql).toContain("expected_group_count constant integer := 5");
    expect(sql).toContain("expected_chunk_count constant integer := 171");
    for (const sourceGroupId of [
      "d6b6bfb9-6a2a-52eb-9f59-5a9260db0a0c",
      "16887b7d-3714-52bd-8138-491a10a22043",
      "5a12d4f2-9b84-545e-be36-c1b63138a73f",
      "8377b26c-aaff-5300-a769-838148e43cf3",
      "ef0d1258-a1b2-5c30-9adf-ca1ed52c8031",
    ]) expect(sql).toContain(sourceGroupId);
  });

  test("uses a separate scoped canonical key and preserves the fail-closed state", () => {
    expect(sql).toContain("legal_source_registry_guarded_user_identity_key");
    expect(sql).toContain("canonical_identity_scope', 'guarded_user_supplied_v1'");
    expect(sql).toContain("'official_origin_verified', false");
    expect(sql).toContain("'content_verified', false");
    expect(sql).toContain("'temporal_verified', false");
    expect(sql).toContain("'substantive_use_allowed', false");
    expect(sql).toContain("'freshness_status', 'verification_unavailable'");
    expect(sql).not.toMatch(/'substantive_use_allowed',\s*true/i);
  });

  test("changes only knowledge-chunk linkage metadata, not embeddings or law chunks", () => {
    expect(sql).toContain("update public.legal_knowledge_chunks chunks");
    expect(sql).not.toMatch(/update\s+public\.legal_law_chunks/i);
    expect(sql).not.toMatch(/embedding\s*=/i);
    expect(sql).not.toMatch(/use_in_generation\s*=/i);
  });
});
