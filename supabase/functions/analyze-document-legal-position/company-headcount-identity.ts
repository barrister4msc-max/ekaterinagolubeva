import type { CompanyAverageHeadcountEvidence } from "./fns-company-headcount-evidence.ts";

export type CanonicalCompanyAverageHeadcountFact = {
  company_headcount_fact_id: string;
  subject: { subject_type: "legal_entity"; inn: string };
  fact_kind: "headcount";
  fact_value: {
    organization_name: string;
    average_headcount: number;
    reporting_scope: "annual_average_headcount";
  };
  reporting_date: string;
  document_id: string;
  evidence_id: string;
  identity_source: "structured_official_evidence";
};

export type CompanyHeadcountFactEvidenceLink = {
  company_headcount_fact_id: string;
  evidence_id: string;
  relation: "DIRECTLY_RECORDS";
  identity_match: "exact";
};

const INN_RE = /^\d{10}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeOrganizationName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function safeIdPart(value: string): string {
  return encodeURIComponent(value);
}

export function makeCompanyHeadcountFactId(input: {
  inn: string;
  reporting_date: string;
  document_id: string;
}): string | null {
  const documentId = input.document_id.trim();
  if (!INN_RE.test(input.inn) || !DATE_RE.test(input.reporting_date) || !documentId) return null;
  return ["company_fact", "legal_entity", input.inn, "headcount", input.reporting_date, safeIdPart(documentId)].join(":");
}

function isExactSafeHeadcountEvidence(item: CompanyAverageHeadcountEvidence): boolean {
  if (item.subject_type !== "legal_entity" || !INN_RE.test(item.subject_key?.inn ?? "")) return false;
  if (item.fact_kind !== "headcount") return false;
  if (!DATE_RE.test(item.reporting_date) || item.data_as_of !== item.reporting_date) return false;
  if (!item.document_id?.trim()) return false;
  if (item.source_family !== "factual_official_data" || item.factual_only !== true) return false;
  if (item.legal_authority !== false || item.substantive_use_allowed !== false || item.use_as_legal_source !== false) return false;
  if (item.current_employee_count_claim_allowed !== false || item.fte_claim_allowed !== false || item.payroll_claim_allowed !== false) return false;
  if (item.attributes.reporting_scope !== "annual_average_headcount") return false;
  if (!normalizeOrganizationName(item.attributes.organization_name ?? "")) return false;
  return Number.isSafeInteger(item.attributes.average_headcount) && item.attributes.average_headcount >= 0;
}

function valueSignature(item: CompanyAverageHeadcountEvidence): string {
  return JSON.stringify({
    organization_name: normalizeOrganizationName(item.attributes.organization_name),
    average_headcount: item.attributes.average_headcount,
    reporting_scope: item.attributes.reporting_scope,
  });
}

export function buildCanonicalCompanyAverageHeadcountFacts(
  evidence: CompanyAverageHeadcountEvidence[],
): CanonicalCompanyAverageHeadcountFact[] {
  const candidates = new Map<string, CompanyAverageHeadcountEvidence[]>();

  for (const item of evidence) {
    if (!isExactSafeHeadcountEvidence(item)) continue;
    const factId = makeCompanyHeadcountFactId({
      inn: item.subject_key.inn,
      reporting_date: item.reporting_date,
      document_id: item.document_id,
    });
    if (!factId) continue;
    const expectedEvidenceId = `fns_sshr2019:${item.subject_key.inn}:${item.reporting_date}:${item.document_id}`;
    if (item.evidence_id !== expectedEvidenceId) continue;
    const bucket = candidates.get(factId) ?? [];
    bucket.push(item);
    candidates.set(factId, bucket);
  }

  const out: CanonicalCompanyAverageHeadcountFact[] = [];
  for (const [factId, bucket] of candidates) {
    const signatures = new Set(bucket.map(valueSignature));
    if (signatures.size !== 1) continue;
    const item = bucket[0]!;
    out.push({
      company_headcount_fact_id: factId,
      subject: { subject_type: "legal_entity", inn: item.subject_key.inn },
      fact_kind: "headcount",
      fact_value: {
        organization_name: normalizeOrganizationName(item.attributes.organization_name),
        average_headcount: item.attributes.average_headcount,
        reporting_scope: "annual_average_headcount",
      },
      reporting_date: item.reporting_date,
      document_id: item.document_id,
      evidence_id: item.evidence_id,
      identity_source: "structured_official_evidence",
    });
  }

  return out.sort((a, b) => a.company_headcount_fact_id.localeCompare(b.company_headcount_fact_id));
}

export function buildCompanyHeadcountFactEvidenceLinks(input: {
  facts: CanonicalCompanyAverageHeadcountFact[];
  evidence: CompanyAverageHeadcountEvidence[];
}): CompanyHeadcountFactEvidenceLink[] {
  const factsById = new Map(input.facts.map((fact) => [fact.company_headcount_fact_id, fact]));
  const links = new Map<string, CompanyHeadcountFactEvidenceLink>();

  for (const item of input.evidence) {
    if (!isExactSafeHeadcountEvidence(item)) continue;
    const factId = makeCompanyHeadcountFactId({ inn: item.subject_key.inn, reporting_date: item.reporting_date, document_id: item.document_id });
    if (!factId) continue;
    const fact = factsById.get(factId);
    if (!fact || fact.evidence_id !== item.evidence_id) continue;
    const sameValue = fact.fact_value.organization_name === normalizeOrganizationName(item.attributes.organization_name)
      && fact.fact_value.average_headcount === item.attributes.average_headcount
      && fact.fact_value.reporting_scope === item.attributes.reporting_scope;
    if (!sameValue) continue;
    const link = {
      company_headcount_fact_id: factId,
      evidence_id: item.evidence_id,
      relation: "DIRECTLY_RECORDS" as const,
      identity_match: "exact" as const,
    };
    links.set(`${factId}:${item.evidence_id}`, link);
  }

  return [...links.values()].sort((a, b) => `${a.company_headcount_fact_id}:${a.evidence_id}`.localeCompare(`${b.company_headcount_fact_id}:${b.evidence_id}`));
}
