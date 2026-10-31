// Real PostgreSQL only. CI supplies a disposable localhost database, never a
// Supabase/Production URL. Fail closed rather than skip missing prerequisites.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const url = process.env.KATI_OCR_SQL_TEST_URL;
if (!url) throw new Error('KATI_OCR_SQL_TEST_URL is required');
const parsed = new URL(url);
if (!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname) ||
    !/^\/kati_ocr_claims_test_[a-z0-9_]+$/.test(parsed.pathname))
  throw new Error('Only an explicit disposable localhost OCR test database is allowed');
const clients = [];
const open = async (service=false) => {
  const c = new pg.Client({connectionString:url}); await c.connect(); clients.push(c);
  if (service) await c.query('set role service_role'); return c;
};
const admin = await open();
const q = async (sql,args=[]) => (await admin.query(sql,args)).rows;
const doc = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migrations = ['20260922120000_stage13l2b_durable_ocr_jobs.sql','20260922120554_fix_stage13l2b_lease_counter.sql',
  '20261029151613_e05_ocr_attempt_reservations.sql','20261029190337_e05_reserved_ocr_runtime.sql',
  '20261031134647_e05_ocr_source_fingerprint.sql'];
const next = async c => (await c.query('select kati_claim_next_reserved_ocr_job() as r')).rows[0].r;
const claim = async (c,n,reserved=true) => (await c.query(`select * from ${reserved?'kati_claim_reserved_document_ocr_job':'kati_claim_document_ocr_job'}($1)`,[doc(n)])).rows[0];
const active = async () => Number((await q("select count(*) n from document_ocr_jobs where status='running' and lease_expires_at>clock_timestamp()"))[0].n);
const state = async n => (await q('select * from document_ocr_jobs where document_id=$1',[doc(n)]))[0];
const due = async n => admin.query("update document_ocr_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where document_id=$1",[doc(n)]);
const expire = async n => admin.query("update document_ocr_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where document_id=$1",[doc(n)]);
const bind = async (c,n,job) => (await c.query('select kati_guard_reserved_ocr_source($1,$2,$3,$4,true) as r',
  [doc(n),job.job_id,job.lease_token,{version:1,bucket:'lead-documents',storage_path:`path-${n}`,sha256:'a'.repeat(64),byte_length:6}])).rows[0].r;
const reserve = async(c,n,job,start=0,pages=6)=>(await c.query('select kati_reserve_document_ocr_unit($1,$2,$3,$4,$5,$6) as r',
  [doc(n),job.job_id,job.lease_token,pages,start,Math.min(start+6,pages)])).rows[0].r;
const settle = async(c,n,job,r,start=0,text='accepted',error=null)=>(await c.query('select kati_settle_document_ocr_unit($1,$2,$3,$4,$5,$6,$7) as r',
  [doc(n),job.job_id,job.lease_token,start,r.reservation_id,text,error])).rows[0].r;
const finish = async(c,n,job,pages=6)=>(await c.query('select kati_finish_reserved_document_ocr_wave($1,$2,$3,$4) as r',
  [doc(n),job.job_id,job.lease_token,pages])).rows[0].r;
