import assert from "node:assert/strict";
const canary="PRIVATE_CHALLENGE_CANARY";
let key="",lovable="",mode="valid",calls=0;
const diagnostics:unknown[]=[];
for(const method of ["warn","error"] as const)console[method]=(...args)=>diagnostics.push(args);
(globalThis as any).Deno={env:{get:(name:string)=>name==="GEMINI_API_KEY"?key:name==="LOVABLE_API_KEY"?lovable:undefined}};
// Fallback reads its key per invocation; Challenge reads credentials per run.
const {runChallenge}=await import("../../functions/analyze-document-legal-position/challenge.ts");
const {decideGeneration}=await import("../../functions/analyze-document-legal-position/enrich.ts");
const {OcrSourceAdmissionError}=await import("../../functions/_shared/ocr-consumer-admission.ts");
const fetcher=(async()=>{
  calls++;if(mode==="exception")throw Error(canary);
  if(mode==="denied")throw new OcrSourceAdmissionError();
  if(mode==="http")return new Response(canary,{status:503});
  if(mode==="empty")return new Response(JSON.stringify({candidates:[{content:{parts:[{text:""}]}}]}));
  const result=mode==="invalid"?canary:mode==="shape"?'{}':JSON.stringify({issues:mode==="issue"?[{kind:"weak_evidence",description:"Synthetic",affected_conclusions:[],affected_sources:[]}]:[],reasoning:"Synthetic",adverse_sources:[]});
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:result}]}}]}));
}) as typeof fetch;
const options={parsed:{},trusted:[],conclusions:[],fetcher};
const final=(challenge:any)=>decideGeneration({sufficiency:{status:"sufficient"},challenge,warnings:[],conclusions:[],trusted:[]}).final;
let r=await runChallenge(options);assert.equal(r.execution_status,"unavailable");assert.equal(r.status,null);assert.equal(calls,0);assert.equal(final(r),false);
key="offline-key";
for(const [scenario,status] of [["http","failed"],["exception","failed"],["empty","invalid_response"],["invalid","invalid_response"],["shape","invalid_response"]]){
  mode=scenario;r=await runChallenge(options);assert.equal(r.execution_status,status);assert.equal(r.status,null);assert.equal(final(r),false);
}
mode="valid";r=await runChallenge(options);assert.equal(r.execution_status,"passed");assert.equal(r.status,"passed");assert.equal(final(r),true);
mode="issue";r=await runChallenge(options);assert.equal(r.execution_status,"passed");assert.equal(r.status,"needs_revision");
mode="denied";const before=calls;await assert.rejects(()=>runChallenge(options),OcrSourceAdmissionError);assert.equal(calls,before+1);
assert.ok(!JSON.stringify(diagnostics).includes(canary));
console.log("challenge_execution_integration_passed");
