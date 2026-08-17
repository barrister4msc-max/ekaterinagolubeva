import type { ResearchQuery } from "./fact-extraction.ts";

export type OfficialProviderId = "pravo" | "fns" | "minfin" | "vsrf" | "kad";

export type OfficialProviderRegistration = {
  id: OfficialProviderId;
  name: string;
  hosts: string[];
  machine_readable_search: boolean;
  documented_interface: boolean;
};

export const OFFICIAL_PROVIDER_REGISTRY: OfficialProviderRegistration[] = [
  {
    id: "pravo",
    name: "Официальное опубликование правовых актов",
    hosts: ["publication.pravo.gov.ru"],
    machine_readable_search: true,
    documented_interface: true,
  },
  {
    id: "fns",
    name: "ФНС России",
    hosts: ["nalog.gov.ru", "www.nalog.gov.ru"],
    machine_readable_search: false,
    documented_interface: false,
  },
  {
    id: "minfin",
    name: "Минфин России",
    hosts: ["minfin.gov.ru", "www.minfin.gov.ru"],
    machine_readable_search: false,
    documented_interface: false,
  },
  {
    id: "vsrf",
    name: "Верховный Суд Российской Федерации",
    hosts: ["vsrf.ru", "www.vsrf.ru", "supcourt.ru", "www.supcourt.ru"],
    machine_readable_search: false,
    documented_interface: false,
  },
  {
    id: "kad",
    name: "Картотека арбитражных дел",
    hosts: ["kad.arbitr.ru"],
    machine_readable_search: false,
    documented_interface: false,
  },
];

export type OfficialSourceSafety = {
  official_origin_verified: boolean;
  document_identity_verified: boolean;
  content_verified: boolean;
  actuality_status: "verified" | "not_applicable" | "unknown";
  substantive_use_allowed: boolean;
  verification_level: "discovery" | "origin" | "identity" | "content" | "substantive";
};

export type OfficialSourceResult = {
  bucket: "laws" | "court_practice" | "fns_letters" | "minfin_letters";
  source_table: "external_official_source";
  source_id: string;
  source_type: string;
  title: string;
  official_url: string;
  citation: string | null;
  snippet: string;
  metadata: Record<string, unknown>;
  code?: string | null;
  article?: string | null;
  part?: string | null;
  case_number?: string | null;
  letter_number?: string | null;
  letter_date?: string | null;
};

export type OfficialSourceDiagnostics = {
  enabled: boolean;
  pravo_exact_attempted: number;
  pravo_context_attempted: number;
  pravo_found: number;
  pravo_identity_verified: number;
  pravo_ambiguous: number;
  substantive_usable: number;
  registered_providers: number;
  failures: string[];
};

export type FederalLawRef = {
  number: string;
  date: string | null;
  year: string | null;
  raw: string;
};

export type SemanticResearchPlan = {
  exact_requisites: string[];
  semantic_intents: string[];
  metadata_terms: string[];
  search_hypotheses: string[];
};

const PRAVO_API = "https://publication.pravo.gov.ru/api";
const OFFICIAL_HOSTS = new Set(OFFICIAL_PROVIDER_REGISTRY.flatMap((p) => p.hosts));

