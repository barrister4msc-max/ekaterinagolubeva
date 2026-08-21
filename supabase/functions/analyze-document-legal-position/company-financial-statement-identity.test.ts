import { describe, expect, test } from "bun:test";
import { toCompanyFinancialStatementEvidence, type FnsFinancialStatementRow } from "./fns-company-financial-statement-evidence.ts";
import {
  buildCanonicalCompanyFinancialStatementFacts,
  buildCompanyFinancialStatementFactEvidenceLinks,
  makeCompanyFinancialStatementFactId,
} from "./company-financial-statement-identity.ts";

const SHA = "bada16ef2497084edd342c0e2f00442293ac708f28a51fb8954fa21a0941f8d8";

function row(overrides: Partial<FnsFinancialStatementRow> = {}): FnsFinancialStatementRow {
  return {
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
}

describe("Canonical REVEXP financial statement identity", () => {
  test("builds stable identity from exact INN, reporting date and document id", () => {
    expect(makeCompanyFinancialStatementFactId({
      inn: "7701234567",
      reporting_date: "2025-12-31",
      document_id: "doc-2025",
    })).toBe("company_fact:legal_entity:7701234567:financial_statement:2025-12-31:doc-2025");
  });

  test("creates exact DIRECTLY_RECORDS link for structured evidence", () => {
    const evidence = [toCompanyFinancialStatementEvidence(row())];
    const facts = buildCanonicalCompanyFinancialStatementFacts(evidence);
    const links = buildCompanyFinancialStatementFactEvidenceLinks({ facts, evidence });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.fact_kind).toBe("financial_statement");
    expect(facts[0]?.fact_value).toEqual({
      organization_name: "ООО Ромашка",
      income_amount: "11623000.10",
      expense_amount: "10969000.20",
      reporting_scope: "annual_accounting_statement",
    });
    expect(links).toEqual([{
      company_financial_statement_fact_id: facts[0]!.company_financial_statement_fact_id,
      evidence_id: "fns_revexp:7701234567:2025-12-31:doc-2025",
      relation: "DIRECTLY_RECORDS",
      identity_match: "exact",
    }]);
  });

  test("does not link same values for a different exact subject identity", () => {
    const first = toCompanyFinancialStatementEvidence(row());
    const other = toCompanyFinancialStatementEvidence(row({ inn: "7707654321", document_id: "doc-other" }));
    const facts = buildCanonicalCompanyFinancialStatementFacts([first]);
    const links = buildCompanyFinancialStatementFactEvidenceLinks({ facts, evidence: [other] });
    expect(links).toEqual([]);
  });

  test("fails closed when evidence id or legal safety flags conflict", () => {
    const badId = { ...toCompanyFinancialStatementEvidence(row()), evidence_id: "fns_revexp:wrong" };
    const promoted = { ...toCompanyFinancialStatementEvidence(row()), legal_authority: true } as any;
    expect(buildCanonicalCompanyFinancialStatementFacts([badId])).toEqual([]);
    expect(buildCanonicalCompanyFinancialStatementFacts([promoted])).toEqual([]);
  });

  test("rejects semantic promotion flags and malformed money", () => {
    const turnoverAllowed = { ...toCompanyFinancialStatementEvidence(row()), turnover_claim_allowed: true } as any;
    const malformedMoney = toCompanyFinancialStatementEvidence(row());
    malformedMoney.attributes.income_amount = "11623000.1";
    expect(buildCanonicalCompanyFinancialStatementFacts([turnoverAllowed])).toEqual([]);
    expect(buildCanonicalCompanyFinancialStatementFacts([malformedMoney])).toEqual([]);
  });
});
