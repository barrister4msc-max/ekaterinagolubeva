import type { CompanyFinancialStatementEvidence } from "./fns-company-financial-statement-evidence.ts";

export type CanonicalCompanyFinancialStatementFact = {
  company_financial_statement_fact_id: string;
  subject: {
    subject_type: "legal_entity";
    inn: string;
  };
  fact_kind: "financial_statement";
  fact_value: {
    organization_name: string;
    income_amount: string;
    expense_amount: string;
    reporting_scope: "annual_accounting_statement";
  };
  reporting_date: string;
  document_id: string;
  evidence_id: string;
  identity_source: "structured_official_evidence";
};

export type CompanyFinancialStatementFactEvidenceLink = {
  company_financial_statement_fact_id: string;
  evidence_id: string;
  relation: "DIRECTLY_RECORDS";
  identity_match: "exact";
};

const INN_RE = /^\d{10}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_RE = /^\d+\.\d{2}$/;

function normalizeOrganizationName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function safeIdPart(value: string): string {
  return encodeURIComponent(value);
}

export function makeCompanyFinancialStatementFactId(input: {
  inn: string;
  reporting_date: string;
  document_id: string;
}): string | null {
  const documentId = input.document_id.trim();
  if (!INN_RE.test(input.inn)) return null;
  if (!DATE_RE.test(input.reporting_date)) return null;
  if (!documentId) return null;
  return [
    "company_fact",
    "legal_entity",
    input.inn,
    "financial_statement",
    input.reporting_date,
    safeIdPart(documentId),
  ].join(":");
}

function isExactSafeFinancialStatementEvidence(item: CompanyFinancialStatementEvidence): boolean {
  if (item.subject_type !== "legal_entity" || !INN_RE.test(item.subject_key?.inn ?? "")) return false;
  if (item.fact_kind !== "financial_statement") return false;
  if (!DATE_RE.test(item.reporting_date) || item.data_as_of !== item.reporting_date) return false;
  if (!item.document_id?.trim()) return false;
  if (item.source_family !== "factual_official_data" || item.factual_only !== true) return false;
  if (item.legal_authority !== false || item.substantive_use_allowed !== false || item.use_as_legal_source !== false) return false;
  if (item.turnover_claim_allowed !== false || item.taxable_income_claim_allowed !== false || item.current_financial_position_claim_allowed !== false) return false;
  if (item.attributes.reporting_scope !== "annual_accounting_statement") return false;
  if (!normalizeOrganizationName(item.attributes.organization_name ?? "")) return false;
  return MONEY_RE.test(item.attributes.income_amount) && MONEY_RE.test(item.attributes.expense_amount);
}

export function buildCanonicalCompanyFinancialStatementFacts(
  evidence: CompanyFinancialStatementEvidence[],
): CanonicalCompanyFinancialStatementFact[] {
  const out: CanonicalCompanyFinancialStatementFact[] = [];
  const seenIds = new Set<string>();

  for (const item of evidence) {
    if (!isExactSafeFinancialStatementEvidence(item)) continue;
    const factId = makeCompanyFinancialStatementFactId({
      inn: item.subject_key.inn,
      reporting_date: item.reporting_date,
      document_id: item.document_id,
    });
    if (!factId || seenIds.has(factId)) continue;

    const expectedEvidenceId = `fns_revexp:${item.subject_key.inn}:${item.reporting_date}:${item.document_id}`;
    if (item.evidence_id !== expectedEvidenceId) continue;

    seenIds.add(factId);
    out.push({
      company_financial_statement_fact_id: factId,
      subject: { subject_type: "legal_entity", inn: item.subject_key.inn },
      fact_kind: "financial_statement",
      fact_value: {
        organization_name: normalizeOrganizationName(item.attributes.organization_name),
        income_amount: item.attributes.income_amount,
        expense_amount: item.attributes.expense_amount,
        reporting_scope: "annual_accounting_statement",
      },
      reporting_date: item.reporting_date,
      document_id: item.document_id,
      evidence_id: item.evidence_id,
      identity_source: "structured_official_evidence",
    });
  }

  return out.sort((a, b) => a.company_financial_statement_fact_id.localeCompare(b.company_financial_statement_fact_id));
}

export function buildCompanyFinancialStatementFactEvidenceLinks(input: {
  facts: CanonicalCompanyFinancialStatementFact[];
  evidence: CompanyFinancialStatementEvidence[];
}): CompanyFinancialStatementFactEvidenceLink[] {
  const factsById = new Map(input.facts.map((fact) => [fact.company_financial_statement_fact_id, fact]));
  const links: CompanyFinancialStatementFactEvidenceLink[] = [];

  for (const item of input.evidence) {
    if (!isExactSafeFinancialStatementEvidence(item)) continue;
    const factId = makeCompanyFinancialStatementFactId({
      inn: item.subject_key.inn,
      reporting_date: item.reporting_date,
      document_id: item.document_id,
    });
    if (!factId) continue;
    const fact = factsById.get(factId);
    if (!fact || fact.evidence_id !== item.evidence_id) continue;

    const sameValue =
      fact.subject.inn === item.subject_key.inn &&
      fact.reporting_date === item.reporting_date &&
      fact.document_id === item.document_id &&
      fact.fact_value.organization_name === normalizeOrganizationName(item.attributes.organization_name) &&
      fact.fact_value.income_amount === item.attributes.income_amount &&
      fact.fact_value.expense_amount === item.attributes.expense_amount &&
      fact.fact_value.reporting_scope === item.attributes.reporting_scope;
    if (!sameValue) continue;

    links.push({
      company_financial_statement_fact_id: factId,
      evidence_id: item.evidence_id,
      relation: "DIRECTLY_RECORDS",
      identity_match: "exact",
    });
  }

  return links.sort((a, b) => `${a.company_financial_statement_fact_id}:${a.evidence_id}`.localeCompare(`${b.company_financial_statement_fact_id}:${b.evidence_id}`));
}
