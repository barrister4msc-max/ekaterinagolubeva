import { expect, test } from "bun:test";

test("OCR keeps provider/document canaries out of handler diagnostics", async () => {
  // Isolate Deno/SDK/transport doubles from the rest of the suite.
  const runner = new URL("./fixtures/ocr-privacy-runner.ts", import.meta.url).pathname;
  const child = Bun.spawn([process.execPath, runner], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});
