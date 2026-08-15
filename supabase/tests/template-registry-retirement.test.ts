import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  testsDirectory,
  "../migrations/20260815124500_retire_additional_control_objections.sql",
);

describe("template registry retirement", () => {
  test("hides the additional-control card without deleting historical sessions", async () => {
    const sql = await Bun.file(migrationPath).text();
    expect(sql).toContain("WHERE code = 'tax_additional_control_objections'");
    expect(sql).toContain("is_active = false");
    expect(sql).toContain("'replacement_code', 'tax_audit_objections_extended'");
    expect(sql).not.toMatch(/\bDELETE\b|\bTRUNCATE\b/i);
  });

  test("keeps the reviewed expanded objections card active", async () => {
    const sql = await Bun.file(migrationPath).text();
    expect(sql).toContain("WHERE code = 'tax_audit_objections_extended'");
    expect(sql).toContain("'template_variant', 'expanded_audit_objections'");
    expect(sql).toContain("'reviewed', true");
  });
});
