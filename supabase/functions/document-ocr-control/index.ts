import { createFreshOcrStorageFetch } from "../_shared/ocr-storage-fetch.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { isValidOcrDispatchToken } from "../_shared/ocr-dispatcher.ts";
import { createOcrControl } from "../_shared/ocr-control.ts";
import { createPdfTextLayerExtractor } from "../_shared/pdf-text-layer.ts";
import { loadDenoPdfJs } from "../_shared/deno-pdfjs.ts";
import { readSupabaseServerKey } from "../_shared/supabase-server-key.ts";
import { readOcrProvider } from "../_shared/ocr-provider.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "",
  key = readSupabaseServerKey((name) => Deno.env.get(name));
const extractText = createPdfTextLayerExtractor(loadDenoPdfJs);
Deno.serve(
  createOcrControl({
    enabled: [
      "KATI_OCR_ENQUEUE_ENABLED",
      "KATI_OCR_DISPATCH_ENABLED",
      "KATI_OCR_UNIT_RESERVATIONS_ENABLED",
    ].every((k) => Deno.env.get(k) === "true"),
    ready: Boolean(
      url &&
      key &&
      readOcrProvider((name) => Deno.env.get(name)).ready &&
      isValidOcrDispatchToken(Deno.env.get("KATI_OCR_DISPATCH_TOKEN") ?? "", key),
    ),
    client: () => {
      const signal = AbortSignal.timeout(90_000);
      return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: createFreshOcrStorageFetch(url, (input, init) =>
            fetch(input, {
              ...init,
              signal: AbortSignal.any(init?.signal ? [init.signal, signal] : [signal]),
            }),
          ),
        },
      });
    },
    extractText,
  }),
);
