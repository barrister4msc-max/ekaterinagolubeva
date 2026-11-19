import { createGeminiOcrExtractor } from "./gemini-ocr-provider.ts";
import { createOpenAiOcrExtractor } from "./openai-ocr-provider.ts";

// Enqueue readiness and dispatch must use the same explicitly selected provider.
export function readOcrProvider(read: (name: string) => string | undefined) {
  const provider = read("KATI_OCR_PROVIDER") ?? "gemini";
  if (provider === "openai") {
    const key = read("OPENAI_API_KEY") ?? "";
    return { ready: Boolean(key), extract: createOpenAiOcrExtractor(key) };
  }
  const key = provider === "gemini" ? (read("GEMINI_API_KEY") ?? "") : "";
  return { ready: provider === "gemini" && Boolean(key), extract: createGeminiOcrExtractor(key) };
}
