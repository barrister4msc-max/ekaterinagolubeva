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
  version: "13L-1B";
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
  return representationOf(document).text.length;
}

function representationOf(document: FullCorpusDocument): { version: string; text: string } {
  const metadata = record(document.metadata);
  if (metadata.redaction_status === "accepted" && typeof metadata.redacted_text === "string") {
    return { version: "accepted_redaction_v1", text: metadata.redacted_text.trim() };
  }
  return {
    version: "ocr_text_v1",
    text: typeof document.ocr_text === "string" ? document.ocr_text.trim() : "",
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
 * The stable packet identity includes every document, its exact model-text
 * representation, and its extraction/page state. It never includes document
 * content or a human-readable filename.
 */
export async function buildFullCorpusFingerprint(documents: readonly FullCorpusDocument[]): Promise<string> {
  const identities = await Promise.all(documents.map(async (document) => {
    const representation = representationOf(document);
    return [
      document.id,
      statusOf(document) || "legacy",
      representation.version,
      textLengthOf(document),
      await sha256Hex(representation.text),
      pageIndexSignature(document),
    ].join(":");
  }));
  return identities.sort().join("|");
}

export async function evaluateFullCorpusAdmission(
  documents: readonly FullCorpusDocument[],
): Promise<FullCorpusAdmission> {
  const blocked = documents
    .map((document) => reasonFor(document))
    .filter((reason): reason is FullCorpusBlockReason => reason !== null);

  return {
    allowed: blocked.length === 0,
    version: "13L-1B",
    fingerprint: await buildFullCorpusFingerprint(documents),
    document_ids: documents.map((document) => document.id).sort(),
    blocked_document_count: blocked.length,
    block_reasons: Array.from(new Set(blocked)).sort(),
  };
}

/**
 * The model may consume only the exact complete corpus that passed admission.
 * Keep the comparison metadata-only so a changed OCR payload cannot be
 * silently substituted between the admission query and the analysis query.
 */
export function matchesFullCorpusAdmissionSnapshot(
  admitted: FullCorpusAdmission,
  consumed: FullCorpusAdmission,
): boolean {
  return admitted.allowed
    && consumed.allowed
    && admitted.fingerprint === consumed.fingerprint
    && admitted.document_ids.length === consumed.document_ids.length
    && admitted.document_ids.every((documentId, index) => documentId === consumed.document_ids[index]);
}
