import { describe, expect, test } from "bun:test";
import { buildCompanyAverageHeadcountEvidenceMatrix } from "./company-headcount-evidence-matrix.ts";
import type { CompanyAverageHeadcountEvidence } from "./fns-company-headcount-evidence.ts";

function evidence(overrides: Partial<CompanyAverageHeadcountEvidence> = {}): CompanyAverageHeadcountEvidence {
  return {
    evidence_id: "fns_sshr2019:7701234567:2025-12-31:doc-1",
    subject_type: "legal_entity",
    subject_key: { inn: "7701234567" },
    fact_kind: "headcount",
    fact_text: "structured factual headcount",
    attributes: { organization_name: "ООО Ромашка", average_headcount: 0, reporting_scope: "annual_average_headcount" },
    source_type: "fns_open_data",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    dataset_id: "7707329152-sshr2019",
    source_url: "https://file.nalog.ru/opendata/7707329152-sshr2019/data-20260725-structure-20200408.zip",
    source_sha256: "265eca8b05a234ff629f57779ebbc647d07e42c7e43612b40e9ae84340de1464",
    data_as_of: "2025-12-31",
    reporting_date: "2025-12-31",
    document_id: "doc-1",
    document_date: "2026-07-25",
    factual_only: true,
    legal_authority: false,
    substantive_use_allowed: false,
    use_as_legal_source: false,
    current_employee_count_claim_allowed: false,
    fte_claim_allowed: false,
    payroll_claim_allowed: false,
    ...overrides,
  };
}

describe("SSHR2019 separate factual Evidence Matrix", () => {
  test("creates one proven exact matrix entry and preserves zero", () => {
    const snapshot = buildCompanyAverageHeadcountEvidenceMatrix([evidence()]);
    expect(snapshot.canonical_company_average_headcount_facts).toHaveLength(1);
    expect(snapshot.company_headcount_fact_evidence_links).toHaveLength(1);
    expect(snapshot.company_average_headcount_evidence_matrix).toEqual([
      expect.objectContaining({
        matrix_scope: "company_average_headcount_factual",
        fact_kind: "headcount",
        fact_value: expect.objectContaining({ average_headcount: 0, reporting_scope: "annual_average_headcount" }),
        evidence_status: "proven",
        current_employee_count_claim_allowed: false,
        fte_claim_allowed: false,
        payroll_claim_allowed: false,
        legal_authority: false,
        substantive_use_allowed: false,
        use_as_legal_source: false,
        evidence_relations: [{
          evidence_id: "fns_sshr2019:7701234567:2025-12-31:doc-1",
          relation: "DIRECTLY_RECORDS",
          identity_match: "exact",
        }],
      }),
    ]);
    expect(snapshot.diagnostics).toMatchObject({
      matrix_scope: "company_average_headcount_factual",
      reporting_scope: "annual_average_headcount",
      model_fact_linking_status: "not_linked",
      legal_source_status: "excluded",
    });
  });

  test("keeps distinct exact identities separate", () => {
    const second = evidence({
      evidence_id: "fns_sshr2019:7701234567:2024-12-31:doc-2",
      reporting_date: "2024-12-31",
      data_as_of: "2024-12-31",
      document_id: "doc-2",
      attributes: { organization_name: "ООО Ромашка", average_headcount: 4, reporting_scope: "annual_average_headcount" },
    });
    const snapshot = buildCompanyAverageHeadcountEvidenceMatrix([second, evidence()]);
    expect(snapshot.company_average_headcount_evidence_matrix).toHaveLength(2);
    expect(snapshot.company_average_headcount_evidence_matrix.map((x) => x.fact_value.average_headcount).sort((a,b)=>a-b)).toEqual([0,4]);
  });

  test("fails closed rather than producing a matrix for conflicting duplicate identity", () => {
    const conflict = evidence({ attributes: { organization_name: "ООО Ромашка", average_headcount: 3, reporting_scope: "annual_average_headcount" } });
    const snapshot = buildCompanyAverageHeadcountEvidenceMatrix([evidence(), conflict]);
    expect(snapshot.canonical_company_average_headcount_facts).toEqual([]);
    expect(snapshot.company_headcount_fact_evidence_links).toEqual([]);
    expect(snapshot.company_average_headcount_evidence_matrix).toEqual([]);
  });

  test("does not use narrative similarity or organization name as identity", () => {
    const other = evidence({
      evidence_id: "fns_sshr2019:7812345678:2025-12-31:doc-9",
      subject_key: { inn: "7812345678" },
      document_id: "doc-9",
      fact_text: "same narrative text",
      attributes: { organization_name: "ООО Ромашка", average_headcount: 0, reporting_scope: "annual_average_headcount" },
    });
    const snapshot = buildCompanyAverageHeadcountEvidenceMatrix([evidence(), other]);
    expect(snapshot.company_average_headcount_evidence_matrix).toHaveLength(2);
    expect(new Set(snapshot.company_average_headcount_evidence_matrix.map((x) => x.subject.inn)).size).toBe(2);
  });
});
