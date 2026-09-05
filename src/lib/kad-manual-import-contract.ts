export type KadImportMode = "user_session" | "manual" | "import" | "discovery_only";

export type KadManualImportDraft = {
  mode: KadImportMode;
  url?: string | null;
  title?: string | null;
  case_number?: string | null;
  court_name?: string | null;
  document_type?: string | null;
  document_date?: string | null;
  text?: string | null;
  research_issue_ids?: string[];
};

export type KadManualImport = KadManualImportDraft & {
  provider: "kad";
  official_url: string;
  source_type: "kad_case";
  source_family: "judicial";
  legal_authority: false;
  substantive_use_allowed: false;
  search_inference_only: true;
  retrieval_method: KadImportMode;
};

const OFFICIAL_HOSTS = new Set(["kad.arbitr.ru", "www.kad.arbitr.ru"]);
const MAX_TEXT = 12_000;
const MAX_ISSUES = 20;

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function issueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )].slice(0, MAX_ISSUES);
}

function officialKadUrl(value: unknown): string | null {
  const raw = text(value, 2_000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !OFFICIAL_HOSTS.has(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeKadCaseNumber(value: unknown): string | null {
  const raw = text(value, 128);
  if (!raw) return null;
  const normalized = raw
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
  return /^А\d{1,5}-\d{1,8}\/\d{2,4}$/.test(normalized) ? normalized : null;
}

/**
 * KAD is an official judicial factual/retrieval channel. This contract accepts
 * only user-session/manual/import/discovery input and never promotes it to legal
 * authority. No network request is made here.
 */
export function sanitizeKadManualImport(value: unknown): KadManualImport | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const mode = raw.mode;
  if (mode !== "user_session" && mode !== "manual" && mode !== "import" && mode !== "discovery_only") {
    return null;
  }

  const officialUrl = officialKadUrl(raw.url);
  const caseNumber = normalizeKadCaseNumber(raw.case_number);
  const title = text(raw.title, 1_000);
  if (!officialUrl || (!caseNumber && !title)) return null;

  return {
    provider: "kad",
    mode,
    official_url: officialUrl,
    source_type: "kad_case",
    source_family: "judicial",
    legal_authority: false,
    substantive_use_allowed: false,
    search_inference_only: true,
    retrieval_method: mode,
    title,
    case_number: caseNumber,
    court_name: text(raw.court_name, 1_000),
    document_type: text(raw.document_type, 256),
    document_date: text(raw.document_date, 64),
    text: text(raw.text),
    research_issue_ids: issueIds(raw.research_issue_ids),
  };
}
