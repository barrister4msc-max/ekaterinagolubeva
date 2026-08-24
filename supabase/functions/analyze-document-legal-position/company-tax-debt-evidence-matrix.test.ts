import { describe, expect, it } from "bun:test";
import type { CompanyTaxDebtEvidence } from "./fns-company-tax-debt-evidence.ts";
import {
  buildCanonicalCompanyTaxDebtFacts,
  buildCompanyTaxDebtFactEvidenceLinks,
  makeCompanyTaxDebtFactId,
} from "./company-tax-debt-identity.ts";
import { buildCompanyTaxDebtEvidenceMatrix } from "./company-tax-debt-evidence-matrix.ts";

const SHA = "0bf119d728c4c6876e6aebe2331bfbfe8a9c0db87682b89d18e3b3d70a8845f5";

function evidence(overrides: Partial<CompanyTaxDebtEvidence> = {}): CompanyTaxDebtEvidence {
  const base: CompanyTaxDebtEvidence = {
    evidence_id: "fns_debtam:7701234567:2026-07-01:doc-1:1",
    subject_type: "legal_entity",
    subject_key: { inn: "7701234567" },
    fact_kind: "tax_debt",
    fact_text: "point-in-time debt evidence",
    attributes: {
      organization_name: "ООО Ромашка",
      tax_name: "Налог на прибыль",
      tax_debt_amount: "100.10",
      penalty_amount: "2.50",
      fine_amount: "0.00",
      total_debt_amount: "102.60",
      observation_scope: "point_in_time_not_live_balance",
    },
    source_type: "fns_open_data",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    dataset_id: "7707329152-debtam",
    source_url: "https://file.nalog.ru/opendata/7707329152-debtam/data-20260725-structure-20181201.zip",
    source_sha256: SHA,
    data_as_of: "2026-07-01",
    document_id: "doc-1",
    document_date: "2026-07-25",
    debt_row_ordinal: 1,
    factual_only: true,
    legal_authority: false,
    substantive_use_allowed: false,
    use_as_legal_source: false,
    current_balance_claim_allowed: false,
  };
  return {
    ...base,
    ...overrides,
    subject_key: overrides.subject_key ?? base.subject_key,
    attributes: overrides.attributes ?? base.attributes,
  };
}

describe("DEBTAM canonical identity and factual matrix", () => {
  it("builds identity from INN + date + document + row ordinal + exact tax name", () => {
    const id = makeCompanyTaxDebtFactId({
      inn: "7701234567",
      valid_as_of: "2026-07-01",
      document_id: "doc-1",
      debt_row_ordinal: 1,
      tax_name: "Налог на прибыль",
    });
    expect(id).toBe(
      "company_fact:legal_entity:7701234567:tax_debt:2026-07-01:doc-1:1:%D0%9D%D0%B0%D0%BB%D0%BE%D0%B3%20%D0%BD%D0%B0%20%D0%BF%D1%80%D0%B8%D0%B1%D1%8B%D0%BB%D1%8C",
    );
  });

  it("keeps multiple debt categories as separate canonical facts", () => {
    const first = evidence();
    const second = evidence({
      evidence_id: "fns_debtam:7701234567:2026-07-01:doc-1:2",
      debt_row_ordinal: 2,
      attributes: {
        ...first.attributes,
        tax_name: "НДС",
        tax_debt_amount: "0.00",
        penalty_amount: "10.00",
        fine_amount: "5.00",
        total_debt_amount: "15.00",
      },
    });
    const facts = buildCanonicalCompanyTaxDebtFacts([first, second]);
    expect(facts).toHaveLength(2);
    expect(new Set(facts.map((fact) => fact.company_tax_debt_fact_id)).size).toBe(2);
    expect(facts.map((fact) => fact.debt_row_ordinal).sort()).toEqual([1, 2]);
  });

  it("links only the exact structured evidence row", () => {
    const item = evidence();
    const facts = buildCanonicalCompanyTaxDebtFacts([item]);
    const links = buildCompanyTaxDebtFactEvidenceLinks({ facts, evidence: [item] });
    expect(links).toEqual([{
      company_tax_debt_fact_id: facts[0]!.company_tax_debt_fact_id,
      evidence_id: item.evidence_id,
      relation: "DIRECTLY_RECORDS",
      identity_match: "exact",
    }]);
  });

  it("fails closed when structured evidence_id conflicts with row identity", () => {
    const bad = evidence({ evidence_id: "fns_debtam:7701234567:2026-07-01:doc-1:99" });
    expect(buildCanonicalCompanyTaxDebtFacts([bad])).toEqual([]);
  });

  it("fails closed on legal-source promotion or live-balance promotion", () => {
    const promoted = evidence({
      legal_authority: true as false,
      substantive_use_allowed: true as false,
      use_as_legal_source: true as false,
      current_balance_claim_allowed: true as false,
    });
    expect(buildCanonicalCompanyTaxDebtFacts([promoted])).toEqual([]);
  });

  it("does not link merely because tax text and amounts resemble another row", () => {
    const item = evidence();
    const facts = buildCanonicalCompanyTaxDebtFacts([item]);
    const lookalike = evidence({
      evidence_id: "fns_debtam:7707654321:2026-07-01:doc-1:1",
      subject_key: { inn: "7707654321" },
    });
    const links = buildCompanyTaxDebtFactEvidenceLinks({ facts, evidence: [lookalike] });
    expect(links).toEqual([]);
  });

  it("builds a separate point-in-time matrix and never promotes debt to legal authority", () => {
    const snapshot = buildCompanyTaxDebtEvidenceMatrix([evidence()]);
    expect(snapshot.canonical_company_tax_debt_facts).toHaveLength(1);
    expect(snapshot.company_tax_debt_fact_evidence_links).toHaveLength(1);
    expect(snapshot.company_tax_debt_evidence_matrix).toHaveLength(1);
    expect(snapshot.company_tax_debt_evidence_matrix[0]).toMatchObject({
      matrix_scope: "company_tax_debt_factual",
      fact_kind: "tax_debt",
      evidence_status: "proven",
      current_balance_claim_allowed: false,
      legal_authority: false,
      substantive_use_allowed: false,
      use_as_legal_source: false,
    });
    expect(snapshot.diagnostics).toMatchObject({
      observation_scope: "point_in_time_not_live_balance",
      model_fact_linking_status: "not_linked",
      legal_source_status: "excluded",
    });
  });
});
