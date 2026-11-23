import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(
  resolve(import.meta.dir, "../migrations/20260914160000_guarded_user_supplied_canonical_identity.sql"),
  "utf8",
);

async function isolatedDatabase() {
  const db = new PGlite();
  await db.exec(`
    create table public.legal_source_registry (
      id uuid primary key,
      metadata jsonb not null default '{}'::jsonb
    );
    create table public.legal_knowledge_chunks (
      id uuid primary key,
      is_active boolean not null default true,
      metadata jsonb not null default '{}'::jsonb
    );
  `);
  return db;
}

describe("guarded source migration on an isolated Preview", () => {
  test("empty source set retains only the identity index", async () => {
    const db = await isolatedDatabase();
    try {
      await db.exec(sql);
      const index = await db.query<{ indexname: string }>(
        "select indexname from pg_indexes where schemaname='public' and indexname='legal_source_registry_guarded_user_identity_key'",
      );
      const heads = await db.query<{ count: number }>(
        "select count(*)::integer as count from public.legal_source_registry",
      );
      expect(index.rows).toHaveLength(1);
      expect(heads.rows[0].count).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("one guarded chunk is a partial set, not an empty Preview", async () => {
    const db = await isolatedDatabase();
    try {
      await db.query(
        "insert into public.legal_knowledge_chunks (id, metadata) values ($1, $2)",
        [
          "10000000-0000-4000-8000-000000000001",
          {
            source_group_id: "d6b6bfb9-6a2a-52eb-9f59-5a9260db0a0c",
            source_class: "user_supplied_retrieval_snapshot",
          },
        ],
      );
      await expect(db.exec(sql)).rejects.toThrow(/expected 5 groups \/ 171 chunks, got 1 \/ 1/);
      const heads = await db.query<{ count: number }>(
        "select count(*)::integer as count from public.legal_source_registry",
      );
      expect(heads.rows[0].count).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("orphaned guarded registry head cannot be treated as empty", async () => {
    const db = await isolatedDatabase();
    try {
      await db.query(
        "insert into public.legal_source_registry (id, metadata) values ($1, $2)",
        [
          "20000000-0000-4000-8000-000000000001",
          { canonical_identity_scope: "guarded_user_supplied_v1", canonical_document_key: "orphan" },
        ],
      );
      await expect(db.exec(sql)).rejects.toThrow(/orphaned registry heads/);
    } finally {
      await db.close();
    }
  });
});
