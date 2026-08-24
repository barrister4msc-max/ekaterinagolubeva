import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

function sliceBetween(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("P0-A5 FNS Analyzer orchestration", () => {
  it("loads company factual runtime only after explicit answers are materialized", () => {
    expect(source).toContain('import { loadCompanyFactualRuntimeSnapshot } from "./fns-company-factual-runtime.ts";');
    const answersReady = source.indexOf("for (const r of answerRows ?? []) answers[r.field_name as string] = r.field_value;");
    const factualLoad = source.indexOf("loadCompanyFactualRuntimeSnapshot({");
    const factExtraction = source.indexOf("const researchQuery = await extractFacts({");
    expect(answersReady).toBeGreaterThanOrEqual(0);
    expect(factualLoad).toBeGreaterThan(answersReady);
    expect(factExtraction).toBeGreaterThan(factualLoad);
  });

  it("persists the bounded snapshot in run audit and final ai_result", () => {
    expect(source).toContain("company_factual_evidence: companyFactualRuntime.company_factual_evidence");
    expect(source).toContain("company_factual_diagnostics: companyFactualRuntime.diagnostics");
    expect(source).toContain("parsed.company_factual_evidence = companyFactualRuntime.company_factual_evidence;");
    expect(source).toContain("parsed.company_factual_diagnostics = companyFactualRuntime.diagnostics;");
  });

  it("does not inject company factual evidence into Gemini prompt", () => {
    const promptBlock = sliceBetween("const prompt = buildPrompt({", "const {\n      text,");
    expect(promptBlock).not.toContain("companyFactualRuntime");
    expect(promptBlock).not.toContain("company_factual_evidence");
  });

  it("does not feed company factual evidence into conclusions, sufficiency, challenge or Evidence Matrix", () => {
    const conclusionsBlock = sliceBetween("let provBuild = buildConclusionsAndIndex", "// Layer 7b:");
    const challengeBlock = sliceBetween("const challengeResult = await runChallenge({", "// Phase B correction:");
    const matrixBlock = sliceBetween("const evidenceMatrix = buildEvidenceMatrix({", "// Layer 10:");
    for (const block of [conclusionsBlock, challengeBlock, matrixBlock]) {
      expect(block).not.toContain("companyFactualRuntime");
      expect(block).not.toContain("company_factual_evidence");
    }
  });
});
