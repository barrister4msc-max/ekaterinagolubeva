import type { CompanyTaxDebtEvidence } from "./fns-company-tax-debt-evidence.ts";

export type CanonicalCompanyTaxDebtFact = {
  company_tax_debt_fact_id: string;
  subject: {
    subject_type: "legal_entity";
    inn: string;
  };
  fact_kind: "tax_debt";
  fact_value: {
    organization_name: string;
    tax_name: string;
    tax_debt_amount: string;
    penalty_amount: string;
    fine_amount: string;
    total_debt_amount: string;
    observation_scope: "point_in_time_not_live_balance";
  };
  valid_as_of: string;
  document_id: string;
  debt_row_ordinal: number;
  evidence_id: string;
  identity_source: "structured_official_evidence";
};

export type CompanyTaxDebtFactEvidenceLink = {
  company_tax_debt_fact_id: string;
  evidence_id: string;
  relation: "DIRECTLY_RECORDS";
  identity_match: "exact";
};

const INN_RE = /^\d{10}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_RE = /^\d+\.\d{2}$/;

function normalizeTaxName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function safeIdPart(value: string): string {
  return encodeURIComponent(value);
}

export function makeCompanyTaxDebtFactId(input: {
  inn: string;
  valid_as_of: string;
  document_id: string;
  debt_row_ordinal: number;
  tax_name: string;
}): string | null {
  const taxName = normalizeTaxName(input.tax_name);
  const documentId = input.document_id.trim();
  if (!INN_RE.test(input.inn)) return null;
  if (!DATE_RE.test(input.valid_as_of)) return null;
  if (!documentId) return null;
  if (!Number.isSafeInteger(input.debt_row_ordinal) || input.debt_row_ordinal < 1) return null;
  if (!taxName) return null;
  return [
    "company_fact",
    "legal_entity",
    input.inn,
    "tax_debt",
    input.valid_as_of,
    safeIdPart(documentId),
    String(input.debt_row_ordinal),
    safeIdPart(taxName),
  ].join(":");
}

function isExactSafeDebtEvidence(item: CompanyTaxDebtEvidence): boolean {
  if (item.subject_type !== "legal_entity" || !INN_RE.test(item.subject_key?.inn ?? "")) return false;
  if (item.fact_kind !== "tax_debt" || !DATE_RE.test(item.data_as_of)) return false;
  if (!item.document_id?.trim()) return false;
  if (!Number.isSafeInteger(item.debt_row_ordinal) || item.debt_row_ordinal < 1) return false;
  if (item.source_family !== "factual_official_data" || item.factual_only !== true) return false;
  if (item.legal_authority !== false || item.substantive_use_allowed !== false || item.use_as_legal_source !== false) return false;
  if (item.current_balance_claim_allowed !== false) return false;
  if (item.attributes.observation_scope !== "point_in_time_not_live_balance") return false;
  if (!item.attributes.organization_name?.trim() || !normalizeTaxName(item.attributes.tax_name ?? "")) return false;
  return [
    item.attributes.tax_debt_amount,
    item.attributes.penalty_amount,
    item.attributes.fine_amount,
    item.attributes.total_debt_amount,
  ].every((value) => MONEY_RE.test(value));
}

export function buildCanonicalCompanyTaxDebtFacts(
  evidence: CompanyTaxDebtEvidence[],
): CanonicalCompanyTaxDebtFact[] {
  const out: CanonicalCompanyTaxDebtFact[] = [];
  const seenIds = new Set<string>();

  for (const item of evidence) {
    if (!isExactSafeDebtEvidence(item)) continue;
    const taxName = normalizeTaxName(item.attributes.tax_name);
    const factId = makeCompanyTaxDebtFactId({
      inn: item.subject_key.inn,
      valid_as_of: item.data_as_of,
      document_id: item.document_id,
      debt_row_ordinal: item.debt_row_ordinal,
      tax_name: taxName,
    });
    if (!factId || seenIds.has(factId)) continue;

    // The evidence id is itself a structured DEBTAM row identity. Require it to
    // match the exact subject/date/document/ordinal before creating a fact.
    const expectedEvidenceId = `fns_debtam:${item.subject_key.inn}:${item.data_as_of}:${item.document_id}:${item.debt_row_ordinal}`;
    if (item.evidence_id !== expectedEvidenceId) continue;

    seenIds.add(factId);
    out.push({
      company_tax_debt_fact_id: factId,
      subject: { subject_type: "legal_entity", inn: item.subject_key.inn },
      fact_kind: "tax_debt",
      fact_value: {
        organization_name: item.attributes.organization_name.trim(),
        tax_name: taxName,
        tax_debt_amount: item.attributes.tax_debt_amount,
        penalty_amount: item.attributes.penalty_amount,
        fine_amount: item.attributes.fine_amount,
        total_debt_amount: item.attributes.total_debt_amount,
        observation_scope: "point_in_time_not_live_balance",
      },
      valid_as_of: item.data_as_of,
      document_id: item.document_id,
      debt_row_ordinal: item.debt_row_ordinal,
      evidence_id: item.evidence_id,
      identity_source: "structured_official_evidence",
    });
  }

  return out.sort((a, b) => a.company_tax_debt_fact_id.localeCompare(b.company_tax_debt_fact_id));
}

export function buildCompanyTaxDebtFactEvidenceLinks(input: {
  facts: CanonicalCompanyTaxDebtFact[];
  evidence: CompanyTaxDebtEvidence[];
}): CompanyTaxDebtFactEvidenceLink[] {
  const factsById = new Map(input.facts.map((fact) => [fact.company_tax_debt_fact_id, fact]));
  const links: CompanyTaxDebtFactEvidenceLink[] = [];

  for (const item of input.evidence) {
    if (!isExactSafeDebtEvidence(item)) continue;
    const factId = makeCompanyTaxDebtFactId({
      inn: item.subject_key.inn,
      valid_as_of: item.data_as_of,
      document_id: item.document_id,
      debt_row_ordinal: item.debt_row_ordinal,
      tax_name: item.attributes.tax_name,
    });
    if (!factId) continue;
    const fact = factsById.get(factId);
    if (!fact || fact.evidence_id !== item.evidence_id) continue;

    const sameValue =
      fact.subject.inn === item.subject_key.inn &&
      fact.valid_as_of === item.data_as_of &&
      fact.document_id === item.document_id &&
      fact.debt_row_ordinal === item.debt_row_ordinal &&
      fact.fact_value.organization_name === item.attributes.organization_name.trim() &&
      fact.fact_value.tax_name === normalizeTaxName(item.attributes.tax_name) &&
      fact.fact_value.tax_debt_amount === item.attributes.tax_debt_amount &&
      fact.fact_value.penalty_amount === item.attributes.penalty_amount &&
      fact.fact_value.fine_amount === item.attributes.fine_amount &&
      fact.fact_value.total_debt_amount === item.attributes.total_debt_amount &&
      fact.fact_value.observation_scope === item.attributes.observation_scope;
    if (!sameValue) continue;

    links.push({
      company_tax_debt_fact_id: factId,
      evidence_id: item.evidence_id,
      relation: "DIRECTLY_RECORDS",
      identity_match: "exact",
    });
  }

  return links.sort((a, b) => `${a.company_tax_debt_fact_id}:${a.evidence_id}`.localeCompare(`${b.company_tax_debt_fact_id}:${b.evidence_id}`));
}
