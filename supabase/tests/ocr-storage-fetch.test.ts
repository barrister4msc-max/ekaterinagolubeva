import { expect, test } from "bun:test";
import { createFreshOcrStorageFetch } from "../functions/_shared/ocr-storage-fetch.ts";
test("OCR downloads bypass stale same-path CDN entries while preserving auth, signal and transport", async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport = (async (input, init) => {
    requests.push({ input, init });
    return new Response("bytes");
  }) as typeof fetch;
  const fresh = createFreshOcrStorageFetch("https://project.test", transport),
    signal = new AbortController().signal;
  const url = "https://project.test/storage/v1/object/authenticated/lead-documents/file.pdf";
  const original = new Request(url, { headers: { Authorization: "Bearer TEST_ONLY" } });
  await fresh(original, { signal });
  await fresh(original, { signal });
  const a = requests[0],
    b = requests[1];
  const aUrl = new URL((a.input as Request).url),
    bUrl = new URL((b.input as Request).url);
  expect(aUrl.pathname).toBe(new URL(url).pathname);
  expect(aUrl.searchParams.get("cacheNonce")).toBeTruthy();
  expect(aUrl.searchParams.get("cacheNonce")).not.toBe(bUrl.searchParams.get("cacheNonce"));
  expect(new Headers(a.init?.headers).get("Authorization")).toBe("Bearer TEST_ONLY");
  expect(new Headers(a.init?.headers).get("Cache-Control")).toBe("no-cache");
  expect(a.init?.cache).toBe("no-store");
  expect(a.init?.signal).toBe(signal);
  expect(original.url).toBe(url);
  for (const target of [
    "https://project.test/rest/v1/rpc/test",
    "https://other.test/storage/v1/object/lead-documents/file.pdf",
    "https://project.test/storage/v1/object/hero/image.jpg",
  ]) {
    const init = { method: "POST", body: "unchanged" };
    await fresh(target, init);
    expect(requests.at(-1)).toEqual({ input: target, init });
  }
  await fresh("https://project.test/storage/v1/object/communication-attachments/file.pdf");
  expect(new URL(String(requests.at(-1)?.input)).searchParams.get("cacheNonce")).toBeTruthy();
});
