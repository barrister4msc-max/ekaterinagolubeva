// PR27 — Verified company profile: pure, runtime-agnostic helpers.
// No Supabase / env imports here so the same logic is unit-testable with bun
// and safe to import from both client components and server functions.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompanyRegistryProvider = "dadata";

export type CompanyRegistryProfile = {
  inn: string;
  name_full: string | null;
  name_short: string | null;
  ogrn: string | null;
  ogrnip: string | null;
  kpp: string | null;
  legal_address: string | null;
  okved_main: string | null;
  business_activity_name: string | null;
  company_status: string | null;
  registration_date: string | null;
  management_name: string | null;
  management_post: string | null;
  branch_type: string | null;
  provider: CompanyRegistryProvider;
  upstream_source: string;
  checked_at: string;
  raw_source_updated_at: string | null;
};

export type DocumentCompanyProfile = {
  taxpayer_name: string | null;
  taxpayer_inn: string | null;
  taxpayer_ogrn: string | null;
  taxpayer_kpp: string | null;
  taxpayer_legal_address: string | null;
  business_activity: string | null;
};

export type CompanyRegistryConflict = {
  field: string;
  document_value: string;
  registry_value: string;
  severity: "high" | "medium" | "low";
  reason: string;
};

export type RegistryLookupStatus =
  | "verified"
  | "registry_not_configured"
  | "not_found"
  | "ambiguous_candidates"
  | "provider_error";

export type CompanyRegistryVerification = {
  provider: CompanyRegistryProvider;
  checked_at: string;
  inn: string;
  status: RegistryLookupStatus;
  conflicts_count: number;
};

export type RegistryFetchResult =
  | { status: "ok"; suggestions: unknown[] }
  | { status: "registry_not_configured" }
  | { status: "provider_error"; reason: string };

export type AnswerRow = {
  field_name: string;
  field_value: unknown;
  value_source?: string | null;
  is_verified?: boolean | null;
};

// ---------------------------------------------------------------------------
// INN validation
// ---------------------------------------------------------------------------

export function normalizeInn(raw: unknown): string {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return "";
  // Strip regular spaces, NBSP, narrow NBSP and zero-width characters only.
  return raw.replace(/[\s\u00a0\u202f\u200b-\u200d\ufeff]/g, "");
}

export function isValidInn(raw: unknown): boolean {
  const value = normalizeInn(raw);
  return /^\d{10}$/.test(value) || /^\d{12}$/.test(value);
}

// ---------------------------------------------------------------------------
// Provider — DaData findById/party
// ---------------------------------------------------------------------------

export const DADATA_FIND_BY_ID_URL =
  "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party";

