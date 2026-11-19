import { providerException, providerHttpFailure } from "./ai-privacy-diagnostics.ts";
import { arrayBufferToBase64, diagnosticMime } from "./gemini-ocr-provider.ts";

export const OPENAI_OCR_MODEL = "gpt-5.4-mini-2026-03-17";
export const OPENAI_OCR_MAX_OUTPUT_TOKENS = 8192;

export function createOpenAiOcrExtractor(apiKey: string, fetcher: typeof fetch = fetch) {
  return async (params: {
    buf: ArrayBuffer;
    mimeType: string;
    fileName: string;
    signal?: AbortSignal;
  }): Promise<{ text: string; debug: Record<string, unknown> }> => {
    const debug = {
      provider: "openai",
      model: OPENAI_OCR_MODEL,
      mimeType: diagnosticMime(params.mimeType),
      byteLength: params.buf.byteLength,
    };
    if (!apiKey) return { text: "", debug: { ...debug, error: "provider_not_configured" } };
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(params.mimeType)) {
      return { text: "", debug: { ...debug, error: "ocr_format_unsupported" } };
    }
    const dataUrl = `data:${params.mimeType};base64,${arrayBufferToBase64(params.buf)}`;
    const attachment =
      params.mimeType === "application/pdf"
        ? { type: "input_file", filename: "ocr-window.pdf", file_data: dataUrl, detail: "high" }
        : { type: "input_image", image_url: dataUrl, detail: "high" };
    const timeout = AbortSignal.timeout(90_000);
    const signal = params.signal ? AbortSignal.any([params.signal, timeout]) : timeout;
    try {
      // Exactly one request per durable reservation. The queue owns retries.
      const response = await fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        redirect: "error",
        signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OPENAI_OCR_MODEL,
          store: false,
          max_output_tokens: OPENAI_OCR_MAX_OUTPUT_TOKENS,
          reasoning: { effort: "none" },
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Извлеки весь читаемый текст с изображения/скана. Верни только текст. Если текста нет — верни пустую строку.",
                },
                attachment,
              ],
            },
          ],
        }),
      });
      if (!response.ok) {
        const failure = providerHttpFailure(
          OPENAI_OCR_MODEL,
          response.status,
          await response.text(),
          "openai",
        );
        console.error("[dispatch-document-ocr] OpenAI OCR failed", failure);
        return { text: "", debug: { ...debug, ...failure, error: "provider_http_error" } };
      }
      const data = await response.json();
      if (
        data?.status !== "completed" ||
        data.error ||
        data.incomplete_details ||
        !Array.isArray(data.output)
      ) {
        return { text: "", debug: { ...debug, error: "ocr_response_incomplete" } };
      }
      const parts: string[] = [];
      for (const item of data.output) {
        if (item?.type === "reasoning") continue;
        if (
          item?.type !== "message" ||
          item.role !== "assistant" ||
          item.status !== "completed" ||
          !Array.isArray(item.content)
        ) {
          return { text: "", debug: { ...debug, error: "ocr_response_invalid" } };
        }
        for (const part of item.content) {
          if (part?.type !== "output_text" || typeof part.text !== "string") {
            return { text: "", debug: { ...debug, error: "ocr_response_invalid" } };
          }
          parts.push(part.text);
        }
      }
      const text = parts.join("\n").trim();
      const usage: Record<string, number> = {};
      for (const name of ["input_tokens", "output_tokens", "total_tokens"]) {
        const value = data.usage?.[name];
        if (Number.isSafeInteger(value) && value >= 0) usage[name] = value;
      }
      const result = { ...debug, candidate_text_length: text.length, usage };
      console.log("[dispatch-document-ocr] OpenAI OCR response", JSON.stringify(result));
      return { text, debug: result };
    } catch {
      console.error(
        "[dispatch-document-ocr] OpenAI OCR exception",
        providerException(OPENAI_OCR_MODEL, "openai"),
      );
      throw new Error("ocr_provider_exception");
    }
  };
}
