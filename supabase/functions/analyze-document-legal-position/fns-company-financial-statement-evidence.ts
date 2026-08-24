import { extractExplicitLegalEntityInns, normalizeLegalEntityInn } from "./fns-company-factual-evidence.ts";

type SbClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const REVEXP_DATASET_ID = "7707329152-revexp" as const;
const OFFICIAL_FNS_URL_RE = /^https:\/\/(?:www\.)?(?:nalog\.gov\.ru|data\.nalog\.ru|file\.nalog\.ru)\//i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MONEY_RE = /^\d+(?:\.\d{1,2})?$/;

export type FnsFinancialStatementRow = {
  inn: string; organization_name: string; income_amount: string; expense_amount: string;
  document_id: string; document_date: string | null; reporting_date: string;
  dataset_id: typeof REVEXP_DATASET_ID; source_url: string; source_sha256: string;
};

export type CompanyFinancialStatementEvidence = {
  evidence_id: string;
  subject_type: "legal_entity";
  subject_key: { inn: string };
  fact_kind: "financial_statement";
  fact_text: string;
  attributes: {
    organization_name: string;
    income_amount: string;
    expense_amount: string;
    reporting_scope: "annual_accounting_statement";
  };
  source_type: "fns_open_data";
  source_family: "factual_official_data";
  official_owner: "ФНС России";
  dataset_id: typeof REVEXP_DATASET_ID;
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
  turnover_claim_allowed: false;
  taxable_income_claim_allowed: false;
  current_financial_position_claim_allowed: false;
};

function normalizeMoneyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!MONEY_RE.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function rowFromUnknown(value: unknown): FnsFinancialStatementRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const inn = normalizeLegalEntityInn(row.inn);
  const organizationName = typeof row.organization_name === "string" ? row.organization_name.trim() : "";
  const incomeAmount = normalizeMoneyText(row.income_amount);
  const expenseAmount = normalizeMoneyText(row.expense_amount);
  const documentId = typeof row.document_id === "string" ? row.document_id.trim() : "";
  const documentDate = typeof row.document_date === "string" && ISO_DATE_RE.test(row.document_date) ? row.document_date : null;
  const reportingDate = typeof row.reporting_date === "string" ? row.reporting_date.trim() : "";
  const datasetId = typeof row.dataset_id === "string" ? row.dataset_id.trim() : "";
  const sourceUrl = typeof row.source_url === "string" ? row.source_url.trim() : "";
  const sourceSha256 = typeof row.source_sha256 === "string" ? row.source_sha256.trim().toLowerCase() : "";
  if (!inn || !organizationName || !incomeAmount || !expenseAmount || !documentId) return null;
  if (!ISO_DATE_RE.test(reportingDate) || datasetId !== REVEXP_DATASET_ID) return null;
  if (!OFFICIAL_FNS_URL_RE.test(sourceUrl) || !SHA256_RE.test(sourceSha256)) return null;
  return { inn, organization_name: organizationName, income_amount: incomeAmount, expense_amount: expenseAmount, document_id: documentId, document_date: documentDate, reporting_date: reportingDate, dataset_id: REVEXP_DATASET_ID, source_url: sourceUrl, source_sha256: sourceSha256 };
}

export function toCompanyFinancialStatementEvidence(row: FnsFinancialStatementRow): CompanyFinancialStatementEvidence {
  return {
    evidence_id: `fns_revexp:${row.inn}:${row.reporting_date}:${row.document_id}`,
    subject_type: "legal_entity",
    subject_key: { inn: row.inn },
    fact_kind: "financial_statement",
    fact_text: `По данным бухгалтерской (финансовой) отчетности за период, завершившийся ${row.reporting_date}: ${row.organization_name} (ИНН ${row.inn}) — сумма доходов ${row.income_amount}, сумма расходов ${row.expense_amount}. Эти показатели не являются автоматически налоговой выручкой, налогооблагаемым доходом, оборотом, денежным потоком или текущим финансовым положением.`,
    attributes: { organization_name: row.organization_name, income_amount: row.income_amount, expense_amount: row.expense_amount, reporting_scope: "annual_accounting_statement" },
    source_type: "fns_open_data", source_family: "factual_official_data", official_owner: "ФНС России",
    dataset_id: REVEXP_DATASET_ID, source_url: row.source_url, source_sha256: row.source_sha256,
    data_as_of: row.reporting_date, reporting_date: row.reporting_date, document_id: row.document_id, document_date: row.document_date,
    factual_only: true, legal_authority: false, substantive_use_allowed: false, use_as_legal_source: false,
    turnover_claim_allowed: false, taxable_income_claim_allowed: false, current_financial_position_claim_allowed: false,
  };
}

export class SupabaseFnsRevexpTransport {
  constructor(private readonly sb: SbClient) {}
  async lookup(innInput: string, asOfDate?: string | null): Promise<CompanyFinancialStatementEvidence[]> {
    const inn = normalizeLegalEntityInn(innInput);
    if (!inn) return [];
    const asOf = asOfDate && ISO_DATE_RE.test(asOfDate) ? asOfDate : null;
    const { data, error } = await this.sb.rpc("fns_open_data_get_financial_statement_text", { p_inn: inn, p_as_of_date: asOf });
    if (error) return [];
    const values = Array.isArray(data) ? data : data ? [data] : [];
    const rows = values.map(rowFromUnknown);
    if (rows.some((row) => row === null)) return [];
    return (rows as FnsFinancialStatementRow[]).map(toCompanyFinancialStatementEvidence);
  }
}

export async function loadFnsRevexpFactualEvidence(input: { sb: SbClient; answers: Record<string, unknown>; asOfDate?: string | null }): Promise<CompanyFinancialStatementEvidence[]> {
  const transport = new SupabaseFnsRevexpTransport(input.sb);
  const inns = extractExplicitLegalEntityInns(input.answers);
  const nested = await Promise.all(inns.map((inn) => transport.lookup(inn, input.asOfDate)));
  return nested.flat();
}
