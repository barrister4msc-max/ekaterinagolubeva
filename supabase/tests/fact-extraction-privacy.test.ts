import { expect, test } from "bun:test";

test("fact extraction keeps model text and exception messages out of diagnostics", async () => {
  // A separate process prevents the Deno/fetch/console doubles from leaking into
  // other tests. Every provider request is intercepted; no live AI is invoked.
  const moduleUrl = new URL("../functions/analyze-document-legal-position/fact-extraction.ts", import.meta.url).href;
  const script = `
    import assert from "node:assert/strict";
    const canary = "PRIVATE_DOCUMENT_CANARY_7701234567";
    const malformed = '{"facts":["' + canary + '"],"broken":}';
    globalThis.Deno = { env: { get: () => "offline-test-key" } };
    const diagnostics = [];
    console.error = (...args) => diagnostics.push(args);
    let mode = "parse_failure";
    globalThis.fetch = async () => {
      if (mode === "provider_exception") throw new Error(canary);
      const text = mode === "success" ? JSON.stringify({ facts: [canary] }) : malformed;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
    };
    const { extractFacts, embedQuery } = await import(${JSON.stringify(moduleUrl)});
    const input = { templateCode: "test", practiceArea: null, answers: {}, documents: [{ title: "test", text: "ИНН 7701234567" }] };
    const failed = await extractFacts(input);
    assert.deepEqual(failed.facts, []);
    assert.ok(failed.inn.includes("7701234567"));
    const parseDiagnostic = diagnostics.find(args => args[1]?.error_code === "parse_failed");
    assert.ok(parseDiagnostic);
    assert.equal(parseDiagnostic[1].response_chars, malformed.length);
    mode = "provider_exception";
    const fallback = await extractFacts(input);
    assert.ok(fallback.inn.includes("7701234567"));
    assert.equal(await embedQuery("query"), null);
    assert.ok(diagnostics.some(args => args[0] === "[fact-extraction] gemini fallback exhausted"));
    assert.ok(diagnostics.some(args => args[0] === "[fact-extraction] Gemini embedding exception"));
    const serialized = JSON.stringify(diagnostics);
    assert.ok(!serialized.includes(canary));
    assert.ok(!serialized.includes("SyntaxError"));
    for (const args of diagnostics) {
      if (args[1] && typeof args[1] === "object") {
        assert.ok(Object.keys(args[1]).every(key => ["error_code", "provider", "model", "http_status", "response_chars"].includes(key)));
      }
    }
    mode = "success";
    const countBeforeSuccess = diagnostics.length;
    assert.deepEqual((await extractFacts(input)).facts, [canary]);
    assert.equal(diagnostics.length, countBeforeSuccess);
  `;
  const child = Bun.spawn([process.execPath, "--eval", script], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});
