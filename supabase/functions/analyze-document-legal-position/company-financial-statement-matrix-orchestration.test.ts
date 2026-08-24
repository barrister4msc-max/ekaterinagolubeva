import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

describe("P0-A17 REVEXP factual matrix Analyzer persistence", () => {
  test("builds the REVEXP matrix only from the separate REVEXP factual channel", () => {
    expect(source).toContain('import { buildCompanyFinancialStatementEvidenceMatrix } from "./company-financial-statement-evidence-matrix.ts";');
    expect(source).toContain("const companyFinancialStatementFactualMatrix = buildCompanyFinancialStatementEvidenceMatrix(\n      companyFactualRuntime.company_financial_statement_evidence,\n    );");
  });

  test("persists matrix audit data in every snapshot path and canonical identity in successful result", () => {
    const matrixField = /company_financial_statement_factual_evidence_matrix:\s*companyFinancialStatementFactualMatrix\.company_financial_statement_evidence_matrix/g;
    const diagnosticsField = /company_financial_statement_factual_matrix_diagnostics:\s*companyFinancialStatementFactualMatrix\.diagnostics/g;
    expect(source.match(matrixField)?.length ?? 0).toBe(4);
    expect(source.match(diagnosticsField)?.length ?? 0).toBe(4);
    expect(source).toContain("parsed.company_financial_statement_factual_evidence_matrix =\n      companyFinancialStatementFactualMatrix.company_financial_statement_evidence_matrix;");
    expect(source).toContain("parsed.company_financial_statement_factual_identity = {");
    expect(source).toContain("canonical_company_financial_statement_facts:\n        companyFinancialStatementFactualMatrix.canonical_company_financial_statement_facts,");
    expect(source).toContain("company_financial_statement_fact_evidence_links:\n        companyFinancialStatementFactualMatrix.company_financial_statement_fact_evidence_links,");
  });

  test("keeps REVEXP out of legal/model consumers", () => {
    const forbidden = [
      /buildPrompt\([\s\S]{0,1200}companyFinancialStatementFactualMatrix/,
      /buildPrompt\([\s\S]{0,1200}company_financial_statement_evidence/,
      /buildConclusionsAndIndex\([\s\S]{0,600}companyFinancialStatementFactualMatrix/,
      /evaluateSufficiency\([\s\S]{0,800}companyFinancialStatementFactualMatrix/,
      /runChallenge\([\s\S]{0,800}companyFinancialStatementFactualMatrix/,
      /buildEvidenceMatrix\([\s\S]{0,800}companyFinancialStatementFactualMatrix/,
    ];
    for (const pattern of forbidden) expect(pattern.test(source)).toBe(false);
    expect(source).not.toContain("trusted.push(...companyFactualRuntime.company_financial_statement_evidence");
  });
});
