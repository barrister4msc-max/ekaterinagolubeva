import { describe, expect, it } from "bun:test";
import {
  buildCanonicalCompanyFacts,
  buildCompanyFactEvidenceLinks,
  makeCompanyFactId,
} from "./company-factual-identity.ts";
import type { CompanyFactualEvidence } from "./fns-company-factual-evidence.ts";

const SHA = "a0b1c63d38569e65acd2011a72e578f2b12ebd42b1c553fe352628ed480f475a";

function evidence(overrides: Partial<CompanyFactualEvidence> = {}): CompanyFactualEvidence {
  return {
    evidence_id: "fns_snr:7701234567:2026-06-01",
    subject_type: "legal_entity",
    subject_key: { inn: "7701234567" },
    fact_kind: "tax_regime",
    fact_text: "По данным ФНС на 2026-06-01: ООО Ромашка (ИНН 7701234567) — USN.",
    attributes: { organization_name: "ООО Ромашка", regimes: ["usn"] },
    source_type: "fns_open_data",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    dataset_id: "7707329152-snr",
    source_url: "https://file.nalog.ru/opendata/7707329152-snr/data.zip",
    source_sha256: SHA,
    data_as_of: "2026-06-01",
    document_id: null,
    document_date: "2026-06-25",
    factual_only: true,
    legal_authority: false,
    substantive_use_allowed: false,
    use_as_legal_source: false,
    ...overrides,
  };
}

describe("canonical company factual identity", () => {
  it("creates stable identity only from exact structured subject/kind/date", () => {
    expect(
      makeCompanyFactId({
        subject_type: "legal_entity",
        inn: "7701234567",
        fact_kind: "tax_regime",
        valid_as_of: "2026-06-01",
      }),
    ).toBe("company_fact:legal_entity:7701234567:tax_regime:2026-06-01");

    expect(
      makeCompanyFactId({
        subject_type: "legal_entity",
        inn: "770123456",
        fact_kind: "tax_regime",
        valid_as_of: "2026-06-01",
      }),
    ).toBeNull();
  });

  it("builds a canonical fact and exact DIRECTLY_RECORDS link", () => {
    const item = evidence();
    const facts = buildCanonicalCompanyFacts([item]);
    const links = buildCompanyFactEvidenceLinks({ facts, evidence: [item] });

    expect(facts).toEqual([
      {
        company_fact_id: "company_fact:legal_entity:7701234567:tax_regime:2026-06-01",
        subject: { subject_type: "legal_entity", inn: "7701234567" },
        fact_kind: "tax_regime",
        fact_value: { organization_name: "ООО Ромашка", regimes: ["usn"] },
        valid_as_of: "2026-06-01",
        evidence_ids: [item.evidence_id],
        identity_source: "structured_official_evidence",
      },
    ]);
    expect(links).toEqual([
      {
        company_fact_id: facts[0]!.company_fact_id,
        evidence_id: item.evidence_id,
        relation: "DIRECTLY_RECORDS",
        identity_match: "exact",
      },
    ]);
  });

  it("does not merge conflicting values under the same identity", () => {
    const first = evidence();
    const conflicting = evidence({
      evidence_id: "fns_snr:7701234567:2026-06-01:conflict" as string,
      attributes: { organization_name: "ООО Ромашка", regimes: ["ausn"] },
    });
    const facts = buildCanonicalCompanyFacts([first, conflicting]);

    expect(facts).toHaveLength(1);
    expect(facts[0]!.fact_value.regimes).toEqual(["usn"]);
    expect(facts[0]!.evidence_ids).toEqual([first.evidence_id]);
    expect(buildCompanyFactEvidenceLinks({ facts, evidence: [first, conflicting] })).toEqual([
      {
        company_fact_id: facts[0]!.company_fact_id,
        evidence_id: first.evidence_id,
        relation: "DIRECTLY_RECORDS",
        identity_match: "exact",
      },
    ]);
  });

  it("rejects evidence that attempts to act as a legal source", () => {
    const unsafe = evidence({
      legal_authority: true as false,
      substantive_use_allowed: true as false,
      use_as_legal_source: true as false,
    });
    expect(buildCanonicalCompanyFacts([unsafe])).toEqual([]);
  });

  it("never links by text resemblance alone", () => {
    const item = evidence();
    const unrelatedFact = {
      company_fact_id: "company_fact:legal_entity:7707654321:tax_regime:2026-06-01",
      subject: { subject_type: "legal_entity" as const, inn: "7707654321" },
      fact_kind: "tax_regime" as const,
      fact_value: { organization_name: "ООО Ромашка", regimes: ["usn"] },
      valid_as_of: "2026-06-01",
      evidence_ids: [item.evidence_id],
      identity_source: "structured_official_evidence" as const,
    };

    expect(buildCompanyFactEvidenceLinks({ facts: [unrelatedFact], evidence: [item] })).toEqual([]);
  });
});
