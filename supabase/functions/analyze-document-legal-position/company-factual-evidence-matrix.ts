import type { CompanyFactualEvidence } from "./fns-company-factual-evidence.ts";
import {
  buildCanonicalCompanyFacts,
  buildCompanyFactEvidenceLinks,
  type CanonicalCompanyFact,
  type CompanyFactEvidenceLink,
} from "./company-factual-identity.ts";

export type CompanyFactualEvidenceMatrixEntry = {
  matrix_scope: "company_factual";
  company_fact_id: string;
  subject: CanonicalCompanyFact["subject"];
  fact_kind: CanonicalCompanyFact["fact_kind"];
  fact_value: CanonicalCompanyFact["fact_value"];
  valid_as_of: string;
  evidence_relations: Array<{
    evidence_id: string;
    relation: "DIRECTLY_RECORDS";
    identity_match: "exact";
  }>;
  evidence_status: "proven" | "missing";
  legal_authority: false;
  substantive_use_allowed: false;
  use_as_legal_source: false;
};

export type CompanyFactualEvidenceMatrixSnapshot = {
  canonical_company_facts: CanonicalCompanyFact[];
  company_fact_evidence_links: CompanyFactEvidenceLink[];
  company_factual_evidence_matrix: CompanyFactualEvidenceMatrixEntry[];
  diagnostics: {
    evidence_received: number;
    canonical_facts: number;
    exact_links: number;
    matrix_entries: number;
    matrix_scope: "company_factual";
    model_fact_linking_status: "not_linked";
    legal_source_status: "excluded";
  };
};

/**
 * P0-A7 additive factual Evidence Matrix layer.
 *
 * It is intentionally separate from the existing `evidence_matrix`, whose rows
 * model canonical FactRecord↔document relations. This builder consumes only the
 * already-validated CompanyFactualEvidence contract and P0-A6 exact identity.
 * It never matches model fact text, OCR, keywords, embeddings or LLM output.
 */
export function buildCompanyFactualEvidenceMatrix(
  evidence: CompanyFactualEvidence[],
): CompanyFactualEvidenceMatrixSnapshot {
  const canonicalFacts = buildCanonicalCompanyFacts(evidence);
  const links = buildCompanyFactEvidenceLinks({ facts: canonicalFacts, evidence });

  const linksByFact = new Map<string, CompanyFactEvidenceLink[]>();
  for (const link of links) {
    const bucket = linksByFact.get(link.company_fact_id) ?? [];
    bucket.push(link);
    linksByFact.set(link.company_fact_id, bucket);
  }

  const matrix = canonicalFacts.map((fact): CompanyFactualEvidenceMatrixEntry => {
    const factLinks = (linksByFact.get(fact.company_fact_id) ?? [])
      .filter((link) => fact.evidence_ids.includes(link.evidence_id))
      .sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));

    return {
      matrix_scope: "company_factual",
      company_fact_id: fact.company_fact_id,
      subject: fact.subject,
      fact_kind: fact.fact_kind,
      fact_value: fact.fact_value,
      valid_as_of: fact.valid_as_of,
      evidence_relations: factLinks.map((link) => ({
        evidence_id: link.evidence_id,
        relation: link.relation,
        identity_match: link.identity_match,
      })),
      evidence_status: factLinks.length > 0 ? "proven" : "missing",
      legal_authority: false,
      substantive_use_allowed: false,
      use_as_legal_source: false,
    };
  });

  return {
    canonical_company_facts: canonicalFacts,
    company_fact_evidence_links: links,
    company_factual_evidence_matrix: matrix,
    diagnostics: {
      evidence_received: evidence.length,
      canonical_facts: canonicalFacts.length,
      exact_links: links.length,
      matrix_entries: matrix.length,
      matrix_scope: "company_factual",
      model_fact_linking_status: "not_linked",
      legal_source_status: "excluded",
    },
  };
}
