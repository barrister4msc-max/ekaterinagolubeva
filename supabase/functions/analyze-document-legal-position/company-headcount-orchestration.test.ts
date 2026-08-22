import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

describe("SSHR2019 factual Analyzer boundary", () => {
  test("persists raw headcount evidence only as separate audit data", () => {
    const field = /company_average_headcount_evidence:\s*companyFactualRuntime\.company_average_headcount_evidence/g;
    expect(source.match(field)?.length ?? 0).toBe(4);
    expect(source).toContain("parsed.company_average_headcount_evidence = companyFactualRuntime.company_average_headcount_evidence;");
  });

  test("keeps headcount out of legal/model consumers", () => {
    const forbidden = [
      /buildPrompt\([\s\S]{0,1500}company_average_headcount_evidence/,
      /buildConclusionsAndIndex\([\s\S]{0,800}company_average_headcount_evidence/,
      /evaluateSufficiency\([\s\S]{0,1000}company_average_headcount_evidence/,
      /runChallenge\([\s\S]{0,1000}company_average_headcount_evidence/,
      /buildEvidenceMatrix\([\s\S]{0,1000}company_average_headcount_evidence/,
    ];
    for (const pattern of forbidden) expect(pattern.test(source)).toBe(false);
    expect(source).not.toContain("trusted.push(...companyFactualRuntime.company_average_headcount_evidence");
  });

  test("keeps the P0-A22 canonical matrix as a separate audit-only channel", () => {
    expect(source).toContain("const companyAverageHeadcountFactualMatrix = buildCompanyAverageHeadcountEvidenceMatrix(");
    expect(source).toContain("companyFactualRuntime.company_average_headcount_evidence,");
    expect(source).toContain("parsed.company_average_headcount_factual_evidence_matrix =");
    expect(source).toContain("parsed.company_average_headcount_factual_identity = {");
  });
});
