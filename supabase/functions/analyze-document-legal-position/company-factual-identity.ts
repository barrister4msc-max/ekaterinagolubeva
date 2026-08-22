import type { CompanyFactualEvidence } from "./fns-company-factual-evidence.ts";

export type CompanyFactualSubjectKey = {
  subject_type: "legal_entity";
  inn: string;
};

export type CanonicalCompanyFact = {
  company_fact_id: string;
  subject: CompanyFactualSubjectKey;
  fact_kind: "tax_regime";
  fact_value: {
    regimes: string[];
    organization_name: string;
  };
  valid_as_of: string;
  evidence_ids: string[];
  identity_source: "structured_official_evidence";
};

export type CompanyFactEvidenceLink = {
  company_fact_id: string;
  evidence_id: string;
  relation: "DIRECTLY_RECORDS";
  identity_match: "exact";
};

const INN_RE = /^\d{10}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeRegimes(regimes: string[]): string[] {
  return [...new Set(regimes.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

export function makeCompanyFactId(input: {
  subject_type: "legal_entity";
  inn: string;
  fact_kind: "tax_regime";
  valid_as_of: string;
}): string | null {
  if (input.subject_type !== "legal_entity") return null;
  if (!INN_RE.test(input.inn)) return null;
  if (input.fact_kind !== "tax_regime") return null;
  if (!DATE_RE.test(input.valid_as_of)) return null;
  return `company_fact:${input.subject_type}:${input.inn}:${input.fact_kind}:${input.valid_as_of}`;
}

/**
 * P0-A6 canonical company-fact identity.
 *
 * This does NOT attempt to match model FactRecord text to external evidence.
 * A canonical company fact is created only from structured, already-validated
 * factual evidence with an exact subject key + fact kind + as-of date.
 */
export function buildCanonicalCompanyFacts(
  evidence: CompanyFactualEvidence[],
): CanonicalCompanyFact[] {
  const byId = new Map<string, CanonicalCompanyFact>();

  for (const item of evidence) {
    if (item.subject_type !== "legal_entity") continue;
    const inn = item.subject_key?.inn ?? "";
    if (!INN_RE.test(inn)) continue;
    if (item.fact_kind !== "tax_regime") continue;
    if (!DATE_RE.test(item.data_as_of)) continue;
    if (item.source_family !== "factual_official_data" || item.factual_only !== true) continue;
    if (item.legal_authority !== false || item.substantive_use_allowed !== false) continue;
    if (item.use_as_legal_source !== false) continue;

    const companyFactId = makeCompanyFactId({
      subject_type: "legal_entity",
      inn,
      fact_kind: "tax_regime",
      valid_as_of: item.data_as_of,
    });
    if (!companyFactId) continue;

    const regimes = normalizeRegimes(item.attributes.regimes ?? []);
    const organizationName = item.attributes.organization_name?.trim() ?? "";
    if (!organizationName) continue;

    const existing = byId.get(companyFactId);
    if (!existing) {
      byId.set(companyFactId, {
        company_fact_id: companyFactId,
        subject: { subject_type: "legal_entity", inn },
        fact_kind: "tax_regime",
        fact_value: {
          regimes,
          organization_name: organizationName,
        },
        valid_as_of: item.data_as_of,
        evidence_ids: [item.evidence_id],
        identity_source: "structured_official_evidence",
      });
      continue;
    }

    // Same canonical identity may only aggregate an evidence identifier when
    // the proposition value is exactly the same. Conflicting values remain
    // fail-closed and are not silently merged.
    const sameValue =
      existing.fact_value.organization_name === organizationName &&
      JSON.stringify(existing.fact_value.regimes) === JSON.stringify(regimes);
    if (!sameValue) continue;
    if (!existing.evidence_ids.includes(item.evidence_id)) existing.evidence_ids.push(item.evidence_id);
  }

  return [...byId.values()].map((fact) => ({
    ...fact,
    evidence_ids: [...fact.evidence_ids].sort(),
  }));
}

/**
 * Exact deterministic fact↔evidence links only.
 * No substring, semantic similarity, embeddings, LLM judgement or OCR mining.
 */
export function buildCompanyFactEvidenceLinks(input: {
  facts: CanonicalCompanyFact[];
  evidence: CompanyFactualEvidence[];
}): CompanyFactEvidenceLink[] {
  const factsById = new Map(input.facts.map((fact) => [fact.company_fact_id, fact]));
  const links: CompanyFactEvidenceLink[] = [];

  for (const item of input.evidence) {
    const companyFactId = makeCompanyFactId({
      subject_type: item.subject_type,
      inn: item.subject_key?.inn ?? "",
      fact_kind: item.fact_kind,
      valid_as_of: item.data_as_of,
    });
    if (!companyFactId) continue;
    const fact = factsById.get(companyFactId);
    if (!fact) continue;

    const regimes = normalizeRegimes(item.attributes.regimes ?? []);
    if (fact.fact_value.organization_name !== item.attributes.organization_name.trim()) continue;
    if (JSON.stringify(fact.fact_value.regimes) !== JSON.stringify(regimes)) continue;
    if (!fact.evidence_ids.includes(item.evidence_id)) continue;

    links.push({
      company_fact_id: companyFactId,
      evidence_id: item.evidence_id,
      relation: "DIRECTLY_RECORDS",
      identity_match: "exact",
    });
  }

  return links.sort((a, b) =>
    `${a.company_fact_id}:${a.evidence_id}`.localeCompare(`${b.company_fact_id}:${b.evidence_id}`),
  );
}
