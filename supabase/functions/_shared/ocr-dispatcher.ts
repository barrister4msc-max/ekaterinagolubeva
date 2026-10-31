import { runLeasedPdfOcr, type ClaimedPdfJob } from "./leased-pdf-ocr.ts";
import type { OcrPdfSource, PdfOcrWaveDependencies } from "./pdf-ocr-wave.ts";

export function isValidOcrDispatchToken(token:string,serviceKey:string) {
  return token.length>=32 && token!==serviceKey && !token.startsWith("sb_publishable_") && !token.startsWith("sb_secret_") &&
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}
async function authorized(header:string|null,token:string,serviceKey:string) {
  if(!isValidOcrDispatchToken(token,serviceKey) || !header || header.length>1024)return false;
  const supplied=header.match(/^Bearer (.+)$/)?.[1];if(!supplied)return false;
  const hash=(s:string)=>crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  const [a,b]=await Promise.all([hash(supplied),hash(token)]);
  const left=new Uint8Array(a),right=new Uint8Array(b);let diff=0;
  for(let i=0;i<left.length;i++)diff|=left[i]^right[i];return diff===0;
}
async function emptyWakeup(req:Request,signal:AbortSignal) {
  if(!req.body)return true;
  const reader=req.body.getReader();let text="",length=0;const decoder=new TextDecoder();
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener("abort",cancel,{once:true});
  try{
    while(true){const {value,done}=await reader.read();if(done)break;
      length+=value.length;if(length>128){await reader.cancel();return false;}
      text+=decoder.decode(value,{stream:true});
    }
    if(signal.aborted)return false;
    text+=decoder.decode();if(!text.trim())return true;
    const data=JSON.parse(text);return data!==null && typeof data==="object" && !Array.isArray(data) && Object.keys(data).length===0;
  }catch{return false;}finally{signal.removeEventListener("abort",cancel);reader.releaseLock();}
}

export function createOcrDispatcher<Source extends OcrPdfSource,Page>(config:{
  enabled:boolean;ready:boolean;token:string;serviceKey:string;
  deadlineMs?:number;
  client:(signal:AbortSignal)=>any;wave:PdfOcrWaveDependencies<Source,Page>;
}) {
  return async(req:Request):Promise<Response>=>{
    const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    if(req.method!=="POST")return json({error:"method_not_allowed"},405);
    if(!await authorized(req.headers.get("Authorization"),config.token,config.serviceKey))return json({error:"unauthorized"},401);
    if(!config.enabled)return json({status:"disabled"});
    if(!config.ready)return json({error:"dispatcher_unavailable"},503);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.max(1,Math.min(config.deadlineMs??140_000,140_000)));
    try{
      if(!await emptyWakeup(req,controller.signal))return json({error:"invalid_wakeup"},400);
      const client=config.client(controller.signal);
      const {data,error}=await client.rpc("kati_claim_next_reserved_ocr_job",{p_lease_seconds:180});
      if(error)return json({error:"claim_unavailable"},503);
      if(data===null)return json({status:"idle"});
      if(data?.acquired!==true || typeof data.document_id!=="string" || !data.document_id || typeof data.job_id!=="string" || !data.job_id ||
        typeof data.lease_token!=="string" || !data.lease_token || !data.checkpoint || typeof data.checkpoint!=="object" || Array.isArray(data.checkpoint))
        return json({error:"claim_unavailable"},503);
      const result=await runLeasedPdfOcr(client,data as ClaimedPdfJob,{...config.wave,signal:controller.signal});
      if(result.status>=500)return json({error:"processing_unavailable"},503);
      const states=["completed","partial_pages","ocr_required","needs_manual_review"];
      return json({status:"processed",outcome:states.includes(result.body.extraction_status)
        ?result.body.extraction_status:result.status===409?"review_required":"unknown"});
    }catch{return json({error:"dispatcher_unavailable"},503);}
    finally{clearTimeout(timer);controller.abort();}
  };
}
