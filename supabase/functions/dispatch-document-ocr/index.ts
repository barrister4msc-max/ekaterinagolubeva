import { createFreshOcrStorageFetch } from "../_shared/ocr-storage-fetch.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { createGeminiOcrExtractor } from "../_shared/gemini-ocr-provider.ts";
import { createOcrDispatcher } from "../_shared/ocr-dispatcher.ts";

const url=Deno.env.get("SUPABASE_URL")??"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const apiKey=Deno.env.get("GEMINI_API_KEY")??"";
Deno.serve(createOcrDispatcher({
  enabled:Deno.env.get("KATI_OCR_DISPATCH_ENABLED")==="true" &&
    Deno.env.get("KATI_OCR_UNIT_RESERVATIONS_ENABLED")==="true",
  ready:Boolean(url && serviceKey && apiKey),
  token:Deno.env.get("KATI_OCR_DISPATCH_TOKEN")??"",serviceKey,
  client:(signal)=>createClient(url,serviceKey,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:createFreshOcrStorageFetch(url,(input,init)=>fetch(input,{...init,signal:AbortSignal.any(init?.signal?[signal,init.signal]:[signal])}))},
  }),
  wave:{pdf:PDFDocument,extract:createGeminiOcrExtractor(apiKey)},
}));
