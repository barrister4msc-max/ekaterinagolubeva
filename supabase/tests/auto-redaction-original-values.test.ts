import { describe, expect, test } from "bun:test";
import { extractProtectedAnswerCandidates } from "../functions/document-intake-ai-fill/redaction-safety";

describe("automatic redaction and original-value preservation", () => {
  test("extracts labelled canonical values from original OCR without exposing them to the model", () => {
    const candidates = extractProtectedAnswerCandidates(
      [
        {
          id: "doc-1",
          ocr_text: "[COMPANY_1] ИНН [BANK_DETAILS_1]",
          metadata: {
            original_ocr_text: [
              'Наименование организации: ООО "АЛАН"',
              "ИНН организации: 0100000614",
              "Наименование инспекции: ИФНС России № 1 по г. Москве",
              "Номер инспекции: 7701",
            ].join("\n"),
          },
        },
      ],
      [
        { field_name: "taxpayer_name", field_label: "Налогоплательщик" },
        { field_name: "taxpayer_inn", field_label: "ИНН" },
        { field_name: "tax_authority_name", field_label: "Инспекция" },
        { field_name: "tax_authority_number", field_label: "Номер инспекции" },
      ],
    );

    expect(candidates).toEqual([
      {
        field_name: "taxpayer_inn",
        field_label: "ИНН",
        value: "0100000614",
        source_document_id: "doc-1",
      },
      {
        field_name: "taxpayer_name",
        field_label: "Налогоплательщик",
        value: 'ООО "АЛАН"',
        source_document_id: "doc-1",
      },
      {
        field_name: "tax_authority_name",
        field_label: "Инспекция",
        value: "ИФНС России № 1 по г. Москве",
        source_document_id: "doc-1",
      },
      {
        field_name: "tax_authority_number",
        field_label: "Номер инспекции",
        value: "7701",
        source_document_id: "doc-1",
      },
    ]);
  });

  test("does not persist placeholders or unlabeled values as canonical answers", () => {
    const candidates = extractProtectedAnswerCandidates(
      [
        {
          id: "doc-2",
          ocr_text: "ООО «АЛАН» 0100000614",
          metadata: {
            original_ocr_text: [
              "Организация: [COMPANY_1]",
              "ИНН организации: синтетическое значение",
            ].join("\n"),
          },
        },
      ],
      [
        { field_name: "taxpayer_name", field_label: "Налогоплательщик" },
        { field_name: "taxpayer_inn", field_label: "ИНН" },
      ],
    );

    expect(candidates).toHaveLength(0);
  });
  test("fails closed instead of treating redacted OCR placeholders as original values", () => {
    const candidates = extractProtectedAnswerCandidates(
      [
        {
          id: "doc-3",
          ocr_text: "ИНН организации: [BANK_DETAILS_1]",
          metadata: {
            redaction_status: "accepted",
            redacted_text: "ИНН организации: [BANK_DETAILS_1]",
          },
        },
      ],
      [{ field_name: "taxpayer_inn", field_label: "ИНН" }],
    );

    expect(candidates).toEqual([]);
  });

});
