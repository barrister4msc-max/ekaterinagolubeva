import { expect, test } from "bun:test";
test("authorized queue/status and worker scope guards use actual SQL without live providers", async () => {
  const child = Bun.spawn(
    [process.execPath, new URL("./fixtures/ocr-control-runner.ts", import.meta.url).pathname],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`control integration failed: ${out}\n${err}`);
  expect(out).toContain("ocr_control_integration_passed");
}, 60000);
