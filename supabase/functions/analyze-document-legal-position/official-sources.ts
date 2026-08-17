import type { ResearchQuery } from "./fact-extraction.ts";

export type OfficialSourceResult = {
  bucket: "laws" | "court_practice" | "fns_letters";
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
  pravo_attempted: number;
  pravo_found: number;
  vsrf_registered: number;
  fns_registered: number;
  failures: string[];
};

const PRAVO_API = "https://publication.pravo.gov.ru/api";
const PRAVO_HOST = "publication.pravo.gov.ru";
const VSRF_HOSTS = new Set(["vsrf.ru", "www.vsrf.ru", "supcourt.ru", "www.supcourt.ru"]);
const FNS_HOSTS = new Set(["nalog.gov.ru", "www.nalog.gov.ru"]);

function officialSourcesEnabled(): boolean {
  const raw = (Deno.env.get("OFFICIAL_LEGAL_SOURCES_ENABLED") ?? "true").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function asText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s || null;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export function isOfficialLegalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return url.hostname === PRAVO_HOST || VSRF_HOSTS.has(url.hostname) || FNS_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function extractFederalLawNumbers(query: ResearchQuery): string[] {
  const haystack = [
    ...(query.legal_issues ?? []),
    ...(query.research_topics ?? []),
    ...(query.keywords ?? []),
    ...(query.articles ?? []),
    ...(query.facts ?? []),
  ].join("\n");
  const matches = haystack.match(/\b\d{1,4}\s*-\s*ФЗ\b/giu) ?? [];
  return uniq(matches.map((v) => v.replace(/\s+/g, "").toUpperCase()));
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

async function searchPravoByNumber(number: string): Promise<OfficialSourceResult[]> {
  const params = new URLSearchParams({
    NumberSearchType: "0",
    Number: number,
    pageSize: "10",
  });
  const data = await fetchJson(`${PRAVO_API}/Documents?${params.toString()}`);
  const items = Array.isArray(data?.items) ? data.items : [];
  const out: OfficialSourceResult[] = [];

  for (const item of items.slice(0, 10)) {
    const eoNumber = asText(item?.eoNumber);
    if (!eoNumber) continue;
    const officialUrl = buildPravoDocumentUrl(eoNumber);
    if (!isOfficialLegalUrl(officialUrl)) continue;

    const complexName = asText(item?.complexName);
    const title = complexName ?? asText(item?.name) ?? asText(item?.title) ?? `Правовой акт № ${number}`;
    const documentNumber = asText(item?.number) ?? number;
    const documentDate = asText(item?.documentDate);
    const publishDate = asText(item?.publishDateShort) ?? asText(item?.viewDate);
    const citation = [documentDate, documentNumber].filter(Boolean).join(" № ") || documentNumber;

    out.push({
      bucket: "laws",
      source_table: "external_official_source",
      source_id: `pravo:${eoNumber}`,
      source_type: "official_publication_pravo",
      title,
      official_url: officialUrl,
      citation,
      snippet: [title, asText(item?.title)].filter(Boolean).join(" — ").slice(0, 1800),
      metadata: {
        official_source: true,
        provider: "publication.pravo.gov.ru",
        verification_status: "official",
        retrieval_method: "documented_read_only_api",
        retrieved_at: new Date().toISOString(),
        eo_number: eoNumber,
        document_number: documentNumber,
        document_date: documentDate,
        publication_date: publishDate,
        signatory_authority_id: asText(item?.signatoryAuthorityId),
        document_type_id: asText(item?.documentTypeId),
      },
    });
  }
  return out;
}

export async function searchOfficialLegalSources(query: ResearchQuery): Promise<{
  sources: OfficialSourceResult[];
  diagnostics: OfficialSourceDiagnostics;
}> {
  const enabled = officialSourcesEnabled();
  const diagnostics: OfficialSourceDiagnostics = {
    enabled,
    pravo_attempted: 0,
    pravo_found: 0,
    // Registered as authoritative domains, but no undocumented HTTP search adapters are used.
    vsrf_registered: 1,
    fns_registered: 1,
    failures: [],
  };
  if (!enabled) return { sources: [], diagnostics };

  const numbers = extractFederalLawNumbers(query).slice(0, 6);
  diagnostics.pravo_attempted = numbers.length;
  if (numbers.length === 0) return { sources: [], diagnostics };

  const settled = await Promise.allSettled(numbers.map((n) => searchPravoByNumber(n)));
  const sources: OfficialSourceResult[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      sources.push(...result.value);
    } else {
      diagnostics.failures.push(`pravo:${numbers[i]}:${String(result.reason)}`.slice(0, 300));
    }
  }

  const deduped = [...new Map(sources.map((s) => [s.source_id, s])).values()];
  diagnostics.pravo_found = deduped.length;
  return { sources: deduped, diagnostics };
}
