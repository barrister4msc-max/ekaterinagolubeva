export type AiFillDocument = {
  id: string;
  ocr_text?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SafeAiFillDocument<T extends AiFillDocument = AiFillDocument> = {
  document: T;
  text: string;
  modelLabel: string;
};

export class AiFillRedactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiFillRedactionError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function selectSafeAiFillText(document: AiFillDocument): string {
  const metadata = asRecord(document.metadata);
  const status = typeof metadata.redaction_status === "string"
    ? metadata.redaction_status
    : null;

  if (status === "accepted") {
    const redactedText = typeof metadata.redacted_text === "string"
      ? metadata.redacted_text.trim()
      : "";
    const quality = typeof metadata.redaction_quality === "string"
      ? metadata.redaction_quality
      : null;
    const hasRemainingSnapshot = Array.isArray(metadata.redaction_remaining_entities);
    const remaining = hasRemainingSnapshot
      ? metadata.redaction_remaining_entities as unknown[]
      : [];
    const stats = asRecord(metadata.redaction_stats);
    const coverage = typeof stats.coverage_percent === "number"
      ? stats.coverage_percent
      : null;

    if (!redactedText) {
      throw new AiFillRedactionError(
        "AI fill blocked: accepted redaction has no safe redacted text.",
      );
    }
    if (quality !== "excellent" && quality !== "warning") {
      throw new AiFillRedactionError(
        "AI fill blocked: accepted redaction quality is missing or unsafe.",
      );
    }
    if (!hasRemainingSnapshot) {
      throw new AiFillRedactionError(
        "AI fill blocked: residual redaction scan is missing.",
      );
    }
    if (remaining.length > 0) {
      throw new AiFillRedactionError(
        "AI fill blocked: residual protected entities remain after redaction.",
      );
    }
    if (coverage === null || coverage < 95) {
      throw new AiFillRedactionError(
        "AI fill blocked: accepted redaction coverage is incomplete.",
      );
    }

    return redactedText;
  }

  if (status === "not_required") {
    const checkedAt = typeof metadata.redaction_checked_at === "string"
      ? metadata.redaction_checked_at.trim()
      : "";
    const currentText = typeof document.ocr_text === "string"
      ? document.ocr_text.trim()
      : "";

    if (!checkedAt) {
      throw new AiFillRedactionError(
        "AI fill blocked: redaction check has not completed.",
      );
    }
    if (!currentText) {
      throw new AiFillRedactionError(
        "AI fill blocked: document has no extracted safe text.",
      );
    }

    return currentText;
  }

  throw new AiFillRedactionError(
    `AI fill blocked: redaction state ${status ?? "missing"} is not complete.`,
  );
}

export function prepareSafeAiFillDocuments<T extends AiFillDocument>(
  documents: T[],
): SafeAiFillDocument<T>[] {
  return documents.map((document, index) => ({
    document,
    text: selectSafeAiFillText(document),
    modelLabel: `DOCUMENT_${index + 1}`,
  }));
}

export function buildModelFacingDocumentText(
  documents: SafeAiFillDocument[],
): string {
  return documents
    .map(({ document, text, modelLabel }) =>
      [
        `=== ${modelLabel} ===`,
        `document_id: ${document.id}`,
        text.slice(0, 45_000),
      ].join("\n"),
    )
    .join("\n\n")
    .slice(0, 120_000);
}
