// Phase C — Document redaction helpers.
//
// All state lives in `documents.metadata` (JSONB). No new tables, no edge
// functions. The existing analyze-document-legal-position edge function
// already reads `metadata.redaction_status === "accepted"` together with
// `metadata.redacted_text`, so this module only has to populate those
// keys correctly.

import { supabase } from "@/integrations/supabase/client";
import { anonymize, type FoundEntity } from "./anonymization";
import {
  redactLegalDocument,
  reviewRedactedText,
  LEGAL_REDACTION_VERSION,
  type LegalEntity,
  type LegalRedactionResult,
  type RedactionQuality,
  type RedactionStats,
  type RemainingEntity,
} from "./legal-redaction";

export type {
  LegalEntity,
  LegalRedactionResult,
  RedactionQuality,
  RedactionStats,
  RemainingEntity,
} from "./legal-redaction";

export type RedactionStatus =
  | "not_required"
  | "required"
  | "pending"
  | "suggested"
  | "accepted"
  | "rejected";

export type RedactionFlags = {
  contains_personal_data: boolean;
  contains_passport_data: boolean;
  contains_bank_data: boolean;
  contains_signature: boolean;
  reasons: string[];
};

export type RedactionMetadata = RedactionFlags & {
  redaction_status: RedactionStatus;
  redacted_text: string | null;
  redaction_notes: string[];
  redaction_checked_at: string | null;
  redaction_accepted_at: string | null;
  redaction_accepted_by: string | null;
  redaction_original_text_length?: number | null;
  redaction_entities_count?: number | null;
  redaction_quality?: RedactionQuality | null;
  redaction_stats?: RedactionStats | null;
  redaction_remaining_entities?: RemainingEntity[] | null;
  redaction_removed_entities?: LegalEntity[] | null;
  redaction_version?: number | null;
};

// ----------------------------------------------------------------------------
// Detection — light regex sweep, reuses anonymization patterns.
// ----------------------------------------------------------------------------

const SIGNATURE_RE = /(?:\/подпись\/|\(подпись\)|подписан(?:о|а)?|м\.?\s*п\.?)/i;
const BANK_RE =
  /(?:БИК|корр?\.?\s*сч|р\/?с|расч[её]тн\w*\s+сч[её]т|ИБАН|IBAN|SWIFT)[:\s№]*[A-Z0-9\-]{6,}/i;
const PASSPORT_RE =
  /(?:паспорт|серия\s+\d{2}\s?\d{2}|\bпасп\.?\s*\d{2}\s?\d{2})|(?:\b\d{2}\s?\d{2}\s?\d{6}\b)/i;
const ADDRESS_RE = /(?:г\.?\s?[А-ЯЁ][а-яё-]+).{0,80}?(?:ул\.?|улица|пр-?т|проспект|шоссе|д\.?|дом|кв\.?|квартира)/i;
const PHONE_RE = /(?:\+7|8)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/;
const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;
const FIO_RE =
  /\b[А-ЯЁ][а-яё]+(?:ов|ев|ин|ын|ский|цкий|ова|ева|ина|ына|ская|цкая)\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?\b/;
const INN_RE = /\b\d{12}\b/; // 12 цифр — физлицо
const SNILS_RE = /\b\d{3}-\d{3}-\d{3}\s?\d{2}\b/;

export function detectPersonalData(text: string | null | undefined): RedactionFlags {
  const reasons: string[] = [];
  if (!text || text.length < 30) {
    return {
      contains_personal_data: false,
      contains_passport_data: false,
      contains_bank_data: false,
      contains_signature: false,
      reasons,
    };
  }
  const fio = FIO_RE.test(text);
  const passport = PASSPORT_RE.test(text);
  const inn = INN_RE.test(text);
  const snils = SNILS_RE.test(text);
  const address = ADDRESS_RE.test(text);
  const phone = PHONE_RE.test(text);
  const email = EMAIL_RE.test(text);
  const bank = BANK_RE.test(text);
  const signature = SIGNATURE_RE.test(text);

  if (fio) reasons.push("ФИО");
  if (passport) reasons.push("паспортные данные");
  if (inn) reasons.push("ИНН физлица");
  if (snils) reasons.push("СНИЛС");
  if (address) reasons.push("адрес");
  if (phone) reasons.push("телефон");
  if (email) reasons.push("email");
  if (bank) reasons.push("банковские реквизиты");
  if (signature) reasons.push("подпись");

  const contains_personal_data =
    fio || passport || inn || snils || address || phone || email;
  return {
    contains_personal_data,
    contains_passport_data: passport,
    contains_bank_data: bank,
    contains_signature: signature,
    reasons,
  };
}

export function initialRedactionStatus(flags: RedactionFlags): RedactionStatus {
  if (flags.contains_personal_data || flags.contains_bank_data || flags.contains_passport_data) {
    return "required";
  }
  return "not_required";
}

// ----------------------------------------------------------------------------
// Masking — reuses the project's anonymize() (strict mode).
// ----------------------------------------------------------------------------

export type RedactionDraft = {
  redacted_text: string;
  entities: FoundEntity[];
  notes: string[];
};

export function buildRedactionDraft(ocrText: string): RedactionDraft {
  const { text, entities } = anonymize(ocrText, "strict");
  const counts = new Map<string, number>();
  for (const e of entities) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const notes = Array.from(counts.entries()).map(([kind, n]) => `${kind}: ${n}`);
  return { redacted_text: text, entities, notes };
}

