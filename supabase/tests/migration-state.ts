import { readdir } from "node:fs/promises";
import { join } from "node:path";

export type TemplateMigrationFixtureEntry = {
  code: string;
  is_active: boolean;
};

function insertedTemplateCodes(sql: string): string[] {
  const codes: string[] = [];
  const insertPattern =
    /INSERT\s+INTO\s+public\.legal_document_templates\b[\s\S]*?\bVALUES\b([\s\S]*?)(?:ON\s+CONFLICT\s*\(code\)\s+DO\s+NOTHING\s*)?;/gi;
  for (const insert of sql.matchAll(insertPattern)) {
    const values = insert[1];
    for (const tuple of values.matchAll(/^\s*\('((?:''|[^'])+)'/gm)) {
      codes.push(tuple[1].replaceAll("''", "'"));
    }
  }
  return codes;
}

function deactivatedTemplateCodes(sql: string): string[] {
  const update = sql.match(
    /UPDATE\s+public\.legal_document_templates\s+SET[\s\S]*?is_active\s*=\s*false[\s\S]*?WHERE\s+code\s+IN\s*\(([^;]+)\)\s*;/i,
  );
  if (!update) return [];
  return [...update[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export async function buildTemplateMigrationFixture(
  migrationsDirectory: string,
  targetMigrationFile: string,
): Promise<Map<string, TemplateMigrationFixtureEntry>> {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql") && file <= targetMigrationFile)
    .sort();
  const state = new Map<string, TemplateMigrationFixtureEntry>();

  for (const file of files) {
    const sql = await Bun.file(join(migrationsDirectory, file)).text();
    for (const code of insertedTemplateCodes(sql)) {
      if (!state.has(code)) state.set(code, { code, is_active: true });
    }
    for (const code of deactivatedTemplateCodes(sql)) {
      const entry = state.get(code);
      if (entry) entry.is_active = false;
    }
  }

  return state;
}

export function extractInsertedTemplateCodes(sql: string): string[] {
  return insertedTemplateCodes(sql);
}
