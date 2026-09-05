import type {
  ExternalResearchCandidate,
  ExternalResearchImportInput,
} from "./external-research-import.ts";

export type VsrfManualDocumentKind =
  | "case_card"
  | "court_act"
  | "review"
  | "plenum"
  | "individual_act";

export type VsrfCourtInstance =
  | "first_instance"
  | "appeal"
  | "cassation"
  | "supervisory"
  | "unknown";

export type VsrfTextStatus = "complete" | "redacted" | "incomplete" | "missing";

export type VsrfManualDocument = {
  title: string;
  url: string;
  document_kind: VsrfManualDocumentKind;
  court_instance?: VsrfCourtInstance;
  text_status: VsrfTextStatus;
  case_number?: string | null;
  document_number?: string | null;
  document_date?: string | null;
  citation?: string | null;
  excerpt?: string | null;
  adverse?: boolean;
  later_act?: boolean;
};

const MAX_DOCUMENTS = 50;
const OFFICIAL_HOSTS = new Set([
  "vsrf.ru",
  "www.vsrf.ru",
  "supcourt.ru",
  "www.supcourt.ru",
]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function officialUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !OFFICIAL_HOSTS.has(hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function candidate(document: VsrfManualDocument): ExternalResearchCandidate | null {
  const url = officialUrl(document.url);
  const title = text(document.title);
  const identity = text(document.case_number) ?? text(document.document_number) ?? text(document.citation);
  if (!url || !title || !identity) return null;
  return {
    title,
    url,
    citation: text(document.citation),
    case_number: text(document.case_number),
    document_number: text(document.document_number),
    document_date: text(document.document_date),
    excerpt: text(document.excerpt),
    source_type: document.document_kind === "case_card" ? "vsrf_case_card" : "vsrf_court_act",
    court_document_kind: document.document_kind,
    court_instance: document.court_instance ?? "unknown",
    text_status: document.text_status,
    adverse: document.adverse === true,
    later_act: document.later_act === true,
  };
}

/**
 * Builds a manual VS РФ import for the existing external-research staging
 * contract. It performs no HTTP request and never verifies legal authority.
 */
export function buildVsrfManualImport(
  documents: readonly VsrfManualDocument[],
  researchIssueIds: readonly string[] = [],
): ExternalResearchImportInput | null {
  const candidates = documents
    .slice(0, MAX_DOCUMENTS)
    .map(candidate)
    .filter((value): value is ExternalResearchCandidate => Boolean(value));
  if (candidates.length === 0) return null;
  return {
    provider: "vsrf",
    candidates,
    research_issue_ids: researchIssueIds.filter((value) => typeof value === "string").slice(0, 12),
  };
}