function asText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s || null;
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim().replace(/\s+/g, " ");
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function env(name: string): string | undefined {
  try {
    const deno = (globalThis as any).Deno;
    return deno?.env?.get?.(name) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Rollout must be opt-in. Missing env is OFF. */
export function officialSourcesEnabledFromValue(raw?: string | null): boolean {
  if (raw == null || !raw.trim()) return false;
  return ["1", "true", "on", "yes"].includes(raw.trim().toLowerCase());
}

function officialSourcesEnabled(): boolean {
  return officialSourcesEnabledFromValue(env("OFFICIAL_LEGAL_SOURCES_ENABLED"));
}

export function isOfficialLegalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && OFFICIAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function normalizeLawNumber(raw: string): string {
  return raw.replace(/[№N]/giu, "").replace(/\s+/g, "").replace(/[–—]/g, "-").toUpperCase();
}

function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = value.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return null;
}

function yearOf(raw: string | null | undefined): string | null {
  const date = normalizeDate(raw);
  return date ? date.slice(0, 4) : null;
}

export function buildCanonicalDocumentKey(input: {
  bucket: string;
  documentNumber?: string | null;
  documentDate?: string | null;
  caseNumber?: string | null;
  article?: string | null;
  code?: string | null;
}): string | null {
  if (input.caseNumber?.trim()) return `ru:${input.bucket}:case:${input.caseNumber.trim().toLowerCase()}`;
  const number = input.documentNumber ? normalizeLawNumber(input.documentNumber) : "";
  const date = normalizeDate(input.documentDate);
  if (number && date) return `ru:${input.bucket}:document:${number.toLowerCase()}:${date}`;
  if (input.code?.trim() && input.article?.trim()) {
    return `ru:${input.bucket}:norm:${input.code.trim().toLowerCase()}:${input.article.trim().toLowerCase()}`;
  }
  return null;
}

export function evaluateOfficialSourceSafety(input: {
  officialUrl: string;
  identityVerified: boolean;
  contentVerified: boolean;
  actualityStatus?: "verified" | "not_applicable" | "unknown";
}): OfficialSourceSafety {
  const officialOrigin = isOfficialLegalUrl(input.officialUrl);
  const actuality = input.actualityStatus ?? "unknown";
  const substantive =
    officialOrigin &&
    input.identityVerified &&
    input.contentVerified &&
    (actuality === "verified" || actuality === "not_applicable");
  let level: OfficialSourceSafety["verification_level"] = "discovery";
  if (officialOrigin) level = "origin";
  if (officialOrigin && input.identityVerified) level = "identity";
  if (officialOrigin && input.identityVerified && input.contentVerified) level = "content";
  if (substantive) level = "substantive";
  return {
    official_origin_verified: officialOrigin,
    document_identity_verified: input.identityVerified,
    content_verified: input.contentVerified,
    actuality_status: actuality,
    substantive_use_allowed: substantive,
    verification_level: level,
  };
}

function researchCorpus(query: ResearchQuery): string {
  return [
    ...(query.legal_issues ?? []),
    ...(query.research_topics ?? []),
    ...(query.keywords ?? []),
    ...(query.articles ?? []),
    ...(query.facts ?? []),
    ...((query as any).legal_concepts ?? []),
    ...((query as any).semantic_intents ?? []),
    ...((query as any).search_hypotheses ?? []),
    ...((query as any).metadata_terms ?? []),
  ].join("\n");
}

/** Extract exact legal requisites without guessing a date/year that is not in context. */
export function extractFederalLawRefs(query: ResearchQuery): FederalLawRef[] {
  const text = researchCorpus(query);
  const out: FederalLawRef[] = [];
  // Do not use ASCII \b after Cyrillic "ФЗ": JS word-boundary semantics do not
  // treat Cyrillic letters as \w. Use an explicit Unicode-letter lookahead.
  const lawRx = /(?:от\s+(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})\s*(?:г\.?\s*)?)?(?:№|N)?\s*(\d{1,4}\s*[-–—]\s*ФЗ)(?=$|[^\p{L}])/giu;
  for (const match of text.matchAll(lawRx)) {
    const date = normalizeDate(match[1] ?? null);
    const number = normalizeLawNumber(match[2]);
    out.push({ number, date, year: date ? date.slice(0, 4) : null, raw: match[0].trim() });
  }
  return [...new Map(out.map((ref) => [`${ref.number}|${ref.date ?? ""}`, ref])).values()];
}

