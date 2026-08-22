import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const indexPath = join(import.meta.dir, "index.ts");
const source = readFileSync(indexPath, "utf8");

describe("P0-A7 Analyzer factual matrix orchestration boundary", () => {
  it("builds the factual matrix only from the bounded company factual runtime evidence", () => {
    expect(source).toContain('import { buildCompanyFactualEvidenceMatrix } from "./company-factual-evidence-matrix.ts";');
    expect(source).toContain("const companyFactualMatrix = buildCompanyFactualEvidenceMatrix(");
    expect(source).toContain("companyFactualRuntime.company_factual_evidence");
  });

  it("persists a separate company factual matrix without replacing the existing Evidence Matrix", () => {
    expect(source).toContain("parsed.evidence_matrix = evidenceMatrix;");
    expect(source).toContain("parsed.company_factual_evidence_matrix = companyFactualMatrix.company_factual_evidence_matrix;");
    expect(source).toContain("parsed.company_factual_identity = {");
    expect(source).toContain("canonical_company_facts: companyFactualMatrix.canonical_company_facts");
    expect(source).toContain("company_fact_evidence_links: companyFactualMatrix.company_fact_evidence_links");
  });

  it("keeps company factual data outside prompt and legal-source calls", () => {
    const promptStart = source.indexOf("const prompt = buildPrompt({");
    const promptEnd = source.indexOf("});", promptStart);
    const promptBlock = source.slice(promptStart, promptEnd + 3);
    expect(promptBlock).not.toContain("companyFactual");

    const sourceCalls = [
      "mergeWithRegistry(parsed, merged)",
      "buildConclusionsAndIndex(parsed, trusted, facts)",
      "evaluateSufficiency({",
      "runChallenge({",
    ];
    for (const call of sourceCalls) expect(source).toContain(call);
    expect(source).not.toContain("trusted.push(...companyFactual");
    expect(source).not.toContain("rawSources.push(...companyFactual");
  });

  it("persists the factual matrix in audit snapshots including no-document runs", () => {
    const occurrences = source.match(/company_factual_evidence_matrix:/g)?.length ?? 0;
    expect(occurrences).toBeGreaterThanOrEqual(3);
    expect(source).toContain("company_factual_matrix_diagnostics: companyFactualMatrix.diagnostics");
  });
});
