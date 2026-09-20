/**
 * Stage 13L-1: a document packet is admissible to AI only as a complete
 * corpus. This is intentionally metadata-only: no OCR text or filename is
 * copied into diagnostics, fingerprints, or error responses.
 */

export type FullCorpusDocument = {
  id: string;
  ocr_text?: string | null;
  metadata?: unknown;
};

export type FullCorpusBlockReason =
  | "extraction_pending"
  | "partial_pages"
  | "extraction_failed"
  | "no_extracted_text"
  | "page_index_incomplete"
  | "extraction_unconfirmed";

export type FullCorpusAdmission = {
  allowed: boolean;
  version: "13L-1";
  fingerprint: string;
  document_ids: string[];
  blocked_document_count: number;
  block_reasons: FullCorpusBlockReason[];
};

const COMPLETE_STATUSES = new Set(["completed", "extracted", "ready"]);
const PENDING_STATUSES = new Set(["pending", "processing", "extracting", "partial_pages"]);
const FAILED_STATUSES = new Set(["failed", "error", "unsupported", "ocr_required", "ocr_failed"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function statusOf(document: FullCorpusDocument): string {
  const value = record(document.metadata).extraction_status;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function textLengthOf(document: FullCorpusDocument): number {
  return typeof document.ocr_text === "string" ? document.ocr_text.trim().length : 0;
}

function pageIndexSignature(document: FullCorpusDocument): string {
  const progress = record(record(document.metadata).page_index_progress);
  if (Object.keys(progress).length === 0) return "none";
  return [
    progress.complete === true ? "complete" : "incomplete",
    Number(progress.percent) || 0,
    Number(progress.indexedPages) || 0,
    Number(progress.totalPages) || 0,
  ].join(":");
}

function hasCompletePageIndex(document: FullCorpusDocument): boolean {
  const progress = record(record(document.metadata).page_index_progress);
  if (Object.keys(progress).length === 0) return true;
  return progress.complete === true && Number(progress.percent) === 100;
}

function reasonFor(document: FullCorpusDocument): FullCorpusBlockReason | null {
  const status = statusOf(document);
  if (PENDING_STATUSES.has(status)) {
    return status === "partial_pages" ? "partial_pages" : "extraction_pending";
  }
  if (FAILED_STATUSES.has(status)) return "extraction_failed";
  if (status && !COMPLETE_STATUSES.has(status)) return "extraction_unconfirmed";
  if (textLengthOf(document) === 0) return "no_extracted_text";
  if (!hasCompletePageIndex(document)) return "page_index_incomplete";
  return null;
}

/**
 * The stable packet identity includes every document and its extraction/page
 * state. It never includes document content or a human-readable filename.
 */
export function buildFullCorpusFingerprint(documents: readonly FullCorpusDocument[]): string {
  return documents
    .map((document) => [document.id, statusOf(document) || "legacy", textLengthOf(document), pageIndexSignature(document)].join(":"))
    .sort()
    .join("|");
}

export function evaluateFullCorpusAdmission(
  documents: readonly FullCorpusDocument[],
): FullCorpusAdmission {
  const blocked = documents
    .map((document) => reasonFor(document))
    .filter((reason): reason is FullCorpusBlockReason => reason !== null);

  return {
    allowed: blocked.length === 0,
    version: "13L-1",
    fingerprint: buildFullCorpusFingerprint(documents),
    document_ids: documents.map((document) => document.id).sort(),
    blocked_document_count: blocked.length,
    block_reasons: Array.from(new Set(blocked)).sort(),
  };
}
