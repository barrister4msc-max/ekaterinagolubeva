import { describe, expect, test } from "bun:test";
import { buildCbrManualImport } from "./cbr-manual-import.ts";
import { normalizeExternalResearchImport } from "./external-research-import.ts";

describe("CBR manual import adapter", () => {
  test("preserves status, effective date, language/version, duplicate and full text", () => {
    const input = buildCbrManualImport([{
      title: "Положение Банка России",
      url: "https://www.cbr.ru/finmarkets/?doc=123#section",
      document_kind: "regulation",
      document_status: "effective",
      effective_from: "2026-01-01",
      language: "ru",
      version: "v3",
      full_text_available: true,
      full_text: "Полный текст положения Банка России. ".repeat(20),
      document_number: "Положение № 123-П",
      document_date: "2025-12-01",
    }], ["issue-cbr"]);
    expect(input?.provider).toBe("cbr");
    const result = normalizeExternalResearchImport(input!);
    const source = result.sources[0];
    expect(source.bucket).toBe("manuals");
    expect(source.content_text).toContain("Полный текст");
    expect(source.metadata.source_family).toBe("cbr_official");
    expect(source.metadata.document_status).toBe("effective");
    expect(source.metadata.effective_from).toBe("2026-01-01");
    expect(source.metadata.language).toBe("ru");
    expect(source.metadata.version).toBe("v3");
    expect(source.metadata.full_text_available).toBe(true);
    expect(source.metadata.substantive_use_allowed).toBe(false);
  });

  test("preserves draft/withdrawn status and rejects missing text when marked available", () => {
    const input = buildCbrManualImport([{
      title: "Проект позиции",
      url: "https://cbr.ru/press/event/?id=7",
      document_kind: "position",
      document_status: "draft",
      withdrawn: true,
      draft: true,
      full_text_available: false,
      document_number: "Проект 7",
    }]);
    expect(input).not.toBeNull();
    const source = normalizeExternalResearchImport(input!).sources[0];
    expect(source.metadata.draft).toBe(true);
    expect(source.metadata.withdrawn).toBe(true);
    expect(buildCbrManualImport([{
      title: "Без текста",
      url: "https://cbr.ru/doc",
      document_kind: "regulation",
      document_status: "effective",
      full_text_available: true,
      document_number: "123",
    }])).toBeNull();
  });

  test("rejects non-CBR URLs and missing identity", () => {
    expect(buildCbrManualImport([{
      title: "Подмена",
      url: "https://example.test/doc",
      document_kind: "regulation",
      document_status: "effective",
      full_text_available: false,
      document_number: "123",
    }])).toBeNull();
    expect(buildCbrManualImport([{
      title: "Без номера",
      url: "https://cbr.ru/doc",
      document_kind: "regulation",
      document_status: "effective",
      full_text_available: false,
    }])).toBeNull();
  });
});
