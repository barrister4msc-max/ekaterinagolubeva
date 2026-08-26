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

export type ProtectedAnswerCandidate = {
  field_name: string;
  field_label: string;
  value: string;
  source_document_id: string;
};

const PROTECTED_FIELD_ALIASES: Record<string, string[]> = {
  taxpayer_inn: ["taxpayer_inn", "inn", "taxpayer_identification_number"],
  taxpayer_name: ["taxpayer_name", "client_name", "company_name", "organization_name"],
  tax_authority_name: ["tax_authority_name", "fns_name", "inspection_name", "fns_inspection_name"],
  tax_authority_number: ["tax_authority_number", "inspection_number", "fns_number"],
  tax_authority_region: ["tax_authority_region", "region", "fns_region"],
  tax_authority_official: ["tax_authority_official", "official_name", "fns_official", "responsible_official"],
  requirement_number: ["requirement_number", "fns_claim_number"],
  requirement_date: ["requirement_date", "fns_claim_date"],
  received_date: ["received_date", "document_received_date"],
  review_period: ["review_period", "audit_period", "tax_period"],
};

const PROTECTED_FIELD_LABELS: Record<string, string[]> = {
  taxpayer_inn: ["ИНН организации", "ИНН налогоплательщика", "ИНН"],
  taxpayer_name: ["Полное наименование", "Наименование налогоплательщика", "Наименование организации"],
  tax_authority_name: ["Наименование инспекции", "Налоговый орган", "Наименование налогового органа"],
  tax_authority_number: ["Номер инспекции", "Код инспекции", "Номер налогового органа"],
  tax_authority_region: ["Регион", "Регион налогового органа"],
  tax_authority_official: ["Должностное лицо", "Ответственное лицо", "Инспектор"],
  requirement_number: ["Номер требования", "Номер документа"],
  requirement_date: ["Дата требования", "Дата документа"],
  received_date: ["Дата получения"],
  review_period: ["Период проверки", "Проверяемый период", "Налоговый период"],
};

function extractLabeledValue(text: string, labels: string[]): string | null {
  const normalizedLabels = labels.map((label) => label.toLocaleLowerCase("ru-RU"));
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const lower = line.toLocaleLowerCase("ru-RU");
    const label = normalizedLabels.find((candidate) =>
      lower.startsWith(candidate + ":") ||
      lower.startsWith(candidate + " :") ||
      lower.startsWith(candidate + "—") ||
      lower.startsWith(candidate + " -")
    );
    if (!label) continue;
    const separatorIndex = Math.max(line.indexOf(":"), line.indexOf("—"), line.indexOf(" -"));
    if (separatorIndex < 0) continue;
    const value = line.slice(separatorIndex + (line.slice(separatorIndex).startsWith(" -") ? 2 : 1)).trim();
    if (value && !/^не указывается|синтетическ/i.test(value)) return value;
  }
  return null;
}

/**
 * Extracts only explicitly labelled, structured fields from the original OCR.
 * This runs inside the trusted function boundary and never sends original OCR
 * to Gemini. The values are persisted as review-required document-local answers,
 * so placeholders from redacted text cannot overwrite them and final generation
 * can still use the original verified fields.
 */
export function extractProtectedAnswerCandidates(
  documents: AiFillDocument[],
  fields: Array<{ field_name: string; field_label?: string }>,
): ProtectedAnswerCandidate[] {
  const out = new Map<string, ProtectedAnswerCandidate>();
  for (const document of documents) {
    const metadata = asRecord(document.metadata);
    // Protected canonical values may only come from the trusted original OCR
    // snapshot. Never fall back to document.ocr_text here: after redaction it may
    // contain model-facing placeholders, which must never become stored answers.
    const originalText =
      typeof metadata.original_ocr_text === "string" && metadata.original_ocr_text.trim()
        ? metadata.original_ocr_text.trim()
        : "";
    if (!originalText) continue;

    for (const [canonical, labels] of Object.entries(PROTECTED_FIELD_LABELS)) {
      const field = fields.find((candidate) =>
        (PROTECTED_FIELD_ALIASES[canonical] ?? []).includes(candidate.field_name),
      );
      if (!field) continue;
      const value = extractLabeledValue(originalText, labels);
      if (!value || out.has(field.field_name)) continue;
      out.set(field.field_name, {
        field_name: field.field_name,
        field_label: field.field_label ?? field.field_name,
        value,
        source_document_id: document.id,
      });
    }
  }
  return [...out.values()];
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
