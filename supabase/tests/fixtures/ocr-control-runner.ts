// Real control entrypoint, shared worker and SQL; only external SDK/IO doubled.
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createOcrDispatcher } from "../../functions/_shared/ocr-dispatcher.ts";
const db = new PGlite();
const actor = "20000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000002";
const session = "30000000-0000-4000-8000-000000000001",
  doc = "10000000-0000-4000-8000-000000000001";
const secret = "PRIVATE_CONTROL_CANARY",
  token = "offline-dispatch-" + "x".repeat(40);
let enabled = true,
  auth = actor,
  text = "",
  bytes = "source PDF bytes",
  reads = 0,
  parses = 0,
  models = 0;
let loseFinish = false;
let afterDownload: undefined | (() => Promise<void>), handler: (req: Request) => Promise<Response>;
const diagnostics: unknown[] = [];
const output = console.log;
for (const k of ["log", "warn", "error"] as const)
  console[k] = (...args) => {
    diagnostics.push(args);
  };
const q = async (sql: string, args: any[] = []) => (await db.query(sql, args)).rows as any[];
const bindings: Record<string, string[]> = {
  is_admin_or_superadmin: ["_user_id"],
  kati_ocr_document_access: ["p_actor_id", "p_session_id", "p_document_id"],
  kati_control_document_ocr: [
    "p_action",
    "p_actor_id",
    "p_session_id",
    "p_document_id",
    "p_source",
    "p_direct_text",
  ],
  kati_claim_next_reserved_ocr_job: ["p_lease_seconds"],
  kati_guard_reserved_ocr_source: [
    "p_document_id",
    "p_job_id",
    "p_lease_token",
    "p_source",
    "p_bind",
  ],
  kati_reserve_document_ocr_unit: [
    "p_document_id",
    "p_job_id",
    "p_lease_token",
    "p_page_count",
    "p_unit_start",
    "p_unit_end",
  ],
  kati_settle_document_ocr_unit: [
    "p_document_id",
    "p_job_id",
    "p_lease_token",
    "p_unit_start",
    "p_reservation_id",
    "p_text",
    "p_error_code",
  ],
  kati_finish_reserved_document_ocr_wave: [
    "p_document_id",
    "p_job_id",
    "p_lease_token",
    "p_page_count",
  ],
  kati_release_reserved_ocr_job: ["p_document_id", "p_job_id", "p_lease_token", "p_reason"],
};
const sb = {
  auth: {
    getUser: async (token: string) => ({
      data: { user: token === "user" ? { id: auth } : null },
      error: null,
    }),
  },
  from: (table: string) => ({
    select() {
      assert.equal(table, "documents");
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return { data: (await q("select * from documents where id=$1", [doc]))[0], error: null };
    },
  }),
  storage: {
    from: () => ({
      download: async () => {
        reads++;
        if (afterDownload) await afterDownload();
        return { data: new Blob([bytes]), error: null };
      },
    }),
  },
  async rpc(name: string, args: Record<string, unknown>) {
    assert.ok(name in bindings, name);
    if (loseFinish && name === "kati_finish_reserved_document_ocr_wave")
      return { data: null, error: { message: secret } };
    const values = bindings[name].map((k) => args[k] ?? null);
    const data = (
      await q(`select ${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) r`, values)
    )[0].r;
    return { data, error: null };
  },
};
(globalThis as any).testClient = () => sb;
(globalThis as any).testPdfjs = {
  getDocument: () => {
    parses++;
    return {
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: text }] }),
          cleanup() {},
        }),
      }),
      destroy() {},
    };
  },
};
(globalThis as any).Deno = {
  env: {
    get: (name: string) =>
      (
        ({
          KATI_OCR_ENQUEUE_ENABLED: String(enabled),
          KATI_OCR_DISPATCH_ENABLED: String(enabled),
          KATI_OCR_UNIT_RESERVATIONS_ENABLED: String(enabled),
          SUPABASE_URL: "https://offline.test",
          SUPABASE_SERVICE_ROLE_KEY: secret,
          GEMINI_API_KEY: "offline-key",
          KATI_OCR_DISPATCH_TOKEN: token,
        }) as Record<string, string>
      )[name],
  },
  serve: (fn: typeof handler) => {
    handler = fn;
  },
};
const folder = await mkdtemp(join(tmpdir(), "kati-control-"));
let loaded = 0;
const load = async () => {
  let source = await readFile(
    new URL("../../functions/document-ocr-control/index.ts", import.meta.url),
    "utf8",
  );
  source = source
    .replace(
      /import \{ createClient \} from "[^"]+";/,
      "const createClient = globalThis.testClient;",
    )
    .replace(/await import\(\s*"https:[^"]+"\s*\)/g, "await Promise.resolve(globalThis.testPdfjs)")
    .replaceAll('"../_shared/', '"' + new URL("../../functions/_shared/", import.meta.url).href);
  const path = join(folder, `entry-${loaded++}.ts`);
  await writeFile(path, source);
  await import(pathToFileURL(path).href);
};
const invoke = async (
  action = "enqueue",
  extra: Record<string, unknown> = {},
  authorization = "user",
) => {
  const r = await handler(
    new Request("https://offline.test/document-ocr-control", {
      method: "POST",
      headers: { Authorization: "Bearer " + authorization },
      body: JSON.stringify({ action, session_id: session, document_id: doc, ...extra }),
    }),
  );
  const body = await r.json();
  const wire = JSON.stringify(body);
  for (const forbidden of [
    secret,
    "checkpoint",
    "lease_token",
    "storage_path",
    "source_fingerprint",
    "ocr_text",
  ])
    assert.ok(!wire.includes(forbidden), wire);
  return { status: r.status, body };
};
const state = async () =>
  (await q("select * from document_ocr_jobs where document_id=$1", [doc]))[0];
