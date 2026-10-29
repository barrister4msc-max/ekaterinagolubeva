import { test } from "bun:test";

test("OCR reservations execute against disposable PostgreSQL with recovery and role isolation", async () => {
  const runner = new URL("./fixtures/ocr-reservations-runner.mjs", import.meta.url).pathname;
  // Node avoids sharing the WASM database and its globals with other Bun tests.
  const child = Bun.spawn(["node", runner], { stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`OCR SQL assertions failed (${code}): ${stdout}\n${stderr}`);
  if (!stdout.includes("ocr_reservations_sql_passed")) throw new Error("SQL runner did not finish");
}, 30000);
