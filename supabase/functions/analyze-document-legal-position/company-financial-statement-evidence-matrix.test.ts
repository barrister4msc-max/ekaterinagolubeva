import { describe, expect, test } from "bun:test";
import { toCompanyFinancialStatementEvidence, type FnsFinancialStatementRow } from "./fns-company-financial-statement-evidence.ts";
import { buildCompanyFinancialStatementEvidenceMatrix } from "./company-financial-statement-evidence-matrix.ts";

const SHA = "bada16ef2497084edd342c0e2f00442293ac708f28a51fb8954fa21a0941f8d8";

function evidence(overrides: Partial<FnsFinancialStatementRow> = {}) {
  const row: FnsFinancialStatementRow = {
    inn: "7701234567",
    organization_name: "ООО Ромашка",
    income_amount: "11623000.10",
    expense_amount: "10969000.20",
    document_id: "doc-2025",
    document_date: "2026-07-25",
    reporting_date: "2025-12-31",
    dataset_id: "7707329152-revexp",
    source_url: "https://file.nalog.ru/opendata/7707329152-revexp/data-20260725-structure-20180110.zip",
    source_sha256: SHA,
    ...overrides,
  };
  return toCompanyFinancialStatementEvidence(row);
}

describe("REVEXP company financial statement factual matrix", () => {
  test("builds a separate exact factual matrix without legal promotion", () => {
    const snapshot = buildCompanyFinancialStatementEvidenceMatrix([evidence()]);
    expect(snapshot.canonical_company_financial_statement_facts).toHaveLength(1);
    expect(snapshot.company_financial_statement_fact_evidence_links).toHaveLength(1);
    expect(snapshot.company_financial_statement_evidence_matrix).toEqual([expect.objectContaining({
      matrix_scope: "company_financial_statement_factual",
      fact_kind: "financial_statement",
      reporting_date: "2025-12-31",
      document_id: "doc-2025",
      evidence_status: "proven",
      turnover_claim_allowed: false,
      taxable_income_claim_allowed: false,
      current_financial_position_claim_allowed: false,
      legal_authority: false,
      substantive_use_allowed: false,
      use_as_legal_source: false,
      evidence_relations: [{
        evidence_id: "fns_revexp:7701234567:2025-12-31:doc-2025",
        relation: "DIRECTLY_RECORDS",
        identity_match: "exact",
      }],
    })]);
    expect(snapshot.diagnostics).toMatchObject({
      matrix_scope: "company_financial_statement_factual",
      reporting_scope: "annual_accounting_statement",
      model_fact_linking_status: "not_linked",
      legal_source_status: "excluded",
    });
  });

  test("keeps different reporting dates and documents as distinct facts", () => {
    const snapshot = buildCompanyFinancialStatementEvidenceMatrix([
      evidence(),
      evidence({ reporting_date: "2024-12-31", document_id: "doc-2024", income_amount: "100.10", expense_amount: "90.20" }),
    ]);
    expect(snapshot.canonical_company_financial_statement_facts).toHaveLength(2);
    expect(new Set(snapshot.canonical_company_financial_statement_facts.map((fact) => fact.company_financial_statement_fact_id)).size).toBe(2);
  });

  test("does not create facts from promoted or malformed factual evidence", () => {
    const promoted = { ...evidence(), current_financial_position_claim_allowed: true } as any;
    const malformed = evidence();
    malformed.attributes.expense_amount = "90.2";
    const snapshot = buildCompanyFinancialStatementEvidenceMatrix([promoted, malformed]);
    expect(snapshot.canonical_company_financial_statement_facts).toEqual([]);
    expect(snapshot.company_financial_statement_fact_evidence_links).toEqual([]);
    expect(snapshot.company_financial_statement_evidence_matrix).toEqual([]);
  });
});
