import { providerException, providerHttpFailure } from "./ai-privacy-diagnostics.ts";

export const GEMINI_OCR_MODEL = "gemini-2.5-flash";
function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

// Diagnostic fields must never echo arbitrary document/provider metadata.
export function diagnosticMime(value: string): string {
  return ["application/pdf", "image/jpeg", "image/png", "image/tiff", "image/webp"].includes(value)
    ? value : "application/octet-stream";
}

function diagnosticFinishReason(value: unknown): string {
  return typeof value === "string" && ["STOP", "MAX_TOKENS", "SAFETY", "RECITATION", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL"].includes(value)
    ? value : "UNKNOWN";
}


export function createGeminiOcrExtractor(GEMINI_API_KEY: string, GEMINI_MODEL = GEMINI_OCR_MODEL) {
  return async function extractWithGeminiFallback(params: {
  buf: ArrayBuffer;
  mimeType: string;
  fileName: string;
  signal?: AbortSignal;
}): Promise<{ text: string; debug: Record<string, unknown> }> {
  if (!GEMINI_API_KEY) {
  console.error("[extract-document-text] GEMINI_API_KEY is missing");
  return { text: "", debug: { error: "GEMINI_API_KEY missing", model: GEMINI_MODEL, mimeType: diagnosticMime(params.mimeType), byteLength: params.buf.byteLength } };
}

  const base64 = arrayBufferToBase64(params.buf);

  

  const parts = [
  {
    text:
      "Извлеки весь читаемый текст с изображения/скана. Верни только текст. Если текста нет — верни пустую строку.",
  },
  {
    inline_data: {
      mime_type: params.mimeType,
      data: base64,
    },
  },
];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: params.signal ?? AbortSignal.timeout(90_000),
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      const failure = providerHttpFailure(GEMINI_MODEL, response.status, errorText);
      console.error("[extract-document-text] Gemini fallback failed", failure);
      // Preserve TIFF unsupported-format handling without retaining the body.
      const error = /unsupported/i.test(errorText) ? "ocr_format_unsupported" : "provider_http_error";
      return { text: "", debug: { ...failure, error, mimeType: diagnosticMime(params.mimeType), byteLength: params.buf.byteLength } };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const debug = {
      finishReason: diagnosticFinishReason(data?.candidates?.[0]?.finishReason),
      candidate_text_length: text.length,
      byteLength: params.buf.byteLength,
      mimeType: diagnosticMime(params.mimeType),
      model: GEMINI_MODEL,
    };
    console.log("[extract-document-text] Gemini OCR response", JSON.stringify(debug));

    return { text, debug };
  } catch {
    console.error("[extract-document-text] Gemini fallback exception", providerException(GEMINI_MODEL));
    // An archive caller may let this propagate; the exception remains safe.
    throw new Error("ocr_provider_exception");
  }
}

}
