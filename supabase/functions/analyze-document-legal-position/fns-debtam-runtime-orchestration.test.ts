import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const indexSource = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

describe("DEBTAM Analyzer factual orchestration", () => {
  it("persists DEBTAM factual evidence separately from SNR factual matrix", () => {
    expect(indexSource).toContain("company_tax_debt_evidence: companyFactualRuntime.company_tax_debt_evidence");
    expect(indexSource).toContain("company_factual_dataset_diagnostics: companyFactualRuntime.dataset_diagnostics");
    expect(indexSource).toContain("parsed.company_tax_debt_evidence = companyFactualRuntime.company_tax_debt_evidence");
    expect(indexSource).toContain("parsed.company_factual_dataset_diagnostics = companyFactualRuntime.dataset_diagnostics");
  });

  it("does not feed DEBTAM rows into the existing SNR canonical factual matrix", () => {
    expect(indexSource).toContain("buildCompanyFactualEvidenceMatrix(\n      companyFactualRuntime.company_factual_evidence,\n    )");
    expect(indexSource).not.toContain("buildCompanyFactualEvidenceMatrix(\n      companyFactualRuntime.company_tax_debt_evidence");
  });

  it("does not add DEBTAM evidence to prompt/legal-source pipelines", () => {
    expect(indexSource).not.toMatch(/buildPrompt\([^)]*company_tax_debt_evidence/s);
    expect(indexSource).not.toMatch(/buildConclusionsAndIndex\([^)]*company_tax_debt_evidence/s);
    expect(indexSource).not.toMatch(/evaluateSufficiency\([^)]*company_tax_debt_evidence/s);
    expect(indexSource).not.toMatch(/runChallenge\([^)]*company_tax_debt_evidence/s);
  });
});
