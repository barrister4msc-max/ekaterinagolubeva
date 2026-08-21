import { describe, expect, test } from "bun:test";
import {
  buildCanonicalCompanyAverageHeadcountFacts,
  buildCompanyHeadcountFactEvidenceLinks,
  makeCompanyHeadcountFactId,
} from "./company-headcount-identity.ts";
import type { CompanyAverageHeadcountEvidence } from "./fns-company-headcount-evidence.ts";

function evidence(overrides: Partial<CompanyAverageHeadcountEvidence> = {}): CompanyAverageHeadcountEvidence {
  const base: CompanyAverageHeadcountEvidence = {
    evidence_id: "fns_sshr2019:7701234567:2025-12-31:doc-1",
    subject_type: "legal_entity",
    subject_key: { inn: "7701234567" },
    fact_kind: "headcount",
    fact_text: "structured factual headcount",
    attributes: {
      organization_name: "ООО Ромашка",
      average_headcount: 0,
      reporting_scope: "annual_average_headcount",
    },
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
  };
  return { ...base, ...overrides };
}

describe("canonical SSHR2019 headcount identity", () => {
  test("uses exact INN + reporting date + document identity and preserves zero", () => {
    const facts = buildCanonicalCompanyAverageHeadcountFacts([evidence()]);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      company_headcount_fact_id: "company_fact:legal_entity:7701234567:headcount:2025-12-31:doc-1",
      fact_value: { average_headcount: 0, reporting_scope: "annual_average_headcount" },
      evidence_id: "fns_sshr2019:7701234567:2025-12-31:doc-1",
    });
  });

  test("identity is deterministic and distinct across document/date/INN", () => {
    expect(makeCompanyHeadcountFactId({ inn: "7701234567", reporting_date: "2025-12-31", document_id: "doc-1" }))
      .toBe("company_fact:legal_entity:7701234567:headcount:2025-12-31:doc-1");
    expect(makeCompanyHeadcountFactId({ inn: "7701234567", reporting_date: "2024-12-31", document_id: "doc-1" }))
      .not.toBe(makeCompanyHeadcountFactId({ inn: "7701234567", reporting_date: "2025-12-31", document_id: "doc-1" }));
    expect(makeCompanyHeadcountFactId({ inn: "7812345678", reporting_date: "2025-12-31", document_id: "doc-1" }))
      .not.toBe(makeCompanyHeadcountFactId({ inn: "7701234567", reporting_date: "2025-12-31", document_id: "doc-1" }));
  });

  test("fails closed on conflicting values for one exact identity", () => {
    const conflicting = evidence({
      attributes: { organization_name: "ООО Ромашка", average_headcount: 5, reporting_scope: "annual_average_headcount" },
    });
    expect(buildCanonicalCompanyAverageHeadcountFacts([evidence(), conflicting])).toEqual([]);
  });

  test("rejects unsafe semantic or provenance states", () => {
    expect(buildCanonicalCompanyAverageHeadcountFacts([evidence({ legal_authority: true as false })])).toEqual([]);
    expect(buildCanonicalCompanyAverageHeadcountFacts([evidence({ current_employee_count_claim_allowed: true as false })])).toEqual([]);
    expect(buildCanonicalCompanyAverageHeadcountFacts([evidence({ evidence_id: "wrong" })])).toEqual([]);
    expect(buildCanonicalCompanyAverageHeadcountFacts([evidence({ data_as_of: "2026-08-21" })])).toEqual([]);
  });

  test("links only exact identity and exact value", () => {
    const item = evidence();
    const facts = buildCanonicalCompanyAverageHeadcountFacts([item]);
    expect(buildCompanyHeadcountFactEvidenceLinks({ facts, evidence: [item] })).toEqual([
      {
        company_headcount_fact_id: "company_fact:legal_entity:7701234567:headcount:2025-12-31:doc-1",
        evidence_id: item.evidence_id,
        relation: "DIRECTLY_RECORDS",
        identity_match: "exact",
      },
    ]);
    const mismatch = evidence({
      evidence_id: "fns_sshr2019:7701234567:2025-12-31:doc-1",
      attributes: { organization_name: "ООО Ромашка", average_headcount: 1, reporting_scope: "annual_average_headcount" },
    });
    expect(buildCompanyHeadcountFactEvidenceLinks({ facts, evidence: [mismatch] })).toEqual([]);
  });
});