export function buildSemanticResearchPlan(query: ResearchQuery): SemanticResearchPlan {
  const hypotheses = uniq(((query as any).search_hypotheses ?? []).map(String)).slice(0, 12);
  const concepts = uniq([
    ...((query as any).legal_concepts ?? []).map(String),
    ...((query as any).semantic_intents ?? []).map(String),
    ...(query.research_topics ?? []),
    ...(query.legal_issues ?? []),
  ]).slice(0, 18);
  const metadataTerms = uniq([
    ...((query as any).metadata_terms ?? []).map(String),
    ...(query.articles ?? []),
    ...(query.organizations ?? []),
    ...(query.inn ?? []),
    ...(query.ogrn ?? []),
    ...(query.dates ?? []),
  ]).slice(0, 24);
  const exact = uniq([
    ...extractFederalLawRefs(query).map((r) => [r.date, r.number].filter(Boolean).join(" ")),
    ...(query.articles ?? []),
  ]).slice(0, 18);
  return {
    exact_requisites: exact,
    semantic_intents: concepts,
    metadata_terms: metadataTerms,
    // Search hypotheses are explicitly search-only; they never become facts here.
    search_hypotheses: hypotheses,
  };
}

function buildPravoDocumentUrl(eoNumber: string): string {
  return `https://publication.pravo.gov.ru/document/${encodeURIComponent(eoNumber)}`;
}

async function fetchJson(url: string, timeoutMs = 4500): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getPravoDetails(eoNumber: string): Promise<any | null> {
  try {
    return await fetchJson(`${PRAVO_API}/Document?eoNumber=${encodeURIComponent(eoNumber)}`);
  } catch {
    return null;
  }
}

function exactRefMatches(item: any, ref: FederalLawRef): boolean {
  if (normalizeLawNumber(asText(item?.number) ?? "") !== ref.number) return false;
  const itemDate = normalizeDate(asText(item?.documentDate));
  if (ref.date) return itemDate === ref.date;
  if (ref.year) return yearOf(itemDate) === ref.year;
  return true;
}

async function mapPravoItem(item: any, identityVerified: boolean, searchMode: "exact" | "context"): Promise<OfficialSourceResult | null> {
  const eoNumber = asText(item?.eoNumber);
  if (!eoNumber) return null;
  const officialUrl = buildPravoDocumentUrl(eoNumber);
  if (!isOfficialLegalUrl(officialUrl)) return null;
  const detail = await getPravoDetails(eoNumber);
  const source = detail ?? item;
  const title = asText(source?.complexName) ?? asText(source?.name) ?? asText(source?.title) ?? "Правовой акт";
  const documentNumber = asText(source?.number);
  const documentDate = normalizeDate(asText(source?.documentDate));
  const publishDate = normalizeDate(asText(source?.publishDateShort)) ?? asText(source?.viewDate);
  const authority = asText(source?.signatoryAuthorities?.find?.((x: any) => x?.isMain)?.name) ??
    asText(source?.signatoryAuthorities?.[0]?.name);
  const documentType = asText(source?.documentType?.name);
  const canonicalKey = buildCanonicalDocumentKey({
    bucket: "laws",
    documentNumber,
    documentDate,
  });
  const safety = evaluateOfficialSourceSafety({
    officialUrl,
    identityVerified,
    contentVerified: false,
    actualityStatus: "unknown",
  });
  const citation = [documentType, documentDate, documentNumber ? `№ ${documentNumber}` : null]
    .filter(Boolean)
    .join(" ") || null;
  return {
    bucket: "laws",
    source_table: "external_official_source",
    source_id: `pravo:${eoNumber}`,
    source_type: "official_publication_pravo",
    title,
    official_url: officialUrl,
    citation,
    snippet: [title, authority ? `Принявший орган: ${authority}` : null]
      .filter(Boolean)
      .join(". ")
      .slice(0, 1800),
    metadata: {
      external_official_source: true,
      official_source: true,
      provider: "publication.pravo.gov.ru",
      provider_id: "pravo",
      retrieval_method: "documented_read_only_api",
      search_mode: searchMode,
      retrieved_at: new Date().toISOString(),
      eo_number: eoNumber,
      document_number: documentNumber,
      document_date: documentDate,
      publication_date: publishDate,
      signatory_authority: authority,
      document_type: documentType,
      canonical_document_key: canonicalKey,
      safety,
      verification_status: safety.verification_level,
      substantive_use_allowed: safety.substantive_use_allowed,
    },
  };
}

