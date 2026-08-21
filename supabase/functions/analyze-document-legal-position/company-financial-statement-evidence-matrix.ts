import type { CompanyFinancialStatementEvidence } from "./fns-company-financial-statement-evidence.ts";
import {
  buildCanonicalCompanyFinancialStatementFacts,
  buildCompanyFinancialStatementFactEvidenceLinks,
  type CanonicalCompanyFinancialStatementFact,
  type CompanyFinancialStatementFactEvidenceLink,
} from "./company-financial-statement-identity.ts";

export type CompanyFinancialStatementEvidenceMatrixEntry = {
  matrix_scope: "company_financial_statement_factual";
  company_financial_statement_fact_id: string;
  subject: CanonicalCompanyFinancialStatementFact["subject"];
  fact_kind: "financial_statement";
  fact_value: CanonicalCompanyFinancialStatementFact["fact_value"];
  reporting_date: string;
  document_id: string;
  evidence_relations: Array<{
    evidence_id: string;
    relation: "DIRECTLY_RECORDS";
    identity_match: "exact";
  }>;
  evidence_status: "proven" | "missing";
  turnover_claim_allowed: false;
  taxable_income_claim_allowed: false;
  current_financial_position_claim_allowed: false;
  legal_authority: false;
  substantive_use_allowed: false;
  use_as_legal_source: false;
};

export type CompanyFinancialStatementEvidenceMatrixSnapshot = {
  canonical_company_financial_statement_facts: CanonicalCompanyFinancialStatementFact[];
  company_financial_statement_fact_evidence_links: CompanyFinancialStatementFactEvidenceLink[];
  company_financial_statement_evidence_matrix: CompanyFinancialStatementEvidenceMatrixEntry[];
  diagnostics: {
    evidence_received: number;
    canonical_facts: number;
    exact_links: number;
    matrix_entries: number;
    matrix_scope: "company_financial_statement_factual";
    reporting_scope: "annual_accounting_statement";
    model_fact_linking_status: "not_linked";
    legal_source_status: "excluded";
  };
};

/**
 * Separate REVEXP factual matrix. It never reuses SNR/DEBTAM identity and never
 * matches by narrative text, organization-name similarity, OCR, embeddings or LLM.
 */
export function buildCompanyFinancialStatementEvidenceMatrix(
  evidence: CompanyFinancialStatementEvidence[],
): CompanyFinancialStatementEvidenceMatrixSnapshot {
  const canonicalFacts = buildCanonicalCompanyFinancialStatementFacts(evidence);
  const links = buildCompanyFinancialStatementFactEvidenceLinks({ facts: canonicalFacts, evidence });
  const linksByFact = new Map<string, CompanyFinancialStatementFactEvidenceLink[]>();
  for (const link of links) {
    const bucket = linksByFact.get(link.company_financial_statement_fact_id) ?? [];
    bucket.push(link);
    linksByFact.set(link.company_financial_statement_fact_id, bucket);
  }

  const matrix = canonicalFacts.map((fact): CompanyFinancialStatementEvidenceMatrixEntry => {
    const factLinks = (linksByFact.get(fact.company_financial_statement_fact_id) ?? [])
      .filter((link) => link.evidence_id === fact.evidence_id)
      .sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
    return {
      matrix_scope: "company_financial_statement_factual",
      company_financial_statement_fact_id: fact.company_financial_statement_fact_id,
      subject: fact.subject,
      fact_kind: "financial_statement",
      fact_value: fact.fact_value,
      reporting_date: fact.reporting_date,
      document_id: fact.document_id,
      evidence_relations: factLinks.map((link) => ({
        evidence_id: link.evidence_id,
        relation: link.relation,
        identity_match: link.identity_match,
      })),
      evidence_status: factLinks.length > 0 ? "proven" : "missing",
      turnover_claim_allowed: false,
      taxable_income_claim_allowed: false,
      current_financial_position_claim_allowed: false,
      legal_authority: false,
      substantive_use_allowed: false,
      use_as_legal_source: false,
    };
  });

  return {
    canonical_company_financial_statement_facts: canonicalFacts,
    company_financial_statement_fact_evidence_links: links,
    company_financial_statement_evidence_matrix: matrix,
    diagnostics: {
      evidence_received: evidence.length,
      canonical_facts: canonicalFacts.length,
      exact_links: links.length,
      matrix_entries: matrix.length,
      matrix_scope: "company_financial_statement_factual",
      reporting_scope: "annual_accounting_statement",
      model_fact_linking_status: "not_linked",
      legal_source_status: "excluded",
    },
  };
}
