import { describe, expect, test } from "bun:test";
import {
  redactLegalDocument,
  reviewRedactedText,
} from "../../src/lib/legal-redaction";
import {
  buildModelFacingDocumentText,
  prepareSafeAiFillDocuments,
  selectSafeAiFillText,
} from "../functions/document-intake-ai-fill/redaction-safety";

const SAFE_STATS = { coverage_percent: 100 };

function acceptedDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    ocr_text: "[COMPANY_1] ИНН [BANK_DETAILS_1]",
    file_name: "ЕГРЮЛ ООО МЕТЕОР Иванов.pdf",
    metadata: {
      redaction_status: "accepted",
      redacted_text: "[COMPANY_1] ИНН [BANK_DETAILS_1]",
      original_ocr_text: "ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ \"МЕТЕОР\" ИНН 7701234567",
      redaction_quality: "excellent",
      redaction_remaining_entities: [],
      redaction_stats: SAFE_STATS,
      redaction_checked_at: "2026-08-16T00:00:00.000Z",
      ...overrides,
    },
  };
}

describe("PR22 legal redaction regressions", () => {
  test.each([
    "+7 999 123-45-67",
    "8 999 123 45 67",
    "(999) 123-45-67",
    "+7\u00A0999\u00A0123\u00A045\u00A067",
    "+7\u200B999\u200B123\u200B45\u200B67",
    "+7 999 123–45–67",
    "+7.999.123.45.67",
    "+7/999/123/45/67",
    "+7 999 / 123 — 45 / 67",
  ])("redacts OCR/Unicode phone variant %s", (phone) => {
    const result = redactLegalDocument(`Контактный телефон: ${phone}.`);
    expect(result.redacted_text).not.toContain(phone);
    expect(result.entities.some((entity) => entity.type === "PHONE")).toBe(true);
    expect(reviewRedactedText(result.redacted_text, result.stats).remaining_entities).toHaveLength(0);
  });

  test.each([
    'ООО "МЕТЕОР"',
    'Общество с ограниченной ответственностью "МЕТЕОР"',
    'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "МЕТЕОР"',
  ])("redacts company form %s", (company) => {
    const result = redactLegalDocument(`Заявитель: ${company}.`);
    expect(result.redacted_text).not.toContain("МЕТЕОР");
    expect(result.entities.some((entity) => entity.type === "COMPANY")).toBe(true);
    expect(reviewRedactedText(result.redacted_text, result.stats).remaining_entities).toHaveLength(0);
  });

  test("redacts INN, OGRN and KPP under the existing BANK_DETAILS contract", () => {
    const source = "ИНН 7701234567 ОГРН 1027700123456 КПП 770101001";
    const result = redactLegalDocument(source);
    expect(result.redacted_text).not.toContain("7701234567");
    expect(result.redacted_text).not.toContain("1027700123456");
    expect(result.redacted_text).not.toContain("770101001");
    expect(result.entities.filter((entity) => entity.type === "BANK_DETAILS").length).toBeGreaterThanOrEqual(3);
  });

  test("redacts a realistic EGRUL-like fragment with no protected residue", () => {
    const source = [
      "ВЫПИСКА ИЗ ЕГРЮЛ",
      'Полное наименование: ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "МЕТЕОР"',
      "ИНН 7701234567",
      "ОГРН 1027700123456",
      "КПП 770101001",
      "Телефон: +7\u200B999\u00A0123–45/67",
    ].join("\n");

    const result = redactLegalDocument(source);
    const review = reviewRedactedText(result.redacted_text, result.stats);

    expect(result.redacted_text).not.toContain("МЕТЕОР");
    expect(result.redacted_text).not.toContain("7701234567");
    expect(result.redacted_text).not.toContain("1027700123456");
    expect(result.redacted_text).not.toContain("770101001");
    expect(result.redacted_text).not.toContain("999");
    expect(review.remaining_entities).toHaveLength(0);
    expect(review.quality).not.toBe("unsafe");
  });
});

describe("PR22 Gemini AI-fill privacy boundary", () => {
  test("accepted redacted text wins and original_ocr_text never becomes model-facing", () => {
    const document = acceptedDocument();
    const safe = selectSafeAiFillText(document);
    const prepared = prepareSafeAiFillDocuments([document]);
    const payload = buildModelFacingDocumentText(prepared);

    expect(safe).toBe("[COMPANY_1] ИНН [BANK_DETAILS_1]");
    expect(payload).toContain("[COMPANY_1]");
    expect(payload).not.toContain("МЕТЕОР");
    expect(payload).not.toContain("7701234567");
  });

  test("raw file_name is excluded from the model-facing document package", () => {
    const document = acceptedDocument();
    const payload = buildModelFacingDocumentText(prepareSafeAiFillDocuments([document]));

    expect(payload).toContain("=== DOCUMENT_1 ===");
    expect(payload).toContain("document_id: doc-1");
    expect(payload).not.toContain("ЕГРЮЛ ООО МЕТЕОР Иванов.pdf");
    expect(payload).not.toContain("file_name:");
  });

  test.each(["required", "pending", "suggested", "rejected"])(
    "blocks incomplete redaction state %s before model invocation",
    (status) => {
      let geminiCalls = 0;
      const document = acceptedDocument({ redaction_status: status });
      const invoke = () => {
        const prepared = prepareSafeAiFillDocuments([document]);
        geminiCalls += 1;
        return buildModelFacingDocumentText(prepared);
      };

      expect(invoke).toThrow(/AI fill blocked/);
      expect(geminiCalls).toBe(0);
    },
  );

  test("blocks unsafe accepted redaction before model invocation", () => {
    let geminiCalls = 0;
    const document = acceptedDocument({ redaction_quality: "unsafe" });
    const invoke = () => {
      const prepared = prepareSafeAiFillDocuments([document]);
      geminiCalls += 1;
      return buildModelFacingDocumentText(prepared);
    };

    expect(invoke).toThrow(/quality/);
    expect(geminiCalls).toBe(0);
  });

  test("blocks residual entities before model invocation", () => {
    let geminiCalls = 0;
    const document = acceptedDocument({
      redaction_remaining_entities: [
        { type: "PHONE", text: "+7 999 123-45-67", reason: "phone", severity: "high" },
      ],
    });
    const invoke = () => {
      const prepared = prepareSafeAiFillDocuments([document]);
      geminiCalls += 1;
      return buildModelFacingDocumentText(prepared);
    };

    expect(invoke).toThrow(/residual/);
    expect(geminiCalls).toBe(0);
  });

  test("blocks accepted redaction when residual scan snapshot is missing", () => {
    const document = acceptedDocument({ redaction_remaining_entities: undefined });
    expect(() => selectSafeAiFillText(document)).toThrow(/scan is missing/);
  });

  test("allows explicitly checked not_required text without original_ocr_text fallback", () => {
    const document = {
      id: "doc-clean",
      ocr_text: "Публичный нормативный текст без защищаемых идентификаторов.",
      metadata: {
        redaction_status: "not_required",
        redaction_checked_at: "2026-08-16T00:00:00.000Z",
        original_ocr_text: "RAW SHOULD NOT BE USED",
      },
    };

    expect(selectSafeAiFillText(document)).toBe(document.ocr_text);
    const payload = buildModelFacingDocumentText(prepareSafeAiFillDocuments([document]));
    expect(payload).not.toContain("RAW SHOULD NOT BE USED");
  });
});