async function searchPravoByRef(ref: FederalLawRef): Promise<{ sources: OfficialSourceResult[]; ambiguous: boolean }> {
  const params = new URLSearchParams({
    NumberSearchType: "0",
    Number: ref.number,
    PageSize: "30",
  });
  const data = await fetchJson(`${PRAVO_API}/Documents?${params.toString()}`);
  const items = (Array.isArray(data?.items) ? data.items : []).filter((item: any) => exactRefMatches(item, ref));
  const identityVerified = items.length === 1;
  const ambiguous = items.length > 1 && !ref.date;
  const mapped = await Promise.all(items.slice(0, ambiguous ? 5 : 1).map((item: any) => mapPravoItem(item, identityVerified, "exact")));
  return { sources: mapped.filter(Boolean) as OfficialSourceResult[], ambiguous };
}

function contextQueries(query: ResearchQuery): string[] {
  const plan = buildSemanticResearchPlan(query);
  return uniq([
    ...plan.semantic_intents,
    ...plan.search_hypotheses,
    ...(query.keywords ?? []),
  ])
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 5 && value.length <= 160)
    .slice(0, 4);
}

async function searchPravoByContext(text: string): Promise<OfficialSourceResult[]> {
  const params = new URLSearchParams({
    DocumentText: text,
    PageSize: "10",
    SortedBy: "0",
    SortDestination: "2",
  });
  const data = await fetchJson(`${PRAVO_API}/Documents?${params.toString()}`);
  const items = Array.isArray(data?.items) ? data.items : [];
  const mapped = await Promise.all(items.slice(0, 5).map((item: any) => mapPravoItem(item, false, "context")));
  return mapped.filter(Boolean) as OfficialSourceResult[];
}

export async function searchOfficialLegalSources(query: ResearchQuery): Promise<{
  sources: OfficialSourceResult[];
  diagnostics: OfficialSourceDiagnostics;
  research_plan: SemanticResearchPlan;
}> {
  const enabled = officialSourcesEnabled();
  const researchPlan = buildSemanticResearchPlan(query);
  const diagnostics: OfficialSourceDiagnostics = {
    enabled,
    pravo_exact_attempted: 0,
    pravo_context_attempted: 0,
    pravo_found: 0,
    pravo_identity_verified: 0,
    pravo_ambiguous: 0,
    substantive_usable: 0,
    registered_providers: OFFICIAL_PROVIDER_REGISTRY.length,
    failures: [],
  };
  if (!enabled) return { sources: [], diagnostics, research_plan: researchPlan };

  const refs = extractFederalLawRefs(query).slice(0, 6);
  const contexts = contextQueries(query);
  diagnostics.pravo_exact_attempted = refs.length;
  diagnostics.pravo_context_attempted = contexts.length;

  const exactSettled = await Promise.allSettled(refs.map((ref) => searchPravoByRef(ref)));
  const contextSettled = await Promise.allSettled(contexts.map((text) => searchPravoByContext(text)));
  const sources: OfficialSourceResult[] = [];

  for (let i = 0; i < exactSettled.length; i++) {
    const result = exactSettled[i];
    if (result.status === "fulfilled") {
      sources.push(...result.value.sources);
      if (result.value.ambiguous) diagnostics.pravo_ambiguous++;
    } else {
      diagnostics.failures.push(`pravo:exact:${refs[i]?.number ?? i}:${String(result.reason)}`.slice(0, 300));
    }
  }
  for (let i = 0; i < contextSettled.length; i++) {
    const result = contextSettled[i];
    if (result.status === "fulfilled") sources.push(...result.value);
    else diagnostics.failures.push(`pravo:context:${i}:${String(result.reason)}`.slice(0, 300));
  }

  const deduped = [...new Map(sources.map((source) => [source.source_id, source])).values()];
  diagnostics.pravo_found = deduped.length;
  diagnostics.pravo_identity_verified = deduped.filter(
    (source) => ((source.metadata?.safety as OfficialSourceSafety | undefined)?.document_identity_verified ?? false),
  ).length;
  diagnostics.substantive_usable = deduped.filter(
    (source) => ((source.metadata?.safety as OfficialSourceSafety | undefined)?.substantive_use_allowed ?? false),
  ).length;
  return { sources: deduped, diagnostics, research_plan: researchPlan };
}
