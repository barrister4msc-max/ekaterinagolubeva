import { processPdfOcrWave, type OcrPdfSource, type PdfOcrWaveDependencies } from "./pdf-ocr-wave.ts";
import { reservedOcrAttempts } from "./ocr-reservation-runtime.ts";
import { ocrSourceFingerprint } from "./ocr-source-fingerprint.ts";

export type ClaimedPdfJob = {
  document_id: string; job_id: string; lease_token: string;
  checkpoint: Record<string, unknown>;
};
type PreparedPdf = { doc: any; downloaded: { buf: ArrayBuffer; bucket: string } };
type Result = { status: number; body: Record<string, any> };

/** Called only after authorization + claim. Never claims or invokes an HTTP
 * extractor. Interactive reserved requests and the dispatcher share this path.
 */
export async function runLeasedPdfOcr<Source extends OcrPdfSource, Page>(
  supabase: any, job: ClaimedPdfJob, dependencies: PdfOcrWaveDependencies<Source,Page>,
  prepared?: PreparedPdf,
): Promise<Result> {
  const args = { p_document_id:job.document_id,p_job_id:job.job_id,p_lease_token:job.lease_token };
  const error = (code: string,status=503):Result=>({status,body:{error:code}});
  const release = async (reason:string,terminal=false):Promise<Result>=>{
    try {
      const {data,error:failure}=await supabase.rpc("kati_release_reserved_ocr_job",{...args,p_reason:reason});
      if(failure || data!==true)return error("ocr_release_unavailable");
      return terminal
        ? {status:200,body:{extraction_status:"needs_manual_review"}}
        : error("ocr_processing_unavailable");
    }catch{return error("ocr_release_unavailable");}
  };
  let doc:any,downloaded:PreparedPdf["downloaded"]|undefined;
  try {
    // Browser-enqueued work rechecks its pinned actor/session before any private
    // document or Storage content is loaded. The guard repeats at each unit.
    if(job.checkpoint.intake_scope){
      const {data,error:failure}=await supabase.rpc("kati_guard_reserved_ocr_source",{...args,p_source:null,p_bind:false});
      if(failure)return error("ocr_source_guard_unavailable");
      if(data?.allowed!==true)return error("ocr_source_rejected",409);
    }
    if(prepared){doc=prepared.doc;downloaded=prepared.downloaded;}
    else {
      const {data,error:failure}=await supabase.from("documents")
        .select("id,file_name,mime_type,storage_path,ocr_text,metadata").eq("id",job.document_id).maybeSingle();
      if(failure || !data)return await release("ocr_document_unavailable");
      doc=data;
    }
    if(doc.id!==job.document_id || !doc.storage_path)return await release("ocr_document_unavailable");
    if(doc.mime_type!=="application/pdf" && !String(doc.file_name??"").toLowerCase().endsWith(".pdf"))
      return await release("ocr_not_pdf",true);
    if(!downloaded){
      let missing=true;
      const pinned=job.checkpoint?.source_fingerprint as {bucket?:string}|undefined;
      const known=["lead-documents","communication-attachments","hero"];
      const buckets=pinned?.bucket && known.includes(pinned.bucket)?[pinned.bucket]:known;
      for(const bucket of buckets){
        const {data,error:failure}=await supabase.storage.from(bucket).download(doc.storage_path);
        if(!failure && data){downloaded={bucket,buf:await data.arrayBuffer()};break;}
        // Only a definite 404 in every candidate bucket is permanent.
        if(String(failure?.status??failure?.statusCode)!=="404")missing=false;
      }
      if(!downloaded)return await release(missing?"ocr_source_missing":"ocr_download_unavailable",missing);
    }
    const source=await ocrSourceFingerprint(downloaded.buf,downloaded.bucket,doc.storage_path);
    const {data:admission,error:failure}=await supabase.rpc("kati_guard_reserved_ocr_source",{
      ...args,p_source:source,p_bind:true,
    });
    if(failure)return error("ocr_source_guard_unavailable");
    if(admission?.allowed!==true)return error("ocr_source_rejected",409);
  }catch{return await release("ocr_download_unavailable");}
  let pageCount:number|null=null;
  try {
    const result=await processPdfOcrWave(downloaded!.buf,doc.file_name||"document",
      job.checkpoint?.page_index??doc.metadata?.page_index,typeof doc.ocr_text==="string"?doc.ocr_text:"",
      {...dependencies,attempts:reservedOcrAttempts(supabase,job.document_id,job)});
    pageCount=result.pageIndex.page_count;
  }catch {
    // Corrupt/planning failures are finalized through the same bounded budget.
    // Error text is never logged or persisted.
  }
  try {
    const {data,error:failure}=await supabase.rpc("kati_finish_reserved_document_ocr_wave",{...args,p_page_count:pageCount});
    if(failure)return error("ocr_checkpoint_unavailable");
    if(data?.persisted!==true)return error("ocr_checkpoint_lease_lost",409);
    return {status:200,body:data.result};
  }catch{return error("ocr_checkpoint_unavailable");}
}
