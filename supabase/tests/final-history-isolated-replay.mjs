// CI-only, disposable local Supabase verification. No remote credentials or
// Production data are read. The source of truth for the second pass is the
// *stored statements array* produced by the first, successful CLI replay.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import pg from "pg";

const root = resolve(import.meta.dirname, "../..");
const localUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const productionTip = "20261028163542";
const baselineVersion = "20260815083345";
const { Client } = pg;

function cli(args, cwd) {
  const result = spawnSync("supabase", args, { cwd, encoding: "utf8", timeout: 900_000 });
  if (result.status !== 0) {
    throw new Error(`supabase ${args.join(" ")} failed: ${(result.stderr || result.stdout || result.error?.message || "").slice(-2500)}`);
  }
}

async function connect() {
  const client = new Client({ connectionString: localUrl });
  await client.connect();
  return client;
}

async function fingerprint(db) {
  const refTables = [
    "public.document_templates",
    "public.legal_document_templates",
    "public.document_intake_schemas",
    "public.legal_research_sources",
    "storage.buckets",
  ];
  const refs = {};
  for (const table of refTables) {
    // Only constant repository-owned rows: omit generated IDs/timestamps.
    const result = await db.query(`
      SELECT count(*)::int AS n,
        md5(coalesce(string_agg(normalized::text, '|' ORDER BY normalized::text), '')) AS digest
      FROM (SELECT to_jsonb(t) - 'id' - 'created_at' - 'updated_at' AS normalized FROM ${table} t) s
    `);
    refs[table] = result.rows[0];
  }
  const catalog = await db.query(`
    SELECT jsonb_build_object(
      'columns', (SELECT jsonb_agg(jsonb_build_array(table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default)
        ORDER BY table_schema,table_name,ordinal_position)
        FROM information_schema.columns WHERE table_schema IN ('public','private','law7_mirror')),
      'policies', (SELECT jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check)
        ORDER BY schemaname,tablename,policyname)
        FROM pg_policies WHERE schemaname IN ('public','private','law7_mirror')),
      'functions', (SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef)
        ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','private','law7_mirror')),
      'role', (SELECT jsonb_build_array(rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls)
        FROM pg_roles WHERE rolname='kati_internal_kb_writer'),
      'writer_select', has_table_privilege('kati_internal_kb_writer','public.legal_knowledge_chunks','SELECT'),
      'writer_insert', has_table_privilege('kati_internal_kb_writer','public.legal_knowledge_chunks','INSERT')
    ) AS result
  `);
  const counts = {};
  for (const table of ["public.documents", "public.legal_knowledge_chunks", "public.legal_law_chunks"]) {
    counts[table] = Number((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
  }
  return { refs, catalog: catalog.rows[0].result, counts };
}

async function main() {
  const sourceFiles = readdirSync(join(root, "supabase/migrations"))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
  const sourceVersions = sourceFiles.map((name) => name.slice(0, 14));
  if (new Set(sourceVersions).size !== sourceVersions.length) throw new Error("Duplicate source version");
  let db = await connect();
  const stored = (await db.query("SELECT version,name,statements FROM supabase_migrations.schema_migrations ORDER BY version")).rows;
  if (stored.length !== sourceVersions.length || stored.some((row, i) => row.version !== sourceVersions[i])) {
    throw new Error(`Stored history/source order differs: ${stored.length}/${sourceVersions.length}`);
  }
  if (stored.some((row) => !Array.isArray(row.statements) || !row.statements.length)) {
    throw new Error("Some stored migrations have no replayable statements");
  }
  const prefix = stored.filter((row) => row.version <= productionTip);
  if (prefix.length !== 78 || prefix.at(-1)?.version !== productionTip) {
    throw new Error(`Unexpected Production-prefix candidate: ${prefix.length} rows`);
  }
  // Digest-only manifest: compare the candidate against the privately held
  // Production backup without publishing full historic SQL or user data.
  const statementHash = (statements) => createHash("sha256")
    .update(JSON.stringify(statements)).digest("hex");
  console.log(`CANDIDATE_PREFIX_MANIFEST=${JSON.stringify(prefix.map((row) => ({
    version: row.version, name: row.name, count: row.statements.length,
    sha256: statementHash(row.statements),
  })))}`);
  const baseline = stored.find((row) => row.version === baselineVersion);
  const baselineSql = baseline?.statements.join("\n") || "";
  for (const text of ["CREATE ROLE kati_internal_kb_writer", "INSERT INTO public.legal_document_templates", "INSERT INTO storage.buckets"]) {
    if (!baselineSql.includes(text)) throw new Error(`Baseline omitted ${text}`);
  }
  if (!stored.some((row) => row.version > baselineVersion && row.statements.some((sql) => /UPDATE public\.legal_document_templates/i.test(sql)))) {
    throw new Error("Post-baseline reference-data updates were dropped");
  }
  const expected = await fingerprint(db);
  if (expected.refs["public.legal_document_templates"].n < 100 || expected.refs["storage.buckets"].n === 0) {
    throw new Error("Reference data missing in source replay");
  }
  if (Object.values(expected.counts).some((n) => n !== 0)) {
    throw new Error("Source replay unexpectedly contains case documents or unverified legal corpus");
  }
  await db.end();
  db = null;

  // Stop the first disposable stack and boot another with NO migrations and NO
  // roles.sql. This proves stored history alone, not CLI source files or hooks.
  cli(["stop", "--no-backup"], root);
  const isolated = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "kati-final-history-"));
  mkdirSync(join(isolated, "supabase/migrations"), { recursive: true });
  writeFileSync(join(isolated, "supabase/config.toml"), `project_id = "kati_history_${process.env.GITHUB_RUN_ID || Date.now()}"\n`);
  let started = false;
  try {
    cli(["start"], isolated);
    started = true;
    db = await connect();
    const existingHistory = (await db.query("SELECT to_regclass('supabase_migrations.schema_migrations') AS name")).rows[0].name;
    if (existingHistory !== null) throw new Error("Isolated database unexpectedly has migration history");
    // CLI creates this metadata table only when it applies a file. We must not
    // apply any source file to the second database, so model just its columns.
    await db.query(`
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations (
        version text PRIMARY KEY, name text, statements text[] NOT NULL
      );
    `);
    for (const [i, migration] of stored.entries()) {
      try {
        for (const sql of migration.statements) await db.query(sql);
        await db.query(
          "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ($1,$2,$3)",
          [migration.version, migration.name, migration.statements],
        );
      } catch (error) {
        throw new Error(`Stored replay failed at ${i + 1}/${stored.length} (${migration.version}): ${error.message}`);
      }
      if (migration.version === productionTip) {
        const atProductionTip = await fingerprint(db);
        if (atProductionTip.refs["public.legal_document_templates"].n < 100 || atProductionTip.refs["storage.buckets"].n === 0) {
          throw new Error("78-row candidate lost baseline reference data");
        }
        if (Object.values(atProductionTip.counts).some((n) => n !== 0)) {
          throw new Error("78-row candidate unexpectedly copied user documents or legal corpus");
        }
      }
    }
    const actual = await fingerprint(db);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Stored replay drift: ${JSON.stringify({ expected: expected.refs, actual: actual.refs, expectedCounts: expected.counts, actualCounts: actual.counts })}`);
    }
    const replayed = (await db.query("SELECT version,statements FROM supabase_migrations.schema_migrations ORDER BY version")).rows;
    const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    if (digest(replayed.map((r) => [r.version, r.statements])) !== digest(stored.map((r) => [r.version, r.statements]))) {
      throw new Error("Replayed migration metadata differs from candidate statements");
    }
    console.log(`PASS: ${prefix.length} Production-prefix rows plus ${stored.length - prefix.length} pending rows; stored statements replayed on a clean isolated Supabase; reference data, schema, policies, roles and safe empty corpus match. Candidate SHA-256: ${digest(stored.map((r) => [r.version, r.statements]))}`);
  } finally {
    if (db) await db.end();
    if (started) cli(["stop", "--no-backup"], isolated);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
