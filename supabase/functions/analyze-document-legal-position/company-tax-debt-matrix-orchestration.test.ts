import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const indexSource = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

function callWindow(name: string, radius = 900): string {
  const at = indexSource.indexOf(name);
  expect(at).toBeGreaterThanOrEqual(0);
  return indexSource.slice(Math.max(0, at - radius), at + radius);
}

describe("P0-A12 DEBTAM factual matrix orchestration", () => {
  it("builds the DEBTAM matrix only from the separate DEBTAM factual channel", () => {
    expect(indexSource).toContain('import { buildCompanyTaxDebtEvidenceMatrix } from "./company-tax-debt-evidence-matrix.ts";');
    expect(indexSource).toContain(
      "buildCompanyTaxDebtEvidenceMatrix(\n      companyFactualRuntime.company_tax_debt_evidence,\n    )",
    );
    expect(indexSource).toContain(
      "buildCompanyFactualEvidenceMatrix(\n      companyFactualRuntime.company_factual_evidence,\n    )",
    );
  });

  it("persists a separate matrix/identity audit contract", () => {
    expect(indexSource).toContain("parsed.company_tax_debt_factual_evidence_matrix =");
    expect(indexSource).toContain("parsed.company_tax_debt_factual_identity = {");
    expect(indexSource).toContain("canonical_company_tax_debt_facts:");
    expect(indexSource).toContain("company_tax_debt_evidence_links:");

    const matrixOccurrences = indexSource.match(/company_tax_debt_factual_evidence_matrix/g)?.length ?? 0;
    expect(matrixOccurrences).toBeGreaterThanOrEqual(5);
  });

  it("does not inject DEBTAM evidence/matrix into legal or model calls", () => {
    for (const call of ["buildPrompt(", "buildConclusionsAndIndex(", "evaluateSufficiency(", "runChallenge("]) {
      const window = callWindow(call);
      expect(window).not.toContain("companyTaxDebtFactualMatrix");
      expect(window).not.toContain("company_tax_debt_evidence");
    }
  });

  it("keeps the canonical legal/document Evidence Matrix separate", () => {
    const window = callWindow("buildEvidenceMatrix({", 1100);
    expect(window).not.toContain("companyTaxDebtFactualMatrix");
    expect(window).not.toContain("company_tax_debt_evidence");
  });

  it("does not retain duplicate DEBTAM keys in one object literal", () => {
    const duplicate = /company_tax_debt_evidence:\s*companyFactualRuntime\.company_tax_debt_evidence,\s*company_factual_dataset_diagnostics:\s*companyFactualRuntime\.dataset_diagnostics,\s*company_tax_debt_evidence:\s*companyFactualRuntime\.company_tax_debt_evidence,/m;
    expect(indexSource).not.toMatch(duplicate);
  });
});