export async function fetchDaDataParty(params: {
  inn: string;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<RegistryFetchResult> {
  const apiKey = (params.apiKey ?? "").trim();
  if (!apiKey) return { status: "registry_not_configured" };

  const doFetch = params.fetchImpl ?? fetch;
  try {
    const response = await doFetch(DADATA_FIND_BY_ID_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify({ query: params.inn, count: 20 }),
    });

    if (!response.ok) {
      // Never echo the provider body — it can carry key-scoped diagnostics.
      return { status: "provider_error", reason: `provider_http_${response.status}` };
    }

    const payload = (await response.json()) as { suggestions?: unknown[] };
    return {
      status: "ok",
      suggestions: Array.isArray(payload?.suggestions) ? payload.suggestions : [],
    };
  } catch {
    return { status: "provider_error", reason: "provider_unreachable" };
  }
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function epochToIsoDate(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function mapDaDataParty(
  suggestion: unknown,
  checkedAt: string,
): CompanyRegistryProfile | null {
  const s = suggestion as Record<string, any> | null;
  const data = s?.data as Record<string, any> | undefined;
  if (!data) return null;

  const inn = normalizeInn(data.inn);
  if (!inn) return null;

  const okveds = Array.isArray(data.okveds) ? data.okveds : [];
  const mainOkved =
    okveds.find((item: any) => item?.main === true) ??
    okveds.find((item: any) => str(item?.code) === str(data.okved)) ??
    null;

  const isIndividual = data.type === "INDIVIDUAL";
  const ogrnValue = str(data.ogrn);

  return {
    inn,
    name_full: str(data.name?.full_with_opf) ?? str(data.name?.full) ?? str(s?.value),
    name_short: str(data.name?.short_with_opf) ?? str(data.name?.short),
    ogrn: isIndividual ? null : ogrnValue,
    ogrnip: isIndividual ? ogrnValue : null,
    kpp: str(data.kpp),
    legal_address: str(data.address?.unrestricted_value) ?? str(data.address?.value),
    okved_main: str(data.okved),
    business_activity_name: str(mainOkved?.name),
    company_status: str(data.state?.status),
    registration_date: epochToIsoDate(data.state?.registration_date),
    management_name: str(data.management?.name),
    management_post: str(data.management?.post),
    branch_type: str(data.branch_type),
    provider: "dadata",
    // Truthful provenance: DaData is an FNS-derived aggregator, not direct FNS.
    upstream_source: "egrul/fns-derived",
    checked_at: checkedAt,
    raw_source_updated_at: epochToIsoDate(data.state?.actuality_date),
  };
}

export type CandidateSelection =
  | { status: "verified"; profile: CompanyRegistryProfile }
  | { status: "not_found" }
  | { status: "ambiguous_candidates"; candidates: CompanyRegistryProfile[] };

export function selectRegistryCandidate(
  suggestions: unknown[],
  inn: string,
  checkedAt: string,
): CandidateSelection {
  const wanted = normalizeInn(inn);
  const profiles = suggestions
    .map((item) => mapDaDataParty(item, checkedAt))
    .filter((p): p is CompanyRegistryProfile => p !== null && p.inn === wanted);

  if (profiles.length === 0) return { status: "not_found" };
  if (profiles.length === 1) return { status: "verified", profile: profiles[0] };

  const main = profiles.filter((p) => p.branch_type === "MAIN");
  if (main.length === 1) return { status: "verified", profile: main[0] };

  return { status: "ambiguous_candidates", candidates: profiles };
}

// ---------------------------------------------------------------------------
// Document (intake answers) side
// ---------------------------------------------------------------------------

const DOCUMENT_FIELD_ALIASES: Record<keyof DocumentCompanyProfile, string[]> = {
  taxpayer_name: ["taxpayer_name", "company_name", "organization_name"],
  taxpayer_inn: ["taxpayer_inn", "inn", "company_inn"],
  taxpayer_ogrn: ["taxpayer_ogrn", "ogrn", "ogrnip", "taxpayer_ogrnip"],
  taxpayer_kpp: ["taxpayer_kpp", "kpp"],
  taxpayer_legal_address: [
    "taxpayer_legal_address",
    "legal_address",
    "registration_address",
  ],
  business_activity: ["business_activity", "okved", "activity"],
};

function answerToString(value: unknown): string | null {
  if (typeof value === "string") return str(value);
  if (typeof value === "number") return String(value);
  return null;
}

export function extractDocumentCompanyProfile(rows: AnswerRow[]): DocumentCompanyProfile {
  const byName = new Map<string, unknown>();
  for (const row of rows) byName.set(row.field_name, row.field_value);

  const result = {} as DocumentCompanyProfile;
  for (const [key, aliases] of Object.entries(DOCUMENT_FIELD_ALIASES) as Array<
    [keyof DocumentCompanyProfile, string[]]
  >) {
    let found: string | null = null;
    for (const alias of aliases) {
      const candidate = answerToString(byName.get(alias));
      if (candidate) {
        found = candidate;
        break;
      }
    }
    result[key] = found;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Normalization + conflict detection
// ---------------------------------------------------------------------------

const QUOTE_RE = /[«»"'`\u201c\u201d\u2018\u2019]/g;

export function normalizeCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(QUOTE_RE, " ")
    .replace(/общество с ограниченной ответственностью/g, "ооо")
    .replace(/публичное акционерное общество/g, "пао")
    .replace(/акционерное общество/g, "ао")
    .replace(/индивидуальный предприниматель/g, "ип")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ADDRESS_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/город/g, "г"],
  [/улица/g, "ул"],
  [/проспект/g, "пр-кт"],
  [/дом/g, "д"],
  [/корпус/g, "к"],
  [/строение/g, "стр"],
  [/офис/g, "оф"],
  [/помещение/g, "помещ"],
  [/квартира/g, "кв"],
];

export function normalizeAddress(value: string): string {
  let out = value.toLowerCase().replace(QUOTE_RE, " ").replace(/[.,]/g, " ");
  for (const [pattern, replacement] of ADDRESS_ABBREVIATIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, " ").trim();
}

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

type ConflictRule = {
  field: string;
  documentValue: string | null;
  registryValue: string | null;
  normalize: (value: string) => string;
  severity: CompanyRegistryConflict["severity"];
  reason: string;
};

export function detectCompanyConflicts(
  documentProfile: DocumentCompanyProfile,
  registryProfile: CompanyRegistryProfile,
): CompanyRegistryConflict[] {
  const rules: ConflictRule[] = [
    {
      field: "name",
      documentValue: documentProfile.taxpayer_name,
      registryValue: registryProfile.name_full ?? registryProfile.name_short,
      normalize: normalizeCompanyName,
      severity: "medium",
      reason: "Наименование в документе отличается от данных реестра",
    },
    {
      field: "inn",
      documentValue: documentProfile.taxpayer_inn,
      registryValue: registryProfile.inn,
      normalize: normalizeDigits,
      severity: "high",
      reason: "ИНН в документе не совпадает с проверенным ИНН",
    },
    {
      field: "ogrn",
      documentValue: documentProfile.taxpayer_ogrn,
      registryValue: registryProfile.ogrn ?? registryProfile.ogrnip,
      normalize: normalizeDigits,
      severity: "high",
      reason: "ОГРН/ОГРНИП в документе не совпадает с данными реестра",
    },
    {
      field: "kpp",
      documentValue: documentProfile.taxpayer_kpp,
      registryValue: registryProfile.kpp,
      normalize: normalizeDigits,
      severity: "medium",
      reason: "КПП в документе отличается от данных реестра",
    },
    {
      field: "legal_address",
      documentValue: documentProfile.taxpayer_legal_address,
      registryValue: registryProfile.legal_address,
      normalize: normalizeAddress,
      severity: "low",
      reason: "Юридический адрес в документе отличается от адреса в реестре",
    },
    {
      field: "business_activity",
      documentValue: documentProfile.business_activity,
      registryValue: registryProfile.business_activity_name ?? registryProfile.okved_main,
      normalize: normalizeCompanyName,
      severity: "low",
      reason: "Вид деятельности в документе отличается от ОКВЭД в реестре",
    },
  ];

  const conflicts: CompanyRegistryConflict[] = [];
  for (const rule of rules) {
    const documentValue = rule.documentValue?.trim();
    const registryValue = rule.registryValue?.trim();
    if (!documentValue || !registryValue) continue;
    if (rule.normalize(documentValue) === rule.normalize(registryValue)) continue;
    conflicts.push({
      field: rule.field,
      document_value: documentValue,
      registry_value: registryValue,
      severity: rule.severity,
      reason: rule.reason,
    });
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Autofill plan
// ---------------------------------------------------------------------------

export const REGISTRY_VALUE_SOURCE = "registry";

export type AutofillEntry = {
  field_name: string;
  field_label: string;
  field_value: string;
  value_source: string;
};

const AUTOFILL_LABELS: Record<string, string> = {
  taxpayer_name: "Наименование налогоплательщика",
  taxpayer_inn: "ИНН",
  taxpayer_ogrn: "ОГРН / ОГРНИП",
  taxpayer_kpp: "КПП",
  taxpayer_legal_address: "Юридический адрес",
  business_activity: "Сфера деятельности",
};

/** Any non-empty non-registry answer is protected from registry overwrite. */
function isProtectedAnswer(row: AnswerRow | undefined): boolean {
  if (!row) return false;
  const value = answerToString(row.field_value);
  if (!value) return false;
  if (row.value_source === REGISTRY_VALUE_SOURCE) return false;
  // Manual, lawyer-confirmed and AI-extracted values stay; divergence is
  // surfaced as a conflict instead of being overwritten.
  return true;
}

export function buildAutofillPlan(params: {
  profile: CompanyRegistryProfile;
  answers: AnswerRow[];
  schemaFieldKeys: string[];
}): AutofillEntry[] {
  const { profile } = params;
  const known = new Set(params.schemaFieldKeys);
  const byName = new Map<string, AnswerRow>();
  for (const row of params.answers) byName.set(row.field_name, row);

  const mapping: Array<[string, string | null]> = [
    ["taxpayer_name", profile.name_full ?? profile.name_short],
    ["taxpayer_inn", profile.inn],
    ["taxpayer_ogrn", profile.ogrn ?? profile.ogrnip],
    ["taxpayer_kpp", profile.kpp],
    ["taxpayer_legal_address", profile.legal_address],
    ["business_activity", profile.business_activity_name ?? profile.okved_main],
  ];

  const plan: AutofillEntry[] = [];
  for (const [fieldName, value] of mapping) {
    if (!value) continue;
    if (known.size > 0 && !known.has(fieldName)) continue;
    if (isProtectedAnswer(byName.get(fieldName))) continue;
    plan.push({
      field_name: fieldName,
      field_label: AUTOFILL_LABELS[fieldName] ?? fieldName,
      field_value: value,
      value_source: REGISTRY_VALUE_SOURCE,
    });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Matter decisions
// ---------------------------------------------------------------------------

export const MATTER_SOURCE_TYPE = "document_builder";

export function mapMatterType(templateCode: string | null | undefined): string {
  const code = (templateCode ?? "").toLowerCase();
  if (code.startsWith("tax_")) return "tax";
  if (code.startsWith("real_estate")) return "real_estate";
  if (code.startsWith("contract")) return "contract_review";
  if (code.startsWith("court") || code.includes("claim")) return "court_dispute";
  if (code.startsWith("bankruptcy")) return "bankruptcy";
  if (code.startsWith("corporate")) return "corporate";
  return "other";
}

export function buildMatterTitle(params: {
  companyName?: string | null;
  templateTitle?: string | null;
  templateCode: string;
}): string {
  const right = str(params.templateTitle) ?? params.templateCode;
  const left = str(params.companyName);
  return left ? `${left} — ${right}` : right;
}

export type ExistingMatterRef = { id: string; metadata?: Record<string, unknown> | null };

export type MatterDecision =
  | { action: "use_existing"; matter_id: string }
  | { action: "create" };

/** Deterministic, retry-safe decision: exactly one matter per intake session. */
export function decideMatterAction(params: {
  sessionMatterId: string | null | undefined;
  existingMatters: ExistingMatterRef[];
  sessionId: string;
}): MatterDecision {
  if (params.sessionMatterId) {
    return { action: "use_existing", matter_id: params.sessionMatterId };
  }
  const linked = params.existingMatters.find(
    (matter) =>
      (matter.metadata as Record<string, unknown> | null)?.intake_session_id ===
      params.sessionId,
  );
  if (linked) return { action: "use_existing", matter_id: linked.id };
  return { action: "create" };
}

// ---------------------------------------------------------------------------
// Safe metadata merge
// ---------------------------------------------------------------------------

export function mergeMetadata(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}

export function buildCompanyMetadataPatch(params: {
  profile: CompanyRegistryProfile | null;
  documentProfile: DocumentCompanyProfile;
  conflicts: CompanyRegistryConflict[];
  status: RegistryLookupStatus;
  inn: string;
  checkedAt: string;
  provider: CompanyRegistryProvider;
}): Record<string, unknown> {
  return {
    company_profile: params.profile,
    document_company_profile: params.documentProfile,
    company_registry_verification: {
      provider: params.provider,
      checked_at: params.checkedAt,
      inn: params.inn,
      status: params.status,
      conflicts_count: params.conflicts.length,
    } satisfies CompanyRegistryVerification,
    company_registry_conflicts: params.conflicts,
  };
}

// ---------------------------------------------------------------------------
// Matter Snapshot projection
// ---------------------------------------------------------------------------

export type CompanyRegistryContext = {
  company_profile: CompanyRegistryProfile | null;
  document_company_profile: DocumentCompanyProfile | null;
  company_registry_verification: CompanyRegistryVerification | null;
  company_registry_conflicts: CompanyRegistryConflict[];
};

/**
 * Reads the company context out of a metadata JSONB blob
 * (document_intake_sessions.metadata or legal_matters.metadata).
 */
export function extractCompanyContextFromMetadata(
  metadata: unknown,
): CompanyRegistryContext {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const conflicts = meta.company_registry_conflicts;
  return {
    company_profile: (meta.company_profile as CompanyRegistryProfile | null) ?? null,
    document_company_profile:
      (meta.document_company_profile as DocumentCompanyProfile | null) ?? null,
    company_registry_verification:
      (meta.company_registry_verification as CompanyRegistryVerification | null) ?? null,
    company_registry_conflicts: Array.isArray(conflicts)
      ? (conflicts as CompanyRegistryConflict[])
      : [],
  };
}
