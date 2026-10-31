import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { isValidOcrDispatchToken } from "../_shared/ocr-dispatcher.ts";
import { createOcrControl } from "../_shared/ocr-control.ts";
import { createPdfTextLayerExtractor } from "../_shared/pdf-text-layer.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "",
  key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const extractText = createPdfTextLayerExtractor(async () => {
  // @ts-ignore Same bundled parser as extract-document-text.
  return await import("https://esm.sh/pdfjs-dist@4.10.38/deno/legacy/build/pdf.bundle.mjs");
});
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
      Deno.env.get("GEMINI_API_KEY") &&
      isValidOcrDispatchToken(Deno.env.get("KATI_OCR_DISPATCH_TOKEN") ?? "", key),
    ),
    client: () => {
      const signal = AbortSignal.timeout(90_000);
      return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: AbortSignal.any(init?.signal ? [init.signal, signal] : [signal]),
            }),
        },
      });
    },
    extractText,
  }),
);
