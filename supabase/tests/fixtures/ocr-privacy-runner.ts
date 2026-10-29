// Runs the actual Edge handler offline; only external SDKs and IO are doubled.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const canary = "PRIVATE_OCR_CANARY_7701234567";
const diagnostics: unknown[][] = [];
for (const method of ["error", "warn", "log"] as const)
  console[method] = (...args) => {
    diagnostics.push(args);
  };
let handler: (req: Request) => Promise<Response>;
(globalThis as any).Deno = {
  env: {
    get: (name: string) =>
      name === "SUPABASE_SERVICE_ROLE_KEY" ? "server-test-token" : "offline-key",
  },
  serve: (fn: typeof handler) => {
    handler = fn;
  },
};
let mode = "http_error",
  mime = "image/png",
  dbFailure = false;
let writes: Array<{ table: string; value: any }> = [];
const sb = {
  from: (table: string) => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      if (dbFailure) return { data: null, error: { message: canary } };
      return {
        data: {
          id: "test-document",
          file_name: canary + ".png",
          title: canary,
          mime_type: mime,
          storage_path: canary,
          metadata: {},
          ocr_text: "",
        },
        error: null,
      };
    },
    update(value: unknown) {
      writes.push({ table, value });
      return { eq: async () => ({ error: null }) };
    },
  }),
  storage: {
    from: () => ({ download: async () => ({ data: new Blob(["offline bytes"]), error: null }) }),
  },
  rpc: async (name: string, args: unknown) => {
    if (name === "kati_claim_document_ocr_job")
      return {
        data: [
          {
            job_id: "job",
            acquired: true,
            job_status: "running",
            lease_token: "lease",
            checkpoint: {},
            invocation_count: 1,
          },
        ],
        error: null,
      };
    if (name === "kati_persist_document_ocr_checkpoint") {
      writes.push({ table: "checkpoint", value: args });
      return { data: true, error: null };
    }
    throw new Error("unexpected mock RPC");
  },
};
(globalThis as any).testSupabase = sb;
(globalThis as any).testPdf = {
  load: async () => ({ getPageCount: () => 2 }),
  create: async () => ({
    copyPages: async () => [1, 2],
    addPage() {},
    save: async () => new Uint8Array([1, 2]),
  }),
};
globalThis.fetch = (async (url: unknown) => {
  assert.ok(String(url).startsWith("https://generativelanguage.googleapis.com/"));
  if (mode === "exception") throw new Error(canary);
  if (mode === "parse_error") return new Response(canary);
  if (mode === "http_error" || mode === "unsupported")
    return new Response((mode === "unsupported" ? "unsupported " : "") + canary, { status: 503 });
  return new Response(
    JSON.stringify({
      [canary]: true,
      candidates: [{ finishReason: canary, content: { parts: [{ text: canary }] } }],
    }),
  );
}) as typeof fetch;

let source = await readFile(
  new URL("../../functions/extract-document-text/index.ts", import.meta.url),
  "utf8",
);
source = source.replace(
  /import \{ createClient \} from "[^"]+";/,
  "const createClient = () => globalThis.testSupabase;",
);
source = source.replace(/import JSZip from "[^"]+";/, "const JSZip = {};");
source = source.replace(
  /import \{ PDFDocument \} from "[^"]+";/,
  "const PDFDocument = globalThis.testPdf;",
);
source = source.replaceAll(
  '"../_shared/',
  '"' + new URL("../../functions/_shared/", import.meta.url).href,
);
// PDF.js is an external SDK too: simulate a sensitive text-layer exception.
source = source.replace(
  /await import\(\s*"https:[^"]+"\s*\)/g,
  'await Promise.reject(new Error("' + canary + '"))',
);
const folder = await mkdtemp(join(tmpdir(), "kati-ocr-privacy-"));
try {
  const modulePath = join(folder, "edge.ts");
  await writeFile(modulePath, source);
  await import(pathToFileURL(modulePath).href);
  assert.equal(typeof handler!, "function");
  const invoke = (body: unknown) =>
    handler(
      new Request("https://offline.test", {
        method: "POST",
        headers: { Authorization: "Bearer server-test-token", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const clean = (value: unknown) =>
    assert.ok(!JSON.stringify(value).includes(canary), JSON.stringify(value));

  let response = await invoke({ archive_item_id: "archive", mime_type: mime, file_name: canary });
  let result = await response.json();
  clean([diagnostics, writes, result]);
  assert.equal(result.error, "ocr_empty");
  assert.equal(result.ocr_debug.http_status, 503);
  assert.equal(result.ocr_debug.response_chars, canary.length);
  clean([diagnostics, writes, result]);

  writes = [];
  mime = "image/tiff";
  mode = "unsupported";
  result = await (
    await invoke({ archive_item_id: "archive", mime_type: mime, file_name: canary })
  ).json();
  assert.equal(result.error, "ocr_format_unsupported");
  assert.equal(writes[0].value.metadata.text_extraction_status, "ocr_format_unsupported");
  clean([diagnostics, writes, result]);

  writes = [];
  mime = "application/pdf";
  mode = "exception";
  result = await (await invoke({ document_id: "document" })).json();
  assert.equal(result.extraction_status, "partial_pages");
  const checkpoint = writes.find((w) => w.table === "checkpoint")!.value;
  assert.equal(checkpoint.p_checkpoint.page_index.units[0].attempts, 1);
  assert.equal(checkpoint.p_checkpoint.page_index.units[0].status, "failed");
  assert.equal(checkpoint.p_checkpoint.page_index.units[0].error, "pdf_ocr_chunk_failed_pages_1_2");
  clean([diagnostics, writes, result]);

  writes = [];
  mime = "image/png";
  await assert.rejects(
    invoke({ archive_item_id: "archive", mime_type: mime, file_name: canary }),
    (error) => (error as Error).message === "ocr_provider_exception",
  );
  mode = "parse_error";
  await assert.rejects(
    invoke({ archive_item_id: "archive", mime_type: mime, file_name: canary }),
    (error) => (error as Error).message === "ocr_provider_exception",
  );
  clean([diagnostics, writes]);

  dbFailure = true;
  response = await invoke({ document_id: "document" });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "document_lookup_failed" });
  dbFailure = false;

  // Success still writes OCR text in its intended content field, never logs.
  writes = [];
  mode = "success";
  result = await (
    await invoke({ archive_item_id: "archive", mime_type: mime, file_name: canary })
  ).json();
  assert.equal(result.ok, true);
  assert.equal(writes[0].value.content, canary);
  assert.equal(writes[0].value.metadata.ocr_text, canary);
  assert.equal(writes[0].value.metadata.ocr_debug.finishReason, "UNKNOWN");
  clean([diagnostics, writes[0].value.metadata.ocr_debug, result]);
  assert.ok(diagnostics.some((args) => (args[1] as any)?.error_code === "provider_exception"));
} finally {
  await rm(folder, { recursive: true, force: true });
}
