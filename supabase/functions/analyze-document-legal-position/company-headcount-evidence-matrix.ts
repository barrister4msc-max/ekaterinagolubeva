import type { CompanyAverageHeadcountEvidence } from "./fns-company-headcount-evidence.ts";
import {
  buildCanonicalCompanyAverageHeadcountFacts,
  buildCompanyHeadcountFactEvidenceLinks,
  type CanonicalCompanyAverageHeadcountFact,
  type CompanyHeadcountFactEvidenceLink,
} from "./company-headcount-identity.ts";

export type CompanyAverageHeadcountEvidenceMatrixEntry = {
  matrix_scope: "company_average_headcount_factual";
  company_headcount_fact_id: string;
  subject: CanonicalCompanyAverageHeadcountFact["subject"];
  fact_kind: "headcount";
  fact_value: CanonicalCompanyAverageHeadcountFact["fact_value"];
  reporting_date: string;
  document_id: string;
  evidence_relations: Array<{
    evidence_id: string;
    relation: "DIRECTLY_RECORDS";
    identity_match: "exact";
  }>;
  evidence_status: "proven" | "missing";
  current_employee_count_claim_allowed: false;
  fte_claim_allowed: false;
  payroll_claim_allowed: false;
  legal_authority: false;
  substantive_use_allowed: false;
  use_as_legal_source: false;
};

export type CompanyAverageHeadcountEvidenceMatrixSnapshot = {
  canonical_company_average_headcount_facts: CanonicalCompanyAverageHeadcountFact[];
  company_headcount_fact_evidence_links: CompanyHeadcountFactEvidenceLink[];
  company_average_headcount_evidence_matrix: CompanyAverageHeadcountEvidenceMatrixEntry[];
  diagnostics: {
    evidence_received: number;
    canonical_facts: number;
    exact_links: number;
    matrix_entries: number;
    matrix_scope: "company_average_headcount_factual";
    reporting_scope: "annual_average_headcount";
    model_fact_linking_status: "not_linked";
    legal_source_status: "excluded";
  };
};

/** Separate SSHR2019 factual matrix. Exact structured identity only. */
export function buildCompanyAverageHeadcountEvidenceMatrix(
  evidence: CompanyAverageHeadcountEvidence[],
): CompanyAverageHeadcountEvidenceMatrixSnapshot {
  const canonicalFacts = buildCanonicalCompanyAverageHeadcountFacts(evidence);
  const links = buildCompanyHeadcountFactEvidenceLinks({ facts: canonicalFacts, evidence });
  const linksByFact = new Map<string, CompanyHeadcountFactEvidenceLink[]>();
  for (const link of links) {
    const bucket = linksByFact.get(link.company_headcount_fact_id) ?? [];
    bucket.push(link);
    linksByFact.set(link.company_headcount_fact_id, bucket);
  }

  const matrix = canonicalFacts.map((fact): CompanyAverageHeadcountEvidenceMatrixEntry => {
    const factLinks = (linksByFact.get(fact.company_headcount_fact_id) ?? [])
      .filter((link) => link.evidence_id === fact.evidence_id)
      .sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
    return {
      matrix_scope: "company_average_headcount_factual",
      company_headcount_fact_id: fact.company_headcount_fact_id,
      subject: fact.subject,
      fact_kind: "headcount",
      fact_value: fact.fact_value,
      reporting_date: fact.reporting_date,
      document_id: fact.document_id,
      evidence_relations: factLinks.map((link) => ({
        evidence_id: link.evidence_id,
        relation: link.relation,
        identity_match: link.identity_match,
      })),
      evidence_status: factLinks.length > 0 ? "proven" : "missing",
      current_employee_count_claim_allowed: false,
      fte_claim_allowed: false,
      payroll_claim_allowed: false,
      legal_authority: false,
      substantive_use_allowed: false,
      use_as_legal_source: false,
    };
  });

  return {
    canonical_company_average_headcount_facts: canonicalFacts,
    company_headcount_fact_evidence_links: links,
    company_average_headcount_evidence_matrix: matrix,
    diagnostics: {
      evidence_received: evidence.length,
      canonical_facts: canonicalFacts.length,
      exact_links: links.length,
      matrix_entries: matrix.length,
      matrix_scope: "company_average_headcount_factual",
      reporting_scope: "annual_average_headcount",
      model_fact_linking_status: "not_linked",
      legal_source_status: "excluded",
    },
  };
}
