import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  testsDirectory,
  "../migrations/20260815093501_rename_tax_court_flagship_title.sql",
);

describe("tax court flagship title migration", () => {
  test("guards the exact flagship code and rank before updating", async () => {
    const sql = await Bun.file(migrationPath).text();
    const guardEnd = sql.indexOf("$guard$;");
    const updateStart = sql.indexOf("UPDATE public.legal_document_templates");

    expect(guardEnd).toBeGreaterThan(-1);
    expect(updateStart).toBeGreaterThan(guardEnd);
    expect(sql).toContain("code = 'tax_court_position'");
    expect(sql).toContain("metadata ->> 'flagship_rank' = '5'");
    expect(sql).toContain("Позиция для суда по налоговым спорам");
  });

  test("changes only the canonical registry title", async () => {
    const sql = await Bun.file(migrationPath).text();

    expect(sql).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bINSERT\b/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.document_templates\b/i);
    expect(sql).not.toMatch(/\bis_active\s*=/i);
    expect(sql).not.toMatch(/metadata\s*=/i);
  });
});
