// Actual dispatcher entrypoint/shared leased processor/SQL; external SDKs,
// Storage and Gemini transport are doubled. This is not a real-PDF E06 run.
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile,writeFile,mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runLeasedPdfOcr } from "../../functions/_shared/leased-pdf-ocr.ts";
import { createGeminiOcrExtractor } from "../../functions/_shared/gemini-ocr-provider.ts";
import { createOcrDispatcher } from "../../functions/_shared/ocr-dispatcher.ts";

const db=new PGlite();const docId="10000000-0000-4000-8000-000000000001";
const token="DISPATCH_TEST_"+"a".repeat(48),service="SERVICE_TEST_"+"b".repeat(48),canary="PRIVATE_DISPATCH_CANARY";
let enabled=true,configuredToken=token,pageCount=601,mode="success",storage="ok",loseFinish=false,claimError=false,badClaim=false;
let calls:number[]=[],rpcNames:string[]=[],clients=0,storageReads=0,bytes="original PDF bytes";
const diagnostics:unknown[]=[];const output=console.log;
for(const k of ["log","warn","error"] as const)console[k]=(...args)=>{diagnostics.push(args);};
let handler:(req:Request)=>Promise<Response>;
const q=async(sql:string,args:any[]=[]) => (await db.query(sql,args)).rows as any[];
const bindings:Record<string,string[]>={
  kati_claim_next_reserved_ocr_job:["p_lease_seconds"],
  kati_guard_reserved_ocr_source:["p_document_id","p_job_id","p_lease_token","p_source","p_bind"],
  kati_reserve_document_ocr_unit:["p_document_id","p_job_id","p_lease_token","p_page_count","p_unit_start","p_unit_end"],
  kati_settle_document_ocr_unit:["p_document_id","p_job_id","p_lease_token","p_unit_start","p_reservation_id","p_text","p_error_code"],
  kati_finish_reserved_document_ocr_wave:["p_document_id","p_job_id","p_lease_token","p_page_count"],
  kati_release_reserved_ocr_job:["p_document_id","p_job_id","p_lease_token","p_reason"],
};
const sb={
  from:(table:string)=>({select(){assert.equal(table,"documents");return this;},eq(){return this;},
    async maybeSingle(){return {data:(await q("select * from documents where id=$1",[docId]))[0],error:null};}}),
  storage:{from:()=>({download:async()=>{
    storageReads++;
    if(storage!=="ok")return {data:null,error:{status:storage==="missing"?404:503,message:canary}};
    return {data:new Blob([bytes]),error:null};
  }})},
  async rpc(name:string,args:Record<string,unknown>){
    rpcNames.push(name);assert.ok(name in bindings,"a second claim/HTTP extractor is forbidden");
    if(name==="kati_claim_next_reserved_ocr_job" && claimError)return {data:null,error:{message:canary}};
    if(name==="kati_claim_next_reserved_ocr_job" && badClaim)return {data:{acquired:true},error:null};
    if(name==="kati_finish_reserved_document_ocr_wave" && loseFinish)return {data:null,error:{message:canary}};
    const values=bindings[name].map(k=>args[k]??null);
    const data=(await q(`select ${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) r`,values))[0].r;
    return {data,error:null};
  },
};
const pdf={load:async()=>{if(mode==="corrupt")throw new Error(canary);return {getPageCount:()=>pageCount};},
  create:async()=>{let start=0;return {copyPages:async(_source:unknown,pages:number[])=>{start=pages[0];return pages;},
    addPage(){},save:async()=>new Uint8Array([start>>8,start&255])};}};
