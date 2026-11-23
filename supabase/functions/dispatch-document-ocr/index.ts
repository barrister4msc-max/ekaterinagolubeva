import { createFreshOcrStorageFetch } from "../_shared/ocr-storage-fetch.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { readOcrProvider } from "../_shared/ocr-provider.ts";
import { createOcrDispatcher } from "../_shared/ocr-dispatcher.ts";
import { readSupabaseServerKey } from "../_shared/supabase-server-key.ts";

const url=Deno.env.get("SUPABASE_URL")??"";
const serviceKey=readSupabaseServerKey((name)=>Deno.env.get(name));
const provider=readOcrProvider((name)=>Deno.env.get(name));
Deno.serve(createOcrDispatcher({
  enabled:Deno.env.get("KATI_OCR_DISPATCH_ENABLED")==="true" &&
    Deno.env.get("KATI_OCR_UNIT_RESERVATIONS_ENABLED")==="true",
  ready:Boolean(url && serviceKey && provider.ready),
  token:Deno.env.get("KATI_OCR_DISPATCH_TOKEN")??"",serviceKey,
  client:(signal)=>createClient(url,serviceKey,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:createFreshOcrStorageFetch(url,(input,init)=>fetch(input,{...init,signal:AbortSignal.any(init?.signal?[signal,init.signal]:[signal])}))},
  }),
  wave:{pdf:PDFDocument,extract:provider.extract},
}));
