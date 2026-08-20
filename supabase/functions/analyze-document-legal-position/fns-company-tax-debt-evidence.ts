import { extractExplicitLegalEntityInns, normalizeLegalEntityInn } from "./fns-company-factual-evidence.ts";

type SbClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const DEBTAM_DATASET_ID = "7707329152-debtam" as const;
const OFFICIAL_FNS_URL_RE = /^https:\/\/(?:www\.)?(?:nalog\.gov\.ru|data\.nalog\.ru|file\.nalog\.ru)\//i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MONEY_RE = /^\d+(?:\.\d{1,2})?$/;

export type FnsTaxDebtRow = {
  inn: string;
  organization_name: string;
  tax_name: string;
  tax_debt_amount: string;
  penalty_amount: string;
  fine_amount: string;
  total_debt_amount: string;
  document_id: string;
  document_date: string | null;
  data_as_of: string;
  debt_row_ordinal: number;
  dataset_id: typeof DEBTAM_DATASET_ID;
  source_url: string;
  source_sha256: string;
};

export type CompanyTaxDebtEvidence = {
  evidence_id: string;
  subject_type: "legal_entity";
  subject_key: { inn: string };
  fact_kind: "tax_debt";
  fact_text: string;
  attributes: {
    organization_name: string;
    tax_name: string;
    tax_debt_amount: string;
    penalty_amount: string;
    fine_amount: string;
    total_debt_amount: string;
    observation_scope: "point_in_time_not_live_balance";
  };
  source_type: "fns_open_data";
  source_family: "factual_official_data";
  official_owner: "ФНС России";
  dataset_id: typeof DEBTAM_DATASET_ID;
  source_url: string;
  source_sha256: string;
  data_as_of: string;
  document_id: string;
  document_date: string | null;
  debt_row_ordinal: number;
  factual_only: true;
  legal_authority: false;
  substantive_use_allowed: false;
  use_as_legal_source: false;
  current_balance_claim_allowed: false;
};

function normalizeMoneyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!MONEY_RE.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function rowFromUnknown(value: unknown): FnsTaxDebtRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const inn = normalizeLegalEntityInn(row.inn);
  const organizationName = typeof row.organization_name === "string" ? row.organization_name.trim() : "";
  const taxName = typeof row.tax_name === "string" ? row.tax_name.trim() : "";
  const documentId = typeof row.document_id === "string" ? row.document_id.trim() : "";
  const documentDate = typeof row.document_date === "string" && ISO_DATE_RE.test(row.document_date)
    ? row.document_date
    : null;
  const dataAsOf = typeof row.data_as_of === "string" ? row.data_as_of.trim() : "";
  const datasetId = typeof row.dataset_id === "string" ? row.dataset_id.trim() : "";
  const sourceUrl = typeof row.source_url === "string" ? row.source_url.trim() : "";
  const sourceSha256 = typeof row.source_sha256 === "string" ? row.source_sha256.trim().toLowerCase() : "";
  const ordinal = typeof row.debt_row_ordinal === "number" && Number.isInteger(row.debt_row_ordinal)
    ? row.debt_row_ordinal
    : typeof row.debt_row_ordinal === "string" && /^\d+$/.test(row.debt_row_ordinal)
      ? Number(row.debt_row_ordinal)
      : NaN;

  const taxDebt = normalizeMoneyText(row.tax_debt_amount);
  const penalty = normalizeMoneyText(row.penalty_amount);
  const fine = normalizeMoneyText(row.fine_amount);
  const total = normalizeMoneyText(row.total_debt_amount);

  if (!inn || !organizationName || !taxName || !documentId) return null;
  if (!ISO_DATE_RE.test(dataAsOf) || datasetId !== DEBTAM_DATASET_ID) return null;
  if (!OFFICIAL_FNS_URL_RE.test(sourceUrl) || !SHA256_RE.test(sourceSha256)) return null;
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) return null;
  if (!taxDebt || !penalty || !fine || !total) return null;

  return {
    inn,
    organization_name: organizationName,
    tax_name: taxName,
    tax_debt_amount: taxDebt,
    penalty_amount: penalty,
    fine_amount: fine,
    total_debt_amount: total,
    document_id: documentId,
    document_date: documentDate,
    data_as_of: dataAsOf,
    debt_row_ordinal: ordinal,
    dataset_id: DEBTAM_DATASET_ID,
    source_url: sourceUrl,
    source_sha256: sourceSha256,
  };
}

export function toCompanyTaxDebtEvidence(row: FnsTaxDebtRow): CompanyTaxDebtEvidence {
  return {
    evidence_id: `fns_debtam:${row.inn}:${row.data_as_of}:${row.document_id}:${row.debt_row_ordinal}`,
    subject_type: "legal_entity",
    subject_key: { inn: row.inn },
    fact_kind: "tax_debt",
    fact_text: `По опубликованным данным ФНС на ${row.data_as_of}: ${row.organization_name} (ИНН ${row.inn}), ${row.tax_name} — общая сумма ${row.total_debt_amount}. Это точечное наблюдение, а не утверждение о текущем остатке задолженности.`,
    attributes: {
      organization_name: row.organization_name,
      tax_name: row.tax_name,
      tax_debt_amount: row.tax_debt_amount,
      penalty_amount: row.penalty_amount,
      fine_amount: row.fine_amount,
      total_debt_amount: row.total_debt_amount,
      observation_scope: "point_in_time_not_live_balance",
    },
    source_type: "fns_open_data",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    dataset_id: DEBTAM_DATASET_ID,
    source_url: row.source_url,
    source_sha256: row.source_sha256,
    data_as_of: row.data_as_of,
    document_id: row.document_id,
    document_date: row.document_date,
    debt_row_ordinal: row.debt_row_ordinal,
    factual_only: true,
    legal_authority: false,
    substantive_use_allowed: false,
    use_as_legal_source: false,
    current_balance_claim_allowed: false,
  };
}

export class SupabaseFnsDebtamTransport {
  constructor(private readonly sb: SbClient) {}

  async lookup(innInput: string, asOfDate?: string | null): Promise<CompanyTaxDebtEvidence[]> {
    const inn = normalizeLegalEntityInn(innInput);
    if (!inn) return [];
    const asOf = asOfDate && ISO_DATE_RE.test(asOfDate) ? asOfDate : null;
    const { data, error } = await this.sb.rpc("fns_open_data_get_tax_debts_text", {
      p_inn: inn,
      p_as_of_date: asOf,
    });
    if (error) return [];
    const values = Array.isArray(data) ? data : data ? [data] : [];
    const rows = values.map(rowFromUnknown);
    if (rows.some((row) => row === null)) return [];
    return (rows as FnsTaxDebtRow[]).map(toCompanyTaxDebtEvidence);
  }
}

export async function loadFnsDebtamFactualEvidence(input: {
  sb: SbClient;
  answers: Record<string, unknown>;
  asOfDate?: string | null;
}): Promise<CompanyTaxDebtEvidence[]> {
  const transport = new SupabaseFnsDebtamTransport(input.sb);
  const inns = extractExplicitLegalEntityInns(input.answers);
  const nested = await Promise.all(inns.map((inn) => transport.lookup(inn, input.asOfDate)));
  return nested.flat();
}
