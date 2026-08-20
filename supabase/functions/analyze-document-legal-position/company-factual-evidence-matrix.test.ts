import { describe, expect, it } from "bun:test";
import { buildCompanyFactualEvidenceMatrix } from "./company-factual-evidence-matrix.ts";
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
    document_id: "doc-1",
    document_date: "2026-06-25",
    factual_only: true,
    legal_authority: false,
    substantive_use_allowed: false,
    use_as_legal_source: false,
    ...overrides,
  };
}

describe("company factual Evidence Matrix", () => {
  it("builds an additive exact-identity matrix without legal authority", () => {
    const snapshot = buildCompanyFactualEvidenceMatrix([evidence()]);

    expect(snapshot.canonical_company_facts).toHaveLength(1);
    expect(snapshot.company_fact_evidence_links).toEqual([
      {
        company_fact_id: "company_fact:legal_entity:7701234567:tax_regime:2026-06-01",
        evidence_id: "fns_snr:7701234567:2026-06-01",
        relation: "DIRECTLY_RECORDS",
        identity_match: "exact",
      },
    ]);
    expect(snapshot.company_factual_evidence_matrix).toEqual([
      {
        matrix_scope: "company_factual",
        company_fact_id: "company_fact:legal_entity:7701234567:tax_regime:2026-06-01",
        subject: { subject_type: "legal_entity", inn: "7701234567" },
        fact_kind: "tax_regime",
        fact_value: { organization_name: "ООО Ромашка", regimes: ["usn"] },
        valid_as_of: "2026-06-01",
        evidence_relations: [
          {
            evidence_id: "fns_snr:7701234567:2026-06-01",
            relation: "DIRECTLY_RECORDS",
            identity_match: "exact",
          },
        ],
        evidence_status: "proven",
        legal_authority: false,
        substantive_use_allowed: false,
        use_as_legal_source: false,
      },
    ]);
    expect(snapshot.diagnostics).toEqual({
      evidence_received: 1,
      canonical_facts: 1,
      exact_links: 1,
      matrix_entries: 1,
      matrix_scope: "company_factual",
      model_fact_linking_status: "not_linked",
      legal_source_status: "excluded",
    });
  });

  it("deduplicates identical evidence under one canonical fact", () => {
    const second = evidence({ evidence_id: "fns_snr:7701234567:2026-06-01:mirror" });
    const snapshot = buildCompanyFactualEvidenceMatrix([evidence(), second]);

    expect(snapshot.canonical_company_facts).toHaveLength(1);
    expect(snapshot.company_fact_evidence_links).toHaveLength(2);
    expect(snapshot.company_factual_evidence_matrix[0]?.evidence_relations).toHaveLength(2);
    expect(snapshot.company_factual_evidence_matrix[0]?.evidence_status).toBe("proven");
  });

  it("does not merge conflicting proposition values under the same canonical identity", () => {
    const conflicting = evidence({
      evidence_id: "fns_snr:7701234567:2026-06-01:conflict",
      attributes: { organization_name: "ООО Ромашка", regimes: ["ausn"] },
      fact_text: "Конфликтующее значение",
    });
    const snapshot = buildCompanyFactualEvidenceMatrix([evidence(), conflicting]);

    expect(snapshot.canonical_company_facts).toHaveLength(1);
    expect(snapshot.canonical_company_facts[0]?.fact_value.regimes).toEqual(["usn"]);
    expect(snapshot.company_fact_evidence_links).toHaveLength(1);
    expect(snapshot.company_factual_evidence_matrix[0]?.evidence_relations).toHaveLength(1);
  });

  it("rejects evidence that attempts legal-authority promotion", () => {
    const promoted = evidence({ legal_authority: true as false });
    const snapshot = buildCompanyFactualEvidenceMatrix([promoted]);

    expect(snapshot.canonical_company_facts).toEqual([]);
    expect(snapshot.company_fact_evidence_links).toEqual([]);
    expect(snapshot.company_factual_evidence_matrix).toEqual([]);
  });

  it("cannot create a matrix row from free text alone", () => {
    const snapshot = buildCompanyFactualEvidenceMatrix([]);
    expect(snapshot.company_factual_evidence_matrix).toEqual([]);
    expect(snapshot.diagnostics.model_fact_linking_status).toBe("not_linked");
  });
});
