import { expect, test } from "bun:test";
import {
  createOpenAiOcrExtractor,
  OPENAI_OCR_MODEL,
} from "../functions/_shared/openai-ocr-provider.ts";
import { readOcrProvider } from "../functions/_shared/ocr-provider.ts";

const params = {
  buf: new Uint8Array([1, 2, 255]).buffer,
  mimeType: "application/pdf",
  fileName: "PRIVATE_NAME.pdf",
};
const message = (text: string) => ({
  type: "message",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text }],
});
const completed = { status: "completed", output: [message("first"), message("second")] };

test("OpenAI sends an inline PDF with fixed model, bounded output and private filename", async () => {
  const parent = new AbortController();
  let calls = 0;
  const extractor = createOpenAiOcrExtractor("test-key", (async (url, init) => {
    calls++;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe(OPENAI_OCR_MODEL);
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(8192);
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body.input[0].content[1]).toEqual({
      type: "input_file",
      filename: "ocr-window.pdf",
      file_data: "data:application/pdf;base64,AQL/",
      detail: "high",
    });
    parent.abort();
    expect(init?.signal?.aborted).toBe(true);
    return Response.json({
      ...completed,
      usage: { input_tokens: 50, output_tokens: 3, total_tokens: 53, private: "CANARY" },
    });
  }) as typeof fetch);
  const result = await extractor({ ...params, signal: parent.signal });
  expect(result.text).toBe("first\nsecond");
  expect(result.debug.usage).toEqual({ input_tokens: 50, output_tokens: 3, total_tokens: 53 });
  expect(JSON.stringify(result.debug)).not.toContain("CANARY");
  expect(calls).toBe(1);
});

test("OpenAI image inputs use a data URL and never upload a separate file", async () => {
  const extract = createOpenAiOcrExtractor("test", (async (_url, init) => {
    const body = JSON.parse(init?.body as string);
    expect(body.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: "data:image/png;base64,AQL/",
      detail: "high",
    });
    return Response.json(completed);
  }) as typeof fetch);
  expect((await extract({ ...params, mimeType: "image/png" })).text).toBe("first\nsecond");
});

test("missing configuration and unsupported inputs make zero requests", async () => {
  const denied = (async () => {
    throw new Error("unexpected network");
  }) as typeof fetch;
  expect((await createOpenAiOcrExtractor("", denied)(params)).debug.error).toBe(
    "provider_not_configured",
  );
  expect(
    (await createOpenAiOcrExtractor("test", denied)({ ...params, mimeType: "image/tiff" })).debug
      .error,
  ).toBe("ocr_format_unsupported");
  const read = (values: Record<string, string>) => (key: string) => values[key];
  expect(readOcrProvider(read({ OPENAI_API_KEY: "test" })).ready).toBe(false);
  expect(readOcrProvider(read({ KATI_OCR_PROVIDER: "openai", GEMINI_API_KEY: "test" })).ready).toBe(
    false,
  );
  expect(
    readOcrProvider(read({ KATI_OCR_PROVIDER: "unknown", GEMINI_API_KEY: "test" })).ready,
  ).toBe(false);
  expect(readOcrProvider(read({ KATI_OCR_PROVIDER: "openai", OPENAI_API_KEY: "test" })).ready).toBe(
    true,
  );
});

test("HTTP failures consume one request and diagnostics exclude provider content", async () => {
  let calls = 0;
  const extract = createOpenAiOcrExtractor("test", (async () => {
    calls++;
    return new Response("PRIVATE_PROVIDER_CANARY", { status: 429 });
  }) as typeof fetch);
  const result = await extract(params);
  expect(calls).toBe(1);
  expect(result.text).toBe("");
  expect(result.debug.http_status).toBe(429);
  expect(result.debug.provider).toBe("openai");
  expect(JSON.stringify(result.debug)).not.toContain("PRIVATE_PROVIDER_CANARY");
});

test("incomplete, refused and malformed responses cannot publish partial OCR text", async () => {
  for (const body of [
    { ...completed, status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
    { ...completed, error: { message: "PRIVATE_PROVIDER_CANARY" } },
    {
      status: "completed",
      output: [message("prefix"), { ...message("tail"), status: "incomplete" }],
    },
    {
      status: "completed",
      output: [
        { ...message(""), content: [{ type: "refusal", refusal: "PRIVATE_PROVIDER_CANARY" }] },
      ],
    },
    { status: "completed", output: "PRIVATE_PROVIDER_CANARY" },
    null,
  ]) {
    const result = await createOpenAiOcrExtractor("test", (async () =>
      Response.json(body)) as typeof fetch)(params);
    expect(result.text).toBe("");
    expect(result.debug.error).toBeTruthy();
    expect(JSON.stringify(result.debug)).not.toContain("PRIVATE_PROVIDER_CANARY");
  }
});

test("transport exceptions and invalid JSON expose only a fixed error", async () => {
  for (const fetcher of [
    async () => {
      throw new Error("PRIVATE_TRANSPORT_CANARY");
    },
    async () => new Response("PRIVATE_JSON_CANARY"),
  ]) {
    await expect(createOpenAiOcrExtractor("test", fetcher as typeof fetch)(params)).rejects.toThrow(
      "ocr_provider_exception",
    );
  }
});
