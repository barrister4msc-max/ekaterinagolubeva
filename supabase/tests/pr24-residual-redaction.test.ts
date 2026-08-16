import { describe, expect, test } from "bun:test";
import { redactLegalDocument, reviewRedactedText } from "../../src/lib/legal-redaction";

describe("PR24 — government whitelist no longer masks adjacent PII", () => {
  test("gov body name survives, adjacent phone/ИНН/company/address are redacted", () => {
    const source = [
      "ИФНС России № 5 по г. Москве, тел. +7 495 123-45-67,",
      'ООО "МЕТЕОР" ИНН 7701234567, г. Москва, ул. Ленина, д. 5',
    ].join("\n");

    const result = redactLegalDocument(source);

    expect(result.redacted_text).toContain("ИФНС");
    expect(result.redacted_text).not.toContain("МЕТЕОР");
    expect(result.redacted_text).not.toContain("7701234567");
    expect(result.redacted_text).not.toContain("495 123-45-67");
    expect(result.entities.some((e) => e.type === "PHONE")).toBe(true);
    expect(result.entities.some((e) => e.type === "COMPANY")).toBe(true);
  });

  test("УФНС label is protected from COMPANY redaction", () => {
    const result = redactLegalDocument("Решение вынесено УФНС России по Московской области.");
    expect(result.redacted_text).toContain("УФНС");
  });
});

describe("PR24 — OCR phone residual variants", () => {
  test.each([
    "725105906 45",
    "727445397 37",
    "727455211 90",
    "727010713 48",
  ])("redacts OCR phone residual %s in contact context", (phone) => {
    const result = redactLegalDocument(`Контактный телефон: ${phone}`);
    expect(result.redacted_text).not.toContain(phone);
    expect(result.entities.some((e) => e.type === "PHONE")).toBe(true);
    expect(reviewRedactedText(result.redacted_text, result.stats).remaining_entities).toHaveLength(0);
  });

  test.each([
    "+7 999 123-45-67",
    "8 999 123 45 67",
    "(999) 123-45-67",
    "+7\u00A0999\u00A0123\u00A045\u00A067",
    "+7\u200B999\u200B123\u200B45\u200B67",
    "+7 999 123–45–67",
    "+7.999.123.45.67",
    "+7/999/123/45/67",
  ])("preserves PR22 phone variant %s", (phone) => {
    const result = redactLegalDocument(`Телефон: ${phone}.`);
    expect(result.redacted_text).not.toContain(phone);
    expect(result.entities.some((e) => e.type === "PHONE")).toBe(true);
  });

  test("does not treat ИНН/ОГРН/КПП digits as phones", () => {
    const result = redactLegalDocument("ИНН 7701234567 ОГРН 1027700123456 КПП 770101001");
    expect(result.entities.some((e) => e.type === "PHONE")).toBe(false);
  });
});

describe("PR24 — STAMP OCR variants", () => {
  test.each(["M.P.", "М.П.", "М П", "м П", "М\u00A0П", "М\u200BП", "МП"])(
    "redacts stamp marker %s",
    (stamp) => {
      const result = redactLegalDocument(`Подпись сторон. ${stamp} Приложение прилагается.`);
      expect(result.entities.some((e) => e.type === "STAMP")).toBe(true);
    },
  );

  test("does not overmatch ordinary prose words", () => {
    const result = redactLegalDocument(
      "Мнение представителя по существу спора изложено в мотивированном отзыве.",
    );
    expect(result.entities.some((e) => e.type === "STAMP")).toBe(false);
  });
});

describe("PR24 — coverage coherence", () => {
  test("residual entities force coverage below 100 and unsafe quality", () => {
    const review = reviewRedactedText("Контактный телефон: +7 999 123-45-67", {
      detected_total: 10,
      replaced_total: 10,
      remaining_total: 0,
      coverage_percent: 100,
      by_type: redactLegalDocument("").stats.by_type,
    });

    expect(review.stats.remaining_total).toBeGreaterThan(0);
    expect(review.stats.coverage_percent).toBeLessThan(100);
    expect(review.quality).toBe("unsafe");
  });

  test("fully redacted document reports coverage 100 and no residuals", () => {
    const result = redactLegalDocument('Телефон +7 999 123-45-67, ООО "МЕТЕОР".');
    expect(result.stats.remaining_total).toBe(0);
    expect(result.stats.coverage_percent).toBe(100);
    expect(result.quality).toBe("excellent");
  });

  test("empty input keeps coverage 100", () => {
    expect(redactLegalDocument("").stats.coverage_percent).toBe(100);
  });
});
