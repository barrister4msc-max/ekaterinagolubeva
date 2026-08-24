import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

describe("P0-A22 SSHR2019 factual matrix Analyzer persistence", () => {
  test("builds the separate headcount matrix only from SSHR2019 runtime evidence", () => {
    expect(source).toContain('import { buildCompanyAverageHeadcountEvidenceMatrix } from "./company-headcount-evidence-matrix.ts";');
    expect(source).toContain("const companyAverageHeadcountFactualMatrix = buildCompanyAverageHeadcountEvidenceMatrix(\n      companyFactualRuntime.company_average_headcount_evidence,\n    );");
  });

  test("persists matrix audit data in all four snapshot object paths", () => {
    const matrixField = /company_average_headcount_factual_evidence_matrix:\s*companyAverageHeadcountFactualMatrix\.company_average_headcount_evidence_matrix/g;
    const diagnosticsField = /company_average_headcount_factual_matrix_diagnostics:\s*companyAverageHeadcountFactualMatrix\.diagnostics/g;
    expect(source.match(matrixField)?.length ?? 0).toBe(4);
    expect(source.match(diagnosticsField)?.length ?? 0).toBe(4);
  });

  test("persists successful parsed matrix plus reconstructable exact identity", () => {
    expect(source).toContain("parsed.company_average_headcount_factual_evidence_matrix =\n      companyAverageHeadcountFactualMatrix.company_average_headcount_evidence_matrix;");
    expect(source).toContain("parsed.company_average_headcount_factual_identity = {");
    expect(source).toContain("canonical_company_average_headcount_facts:\n        companyAverageHeadcountFactualMatrix.canonical_company_average_headcount_facts,");
    expect(source).toContain("company_headcount_fact_evidence_links:\n        companyAverageHeadcountFactualMatrix.company_headcount_fact_evidence_links,");
  });

  test("keeps headcount matrix out of legal/model consumers", () => {
    const forbidden = [
      /buildPrompt\([\s\S]{0,1500}companyAverageHeadcountFactualMatrix/,
      /buildConclusionsAndIndex\([\s\S]{0,1000}companyAverageHeadcountFactualMatrix/,
      /evaluateSufficiency\([\s\S]{0,1200}companyAverageHeadcountFactualMatrix/,
      /runChallenge\([\s\S]{0,1200}companyAverageHeadcountFactualMatrix/,
      /buildEvidenceMatrix\([\s\S]{0,1200}companyAverageHeadcountFactualMatrix/,
    ];
    for (const pattern of forbidden) expect(pattern.test(source)).toBe(false);
    expect(source).not.toContain("trusted.push(...companyFactualRuntime.company_average_headcount_evidence");
  });
});
