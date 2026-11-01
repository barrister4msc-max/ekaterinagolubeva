import { expect, test } from "bun:test";
import {
  createOcrConsumerAdmission,
  OcrSourceAdmissionError,
} from "../functions/_shared/ocr-consumer-admission.ts";
import {
  evaluateFullCorpusAdmission,
  matchesFullCorpusAdmissionSnapshot,
} from "../functions/_shared/full-corpus-admission.ts";
const managed = {
  id: "doc",
  ocr_text: "same exact OCR",
  metadata: {
    extraction_status: "completed",
    ocr_execution_owner: "server",
    ocr_source_fingerprint: {
      version: 1,
      sha256: "a".repeat(64),
      bucket: "lead-documents",
      storage_path: "PRIVATE_PATH",
      byte_length: 4,
      generation: { object_id: "object-a", version: "version-a" },
    },
  },
};
test("provider requests recheck immutable expected pins; denial is never retried or replaced by legacy", async () => {
  let checks = 0,
    calls = 0,
    allowed = true;
  const expected: any[] = [];
  const client = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      checks++;
      expected.push(structuredClone(args.p_expected));
      return { data: { allowed }, error: null };
    },
  };
  const doc = structuredClone(managed),
    gate = createOcrConsumerAdmission(client, "actor", "session", [doc]);
  const guarded = gate.fetch((async () => {
    calls++;
    return new Response("ok");
  }) as typeof fetch);
  await guarded("https://provider.test");
  allowed = false;
  doc.metadata.ocr_source_fingerprint.generation.version = "version-b";
  await expect(guarded("https://provider.test")).rejects.toBeInstanceOf(OcrSourceAdmissionError);
  expect(checks).toBe(2);
  expect(calls).toBe(1);
  expect(expected[1][0].source.generation.version).toBe("version-a");
  expect(expected[0][0]).not.toHaveProperty("ocr_text");
});
test("missing/failing RPC and missing scope block managed work after flag rollback; legacy remains independent", async () => {
  for (const reply of [
    { data: null, error: { message: "PRIVATE_ERROR" } },
    { data: null, error: null },
    { data: { allowed: false }, error: null },
  ]) {
    const gate = createOcrConsumerAdmission({ rpc: async () => reply }, "actor", "session", [
      managed,
    ]);
    try {
      await gate.check();
      throw Error("not denied");
    } catch (e) {
      expect(e).toBeInstanceOf(OcrSourceAdmissionError);
      expect((e as Error).message).not.toContain("PRIVATE_ERROR");
    }
  }
  const client = {
    rpc: async () => {
      throw Error("must not be called");
    },
  };
  await expect(
    createOcrConsumerAdmission(client, "actor", null, [managed]).check(),
  ).rejects.toBeInstanceOf(OcrSourceAdmissionError);
  await createOcrConsumerAdmission(client, "actor", "session", [
    { id: "legacy", ocr_text: "text", metadata: { extraction_status: "completed" } },
  ]).check();
});
test("same OCR text with a new source generation invalidates corpus identity without exposing paths or versions", async () => {
  const a = await evaluateFullCorpusAdmission([managed]),
    changed = structuredClone(managed);
  changed.metadata.ocr_source_fingerprint.generation.version = "version-b";
  const b = await evaluateFullCorpusAdmission([changed]);
  expect(a.source_generation_required).toBe(true);
  expect(matchesFullCorpusAdmissionSnapshot(a, b)).toBe(false);
  expect(a.fingerprint).not.toContain("PRIVATE_PATH");
  expect(a.fingerprint).not.toContain("version-a");
});
test("actual consumer handlers and SQL deny stale generations without live inference", async () => {
  const child = Bun.spawn(
    [process.execPath, new URL("./fixtures/ocr-consumer-runner.ts", import.meta.url).pathname],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw Error(`consumer integration failed: ${out}\n${err}`);
  expect(out).toContain("ocr_consumer_integration_passed");
}, 60000);
