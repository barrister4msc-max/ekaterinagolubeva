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

export function isExtractionSettled(doc: AutoAiFillDocument): boolean {
  const status = (doc.extraction_status ?? "").toLowerCase();
  if (FAILED_STATUSES.has(status)) return true;
  if (READY_STATUSES.has(status)) return true;
  // No status recorded but text already present → treat as settled.
  return doc.ocr_text_length > 0;
}

export function isExtractionUsable(doc: AutoAiFillDocument): boolean {
  const status = (doc.extraction_status ?? "").toLowerCase();
  if (FAILED_STATUSES.has(status)) return false;
  return doc.ocr_text_length > 0;
}

/**
 * Stable identity of the document subset consumed by AI-fill. Failed or
 * otherwise unusable documents are deliberately excluded: removing one broken
 * file from a mixed packet must not trigger a duplicate AI run over identical
 * usable content, while any change to a usable document still starts a new run.
 */
export function computeDocumentSetFingerprint(documents: AutoAiFillDocument[]): string {
  return documents
    .filter(isExtractionUsable)
    .map((d) => `${d.id}:${d.ocr_text_length}:${(d.extraction_status ?? "none").toLowerCase()}`)
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
  const fingerprint = computeAiFillInputFingerprint(input.documents);

  if (!input.sessionId) return { action: "wait", reason: "no_session", fingerprint };
  if (input.disabled) return { action: "skip", reason: "disabled", fingerprint };
  if (input.documents.length === 0) return { action: "wait", reason: "no_documents", fingerprint };
  if (input.inFlight) return { action: "skip", reason: "in_flight", fingerprint };
  if (input.processing) return { action: "wait", reason: "processing", fingerprint };

  if (!input.documents.every(isExtractionSettled)) {
    return { action: "wait", reason: "extraction_pending", fingerprint };
  }

  if (input.lastFingerprint === fingerprint) {
    return { action: "skip", reason: "already_ran", fingerprint };
  }

  const usable = input.documents.filter(isExtractionUsable);
  if (usable.length === 0) {
    return { action: "blocked", reason: "no_extracted_text", fingerprint };
  }
  if (usable.length !== input.documents.length) {
    // Run on the usable subset, but let the caller surface the omitted files
    // as an explicit warning. A single failed OCR document must not freeze
    // otherwise usable intake data.
    return {
      action: "run",
      reason: "partial_extraction",
      fingerprint,
      documentIds: usable.map((d) => d.id),
    };
  }

  return {
    action: "run",
    reason: "ready",
    fingerprint,
    documentIds: usable.map((d) => d.id),
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
