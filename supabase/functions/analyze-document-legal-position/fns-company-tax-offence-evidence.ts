import { extractExplicitLegalEntityInns, normalizeLegalEntityInn } from "./fns-company-factual-evidence.ts";

type SbClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const TAXOFFENCE_DATASET_ID = "7707329152-taxoffence" as const;
const OFFICIAL_FNS_URL_RE = /^https:\/\/(?:www\.)?(?:nalog\.gov\.ru|data\.nalog\.ru|file\.nalog\.ru)\//i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MONEY_RE = /^\d+(?:\.\d{1,2})?$/;

export type FnsTaxOffenceRow = {
  inn: string;
  organization_name: string;
  fine_amount: string;
  document_id: string;
  document_date: string;
  data_as_of: string;
  format_version: "4.01";
  dataset_id: typeof TAXOFFENCE_DATASET_ID;
  source_url: string;
  source_sha256: string;
};

export type CompanyTaxOffenceEvidence = {
  evidence_id: string;
  subject_type: "legal_entity";
  subject_key: { inn: string };
  fact_kind: "tax_offence_record";
  fact_text: string;
  attributes: {
    organization_name: string;
    fine_amount: string;
    observation_scope: "published_factual_record_not_current_liability";
  };
  source_type: "fns_open_data";
  source_family: "factual_official_data";
  official_owner: "ФНС России";
  dataset_id: typeof TAXOFFENCE_DATASET_ID;
  source_url: string;
  source_sha256: string;
  data_as_of: string;
  document_id: string;
  document_date: string;
  factual_only: true;
  legal_authority: false;
  substantive_use_allowed: false;
  use_as_legal_source: false;
  current_liability_claim_allowed: false;
};

function normalizeMoneyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!MONEY_RE.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function rowFromUnknown(value: unknown): FnsTaxOffenceRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const inn = normalizeLegalEntityInn(row.inn);
  const organizationName = typeof row.organization_name === "string" ? row.organization_name.trim() : "";
  const fineAmount = normalizeMoneyText(row.fine_amount);
  const documentId = typeof row.document_id === "string" ? row.document_id.trim() : "";
  const documentDate = typeof row.document_date === "string" ? row.document_date.trim() : "";
  const dataAsOf = typeof row.data_as_of === "string" ? row.data_as_of.trim() : "";
  const formatVersion = typeof row.format_version === "string" ? row.format_version.trim() : "";
  const datasetId = typeof row.dataset_id === "string" ? row.dataset_id.trim() : "";
  const sourceUrl = typeof row.source_url === "string" ? row.source_url.trim() : "";
  const sourceSha256 = typeof row.source_sha256 === "string" ? row.source_sha256.trim().toLowerCase() : "";
  if (!inn || !organizationName || !fineAmount || !documentId) return null;
  if (!ISO_DATE_RE.test(documentDate) || !ISO_DATE_RE.test(dataAsOf)) return null;
  if (formatVersion !== "4.01" || datasetId !== TAXOFFENCE_DATASET_ID) return null;
  if (!OFFICIAL_FNS_URL_RE.test(sourceUrl) || !SHA256_RE.test(sourceSha256)) return null;
  return {
    inn, organization_name: organizationName, fine_amount: fineAmount, document_id: documentId,
    document_date: documentDate, data_as_of: dataAsOf, format_version: "4.01",
    dataset_id: TAXOFFENCE_DATASET_ID, source_url: sourceUrl, source_sha256: sourceSha256,
  };
}

export function toCompanyTaxOffenceEvidence(row: FnsTaxOffenceRow): CompanyTaxOffenceEvidence {
  return {
    evidence_id: `fns_taxoffence:${row.inn}:${row.data_as_of}:${row.document_id}`,
    subject_type: "legal_entity",
    subject_key: { inn: row.inn },
    fact_kind: "tax_offence_record",
    fact_text: `В опубликованных данных ФНС на ${row.data_as_of}: ${row.organization_name} (ИНН ${row.inn}) указана запись с суммой штрафа ${row.fine_amount}. Это историческая фактическая запись, а не вывод о текущей задолженности, виновности или действующем обязательстве.`,
    attributes: {
      organization_name: row.organization_name,
      fine_amount: row.fine_amount,
      observation_scope: "published_factual_record_not_current_liability",
    },
    source_type: "fns_open_data",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    dataset_id: TAXOFFENCE_DATASET_ID,
    source_url: row.source_url,
    source_sha256: row.source_sha256,
    data_as_of: row.data_as_of,
    document_id: row.document_id,
    document_date: row.document_date,
    factual_only: true,
    legal_authority: false,
    substantive_use_allowed: false,
    use_as_legal_source: false,
    current_liability_claim_allowed: false,
  };
}

export class SupabaseFnsTaxOffenceTransport {
  constructor(private readonly sb: SbClient) {}

  async lookup(innInput: string, asOfDate?: string | null): Promise<CompanyTaxOffenceEvidence[]> {
    const inn = normalizeLegalEntityInn(innInput);
    if (!inn) return [];
    const asOf = asOfDate && ISO_DATE_RE.test(asOfDate) ? asOfDate : null;
    const { data, error } = await this.sb.rpc("fns_open_data_get_tax_offences", {
      p_inn: inn,
      p_as_of_date: asOf,
    });
    if (error) return [];
    const values = Array.isArray(data) ? data : data ? [data] : [];
    const rows = values.map(rowFromUnknown);
    if (rows.some((row) => row === null)) return [];
    return (rows as FnsTaxOffenceRow[]).map(toCompanyTaxOffenceEvidence);
  }
}

export async function loadFnsTaxOffenceFactualEvidence(input: {
  sb: SbClient;
  answers: Record<string, unknown>;
  asOfDate?: string | null;
}): Promise<CompanyTaxOffenceEvidence[]> {
  const transport = new SupabaseFnsTaxOffenceTransport(input.sb);
  const inns = extractExplicitLegalEntityInns(input.answers);
  const nested = await Promise.all(inns.map((inn) => transport.lookup(inn, input.asOfDate)));
  return nested.flat();
}
