// Actual three Edge entrypoints, per-attempt provider adapters, source guard
// and executable SQL. Supabase SDK/auth and external provider IO are doubled.
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createOcrConsumerAdmission,
  OcrSourceAdmissionError,
} from "../../functions/_shared/ocr-consumer-admission.ts";
import { evaluateFullCorpusAdmission } from "../../functions/_shared/full-corpus-admission.ts";
const db = new PGlite();
const actor = "20000000-0000-4000-8000-000000000001",
  session = "30000000-0000-4000-8000-000000000001",
  doc = "10000000-0000-4000-8000-000000000001";
const object = "40000000-0000-4000-8000-000000000001",
  canary = "PRIVATE_CONSUMER_CANARY",
  path = "private-consumer-path";
const source = {
  version: 1,
  bucket: "lead-documents",
  storage_path: path,
  sha256: "a".repeat(64),
  byte_length: 6,
  generation: { object_id: object, version: "version-a" },
};
const ocrText =
  "The complete synthetic document contains readable factual evidence for a contract and tax dispute. " +
  canary;
const q = async (sql: string, args: any[] = []) => (await db.query(sql, args)).rows as any[];
const diagnostics: unknown[] = [];
const output = console.log;
for (const method of ["log", "warn", "error", "info"] as const)
  console[method] = (...args) => {
    diagnostics.push(args);
  };
let handler: (req: Request) => Promise<Response>,
  mode = "ok",
  rpcFailure = false,
  models = 0,
  requests = 0,
  guardCalls = 0;
let writes: Array<{ table: string; kind: string; value: any }> = [],
  runs: any[] = [],
  acceptedAnalysis: any = null;
