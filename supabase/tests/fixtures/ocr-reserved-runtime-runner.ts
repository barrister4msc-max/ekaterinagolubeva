// Actual handler + actual shared wave + executable PostgreSQL RPCs; only SDKs,
// Storage, auth and provider transport are doubled. No network/provider costs.
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const db = new PGlite();
const docId="10000000-0000-4000-8000-000000000001";
const secret="offline-service-secret", canary="PRIVATE_OCR_CANARY";
const logs: unknown[]=[];
const realLog=console.log;
for(const method of ["log","warn","error"] as const) console[method]=(...args)=>{logs.push(args);};
let enabled=true, failFirst=true, denyClaim=false, loseFinish=false, corrupt=false;
let calls:number[]=[];
let storageBytes="offline PDF", changePointerBeforeReserve=false, changePointerBeforeFinish=false;
let latestLease:any, firstLease:any;
let handler:(req:Request)=>Promise<Response>;
const folder=await mkdtemp(join(tmpdir(),"kati-reserved-runtime-"));
const q=async (sql:string,args:any[]=[]) => (await db.query(sql,args)).rows as any[];
const cp=async()=> (await q("select checkpoint from document_ocr_jobs where document_id=$1",[docId]))[0].checkpoint;
const binding:Record<string,string[]>={
  kati_guard_reserved_ocr_source:["p_document_id","p_job_id","p_lease_token","p_source","p_bind"],
  kati_claim_document_ocr_job:["p_document_id","p_lease_seconds"],
  kati_claim_reserved_document_ocr_job:["p_document_id","p_lease_seconds"],
  kati_reserve_document_ocr_unit:["p_document_id","p_job_id","p_lease_token","p_page_count","p_unit_start","p_unit_end"],
  kati_settle_document_ocr_unit:["p_document_id","p_job_id","p_lease_token","p_unit_start","p_reservation_id","p_text","p_error_code"],
  kati_finish_reserved_document_ocr_wave:["p_document_id","p_job_id","p_lease_token","p_page_count"],
  kati_persist_document_ocr_checkpoint:["p_document_id","p_job_id","p_lease_token","p_job_status","p_checkpoint","p_metadata_patch","p_ocr_text","p_analysis_status","p_review_status","p_last_error_code"],
};
const invokeRpc=async(name:string,args:Record<string,any>)=>{
  const values=binding[name].map(k=>args[k]??null);
  const sql=`select ${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as r`;
  if(name.includes("claim_")) return q(sql.replace(`select ${name}(`,`select * from ${name}(`).replace(") as r",")"),values);
  return (await q(sql,values))[0].r;
};
const sb={
  auth:{ getUser:async()=>({data:{user:null},error:{message:canary}}) },
  from:(table:string)=>({
    select(){assert.ok(["documents","document_ocr_jobs"].includes(table));return this;},eq(){return this;},
    async maybeSingle(){return {data:(await q(table==="documents"?"select * from documents where id=$1":"select id from document_ocr_jobs where document_id=$1",[docId]))[0]??null,error:null};},
    update(){throw new Error("reserved handler must use atomic finish RPC");},
  }),
  storage:{from:()=>({download:async()=>({data:new Blob([storageBytes]),error:null})})},
  async rpc(name:string,args:Record<string,any>){
    if(denyClaim && name==="kati_claim_reserved_document_ocr_job") return {data:null,error:{message:canary}};
    if(loseFinish && name==="kati_finish_reserved_document_ocr_wave") return {data:null,error:{message:canary}};
    if(changePointerBeforeReserve && name==="kati_reserve_document_ocr_unit"){
      changePointerBeforeReserve=false;
      await db.query("update documents set storage_path='replaced-path' where id=$1",[docId]);
    }
    if(changePointerBeforeFinish && name==="kati_finish_reserved_document_ocr_wave"){
      changePointerBeforeFinish=false;
      await db.query("update documents set storage_path='replaced-path' where id=$1",[docId]);
    }
    const data=await invokeRpc(name,args);
    if(name==="kati_claim_reserved_document_ocr_job" && data[0].acquired){
      latestLease=data[0];firstLease??=data[0];
      // Legacy writes/claims are blocked even with the CURRENT valid lease.
      const old=await invokeRpc("kati_claim_document_ocr_job",args);
      assert.equal(old[0].acquired,false);
      assert.equal(await invokeRpc("kati_persist_document_ocr_checkpoint",{
        p_document_id:docId,p_job_id:latestLease.job_id,p_lease_token:latestLease.lease_token,
        p_job_status:"completed",p_checkpoint:{},p_metadata_patch:{bad:"overwrite"},
        p_ocr_text:"overwrite",p_analysis_status:"pending",p_review_status:"not_started",
      }),false);
    }
    return {data,error:null};
  },
};
(globalThis as any).testSupabase=sb;
(globalThis as any).testPdf={
  load:async()=>{if(corrupt)throw new Error("private corrupt PDF");return {getPageCount:()=>18};},
  create:async()=>{let start=0;return {
    copyPages:async(_source:unknown,pages:number[])=>{start=pages[0];return pages;},
    addPage(){},save:async()=>new Uint8Array([start]),
  };},
};
(globalThis as any).Deno={
  env:{get:(name:string)=> name==="KATI_OCR_UNIT_RESERVATIONS_ENABLED"?String(enabled):name==="SUPABASE_SERVICE_ROLE_KEY"?secret:"offline-key"},
  serve:(fn:typeof handler)=>{handler=fn;},
};
globalThis.fetch=(async(url:unknown,init:any)=>{
  assert.ok(String(url).startsWith("https://generativelanguage.googleapis.com/"));
  const payload=JSON.parse(init.body);
  const encoded=payload.contents[0].parts.find((p:any)=>p.inline_data).inline_data.data;
  const start=Buffer.from(encoded,"base64")[0];calls.push(start);
  const state=await cp();
  // The provider never runs before its durable reservation is committed.
  assert.ok(state.page_index.units[start/6].attempts>=1 && state.page_index.units[start/6].attempts<=3);
  assert.equal(state.page_index.units[start/6].error,"ocr_attempt_unresolved");
  assert.equal(state.ocr_unit_reservations[String(start)].lease_token,latestLease.lease_token);
  if(start===0 && failFirst)return new Response(canary,{status:503});
  return new Response(JSON.stringify({candidates:[{finishReason:"STOP",content:{parts:[{text:`text-${start}`}]}}]}));
}) as typeof fetch;
const loadHandler=async(name:string)=>{
  let source=await readFile(new URL("../../functions/extract-document-text/index.ts",import.meta.url),"utf8");
  source=source.replace(/import \{ createClient \} from "[^"]+";/,"const createClient = () => globalThis.testSupabase;")
    .replace(/import JSZip from "[^"]+";/,"const JSZip = {};")
    .replace(/import \{ PDFDocument \} from "[^"]+";/,"const PDFDocument = globalThis.testPdf;")
    .replaceAll('"../_shared/','"'+new URL("../../functions/_shared/",import.meta.url).href)
    .replace(/await import\(\s*"https:[^"]+"\s*\)/g,'await Promise.reject(new Error("private text-layer error"))');
  const path=join(folder,name+".ts");await writeFile(path,source);await import(pathToFileURL(path).href);
};
const invoke=async(token=secret)=>handler(new Request("https://offline.test",{
  method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({document_id:docId}),
}));
const expire=async()=>{await db.exec("reset role; update document_ocr_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where status='running'; set role service_role;");};
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table documents(id uuid primary key,file_name text,mime_type text,storage_path text,ocr_text text,
      metadata jsonb,analysis_status text,review_status text,updated_at timestamptz);
    grant select,update on documents to service_role;`);
  for(const file of ["20260922120000_stage13l2b_durable_ocr_jobs.sql","20260922120554_fix_stage13l2b_lease_counter.sql",
    "20261029151613_e05_ocr_attempt_reservations.sql","20261029190337_e05_reserved_ocr_runtime.sql","20261031134647_e05_ocr_source_fingerprint.sql"])
    await db.exec(await readFile(new URL("../../migrations/"+file,import.meta.url),"utf8"));
  await db.query("insert into documents values($1,'scan.pdf','application/pdf','private-path','', $2,'pending','not_started',now())",[docId,{preserve:"manual"}]);
  for(const role of ["anon","authenticated"]){
    await db.exec("set role "+role);
    for(const sql of ["select kati_claim_reserved_document_ocr_job(null)","select kati_finish_reserved_document_ocr_wave(null,null,null,null)","select kati_guard_reserved_ocr_source(null,null,null,null,true)"]){
      let code;try{await db.exec(sql);}catch(e:any){code=e.code;}assert.equal(code,"42501");
    }await db.exec("reset role");
  }
  await db.exec("set role service_role");await loadHandler("enabled");
  assert.equal((await invoke("invalid")).status,401);assert.equal(calls.length,0);
  denyClaim=true;assert.equal((await invoke()).status,503);assert.equal(calls.length,0);denyClaim=false;
  let response=await invoke();let result=await response.json();
  assert.equal(response.status,200);assert.equal(result.extraction_status,"partial_pages");
  assert.equal(result.page_index_progress.percent,66);assert.equal(result.continuation_required,true);
  assert.equal(JSON.stringify(result).includes("lease_token"),false);
  assert.deepEqual(calls,[0,6,12]);assert.equal((await cp()).page_index.units[0].attempts,1);
  failFirst=false;
  response=await invoke();result=await response.json();
  assert.equal(result.extraction_status,"completed");assert.equal(result.page_index_progress.percent,100);
  assert.deepEqual(calls,[0,6,12,0]);
  let row=(await q("select * from documents where id=$1",[docId]))[0];
  assert.equal(row.ocr_text,"text-0\n\ntext-6\n\ntext-12");assert.equal(row.metadata.preserve,"manual");
  assert.deepEqual((await cp()).page_index.units.map((u:any)=>u.attempts),[2,1,1]);
  assert.equal((await invokeRpc("kati_finish_reserved_document_ocr_wave",{p_document_id:docId,p_job_id:firstLease.job_id,p_lease_token:firstLease.lease_token,p_page_count:18})).persisted,false);

  // Crash after all unit settlements but before final-wave publication.
  await db.exec("reset role");await db.query("delete from document_ocr_jobs where document_id=$1",[docId]);
  await db.query("update documents set metadata='{}',ocr_text='' where id=$1",[docId]);
  await db.exec("set role service_role");calls=[];failFirst=true;loseFinish=true;
  assert.equal((await invoke()).status,503);assert.deepEqual(calls,[0,6,12]);
  assert.equal((await cp()).page_index.units[1].text,"text-6");
  await expire();loseFinish=false;failFirst=false;
  response=await invoke();result=await response.json();assert.equal(result.extraction_status,"completed");
  assert.deepEqual(calls,[0,6,12,0]); // completed units never sent again
  enabled=false;await loadHandler("disabled");
  assert.equal((await invoke()).status,503);assert.deepEqual(calls,[0,6,12,0]);
  enabled=true;await loadHandler("enabled-again");
  await db.exec("reset role");await db.query("delete from document_ocr_jobs where document_id=$1",[docId]);
  await db.query("update documents set metadata='{}',ocr_text='' where id=$1",[docId]);await db.exec("set role service_role");
  calls=[];failFirst=true;
  for(let n=1;n<=3;n++){
    const failed=await (await invoke()).json();
    assert.equal(failed.extraction_status,n===3?"needs_manual_review":"partial_pages");
    assert.equal(failed.page_index_progress.complete,false);
  }
  assert.equal((await (await invoke()).json()).extraction_status,"needs_manual_review");
  assert.deepEqual(calls,[0,6,12,0,0]);
  assert.equal((await cp()).page_index.units[0].attempts,3);
  // Changing bytes with the SAME length/path/page count cannot complete or
  // reuse the old page plan, including requests for an already completed job.
  await db.exec("reset role");await db.query("delete from document_ocr_jobs where document_id=$1",[docId]);
  await db.query("update documents set metadata='{}',ocr_text='' where id=$1",[docId]);await db.exec("set role service_role");
  failFirst=false;
  assert.equal((await (await invoke()).json()).extraction_status,"completed");
  const oldCheckpoint=await cp();
  const oldText=(await q("select ocr_text from documents where id=$1",[docId]))[0].ocr_text;
  storageBytes="replacedPDF";
  assert.equal(storageBytes.length,"offline PDF".length);
  const beforeMismatch=calls.length;
  assert.equal((await invoke()).status,409);assert.equal(calls.length,beforeMismatch);
  assert.deepEqual(await cp(),oldCheckpoint);
  assert.equal((await q("select ocr_text from documents where id=$1",[docId]))[0].ocr_text,oldText);
  assert.equal((await q("select last_error_code from document_ocr_jobs where document_id=$1",[docId]))[0].last_error_code,"ocr_source_mismatch");
  storageBytes="offline PDF";
  // Unbound legacy metadata is preserved for explicit review, never adopted.
  await db.exec("reset role");await db.query("delete from document_ocr_jobs where document_id=$1",[docId]);
  const legacy={page_count:18,unit_size:6,units:[0,6,12].map(start=>({start,end:start+6,status:"completed",attempts:1,text_length:6,text:`text-${start}`}))};
  await db.query("update documents set metadata=$2,ocr_text='preserve legacy' where id=$1",[docId,{page_index:legacy}]);await db.exec("set role service_role");
  const beforeUnbound=calls.length;
  assert.equal((await invoke()).status,409);assert.equal(calls.length,beforeUnbound);
  assert.deepEqual((await cp()).page_index,legacy);
  assert.equal((await q("select ocr_text from documents where id=$1",[docId]))[0].ocr_text,"preserve legacy");
  assert.equal((await q("select last_error_code from document_ocr_jobs where document_id=$1",[docId]))[0].last_error_code,"ocr_source_unbound_checkpoint");
  // The pointer changes after binding but before the first unit reservation.
  await db.exec("reset role");await db.query("delete from document_ocr_jobs where document_id=$1",[docId]);
  await db.query("update documents set metadata='{}',ocr_text='' where id=$1",[docId]);await db.exec("set role service_role");
  changePointerBeforeReserve=true;
  const beforePointer=calls.length;
  assert.equal((await invoke()).status,409);assert.equal(calls.length,beforePointer);
  assert.equal((await q("select last_error_code from document_ocr_jobs where document_id=$1",[docId]))[0].last_error_code,"ocr_source_mismatch");
  await db.query("update documents set storage_path='private-path' where id=$1",[docId]);
  // A late pointer change is rejected at final publication too. Unit text stays
  // in the old-source checkpoint; it is not published as the new file's OCR.
  await db.exec("reset role");await db.query("delete from document_ocr_jobs where document_id=$1",[docId]);
  await db.query("update documents set metadata='{}',ocr_text='' where id=$1",[docId]);await db.exec("set role service_role");
  changePointerBeforeFinish=true;failFirst=false;
  assert.equal((await invoke()).status,409);
  assert.equal((await q("select ocr_text from documents where id=$1",[docId]))[0].ocr_text,"");
  assert.equal((await cp()).page_index.units[0].text,"text-0");
  await db.query("update documents set storage_path='private-path' where id=$1",[docId]);
  corrupt=true;
  await db.exec("reset role");await db.query("delete from document_ocr_jobs where document_id=$1",[docId]);
  await db.query("update documents set metadata='{}',ocr_text='' where id=$1",[docId]);await db.exec("set role service_role");
  const beforeCorruptCalls=calls.length;
  for(let n=1;n<=3;n++){
    const bad=await (await invoke()).json();
    assert.equal(bad.extraction_status,n===3?"needs_manual_review":"ocr_required");
    assert.equal(bad.continuation_required,n<3);
  }
  assert.equal(calls.length,beforeCorruptCalls);
  assert.ok(!JSON.stringify(logs).includes(canary));
  realLog("ocr_reserved_runtime_passed");
}finally{await db.close();await rm(folder,{recursive:true,force:true});}
