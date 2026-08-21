import { extractExplicitLegalEntityInns, normalizeLegalEntityInn } from "./fns-company-factual-evidence.ts";

type SbClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const SSHR2019_DATASET_ID = "7707329152-sshr2019" as const;
const OFFICIAL_FNS_URL_RE = /^https:\/\/(?:www\.)?(?:nalog\.gov\.ru|data\.nalog\.ru|file\.nalog\.ru)\//i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export type FnsAverageHeadcountRow = {
  inn: string;
  organization_name: string;
  average_headcount: number;
  document_id: string;
  document_date: string | null;
  reporting_date: string;
  dataset_id: typeof SSHR2019_DATASET_ID;
  source_url: string;
  source_sha256: string;
};

export type CompanyAverageHeadcountEvidence = {
  evidence_id: string;
  subject_type: "legal_entity";
  subject_key: { inn: string };
  fact_kind: "headcount";
  fact_text: string;
  attributes: {
    organization_name: string;
    average_headcount: number;
    reporting_scope: "annual_average_headcount";
  };
  source_type: "fns_open_data";
  source_family: "factual_official_data";
  official_owner: "ФНС России";
  dataset_id: typeof SSHR2019_DATASET_ID;
  source_url: string;
  source_sha256: string;
  data_as_of: string;
  reporting_date: string;
  document_id: string;
  document_date: string | null;
  factual_only: true;
  legal_authority: false;
  substantive_use_allowed: false;
  use_as_legal_source: false;
  current_employee_count_claim_allowed: false;
  fte_claim_allowed: false;
  payroll_claim_allowed: false;
};

function normalizeNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function rowFromUnknown(value: unknown): FnsAverageHeadcountRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const inn = normalizeLegalEntityInn(row.inn);
  const organizationName = typeof row.organization_name === "string" ? row.organization_name.trim() : "";
  const averageHeadcount = normalizeNonNegativeInteger(row.average_headcount);
  const documentId = typeof row.document_id === "string" ? row.document_id.trim() : "";
  const documentDate = typeof row.document_date === "string" && ISO_DATE_RE.test(row.document_date) ? row.document_date : null;
  const reportingDate = typeof row.reporting_date === "string" ? row.reporting_date.trim() : "";
  const datasetId = typeof row.dataset_id === "string" ? row.dataset_id.trim() : "";
  const sourceUrl = typeof row.source_url === "string" ? row.source_url.trim() : "";
  const sourceSha256 = typeof row.source_sha256 === "string" ? row.source_sha256.trim().toLowerCase() : "";

  if (!inn || !organizationName || averageHeadcount === null || !documentId) return null;
  if (!ISO_DATE_RE.test(reportingDate) || datasetId !== SSHR2019_DATASET_ID) return null;
  if (!OFFICIAL_FNS_URL_RE.test(sourceUrl) || !SHA256_RE.test(sourceSha256)) return null;

  return {
    inn,
    organization_name: organizationName,
    average_headcount: averageHeadcount,
    document_id: documentId,
    document_date: documentDate,
    reporting_date: reportingDate,
    dataset_id: SSHR2019_DATASET_ID,
    source_url: sourceUrl,
    source_sha256: sourceSha256,
  };
}

export function toCompanyAverageHeadcountEvidence(row: FnsAverageHeadcountRow): CompanyAverageHeadcountEvidence {
  return {
    evidence_id: `fns_sshr2019:${row.inn}:${row.reporting_date}:${row.document_id}`,
    subject_type: "legal_entity",
    subject_key: { inn: row.inn },
    fact_kind: "headcount",
    fact_text: `По данным ФНС о среднесписочной численности за период, завершившийся ${row.reporting_date}: ${row.organization_name} (ИНН ${row.inn}) — среднесписочная численность ${row.average_headcount}. Показатель не является автоматически текущим количеством работников, FTE или данными payroll.`,
    attributes: {
      organization_name: row.organization_name,
      average_headcount: row.average_headcount,
      reporting_scope: "annual_average_headcount",
    },
    source_type: "fns_open_data",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    dataset_id: SSHR2019_DATASET_ID,
    source_url: row.source_url,
    source_sha256: row.source_sha256,
    data_as_of: row.reporting_date,
    reporting_date: row.reporting_date,
    document_id: row.document_id,
    document_date: row.document_date,
    factual_only: true,
    legal_authority: false,
    substantive_use_allowed: false,
    use_as_legal_source: false,
    current_employee_count_claim_allowed: false,
    fte_claim_allowed: false,
    payroll_claim_allowed: false,
  };
}

export class SupabaseFnsSshr2019Transport {
  constructor(private readonly sb: SbClient) {}

  async lookup(innInput: string, asOfDate?: string | null): Promise<CompanyAverageHeadcountEvidence[]> {
    const inn = normalizeLegalEntityInn(innInput);
    if (!inn) return [];
    const asOf = asOfDate && ISO_DATE_RE.test(asOfDate) ? asOfDate : null;
    const { data, error } = await this.sb.rpc("fns_open_data_get_average_headcount", {
      p_inn: inn,
      p_as_of_date: asOf,
    });
    if (error) return [];
    const values = Array.isArray(data) ? data : data ? [data] : [];
    const rows = values.map(rowFromUnknown);
    if (rows.some((row) => row === null)) return [];
    return (rows as FnsAverageHeadcountRow[]).map(toCompanyAverageHeadcountEvidence);
  }
}

export async function loadFnsSshr2019FactualEvidence(input: {
  sb: SbClient;
  answers: Record<string, unknown>;
  asOfDate?: string | null;
}): Promise<CompanyAverageHeadcountEvidence[]> {
  const transport = new SupabaseFnsSshr2019Transport(input.sb);
  const inns = extractExplicitLegalEntityInns(input.answers);
  const nested = await Promise.all(inns.map((inn) => transport.lookup(inn, input.asOfDate)));
  return nested.flat();
}
