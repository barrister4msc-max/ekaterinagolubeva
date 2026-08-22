import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

describe("P0-A15 REVEXP Analyzer audit boundary", () => {
  test("persists REVEXP evidence only as additive factual audit data", () => {
    const snapshotMatches = source.match(/company_financial_statement_evidence:\s*companyFactualRuntime\.company_financial_statement_evidence/g) ?? [];
    expect(snapshotMatches.length).toBe(4);
    expect(source).toContain("parsed.company_financial_statement_evidence = companyFactualRuntime.company_financial_statement_evidence;");
  });

  test("does not add REVEXP to model or legal-source inputs", () => {
    const promptStart = source.indexOf("const prompt = buildPrompt({");
    const promptEnd = source.indexOf("const {\n      text,", promptStart);
    expect(source.slice(promptStart, promptEnd)).not.toContain("company_financial_statement_evidence");
    for (const legalCall of ["buildEvidenceMatrix({", "evaluateSufficiency({", "runChallenge({"]) {
      const start = source.indexOf(legalCall);
      expect(source.slice(start, start + 1200)).not.toContain("company_financial_statement_evidence");
    }
  });
});
