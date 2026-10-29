// Executable migration checks. PGlite runs real PostgreSQL, but only one session:
// these tests do NOT establish multi-session row-lock/concurrency acceptance.
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const db = new PGlite();
const id = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const wrong = "10000000-0000-4000-8000-000000000003";
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const snapshot = async () => rows("select checkpoint, status,lease_token from document_ocr_jobs order by document_id");
const migration = await readFile(new URL("../../migrations/20261029151613_e05_ocr_attempt_reservations.sql", import.meta.url), "utf8");
const claim = async (document = id) => (await rows("select * from kati_claim_document_ocr_job($1)", [document]))[0];
const reserve = async (job, start = 0, end = 6, pages = 12, document = id) => (await rows(
  "select kati_reserve_document_ocr_unit($1,$2,$3,$4,$5,$6) as r",
  [document, job.job_id, job.lease_token, pages, start, end],
))[0].r;
const settle = async (job, reservation, start = 0, text = "OCR text", error = null) => (await rows(
  "select kati_settle_document_ocr_unit($1,$2,$3,$4,$5,$6,$7) as r",
  [id, job.job_id, job.lease_token, start, reservation, text, error],
))[0].r;
const expire = async () => db.exec("update document_ocr_jobs set lease_expires_at = clock_timestamp() - interval '1 second' where status='running'");
const checkpoint = async () => (await rows("select checkpoint from document_ocr_jobs where document_id=$1", [id]))[0].checkpoint;
const denied = async sql => {
  try { await db.exec(sql); assert.fail("role unexpectedly authorized"); }
  catch (e) { assert.equal(e.code, "42501"); }
};
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table public.documents(id uuid primary key, ocr_text text, metadata jsonb default '{}',
      analysis_status text, review_status text, updated_at timestamptz);
    grant select,update on public.documents to service_role;`);
  for (const name of ["20260922120000_stage13l2b_durable_ocr_jobs.sql", "20260922120554_fix_stage13l2b_lease_counter.sql"])
    await db.exec(await readFile(new URL("../../migrations/" + name, import.meta.url), "utf8"));
  await db.query("insert into documents(id,ocr_text) values ($1,'preserve existing'),($2,'other document')", [id, other]);
  await claim(other);
  const ledgerBeforeMigration = await snapshot();
  const oldFunctions = await rows("select proname,md5(prosrc) as hash from pg_proc where proname in ('kati_claim_document_ocr_job','kati_persist_document_ocr_checkpoint') order by proname");
  await db.exec(migration);
  assert.deepEqual(await snapshot(),ledgerBeforeMigration);
  assert.deepEqual(await rows("select proname,md5(prosrc) as hash from pg_proc where proname in ('kati_claim_document_ocr_job','kati_persist_document_ocr_checkpoint') order by proname"),oldFunctions);
  const documentsBefore = await rows("select * from documents order by id");
  const functions = await rows(`select p.proname, p.prosecdef, p.proconfig from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('kati_reserve_document_ocr_unit','kati_settle_document_ocr_unit')`);
  assert.equal(functions.length, 2);
  assert.ok(functions.every(f => !f.prosecdef && f.proconfig.includes('search_path=""')));
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    await denied("select kati_reserve_document_ocr_unit(null,null,null,12,0,6)");
    await denied("select kati_settle_document_ocr_unit(null,null,null,0,null,null,null)");
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  let job = await claim();
  const beforeInvalid = await snapshot();
  for (const [start,end,pages] of [[-1,6,12],[1,6,12],[0,7,12],[0,6,0],[0,0,12],[12,18,12],[null,6,12]])
    assert.equal((await reserve(job,start,end,pages)).code,"invalid_page_window");
  assert.equal((await reserve({...job,lease_token:null})).code,"lease_lost");
  assert.equal((await reserve(job,0,6,12,other)).code,"lease_lost");
  assert.equal((await reserve({...job,job_id:wrong})).code,"lease_lost");
  assert.deepEqual(await snapshot(), beforeInvalid);

  // Reserve commits BEFORE simulated external IO. A lost reply cannot authorize
  // the same provider attempt again under this lease.
  const first = await reserve(job);
  assert.equal(first.allowed,true); assert.equal(first.attempt,1);
  assert.equal((await reserve(job)).code,"unit_already_reserved");
  assert.equal(await settle(job,wrong),false);
  assert.equal((await reserve(job,6,12)).attempt,1);
  const second = (await checkpoint()).ocr_unit_reservations["6"].reservation_id;
  assert.equal(await settle(job,second,6,"later pages"),true);
  assert.equal(await settle(job,second,6,"overwrite result"),false);

  // Crash with first unit unresolved, then a fresh lease: count did not reset;
  // completed second unit remains durable although final-wave persist never ran.
  await db.exec("reset role"); await expire(); await db.exec("set role service_role");
  assert.equal(await settle(job,first.reservation_id),false);
  const stale = job;
  job = await claim();
  assert.notEqual(job.lease_token,stale.lease_token);
  assert.equal((await reserve(stale)).code,"lease_lost");
  assert.equal((await reserve(job,6,12)).code,"unit_completed");
  const retry = await reserve(job);
  assert.equal(retry.attempt,2);
  assert.equal(await settle(stale,first.reservation_id),false);
  assert.equal(await settle(job,retry.reservation_id,0,"discard me","PRIVATE_PROVIDER_BODY"),true);
  let cp = await checkpoint();
  assert.equal(cp.page_index.units[0].attempts,2);
  assert.equal(cp.page_index.units[0].error,"ocr_unit_failed");
  assert.ok(!JSON.stringify(cp).includes("PRIVATE_PROVIDER_BODY"));
  assert.equal(cp.page_index.units[1].text,"later pages");
  await db.exec("reset role"); await expire(); await db.exec("set role service_role");
  job = await claim();
  assert.equal((await reserve(job)).attempt,3);
  // Crash after the third reservation: another lease must not call provider #4.
  await db.exec("reset role"); await expire(); await db.exec("set role service_role");
  job = await claim();
  const beforeExhausted = await checkpoint();
  assert.equal((await reserve(job)).code,"unit_attempts_exhausted");
  assert.deepEqual(await checkpoint(),beforeExhausted);
  assert.equal((await reserve(job,0,6,13)).code,"checkpoint_mismatch");
  assert.deepEqual(await checkpoint(),beforeExhausted);
  await db.exec("reset role");
  assert.deepEqual(await rows("select * from documents order by id"),documentsBefore);

  // A legacy metadata checkpoint is seeded without losing completed text or
  // prior failed-attempt counts. Malformed indices fail closed without writes.
  const legacy = {page_count:12,unit_size:6,units:[
    {start:0,end:6,status:"failed",attempts:2,text_length:0,error:"provider_timeout"},
    {start:6,end:12,status:"completed",attempts:1,text_length:5,text:"saved"},
  ]};
  await db.query("delete from document_ocr_jobs where document_id=$1",[id]);
  await db.query("update documents set metadata=$2 where id=$1",[id,{page_index:legacy}]);
  await db.exec("set role service_role"); job=await claim();
  const legacyAttempt=await reserve(job);
  assert.equal(legacyAttempt.attempt,3);
  assert.equal(await settle(job,legacyAttempt.reservation_id,0,"first pages 🧾"),true);
  cp=await checkpoint();
  assert.equal(cp.page_index.units[0].attempts,3);
  assert.equal(cp.page_index.units[0].text,"first pages 🧾");
  assert.equal(cp.page_index.units[0].text_length,"first pages 🧾".length);
  assert.equal(cp.page_index.units[1].text,"saved");
  await db.exec("reset role");
  for (const invalid of [{...legacy,units:[]},{...legacy,unit_size:3},
    {...legacy,units:[{...legacy.units[0],attempts:-1},legacy.units[1]]}]) {
    await db.query("update document_ocr_jobs set checkpoint=$2 where document_id=$1",[id,{page_index:invalid}]);
    const snap=await snapshot(); await db.exec("set role service_role");
    assert.equal((await reserve(job)).code,"checkpoint_mismatch");
    await db.exec("reset role"); assert.deepEqual(await snapshot(),snap);
  }
  // No new table, no scheduler, no grants widening the old ledger.
  assert.equal((await rows("select relrowsecurity from pg_class where oid='public.document_ocr_jobs'::regclass"))[0].relrowsecurity,true);
  console.log("ocr_reservations_sql_passed");
} finally { await db.close(); }