const bindings: Record<string, string[]> = {
  is_admin_or_superadmin: ["_user_id"],
  kati_check_ocr_consumer_sources: ["p_actor_id", "p_session_id", "p_expected"],
};
function builder(table: string) {
  let operation = "read",
    value: any,
    filters: Record<string, any> = {};
  const run = async (single = false) => {
    if (operation !== "read") {
      writes.push({ table, kind: operation, value: structuredClone(value) });
      if (table === "document_intake_ai_runs") {
        if (operation === "insert") {
          const row = {
            ...value,
            id: `50000000-0000-4000-8000-${String(runs.length + 1).padStart(12, "0")}`,
          };
          runs.push(row);
          return { data: single ? row : [row], error: null };
        }
        for (const row of runs) if (!filters.id || row.id === filters.id) Object.assign(row, value);
      }
      return {
        data: single ? { id: "60000000-0000-4000-8000-000000000001", ...value } : [],
        error: null,
      };
    }
    let data: any[] = [];
    if (table === "documents")
      data = (await q("select to_jsonb(d) value from documents d where metadata->>'intake_session_id'=$1", [session])).map(row=>row.value);
    else if (table === "document_intake_sessions")
      data = await q("select * from document_intake_sessions where id=$1", [session]);
    else if (table === "document_intake_schemas")
      data = [
        {
          schema_json: { steps: [{ fields: [{ key: "disputed_operations", label: "Dispute" }] }] },
        },
      ];
    else if (table === "document_intake_answers")
      data = [{ field_name: "manual_guard", field_value: "KEEP_MANUAL", value_source: "manual" }];
    else if (table === "document_intake_ai_runs")
      data = acceptedAnalysis
        ? [acceptedAnalysis]
        : runs.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
    return { data: single ? (data[0] ?? null) : data, error: null };
  };
  const api: any = {
    select() {
      return api;
    },
    eq(k: string, v: any) {
      filters[k] = v;
      return api;
    },
    filter() {
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return api;
    },
    or() {
      return api;
    },
    range() {
      return api;
    },
    not() {
      return api;
    },
    contains() {
      return api;
    },
    gte() {
      return api;
    },
    lte() {
      return api;
    },
    lt() {
      return api;
    },
    gt() {
      return api;
    },
    in() {
      return api;
    },
    neq() {
      return api;
    },
    is() {
      return api;
    },
    ilike() {
      return api;
    },
    insert(v: any) {
      operation = "insert";
      value = v;
      return api;
    },
    update(v: any) {
      operation = "update";
      value = v;
      return api;
    },
    upsert(v: any) {
      operation = "upsert";
      value = v;
      return api;
    },
    single: () => run(true),
    maybeSingle: () => run(true),
    then: (resolve: any, reject: any) => run().then(resolve, reject),
  };
  return api;
}
const sb = {
  auth: {
    getUser: async (token: string) => ({
      data: { user: token === "user" ? { id: actor } : null },
      error: null,
    }),
  },
  from: builder,
  async rpc(name: string, args: Record<string, unknown>) {
    if (!(name in bindings)) return { data: [], error: null }; // empty doubled legal repositories; no live retrieval
    if (name === "kati_check_ocr_consumer_sources") {
      guardCalls++;
      assert.ok(!JSON.stringify(args).includes(canary));
      if (rpcFailure) return { data: null, error: { message: canary } };
    }
    const values = bindings[name].map((k) => args[k] ?? null);
    const data = (
      await q(`select ${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) r`, values)
    )[0].r;
    if (name === "kati_check_ocr_consumer_sources")
      assert.deepEqual(Object.keys(data), ["allowed"]);
    return { data, error: null };
  },
};
(globalThis as any).testClient = () => sb;
(globalThis as any).Deno = {
  env: {
    get: (name: string) =>
      (
        ({
          SUPABASE_URL: "https://offline.test",
          SUPABASE_SERVICE_ROLE_KEY: "offline-service",
          GEMINI_API_KEY: "offline-gemini",
          KATI_OCR_UNIT_RESERVATIONS_ENABLED: "false",
          KATI_OCR_ENQUEUE_ENABLED: "false",
        }) as Record<string, string>
      )[name],
  },
  serve: (fn: typeof handler) => {
    handler = fn;
  },
};
globalThis.fetch = (async (input: RequestInfo | URL) => {
  requests++;
  const url = String(input);
  if (url.includes("/functions/v1/review-generated-legal-document")) return new Response("{}");
  assert.ok(url.startsWith("https://generativelanguage.googleapis.com/"));
  if (url.includes(":embedContent"))
    return new Response(JSON.stringify({ embedding: { values: Array(1536).fill(0) } }));
  if (url.includes("/models?")) return new Response('{"models":[]}');
  models++;
  if (mode === "during" || mode === "retry")
    await db.query("update storage.objects set version='version-b'");
  if (mode === "retry") return new Response("unavailable", { status: 503 });
  const result = {
    title: "Synthetic draft",
    content: "Synthetic generated draft",
    paragraph_provenance: [],
    legal_reasoning: {},
    issues: [],
    adverse_sources: [],
    sources: [],
    conclusions: [],
    answers: [
      {
        field_name: "disputed_operations",
        value: "synthetic dispute",
        confidence: 1,
        source_document_id: doc,
        source_quote: "The complete synthetic document",
      },
      {
        field_name: "manual_guard",
        value: "MUST_NOT_OVERWRITE",
        confidence: 1,
        source_document_id: doc,
        source_quote: "The complete synthetic document",
      },
    ],
    summary: "Synthetic summary",
    document_role: { can_fill_facts: true },
    facts: ["synthetic dispute"],
    legal_issues: ["tax dispute"],
    research_topics: ["tax"],
    keywords: ["tax"],
  };
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }),
  );
}) as typeof fetch;
const folder = await mkdtemp(join(tmpdir(), "kati-consumer-"));
let n = 0;
const load = async (name: string) => {
  const origin = new URL(`../../functions/${name}/index.ts`, import.meta.url);
  let source = await readFile(origin, "utf8");
  source = source
    .replace(/import \{ createClient \} from "[^"]+";/, "const createClient=globalThis.testClient;")
    .replace(/import \{ serve \} from "[^"]+";/, "const serve=globalThis.Deno.serve;")
    .replace(
      /from "(\.[^"]+)"/g,
      (_all, relative) => 'from "' + new URL(relative, origin).href + '"',
    );
  const file = join(folder, `entry-${n++}.ts`);
  await writeFile(file, source);
  await import(pathToFileURL(file).href);
};
// Match PostgREST JSON transport (PGlite raw text decoding strips a leading BOM).
const documents = async() => (await q("select to_jsonb(d) value from documents d")).map(row=>row.value);
const seed = async (legacy = false) => {
  await db.exec("reset role;delete from document_ocr_jobs;delete from storage.objects");
  await db.query(
    "insert into storage.objects values($1,'lead-documents',$2,'version-a',null,false)",
    [object, path],
  );
  await db.query(
    "update documents set ocr_text=$1,metadata=$2,is_archived=false,uploaded_by=$3 where id=$4",
    [
      ocrText,
      {
        intake_session_id: session,
        extraction_status: "completed",
        manual: "KEEP",
        ...(!legacy ? { ocr_source_fingerprint: source } : {}),
      },
      actor,
      doc,
    ],
  );
  await db.query("update document_intake_sessions set archived_at=null,created_by=$1 where id=$2", [
    actor,
    session,
  ]);
  await db.exec("update test_admins set active=true;set role service_role");
  writes = [];
  runs = [];
  models = 0;
  requests = 0;
  guardCalls = 0;
  mode = "ok";
  rpcFailure = false;
  acceptedAnalysis = null;
};
const invoke = async (name: string, extra: any = {}) => {
  const payload =
    name === "document-intake-ai-fill"
      ? { session_id: session, document_ids: [doc] }
      : name === "analyze-document-legal-position"
        ? { session_id: session }
        : {
            session_id: session,
            template_code: "test_intake",
            template: { title: "Synthetic template" },
            language: "ru",
            jurisdiction: "RU",
          };
  const response = await handler(
    new Request("https://offline.test", {
      method: "POST",
      headers: { Authorization: "Bearer user", "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, ...extra }),
    }),
  );
  const body = await response.json();
  if (!body.success) {
    const wire = JSON.stringify(body);
    for (const forbidden of [canary, path, "version-a", "object_id"])
      assert.ok(!wire.includes(forbidden), wire);
  }
  return { status: response.status, body };
};
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
    create schema storage;grant usage on schema storage to service_role;
    create table storage.buckets(id text primary key,public boolean default false);
    create table storage.objects(id uuid primary key,bucket_id text,name text,version text,archived_at timestamptz,is_delete_marker boolean);
    create unique index current_storage_object on storage.objects(bucket_id,name) where archived_at is null;
    insert into storage.buckets values('lead-documents',false);
    grant select,update on storage.buckets,storage.objects to service_role;
    create table documents(id uuid primary key,title text,file_name text,mime_type text,storage_path text,ocr_text text,metadata jsonb,analysis_status text,review_status text,updated_at timestamptz,is_archived boolean default false,uploaded_by uuid,matter_id uuid,client_id uuid);
    create table document_intake_sessions(id uuid primary key,created_by uuid,archived_at timestamptz,matter_id uuid,client_id uuid,metadata jsonb,template_code text,jurisdiction text,language text);
    create table test_admins(id uuid primary key,active boolean);
    create function is_admin_or_superadmin(_user_id uuid) returns boolean language sql as 'select coalesce((select active from public.test_admins where id=_user_id),false)';
    grant select on test_admins to service_role;grant select,update on documents,document_intake_sessions to service_role;`);
  for (const name of [
    "20260922120000_stage13l2b_durable_ocr_jobs.sql",
    "20260922120554_fix_stage13l2b_lease_counter.sql",
    "20261029151613_e05_ocr_attempt_reservations.sql",
    "20261029190337_e05_reserved_ocr_runtime.sql",
    "20261031134647_e05_ocr_source_fingerprint.sql",
    "20261031135820_e05_ocr_dispatch_claims.sql",
    "20261031141704_e05_ocr_dispatch_release.sql",
    "20261031144205_e05_ocr_enqueue_status.sql",
    "20261031151327_e05_ocr_storage_generation.sql",
    "20261031154501_e05_ocr_consumer_admission.sql",
  ])
    await db.exec(await readFile(new URL("../../migrations/" + name, import.meta.url), "utf8"));
  await db.query(
    "insert into documents(id,title,file_name,mime_type,storage_path) values($1,'Synthetic evidence','scan.pdf','application/pdf',$2)",
    [doc, path],
  );
  await db.query(
    "insert into document_intake_sessions values($1,$2,null,null,null,'{}','test_intake','RU','ru')",
    [session, actor],
  );
  await db.query("insert into test_admins values($1,true)", [actor]);
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    await assert.rejects(
      db.query("select kati_check_ocr_consumer_sources(null,null,'[]')"),
      (e: any) => e.code === "42501",
    );
    await db.exec("reset role");
  }
  for (const name of [
    "document-intake-ai-fill",
    "analyze-document-legal-position",
    "generate-legal-document-v2",
  ]) {
    await seed();
    await load(name);
    await db.query("update storage.objects set version='version-b'");
    let r = await invoke(name);
    assert.equal(r.status, 409, `${name} changed: ${JSON.stringify(r)}`);
    assert.equal(models, 0);
    assert.equal(requests, 0);
    assert.ok(
      !writes.some(
        (w) =>
          w.table === "generated_legal_documents" ||
          w.table === "document_intake_answers" ||
          w.value.status === "completed",
      ),
    );
    await seed();
    rpcFailure = true;
    r = await invoke(name);
    assert.equal(r.status, 503, `${name} RPC failure: ${JSON.stringify(r)}`);
    assert.equal(requests, 0);
    await seed();
    mode = "during";
    r = await invoke(name);
    assert.equal(r.status, 409, `${name} during: ${JSON.stringify(r)}`);
    assert.equal(models, 1);
    assert.ok(
      !writes.some(
        (w) =>
          w.table === "generated_legal_documents" ||
          w.table === "document_intake_answers" ||
          w.value.status === "completed",
      ),
    );
    assert.equal((await documents())[0].ocr_text, ocrText);
    assert.equal((await documents())[0].metadata.manual, "KEEP");
    if (name !== "generate-legal-document-v2")
      assert.ok(runs.every((row) => row.status === "failed"));
    {
      await seed();
      r = await invoke(name);
      assert.equal(r.status, 200, `${name} valid: ${JSON.stringify(r)}`);
      assert.equal(r.body.success, true);
      assert.ok(models >= 1);
      assert.ok(
        !writes.some(
          (w) => w.table === "document_intake_answers" && w.value.field_name === "manual_guard",
        ),
      );
      await seed(true);
      rpcFailure = true;
      r = await invoke(name);
      assert.equal(r.status, 200, `${name} legacy: ${JSON.stringify(r)}`);
      assert.equal(guardCalls, 0);
    }
    if (name === "document-intake-ai-fill" || name === "analyze-document-legal-position") {
      await seed();
      mode = "retry";
      r = await invoke(name);
      assert.equal(r.status, 409, `${name} retry: ${JSON.stringify(r)}`);
      assert.equal(models, 1);
    }
  }
  // A previous analysis may not be reused with a different/removed source set.
  await seed();
  await load("generate-legal-document-v2");
  acceptedAnalysis = {
    id: "analysis",
    session_id: session,
    run_type: "legal_analysis",
    status: "completed",
    ai_result: {},
    input_snapshot: { full_corpus_admission: await evaluateFullCorpusAdmission(await documents()) },
  };
  const old = structuredClone(acceptedAnalysis);
  acceptedAnalysis.input_snapshot.full_corpus_admission.fingerprint = "different";
  assert.equal(
    (await invoke("generate-legal-document-v2", { legal_analysis_run_id: "analysis" })).status,
    409,
  );
  assert.equal(models, 0);
  acceptedAnalysis=structuredClone(old);delete acceptedAnalysis.input_snapshot.full_corpus_admission.document_ids;
  assert.equal((await invoke("generate-legal-document-v2",{legal_analysis_run_id:"analysis"})).status,409);assert.equal(models,0);
  acceptedAnalysis = old;
  await db.exec("reset role;delete from documents;set role service_role");
  assert.equal(
    (await invoke("generate-legal-document-v2", { legal_analysis_run_id: "analysis" })).status,
    409,
  );
  assert.equal(models, 0);
  // Revalidate actual scope/representation under SQL locks, not stale UI data.
  await db.exec("reset role");
  await db.query(
    "insert into documents(id,title,file_name,mime_type,storage_path) values($1,'Synthetic','scan.pdf','application/pdf',$2)",
    [doc, path],
  );
  for (const change of [
    "update document_intake_sessions set archived_at=now()",
    "update document_intake_sessions set created_by='20000000-0000-4000-8000-000000000002'",
    "update documents set uploaded_by='20000000-0000-4000-8000-000000000002'",
    "update test_admins set active=false",
    "update documents set ocr_text=replace(ocr_text,'complete','replaced')",
    'update documents set metadata=metadata||\'{"extraction_status":"pending"}\'::jsonb',
  ]) {
    await seed();
    const snapshot = createOcrConsumerAdmission(sb, actor, session, await documents());
    await db.exec("reset role");
    await db.exec(change);
    await db.exec("set role service_role");
    await assert.rejects(snapshot.check, OcrSourceAdmissionError);
    assert.equal(requests, 0);
  }
  await seed();
  await db.query("update documents set ocr_text=$1", ["\ufeff \r\nРусский текст и emoji 😀 \n"]);
  await createOcrConsumerAdmission(sb, actor, session, await documents()).check().catch(error=>{throw new Error("direct RPC positive case failed",{cause:error});});
  await seed();
  await db.query("update documents set metadata=metadata||$1", [
    { redaction_status: "accepted", redacted_text: "Safe synthetic representation" },
  ]);
  const redactedGate = createOcrConsumerAdmission(sb, actor, session, await documents());
  await redactedGate.check().catch(error=>{throw new Error("redacted positive case failed",{cause:error});});
  await db.query(
    "update documents set metadata=jsonb_set(metadata,'{redacted_text}','\"New synthetic representation\"')",
  );
  await assert.rejects(redactedGate.check, OcrSourceAdmissionError);
  await seed();
  await db.query(
    "insert into document_ocr_jobs(document_id,status,checkpoint,dispatch_enabled) values($1,'completed',$2,true)",
    [
      doc,
      {
        ocr_protocol: "reserved_v1",
        source_fingerprint: source,
        intake_scope: { actor_id: actor, session_id: session },
      },
    ],
  );
  await db.query(
    'update documents set metadata=metadata||\'{"ocr_execution_owner":"server"}\'::jsonb',
  );
  await createOcrConsumerAdmission(sb, actor, session, await documents()).check().catch(error=>{throw new Error("direct RPC positive case failed",{cause:error});});
  // Per-attempt adapters must propagate admission failure through optional
  // fact/embedding/challenge fallbacks instead of converting it into evidence.
  await seed();
  const gate = createOcrConsumerAdmission(sb, actor, session, await documents());
  await db.query("update storage.objects set version='version-b'");
  const guarded = gate.fetch();
  const fallback =
    await import("../../functions/analyze-document-legal-position/gemini-fallback.ts");
  const facts = await import("../../functions/analyze-document-legal-position/fact-extraction.ts");
  const prompt = await import("../../functions/analyze-document-legal-position/prompt.ts");
  const challenge = await import("../../functions/analyze-document-legal-position/challenge.ts");
  for (const call of [
    () => fallback.callGeminiWithFallback("prompt", { fetcher: guarded }),
    () =>
      facts.extractFacts({
        templateCode: "test",
        practiceArea: null,
        answers: {},
        documents: [],
        fetcher: guarded,
      }),
    () => facts.embedQuery("text", guarded),
    () => prompt.callGeminiPro("text", guarded),
    () => challenge.runChallenge({ parsed: {}, trusted: [], conclusions: [], fetcher: guarded }),
  ])
    await assert.rejects(call, OcrSourceAdmissionError);
  assert.equal(requests, 0);
  assert.ok(!JSON.stringify(diagnostics).includes(canary));
  output("ocr_consumer_integration_passed");
} finally {
  await db.close();
  await rm(folder, { recursive: true, force: true });
}