// ----------------------------------------------------------------------------
// DB ops — all writes are merge-into-metadata patches.
// ----------------------------------------------------------------------------

async function readDocMetadata(documentId: string): Promise<{
  metadata: Record<string, unknown>;
  ocr_text: string | null;
}> {
  const { data, error } = await supabase
    .from("documents")
    .select("metadata, ocr_text")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Document ${documentId} not found`);
  return {
    metadata: ((data.metadata as Record<string, unknown> | null) ?? {}) as Record<
      string,
      unknown
    >,
    ocr_text: (data.ocr_text as string | null) ?? null,
  };
}

async function patchMetadata(
  documentId: string,
  patch: Record<string, unknown>,
  ocrPatch?: string | null,
): Promise<void> {
  const { metadata } = await readDocMetadata(documentId);
  const next = { ...metadata, ...patch };
  const update: Record<string, unknown> = { metadata: next };
  if (typeof ocrPatch === "string") update.ocr_text = ocrPatch;
  const { error } = await supabase
    .from("documents")
    .update(update as any)
    .eq("id", documentId);
  if (error) throw error;
}

/**
 * Run detection over current ocr_text and persist redaction flags into
 * documents.metadata. Sets redaction_status to "required" or "not_required"
 * unless a human-set status (suggested/accepted/rejected/pending) is already
 * present — we never overwrite a manual decision automatically.
 */
export async function detectAndPersistRedaction(documentId: string): Promise<RedactionMetadata> {
  const { metadata, ocr_text } = await readDocMetadata(documentId);
  const flags = detectPersonalData(ocr_text);
  const currentStatus = metadata.redaction_status as RedactionStatus | undefined;

  const preserveStatuses: RedactionStatus[] = [
    "suggested",
    "accepted",
    "rejected",
    "pending",
  ];
  const nextStatus: RedactionStatus =
    currentStatus && preserveStatuses.includes(currentStatus)
      ? currentStatus
      : initialRedactionStatus(flags);

  const patch: Partial<RedactionMetadata> = {
    redaction_status: nextStatus,
    contains_personal_data: flags.contains_personal_data,
    contains_passport_data: flags.contains_passport_data,
    contains_bank_data: flags.contains_bank_data,
    contains_signature: flags.contains_signature,
    redaction_notes: flags.reasons,
    redaction_checked_at: new Date().toISOString(),
  };
  await patchMetadata(documentId, patch as Record<string, unknown>);
  return { ...(metadata as any), ...patch } as RedactionMetadata;
}

/**
 * Build a redaction draft from the current ocr_text and store it as
 * `metadata.redacted_text` with status "suggested". Does NOT touch ocr_text;
 * the user must accept first.
 */
export async function suggestRedaction(documentId: string): Promise<RedactionDraft> {
  const { ocr_text } = await readDocMetadata(documentId);
  if (!ocr_text || ocr_text.trim().length === 0) {
    throw new Error("Документ ещё не содержит OCR-текста — обезличивание невозможно.");
  }
  const draft = buildRedactionDraft(ocr_text);
  await patchMetadata(documentId, {
    redaction_status: "suggested" as RedactionStatus,
    redacted_text: draft.redacted_text,
    redaction_notes: draft.notes,
    redaction_entities_count: draft.entities.length,
    redaction_original_text_length: ocr_text.length,
    redaction_checked_at: new Date().toISOString(),
  });
  return draft;
}

/**
 * Accept the suggested (or manually edited) redacted text. Copies redacted
 * text into documents.ocr_text so the existing analyze-document-legal-position
 * edge function reads only the safe version even via legacy code paths.
 */
export async function acceptRedaction(
  documentId: string,
  opts: { editedText?: string; userId?: string | null },
): Promise<void> {
  const { metadata, ocr_text } = await readDocMetadata(documentId);
  const redacted =
    typeof opts.editedText === "string" && opts.editedText.length > 0
      ? opts.editedText
      : ((metadata.redacted_text as string | null) ?? null);
  if (!redacted) {
    throw new Error("Нет предложенного обезличивания — нажмите «Обезличить» сначала.");
  }
  const original =
    typeof metadata.original_ocr_text === "string"
      ? (metadata.original_ocr_text as string)
      : (ocr_text ?? "");
  await patchMetadata(
    documentId,
    {
      redaction_status: "accepted" as RedactionStatus,
      redacted_text: redacted,
      redaction_accepted_at: new Date().toISOString(),
      redaction_accepted_by: opts.userId ?? null,
      original_ocr_text: original,
    },
    redacted,
  );
}

export async function rejectRedaction(documentId: string): Promise<void> {
  await patchMetadata(documentId, {
    redaction_status: "rejected" as RedactionStatus,
  });
}

// ----------------------------------------------------------------------------
// UI helpers
// ----------------------------------------------------------------------------

export function statusBadgeLabel(status: RedactionStatus | null | undefined): string {
  switch (status) {
    case "not_required":
      return "Без ПДн";
    case "required":
      return "Требует обезличивания";
    case "pending":
      return "Обезличивание выполняется";
    case "suggested":
      return "Обезличивание предложено";
    case "accepted":
      return "Обезличено";
    case "rejected":
      return "Отклонено";
    default:
      return "ПДн не проверены";
  }
}

export function statusBadgeTone(
  status: RedactionStatus | null | undefined,
): "neutral" | "warn" | "danger" | "ok" {
  switch (status) {
    case "not_required":
    case "accepted":
      return "ok";
    case "suggested":
    case "pending":
      return "neutral";
    case "required":
      return "warn";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}