(globalThis as any).testPdf=pdf;
(globalThis as any).testCreateClient=(_url:unknown,_key:unknown,options:any)=>{
  clients++;assert.equal(typeof options.global.fetch,"function");return sb;
};
(globalThis as any).Deno={env:{get:(name:string)=>({
  KATI_OCR_DISPATCH_ENABLED:String(enabled),KATI_OCR_UNIT_RESERVATIONS_ENABLED:String(enabled),
  KATI_OCR_DISPATCH_TOKEN:configuredToken,SUPABASE_SERVICE_ROLE_KEY:service,
  SUPABASE_URL:"https://offline.test",GEMINI_API_KEY:"offline-api-key",
} as Record<string,string>)[name]},serve:(fn:typeof handler)=>{handler=fn;}};
globalThis.fetch=(async(url:unknown,init:any)=>{
  assert.ok(String(url).startsWith("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:"));
  const payload=JSON.parse(init.body);assert.deepEqual(payload.generationConfig,{temperature:0});
  assert.equal(payload.contents[0].parts[0].text,"Извлеки весь читаемый текст с изображения/скана. Верни только текст. Если текста нет — верни пустую строку.");
  const data=Buffer.from(payload.contents[0].parts[1].inline_data.data,"base64");
  const start=data[0]*256+data[1];calls.push(start);
  if(mode==="provider_error")return new Response(canary,{status:503});
  return new Response(JSON.stringify({candidates:[{finishReason:"STOP",content:{parts:[{text:`window-${start}`}]}}]}));
}) as typeof fetch;
const folder=await mkdtemp(join(tmpdir(),"kati-dispatcher-"));let loaded=0;
const load=async()=>{
  let source=await readFile(new URL("../../functions/dispatch-document-ocr/index.ts",import.meta.url),"utf8");
  source=source.replace(/import \{ createClient \} from "[^"]+";/,"const createClient = globalThis.testCreateClient;")
    .replace(/import \{ PDFDocument \} from "[^"]+";/,"const PDFDocument = globalThis.testPdf;")
    .replaceAll('"../_shared/','"'+new URL("../../functions/_shared/",import.meta.url).href);
  const path=join(folder,`entry-${loaded++}.ts`);await writeFile(path,source);await import(pathToFileURL(path).href);
};
const request=(body="{}",auth=token)=>new Request("https://offline.test/dispatch-document-ocr",{
  method:"POST",headers:{Authorization:"Bearer "+auth,"Content-Type":"application/json"},body,
});
const tick=async()=>{const response=await handler(request());const body=await response.json();
  assert.ok(!JSON.stringify(body).includes(canary));assert.ok(!JSON.stringify(body).includes("lease_token"));
  assert.ok(!JSON.stringify(body).includes("checkpoint"));return {status:response.status,body};};
