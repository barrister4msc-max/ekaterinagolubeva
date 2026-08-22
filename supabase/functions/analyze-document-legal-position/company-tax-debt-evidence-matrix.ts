import type { CompanyTaxDebtEvidence } from "./fns-company-tax-debt-evidence.ts";
import {
  buildCanonicalCompanyTaxDebtFacts,
  buildCompanyTaxDebtFactEvidenceLinks,
  type CanonicalCompanyTaxDebtFact,
  type CompanyTaxDebtFactEvidenceLink,
} from "./company-tax-debt-identity.ts";

export type CompanyTaxDebtEvidenceMatrixEntry = {
  matrix_scope: "company_tax_debt_factual";
  company_tax_debt_fact_id: string;
  subject: CanonicalCompanyTaxDebtFact["subject"];
  fact_kind: "tax_debt";
  fact_value: CanonicalCompanyTaxDebtFact["fact_value"];
  valid_as_of: string;
  document_id: string;
  debt_row_ordinal: number;
  evidence_relations: Array<{
    evidence_id: string;
    relation: "DIRECTLY_RECORDS";
    identity_match: "exact";
  }>;
  evidence_status: "proven" | "missing";
  current_balance_claim_allowed: false;
  legal_authority: false;
  substantive_use_allowed: false;
  use_as_legal_source: false;
};

export type CompanyTaxDebtEvidenceMatrixSnapshot = {
  canonical_company_tax_debt_facts: CanonicalCompanyTaxDebtFact[];
  company_tax_debt_fact_evidence_links: CompanyTaxDebtFactEvidenceLink[];
  company_tax_debt_evidence_matrix: CompanyTaxDebtEvidenceMatrixEntry[];
  diagnostics: {
    evidence_received: number;
    canonical_facts: number;
    exact_links: number;
    matrix_entries: number;
    matrix_scope: "company_tax_debt_factual";
    observation_scope: "point_in_time_not_live_balance";
    model_fact_linking_status: "not_linked";
    legal_source_status: "excluded";
  };
};

/**
 * Separate DEBTAM factual matrix. It never reuses the SNR tax-regime identity
 * and never matches by fact text, tax-name similarity, OCR, embeddings or LLM.
 */
export function buildCompanyTaxDebtEvidenceMatrix(
  evidence: CompanyTaxDebtEvidence[],
): CompanyTaxDebtEvidenceMatrixSnapshot {
  const canonicalFacts = buildCanonicalCompanyTaxDebtFacts(evidence);
  const links = buildCompanyTaxDebtFactEvidenceLinks({ facts: canonicalFacts, evidence });
  const linksByFact = new Map<string, CompanyTaxDebtFactEvidenceLink[]>();
  for (const link of links) {
    const bucket = linksByFact.get(link.company_tax_debt_fact_id) ?? [];
    bucket.push(link);
    linksByFact.set(link.company_tax_debt_fact_id, bucket);
  }

  const matrix = canonicalFacts.map((fact): CompanyTaxDebtEvidenceMatrixEntry => {
    const factLinks = (linksByFact.get(fact.company_tax_debt_fact_id) ?? [])
      .filter((link) => link.evidence_id === fact.evidence_id)
      .sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
    return {
      matrix_scope: "company_tax_debt_factual",
      company_tax_debt_fact_id: fact.company_tax_debt_fact_id,
      subject: fact.subject,
      fact_kind: "tax_debt",
      fact_value: fact.fact_value,
      valid_as_of: fact.valid_as_of,
      document_id: fact.document_id,
      debt_row_ordinal: fact.debt_row_ordinal,
      evidence_relations: factLinks.map((link) => ({
        evidence_id: link.evidence_id,
        relation: link.relation,
        identity_match: link.identity_match,
      })),
      evidence_status: factLinks.length > 0 ? "proven" : "missing",
      current_balance_claim_allowed: false,
      legal_authority: false,
      substantive_use_allowed: false,
      use_as_legal_source: false,
    };
  });

  return {
    canonical_company_tax_debt_facts: canonicalFacts,
    company_tax_debt_fact_evidence_links: links,
    company_tax_debt_evidence_matrix: matrix,
    diagnostics: {
      evidence_received: evidence.length,
      canonical_facts: canonicalFacts.length,
      exact_links: links.length,
      matrix_entries: matrix.length,
      matrix_scope: "company_tax_debt_factual",
      observation_scope: "point_in_time_not_live_balance",
      model_fact_linking_status: "not_linked",
      legal_source_status: "excluded",
    },
  };
}
