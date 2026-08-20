export type FnsTaxRegimeRow = {
  inn: string;
  organization_name: string;
  regimes: string[];
  document_id: string | null;
  document_date: string | null;
  data_as_of: string;
  dataset_id: string;
  source_url: string;
  source_sha256: string;
};

export type CompanyFactualEvidence = {
  evidence_id: string;
  subject_type: "legal_entity";
  subject_key: { inn: string };
  fact_kind: "tax_regime";
  fact_text: string;
  attributes: {
    organization_name: string;
    regimes: string[];
  };
  source_type: "fns_open_data";
  source_family: "factual_official_data";
  official_owner: "ФНС России";
  dataset_id: "7707329152-snr";
  source_url: string;
  source_sha256: string;
  data_as_of: string;
  document_id: string | null;
  document_date: string | null;
  factual_only: true;
  legal_authority: false;
  substantive_use_allowed: false;
  use_as_legal_source: false;
};

type SbClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const INN_RE = /^\d{10}$/;
const ALLOWED_REGIMES = new Set(["eshn", "usn", "ausn", "srp"]);
const SNR_DATASET_ID = "7707329152-snr" as const;

export function normalizeLegalEntityInn(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).replace(/[\s-]+/g, "").trim();
  return INN_RE.test(normalized) ? normalized : null;
}

/**
 * Only explicit answer fields whose key identifies an INN are admitted.
 * We do not mine arbitrary OCR/model narrative for 10-digit strings because a
 * deterministic company subject is required before querying external facts.
 */
export function extractExplicitLegalEntityInns(answers: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(answers ?? {})) {
    if (!/(^|[_\-])(inn|инн)($|[_\-])/iu.test(key)) continue;
    const inn = normalizeLegalEntityInn(value);
    if (!inn || seen.has(inn)) continue;
    seen.add(inn);
    out.push(inn);
  }
  return out.slice(0, 5);
}

function rowFromUnknown(value: unknown): FnsTaxRegimeRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const inn = normalizeLegalEntityInn(row.inn);
  const organizationName = typeof row.organization_name === "string" ? row.organization_name.trim() : "";
  const dataAsOf = typeof row.data_as_of === "string" ? row.data_as_of.trim() : "";
  const datasetId = typeof row.dataset_id === "string" ? row.dataset_id.trim() : "";
  const sourceUrl = typeof row.source_url === "string" ? row.source_url.trim() : "";
  const sourceSha256 = typeof row.source_sha256 === "string" ? row.source_sha256.trim().toLowerCase() : "";
  const regimes = Array.isArray(row.regimes)
    ? row.regimes
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase())
    : [];

  if (!inn || !organizationName || !/^\d{4}-\d{2}-\d{2}$/.test(dataAsOf)) return null;
  if (datasetId !== SNR_DATASET_ID) return null;
  if (!/^https:\/\/(?:www\.)?(?:nalog\.gov\.ru|data\.nalog\.ru|file\.nalog\.ru)\//i.test(sourceUrl)) return null;
  if (!/^[0-9a-f]{64}$/.test(sourceSha256)) return null;
  if (regimes.some((regime) => !ALLOWED_REGIMES.has(regime))) return null;

  return {
    inn,
    organization_name: organizationName,
    regimes: [...new Set(regimes)].sort(),
    document_id: typeof row.document_id === "string" && row.document_id.trim() ? row.document_id.trim() : null,
    document_date: typeof row.document_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.document_date)
      ? row.document_date
      : null,
    data_as_of: dataAsOf,
    dataset_id: datasetId,
    source_url: sourceUrl,
    source_sha256: sourceSha256,
  };
}

export function toCompanyFactualEvidence(row: FnsTaxRegimeRow): CompanyFactualEvidence {
  const regimeText = row.regimes.length ? row.regimes.map((r) => r.toUpperCase()).join(", ") : "специальные режимы не отмечены";
  return {
    evidence_id: `fns_snr:${row.inn}:${row.data_as_of}`,
    subject_type: "legal_entity",
    subject_key: { inn: row.inn },
    fact_kind: "tax_regime",
    fact_text: `По данным ФНС на ${row.data_as_of}: ${row.organization_name} (ИНН ${row.inn}) — ${regimeText}.`,
    attributes: {
      organization_name: row.organization_name,
      regimes: [...row.regimes],
    },
    source_type: "fns_open_data",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    dataset_id: SNR_DATASET_ID,
    source_url: row.source_url,
    source_sha256: row.source_sha256,
    data_as_of: row.data_as_of,
    document_id: row.document_id,
    document_date: row.document_date,
    factual_only: true,
    legal_authority: false,
    substantive_use_allowed: false,
    use_as_legal_source: false,
  };
}

export class SupabaseFnsSnrTransport {
  constructor(private readonly sb: SbClient) {}

  async lookup(innInput: string, asOfDate?: string | null): Promise<CompanyFactualEvidence | null> {
    const inn = normalizeLegalEntityInn(innInput);
    if (!inn) return null;
    const asOf = asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? asOfDate : null;
    const { data, error } = await this.sb.rpc("fns_open_data_get_tax_regime", {
      p_inn: inn,
      p_as_of_date: asOf,
    });
    if (error) return null;
    const first = Array.isArray(data) ? data[0] : data;
    const row = rowFromUnknown(first);
    return row ? toCompanyFactualEvidence(row) : null;
  }
}

/**
 * Factual evidence is intentionally kept outside RawSource/TrustedSource.
 * It may support factual propositions after explicit fact↔evidence wiring, but
 * it can never be used as a legal norm, administrative interpretation or
 * substantive conclusion source by this adapter.
 */
export async function loadFnsSnrFactualEvidence(input: {
  sb: SbClient;
  answers: Record<string, unknown>;
  asOfDate?: string | null;
}): Promise<CompanyFactualEvidence[]> {
  const transport = new SupabaseFnsSnrTransport(input.sb);
  const inns = extractExplicitLegalEntityInns(input.answers);
  const results = await Promise.all(inns.map((inn) => transport.lookup(inn, input.asOfDate)));
  return results.filter((evidence): evidence is CompanyFactualEvidence => evidence !== null);
}
