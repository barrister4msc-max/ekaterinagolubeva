/**
 * Auto AI-fill orchestration contract.
 *
 * Pure decision layer used by the intake form so that AI-fill starts by itself
 * exactly once per settled document set. Usable documents may run while a
 * failed/OCR-required document is excluded with an explicit warning. No network
 * calls happen here.
 */

export type AutoAiFillDocument = {
  id: string;
  extraction_status: string | null;
  ocr_text_length: number;
  page_index_progress?: {
    percent: number;
    complete: boolean;
  } | null;
};

export type AutoAiFillStage =
  | "idle"
  | "uploaded"
  | "extracting"
  | "ai_filling"
  | "done"
  | "failed";

export type AutoAiFillDecision =
  | { action: "wait"; reason: string; fingerprint: string }
  | { action: "skip"; reason: string; fingerprint: string }
  | { action: "blocked"; reason: string; fingerprint: string }
  | { action: "run"; reason: string; fingerprint: string; documentIds: string[] };

const READY_STATUSES = new Set(["completed", "extracted", "ready"]);
const FAILED_STATUSES = new Set(["failed", "error", "unsupported", "ocr_required", "ocr_failed"]);
const PENDING_STATUSES = new Set(["pending", "processing", "extracting", "partial_pages"]);

function hasCompletePageIndex(doc: AutoAiFillDocument): boolean {
  const progress = doc.page_index_progress;
  return !progress || (progress.complete === true && Number(progress.percent) === 100);
}

export function isExtractionSettled(doc: AutoAiFillDocument): boolean {
  const status = (doc.extraction_status ?? "").toLowerCase();
  if (PENDING_STATUSES.has(status)) return false;
  if (!hasCompletePageIndex(doc)) return false;
  if (FAILED_STATUSES.has(status)) return true;
  if (READY_STATUSES.has(status)) return true;
  // No status recorded but text already present → treat as settled.
  return doc.ocr_text_length > 0;
}

export function isExtractionUsable(doc: AutoAiFillDocument): boolean {
  const status = (doc.extraction_status ?? "").toLowerCase();
  if (FAILED_STATUSES.has(status) || PENDING_STATUSES.has(status)) return false;
  if (status && !READY_STATUSES.has(status)) return false;
  return doc.ocr_text_length > 0 && hasCompletePageIndex(doc);
}

/**
 * Stable identity of the complete document corpus. Incomplete documents are
 * intentionally included: a caller must never deduplicate a request that
 * silently omits one member of the packet.
 */
export function computeDocumentSetFingerprint(documents: AutoAiFillDocument[]): string {
  return documents
    .map((d) => `${d.id}:${d.ocr_text_length}:${(d.extraction_status ?? "none").toLowerCase()}:${d.page_index_progress?.complete === true && Number(d.page_index_progress.percent) === 100 ? "complete" : d.page_index_progress ? "incomplete" : "no_page_index"}`)
    .sort()
    .join("|");
}




export function evaluateAutoAiFill(input: {
  sessionId: string | null | undefined;
  documents: AutoAiFillDocument[];
  /** Fingerprint of the document set that already triggered an auto run. */
  lastFingerprint: string | null;
  /** True while an AI-fill request (auto or manual) is in flight. */
  inFlight: boolean;
  /** True while staging/extraction workers are still running. */
  processing: boolean;
  /** Lawyer explicitly disabled automatic filling for this session. */
  disabled?: boolean;
}): AutoAiFillDecision {
  const fingerprint = computeDocumentSetFingerprint(input.documents);

  if (!input.sessionId) return { action: "wait", reason: "no_session", fingerprint };
  if (input.disabled) return { action: "skip", reason: "disabled", fingerprint };
  if (input.documents.length === 0) return { action: "wait", reason: "no_documents", fingerprint };
  if (input.inFlight) return { action: "skip", reason: "in_flight", fingerprint };
  if (input.processing) return { action: "wait", reason: "processing", fingerprint };

  if (!input.documents.every(isExtractionSettled)) {
    return { action: "wait", reason: "extraction_pending", fingerprint };
  }

  // A packet is admissible only as a full corpus. A failed OCR document may
  // be visible to the lawyer, but it cannot be silently omitted from an AI run.
  if (!input.documents.every(isExtractionUsable)) {
    return { action: "blocked", reason: "incomplete_corpus", fingerprint };
  }

  if (input.lastFingerprint === fingerprint) {
    return { action: "skip", reason: "already_ran", fingerprint };
  }

  return {
    action: "run",
    reason: "ready",
    fingerprint,
    documentIds: input.documents.map((d) => d.id),
  };
}

export function describeAutoAiFillStage(stage: AutoAiFillStage): string {
  switch (stage) {
    case "uploaded":
      return "Документы загружены";
    case "extracting":
      return "Распознаём документы";
    case "ai_filling":
      return "AI заполняет анкету";
    case "done":
      return "AI-заполнение завершено";
    case "failed":
      return "AI-заполнение не завершено";
    default:
      return "";
  }
}