const seed = async(n,enabled=true,reserved=true)=>{
  await admin.query('insert into documents(id,storage_path,ocr_text,metadata) values($1,$2,$3,$4) on conflict(id) do update set ocr_text=$3,metadata=$4,storage_path=$2',
    [doc(n),`path-${n}`,'',{preserve:'manual'}]);
  await admin.query('delete from document_ocr_jobs where document_id=$1',[doc(n)]);
  await admin.query("insert into document_ocr_jobs(document_id,dispatch_enabled,checkpoint,next_attempt_at,created_at) values($1,$2,$3,clock_timestamp()-interval '1 second','2026-01-01')",
    [doc(n),enabled,reserved?{ocr_protocol:'reserved_v1'}:{}]);
};
const reset = async()=>admin.query('delete from document_ocr_jobs');
try {
  assert.equal(Number((await q("select count(*) n from information_schema.tables where table_schema='public'"))[0].n),0,'database must be empty');
  await admin.query(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table documents(id uuid primary key,storage_path text,ocr_text text,metadata jsonb,analysis_status text,review_status text,updated_at timestamptz);
    grant select,update on documents to service_role;`);
  for(const m of migrations) await admin.query(await readFile(new URL('../../migrations/'+m,import.meta.url),'utf8'));
  await admin.query('insert into documents(id,storage_path,ocr_text,metadata) values($1,$2,$3,$4)',[doc(99),'old-path','old OCR',{manual:'preserve'}]);
  await admin.query('insert into document_ocr_jobs(document_id,checkpoint) values($1,$2)',[doc(99),{legacy:'preserve'}]);
  const before = (await q('select status,checkpoint,invocation_count from document_ocr_jobs'));
  await admin.query(await readFile(new URL('../../migrations/20261031135820_e05_ocr_dispatch_claims.sql',import.meta.url),'utf8'));
  await admin.query(await readFile(new URL('../../migrations/20261031141704_e05_ocr_dispatch_release.sql',import.meta.url),'utf8'));
  assert.deepEqual(await q('select status,checkpoint,invocation_count from document_ocr_jobs'),before);
  assert.equal((await state(99)).dispatch_enabled,false);
  await reset();
  for(const role of ['anon','authenticated']){
    await admin.query('set role '+role);
    for(const sql of ['select kati_claim_next_reserved_ocr_job()','select kati_recover_expired_ocr_job(null)','select kati_release_reserved_ocr_job(null,null,null,null)']){
      let code;try{await admin.query(sql);}catch(e){code=e.code;}assert.equal(code,'42501');
    }await admin.query('reset role');
  }
  const pool=await Promise.all(Array.from({length:20},()=>open(true)));
  // All three entry points share one transaction lock and one valid-lease cap.
  await Promise.all([seed(1),seed(2),seed(3),seed(4,false,false)]);
  const races=await Promise.all(pool.map((c,i)=>i<12?next(c):claim(c,i<16?2:4,i<16)));
  assert.equal(races.filter(r=>r?.acquired).length,1);assert.equal(await active(),1);
  // Deterministic due ordering and row skipping use two live transactions.
  await reset();await seed(1);await seed(2);
  const ordered=await q('select id,document_id from document_ocr_jobs order by next_attempt_at,created_at,id');
  await pool[0].query('begin');
  await pool[0].query('select id from document_ocr_jobs where id=$1 for update',[ordered[0].id]);
  const skipped=await next(pool[1]);assert.equal(skipped.document_id,ordered[1].document_id);
  await pool[0].query('commit');assert.equal(await active(),1);
  await reset();await seed(1);await seed(2);
  const firstDue=(await q('select document_id from document_ocr_jobs order by next_attempt_at,created_at,id'))[0].document_id;
  assert.equal((await next(pool[1])).document_id,firstDue);
  // Claims waiting on the advisory lock do not mint leases from stale now().
  await reset();await seed(1);await seed(4,false,false);
  await pool[0].query('begin');await pool[0].query('select pg_advisory_xact_lock(1748702047,5)');
  const waiting=[next(pool[1]),claim(pool[2],4,false)];
  await new Promise(resolve=>setTimeout(resolve,50));await pool[0].query('commit');
  assert.equal((await Promise.all(waiting)).filter(r=>r?.acquired).length,1);assert.equal(await active(),1);

  // Crash before end-of-wave persist: due/backoff and terminal no-progress are
  // server-owned, and stale attempts cannot settle after a new lease.
  await reset();await seed(1);
  let job=await next(pool[1]);assert.equal((await bind(pool[1],1,job)).allowed,true);
  const firstReservation=await reserve(pool[1],1,job);assert.equal(firstReservation.attempt,1);
  const stale=job;await expire(1);
  assert.equal(await next(pool[2]),null);
  let row=await state(1);assert.equal(row.status,'queued');assert.equal(row.consecutive_no_progress,1);
  assert.ok(row.next_attempt_at.getTime()>Date.now()+10000);
  assert.equal((await claim(pool[1],1)).acquired,false);
  assert.equal(await settle(pool[1],1,stale,firstReservation),false);
  await due(1);job=await next(pool[2]);assert.notEqual(job.lease_token,stale.lease_token);
  assert.equal((await bind(pool[2],1,job)).allowed,true);assert.equal((await reserve(pool[2],1,job)).attempt,2);
  await expire(1);assert.equal(await next(pool[2]),null);await due(1);
  job=await next(pool[1]);assert.equal((await reserve(pool[1],1,job)).attempt,3);
  await expire(1);assert.equal(await next(pool[2]),null);
  row=await state(1);assert.equal(row.status,'needs_manual_review');assert.equal(row.consecutive_no_progress,3);
  assert.equal(row.checkpoint.page_index.units[0].attempts,3);assert.equal(await next(pool[1]),null);
  assert.equal((await q('select metadata from documents where id=$1',[doc(1)]))[0].metadata.preserve,'manual');

  // The reserved kill switch prevents new calls but permits accepted settlement.
  await reset();await seed(1,false);
  assert.equal(await next(pool[1]),null);assert.equal((await claim(pool[1],1)).acquired,false);
  await admin.query('update document_ocr_jobs set dispatch_enabled=true');job=await next(pool[1]);
  assert.equal((await bind(pool[1],1,job)).allowed,true);
  const accepted=await reserve(pool[1],1,job);assert.equal(accepted.allowed,true);
  await admin.query('update document_ocr_jobs set dispatch_enabled=false');
  assert.equal((await reserve(pool[1],1,job)).code,'ocr_dispatch_disabled');
  assert.equal(await settle(pool[1],1,job,accepted),true);
  assert.equal((await finish(pool[1],1,job)).result.extraction_status,'completed');
  row=await state(1);assert.equal(row.consecutive_no_progress,0);assert.equal(row.last_progress_pages,6);
  assert.equal(await next(pool[1]),null);
  // Transient failures before source/page planning release the current lease
  // without resetting its checkpoint, and cannot spin indefinitely.
  await reset();await seed(1);
  for(let attempt=1;attempt<=3;attempt++){
    job=await next(pool[1]);assert.equal(job.acquired,true);
    assert.equal((await pool[1].query('select kati_release_reserved_ocr_job($1,$2,$3,$4) r',
      [doc(1),job.job_id,job.lease_token,'not_an_allowed_reason'])).rows[0].r,false);
    assert.equal((await pool[1].query('select kati_release_reserved_ocr_job($1,$2,$3,$4) r',
      [doc(1),job.job_id,job.lease_token,'ocr_download_unavailable'])).rows[0].r,true);
    row=await state(1);assert.equal(row.consecutive_no_progress,attempt);
    assert.equal(row.status,attempt===3?'needs_manual_review':'queued');
    assert.deepEqual(row.checkpoint,{ocr_protocol:'reserved_v1'});
    assert.equal(await next(pool[1]),null);await due(1);
  }
  console.log(JSON.stringify({engine:(await q('show server_version'))[0].server_version,
    concurrent_sessions:20,global_cap:'passed',skip_locked:'passed',ordering:'passed',backoff:'passed',
    expired_recovery:'passed',terminal_no_progress:'passed',stale_fence:'passed',kill_switch:'passed',role_isolation:'passed',preplan_release:'passed'}));
} finally {
  await Promise.allSettled(clients.map(c=>c.end()));
}
