import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTemplateMigrationFixture } from "./migration-state.ts";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(testsDirectory, "../migrations_legacy");
const migrationFile = "20260809200000_t0c_flagship_template_metadata.sql";
const migrationPath = join(migrationsDirectory, migrationFile);

const flagships = [
  {
    code: "response_to_tax_request",
    title: "Ответ на требование налогового органа",
    rank: 1,
  },
  {
    code: "tax_explanations",
    title: "Пояснения в налоговый орган",
    rank: 2,
  },
  {
    code: "tax_vat_explanations",
    title: "Пояснения по НДС",
    rank: 3,
  },
  {
    code: "tax_strategy_memo",
    title: "Меморандум по налоговой стратегии",
    rank: 4,
  },
  {
    code: "tax_court_position",
    title: "Позиция в суд",
    rank: 5,
  },
] as const;

async function readMigration(): Promise<string> {
  return (await Bun.file(migrationPath).text()).replace(/\r\n/g, "\n");
}

describe("T0-C flagship template metadata migration", () => {
  test("guards all five exact codes before the update", async () => {
    const sql = await readMigration();
    const guardEnd = sql.indexOf("$guard$;");
    const updateStart = sql.indexOf("UPDATE public.legal_document_templates AS template");

    expect(guardEnd).toBeGreaterThan(-1);
    expect(updateStart).toBeGreaterThan(guardEnd);
    expect(sql).toContain("IF matched_count <> 5 THEN");
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("END;\n$guard$;");

    const guard = sql.slice(0, guardEnd);
    for (const { code, rank } of flagships) {
      expect(guard).toContain(`('${code}', ${rank})`);
    }
  });

  test("uses the approved titles and exact ranks for sort order", async () => {
    const sql = await readMigration();
    for (const { code, title, rank } of flagships) {
      expect(sql).toContain(`('${code}', '${title}', ${rank})`);
    }
    expect(sql).toContain("sort_order = flagship.flagship_rank");
  });

  test("merges flagship metadata without replacing existing keys", async () => {
    const sql = await readMigration();
    expect(sql).toContain("COALESCE(template.metadata, '{}'::jsonb) || jsonb_build_object(");
    expect(sql).toContain("'flagship', true");
    expect(sql).toContain("'flagship_rank', flagship.flagship_rank");
    expect(sql).not.toMatch(/metadata\s*=\s*jsonb_build_object/i);
  });

  test("is limited to the canonical registry and makes no destructive changes", async () => {
    const sql = await readMigration();
    expect(sql).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bINSERT\b/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.document_templates\b/i);
    expect(sql).not.toMatch(/\bis_active\s*=/i);
  });

  test("preserves the T0-B template totals and active count", async () => {
    const state = await buildTemplateMigrationFixture(migrationsDirectory, migrationFile);
    expect(state.size).toBe(197);
    expect([...state.values()].filter((entry) => entry.is_active)).toHaveLength(194);
  });
});