const seed = async () => {
  await db.exec("reset role");
  await db.exec("delete from document_ocr_jobs");
  await db.query("update document_intake_sessions set created_by=$1,archived_at=null where id=$2", [
    actor,
    session,
  ]);
  await db.query(
    "update documents set uploaded_by=$1,is_archived=false,storage_path=$2,ocr_text='',metadata=$3 where id=$4",
    [actor, secret, { intake_session_id: session, manual: "preserve" }, doc],
  );
  await db.query("update test_admins set active=true");
  await db.exec("set role service_role");
  auth = actor;
  bytes = "source PDF bytes";
  text = "";
  afterDownload = undefined;
  reads = 0;
  models = 0;
  parses = 0;
};
const pdf = {
  load: async () => ({ getPageCount: () => 24 }),
  create: async () => ({
    copyPages: async (_source: unknown, pages: number[]) => pages,
    addPage() {},
    save: async () => new Uint8Array([1]),
  }),
};
const dispatcher = createOcrDispatcher({
  enabled: true,
  ready: true,
  token,
  serviceKey: secret,
  client: () => sb,
  wave: {
    pdf,
    extract: async () => {
      models++;
      return { text: "accepted window", debug: {} };
    },
  },
});
const wake = async () =>
  dispatcher(
    new Request("https://offline.test/dispatch-document-ocr", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: "{}",
    }),
  );
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table documents(id uuid primary key,file_name text,mime_type text,storage_path text,ocr_text text,metadata jsonb,
      analysis_status text,review_status text,updated_at timestamptz,is_archived boolean default false,uploaded_by uuid,matter_id uuid,client_id uuid);
    create table document_intake_sessions(id uuid primary key,created_by uuid,archived_at timestamptz,matter_id uuid,client_id uuid);
    create table test_admins(id uuid primary key,active boolean);
    create function is_admin_or_superadmin(_user_id uuid) returns boolean language sql as 'select coalesce((select active from public.test_admins where id=_user_id),false)';
    grant select on test_admins to service_role;grant select,update on document_intake_sessions to service_role;
    grant select,update on documents to service_role;`);
  for (const m of [
    "20260922120000_stage13l2b_durable_ocr_jobs.sql",
    "20260922120554_fix_stage13l2b_lease_counter.sql",
    "20261029151613_e05_ocr_attempt_reservations.sql",
    "20261029190337_e05_reserved_ocr_runtime.sql",
    "20261031134647_e05_ocr_source_fingerprint.sql",
    "20261031135820_e05_ocr_dispatch_claims.sql",
    "20261031141704_e05_ocr_dispatch_release.sql",
    "20261031144205_e05_ocr_enqueue_status.sql",
  ])
    await db.exec(await readFile(new URL("../../migrations/" + m, import.meta.url), "utf8"));
  await db.query(
    "insert into documents(id,file_name,mime_type) values($1,'scan.pdf','application/pdf')",
    [doc],
  );
  await db.query("insert into document_intake_sessions(id,created_by) values($1,$2)", [
    session,
    actor,
  ]);
  await db.query("insert into test_admins values($1,true),($2,true)", [actor, other]);
  await seed();
  await load();
  for (const role of ["anon", "authenticated"]) {
    await db.exec("reset role;set role " + role);
    for (const sql of [
      "select kati_ocr_document_access(null,null,null)",
      "select kati_control_document_ocr('status',null,null,null)",
    ])
      await assert.rejects(db.query(sql), (e: any) => e.code === "42501");
  }
  await db.exec("reset role;set role service_role");
  for (const denied of [secret, "invalid"])
    assert.equal((await invoke("enqueue", {}, denied)).status, 401);
  assert.equal((await invoke("enqueue", { actor_id: actor })).status, 400);
  for (const key of ["source", "direct_text", "enabled", "dispatch_enabled"])
    assert.equal((await invoke("enqueue", { [key]: true })).status, 400);
  auth = other;
  assert.equal((await invoke()).status, 403);
  auth = actor;
  assert.equal((await invoke("status", { session_id: other })).status, 403);
  assert.equal(reads, 0);
  enabled = false;
  await load();
  assert.equal((await invoke()).status, 503);
  assert.equal(reads, 0);
  enabled = true;
  await load();
  for (const change of [
    "update documents set is_archived=true",
    "update document_intake_sessions set archived_at=now()",
    "update test_admins set active=false",
  ]) {
    await seed();
    await db.exec("reset role");
    await db.exec(change);
    await db.exec("set role service_role");
    assert.equal((await invoke()).status, 403);
    assert.equal(reads, 0);
  }
  // Transactional recheck closes the authorization/download gap.
  await seed();
  afterDownload = async () => {
    await db.exec("reset role");
    await db.query("update documents set uploaded_by=$1", [other]);
    await db.exec("set role service_role");
  };
  assert.equal((await invoke()).status, 403);
  assert.equal(await state(), undefined);
  await seed();
  afterDownload = async () => {
    await db.exec("reset role;update documents set storage_path='changed';set role service_role");
  };
  assert.equal((await invoke()).status, 409);
  assert.equal(await state(), undefined);
  // A usable text layer follows the same parser/quality gate, with no job/model.
  await seed();
  text =
    "Readable document with enough ordinary words for the existing quality gate to accept its extracted text layer.";
  let result = await invoke();
  assert.equal(result.body.state, "completed");
  assert.equal(parses, 1);
  assert.equal(models, 0);
  assert.equal(await state(), undefined);
  assert.equal((await invoke("status")).body.state, "completed");
  assert.equal((await invoke()).body.state, "completed");
  assert.equal((await q("select metadata from documents"))[0].metadata.manual, "preserve");
  await seed();
  await db.query("update documents set ocr_text='prior text'");
  assert.equal((await invoke()).status, 409);
  assert.equal(await state(), undefined);
  assert.equal((await q("select ocr_text from documents"))[0].ocr_text, "prior text");
  // Enqueue only: actual source pin, no provider call and no browser continuation.
  await seed();
  result = await invoke();
  assert.equal(result.body.state, "queued");
  assert.equal(models, 0);
  let row = await state();
  assert.equal(row.dispatch_enabled, true);
  assert.equal(row.checkpoint.intake_scope.actor_id, actor);
  assert.equal(row.checkpoint.source_fingerprint.sha256.length, 64);
  assert.equal((await wake()).status, 200);
  assert.equal(models, 3);
  assert.equal((await invoke("status")).body.progress.percent, 75);
  const before = await state();
  assert.equal((await invoke()).body.state, "queued");
  assert.deepEqual(await state(), before);
  // Completion is withheld until the final authoritative publication succeeds.
  loseFinish = true;
  assert.equal((await wake()).status, 503);
  assert.equal(models, 4);
  result = await invoke("status");
  assert.equal(result.body.state, "running");
  assert.equal(result.body.progress.percent, 99);
  assert.equal(result.body.progress.complete, false);
  assert.equal(result.body.text_length, 0);
  loseFinish = false;
  await db.query(
    "update document_ocr_jobs set lease_expires_at=clock_timestamp()-interval '1 second'",
  );
  // Closing the UI after enqueue does not stop remaining server-owned work.
  assert.equal((await wake()).status, 200);
  assert.equal(models, 4);
  result = await invoke("status");
  assert.equal(result.body.state, "completed");
  assert.equal(result.body.progress.percent, 100);
  assert.equal(result.body.progress.complete, true);
  row = await state();
  await invoke();
  assert.deepEqual(await state(), row);
  assert.equal((await q("select metadata from documents"))[0].metadata.manual, "preserve");
  // Per-job stop/terminal markers survive repeated browser enqueue.
  await seed();
  await invoke();
  await db.query("update document_ocr_jobs set dispatch_enabled=false");
  row = await state();
  assert.equal((await invoke()).body.state, "paused");
  assert.deepEqual(await state(), row);
  await db.query("update document_ocr_jobs set status='needs_manual_review'");
  row = await state();
  await invoke();
  assert.deepEqual(await state(), row);
  // Source replacement invalidates the job without resetting checkpoint/text.
  await seed();
  await invoke();
  await wake();
  row = await state();
  bytes = "replaced PDF bytes";
  assert.equal((await invoke()).status, 409);
  assert.equal((await state()).status, "needs_manual_review");
  assert.deepEqual((await state()).checkpoint, row.checkpoint);
  // Access is checked before private Storage/model IO on each server wakeup.
  for (const change of [
    "update documents set uploaded_by='" + other + "'",
    "update document_intake_sessions set archived_at=now()",
    "update test_admins set active=false",
  ]) {
    await seed();
    await invoke();
    const storageBefore: number = reads;
    await db.exec("reset role");
    await db.exec(change);
    await db.exec("set role service_role");
    await wake();
    assert.equal(reads, storageBefore);
    assert.equal(models, 0);
    assert.equal((await state()).last_error_code, "ocr_scope_changed");
  }
  // Revocation between admission and the next reserve/settle cannot publish.
  await seed();
  await invoke();
  const claim = (await sb.rpc("kati_claim_next_reserved_ocr_job", {})).data;
  await db.exec("reset role;update test_admins set active=false;set role service_role");
  const r = (
    await sb.rpc("kati_reserve_document_ocr_unit", {
      p_document_id: doc,
      p_job_id: claim.job_id,
      p_lease_token: claim.lease_token,
      p_page_count: 24,
      p_unit_start: 0,
      p_unit_end: 6,
    })
  ).data;
  assert.equal(r.allowed, false);
  assert.equal(models, 0);
  await seed();
  await invoke();
  const acceptedClaim = (await sb.rpc("kati_claim_next_reserved_ocr_job", {})).data;
  const leaseArgs = {
    p_document_id: doc,
    p_job_id: acceptedClaim.job_id,
    p_lease_token: acceptedClaim.lease_token,
  };
  const accepted = (
    await sb.rpc("kati_reserve_document_ocr_unit", {
      ...leaseArgs,
      p_page_count: 24,
      p_unit_start: 0,
      p_unit_end: 6,
    })
  ).data;
  assert.equal(accepted.allowed, true);
  await db.exec("reset role;update test_admins set active=false;set role service_role");
  assert.equal(
    (
      await sb.rpc("kati_settle_document_ocr_unit", {
        ...leaseArgs,
        p_unit_start: 0,
        p_reservation_id: accepted.reservation_id,
        p_text: "must not publish",
      })
    ).data,
    false,
  );
  assert.equal(
    (await sb.rpc("kati_finish_reserved_document_ocr_wave", { ...leaseArgs, p_page_count: 24 }))
      .data.persisted,
    false,
  );
  assert.equal((await q("select ocr_text from documents"))[0].ocr_text, "");
  assert.ok(!JSON.stringify(diagnostics).includes(secret));
  output("ocr_control_integration_passed");
} finally {
  await db.close();
  await rm(folder, { recursive: true, force: true });
}
