import type { ExternalResearchCandidate, ExternalResearchImportInput } from "./external-research-import.ts";

export type CbrDocumentKind = "regulation" | "position" | "instruction" | "letter" | "decision" | "other";
export type CbrDocumentStatus = "effective" | "not_effective" | "withdrawn" | "draft" | "unknown";

export type CbrManualDocument = {
  title: string;
  url: string;
  document_kind: CbrDocumentKind;
  document_status: CbrDocumentStatus;
  effective_from?: string | null;
  language?: string | null;
  version?: string | null;
  withdrawn?: boolean;
  draft?: boolean;
  duplicate_of?: string | null;
  full_text_available: boolean;
  full_text?: string | null;
  document_number?: string | null;
  document_date?: string | null;
  citation?: string | null;
  excerpt?: string | null;
};

const MAX_DOCUMENTS = 50;
const OFFICIAL_HOSTS = new Set(["cbr.ru", "www.cbr.ru"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function officialUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !OFFICIAL_HOSTS.has(url.hostname.toLowerCase())) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function candidate(document: CbrManualDocument): ExternalResearchCandidate | null {
  const url = officialUrl(document.url);
  const title = text(document.title);
  const identity = text(document.document_number) ?? text(document.citation);
  if (!url || !title || !identity || typeof document.full_text_available !== "boolean") return null;
  if (document.full_text_available && !text(document.full_text)) return null;
  return {
    title,
    url,
    citation: text(document.citation),
    document_number: text(document.document_number),
    document_date: text(document.document_date),
    excerpt: text(document.excerpt),
    full_text: text(document.full_text),
    source_type: "cbr_official_reference",
    cbr_document_kind: document.document_kind,
    document_status: document.document_status,
    effective_from: text(document.effective_from),
    language: text(document.language),
    version: text(document.version),
    withdrawn: document.withdrawn === true,
    draft: document.draft === true || document.document_status === "draft",
    duplicate_of: text(document.duplicate_of),
    full_text_available: document.full_text_available,
  };
}

/** Builds a CBR manual import without network access or authority promotion. */
export function buildCbrManualImport(
  documents: readonly CbrManualDocument[],
  researchIssueIds: readonly string[] = [],
): ExternalResearchImportInput | null {
  const candidates = documents
    .slice(0, MAX_DOCUMENTS)
    .map(candidate)
    .filter((value): value is ExternalResearchCandidate => Boolean(value));
  if (candidates.length === 0) return null;
  return {
    provider: "cbr",
    candidates,
    research_issue_ids: researchIssueIds.filter((value) => typeof value === "string").slice(0, 12),
  };
}