const state=async()=>(await q("select * from document_ocr_jobs where document_id=$1",[docId]))[0];
const due=async()=>db.query("update document_ocr_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where document_id=$1",[docId]);
const seed=async(pages=18)=>{
  pageCount=pages;mode="success";storage="ok";loseFinish=false;bytes="original PDF bytes";calls=[];rpcNames=[];
  await db.exec("reset role");await db.query("delete from document_ocr_jobs where document_id=$1",[docId]);
  await db.query("update documents set metadata=$2,ocr_text='' where id=$1",[docId,{manual:"preserve"}]);
  await db.query("insert into document_ocr_jobs(document_id,dispatch_enabled,checkpoint) values($1,true,$2)",[docId,{ocr_protocol:"reserved_v1"}]);
  await db.exec("set role service_role");
};
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table documents(id uuid primary key,file_name text,mime_type text,storage_path text,ocr_text text,metadata jsonb,
      analysis_status text,review_status text,updated_at timestamptz);
    grant select,update on documents to service_role;`);
  for(const m of ["20260922120000_stage13l2b_durable_ocr_jobs.sql","20260922120554_fix_stage13l2b_lease_counter.sql",
    "20261029151613_e05_ocr_attempt_reservations.sql","20261029190337_e05_reserved_ocr_runtime.sql",
    "20261031134647_e05_ocr_source_fingerprint.sql","20261031135820_e05_ocr_dispatch_claims.sql",
    "20261031141704_e05_ocr_dispatch_release.sql"])
    await db.exec(await readFile(new URL("../../migrations/"+m,import.meta.url),"utf8"));
  await db.query("insert into documents values($1,'scan.pdf','application/pdf','private-path','', $2,'pending','not_started',now())",[docId,{}]);
  await db.exec("set role service_role");await load();
  for(const bad of ["wrong",service])assert.equal((await handler(request("{}",bad))).status,401);
  assert.equal((await handler(new Request("https://offline.test",{method:"POST",body:"{}"}))).status,401);
  assert.equal((await handler(new Request("https://offline.test",{method:"GET"}))).status,405);
  assert.equal(clients,0);assert.equal(rpcNames.length,0);
  enabled=false;await load();assert.equal((await tick()).body.status,"disabled");assert.equal(clients,0);
  enabled=true;configuredToken=service;await load();assert.equal((await handler(request("{}",service))).status,401);assert.equal(clients,0);
  configuredToken="";await load();assert.equal((await handler(request())).status,401);assert.equal(clients,0);
  for(const publicKey of ["sb_publishable_"+"x".repeat(40),"eyJfakeHeader.eyJfakePayload."+"x".repeat(40)]){
    configuredToken=publicKey;await load();assert.equal((await handler(request("{}",publicKey))).status,401);assert.equal(clients,0);
  }
  configuredToken=token;await load();
  for(const bad of ['{"document_id":"arbitrary"}',"null","[]"," ".repeat(129)])assert.equal((await handler(request(bad))).status,400);
  assert.equal(clients,0);
  claimError=true;assert.equal((await tick()).status,503);claimError=false;
  badClaim=true;assert.equal((await tick()).status,503);badClaim=false;assert.equal(storageReads,0);assert.equal(calls.length,0);
  assert.equal((await tick()).body.status,"idle");

  // Only the first wave is interactive. All remaining invocations are server
  // wakeups, with no tab/UI calls and no second claim in application code.
  await seed(601);
  const first=(await q("select * from kati_claim_reserved_document_ocr_job($1)",[docId]))[0];
  const manual=await runLeasedPdfOcr(sb,{...first,document_id:docId},{pdf,extract:createGeminiOcrExtractor("offline-api-key")});
  assert.equal(manual.body.extraction_status,"partial_pages");assert.equal(calls.length,3);
  rpcNames=[];
  for(let i=0;i<33;i++){const result=await tick();assert.equal(result.status,200);
    assert.equal(result.body.outcome,i===32?"completed":"partial_pages");}
  let row=await state();assert.equal(row.status,"completed");assert.equal(row.invocation_count,34);
  assert.deepEqual(calls,Array.from({length:101},(_,i)=>i*6));
  assert.equal(rpcNames.filter(n=>n==="kati_claim_next_reserved_ocr_job").length,33);
  assert.equal(row.checkpoint.page_index.units.every((u:any)=>u.status==="completed"&&u.attempts===1),true);
  const document=(await q("select * from documents where id=$1",[docId]))[0];
  assert.equal(document.ocr_text,Array.from({length:101},(_,i)=>`window-${i*6}`).join("\n\n"));
  assert.equal(document.metadata.manual,"preserve");assert.equal((await tick()).body.status,"idle");

  await seed();loseFinish=true;assert.equal((await tick()).status,503);assert.equal(calls.length,3);
  await db.exec("reset role");await db.query("update document_ocr_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where document_id=$1",[docId]);await db.exec("set role service_role");
  loseFinish=false;assert.equal((await tick()).body.outcome,"completed");assert.equal(calls.length,3);

  for(const scenario of ["provider_error","corrupt","transient"]){
    await seed();if(scenario==="transient")storage="transient";else mode=scenario;
    for(let attempt=0;attempt<3;attempt++){await tick();if(attempt<2){assert.equal((await tick()).body.status,"idle");await due();}}
    assert.equal((await state()).status,"needs_manual_review");assert.equal((await tick()).body.status,"idle");
    assert.equal(calls.length,scenario==="provider_error"?9:0);
  }
  await seed();storage="missing";assert.equal((await tick()).body.outcome,"needs_manual_review");assert.equal(calls.length,0);
  assert.equal((await state()).last_error_code,"ocr_source_missing");

  await seed(24);assert.equal((await tick()).body.outcome,"partial_pages");const before=await state();
  bytes="replaced PDF bytes";assert.equal((await tick()).body.outcome,"review_required");
  assert.equal(calls.length,3);assert.deepEqual((await state()).checkpoint,before.checkpoint);
  assert.equal((await state()).status,"needs_manual_review");
  await seed();await db.query("update document_ocr_jobs set dispatch_enabled=false where document_id=$1",[docId]);
  assert.equal((await tick()).body.status,"idle");assert.equal(calls.length,0);
  assert.ok(!JSON.stringify(diagnostics).includes(canary));
  assert.ok(!JSON.stringify(diagnostics).includes(token));assert.ok(!JSON.stringify(diagnostics).includes(service));

  let deadlineStorage=false;
  const timed=createOcrDispatcher({enabled:true,ready:true,token,serviceKey:service,deadlineMs:5,wave:{pdf,extract:createGeminiOcrExtractor("offline-api-key")},
    client:(signal)=>({rpc:()=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error(canary)),{once:true})),
      storage:{from:()=>{deadlineStorage=true;throw new Error("unexpected");}}})});
  assert.equal((await timed(request())).status,503);assert.equal(deadlineStorage,false);
  output("ocr_dispatcher_integration_passed");
}finally{await db.close();await rm(folder,{recursive:true,force:true});}
