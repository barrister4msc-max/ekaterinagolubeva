import { describe, expect, test } from "bun:test";
import {
  normalizeKadCaseNumber,
  sanitizeKadManualImport,
} from "../src/lib/kad-manual-import-contract";

describe("KAD manual/import safety contract", () => {
  test("accepts an official HTTPS manual case import as factual discovery only", () => {
    const result = sanitizeKadManualImport({
      mode: "manual",
      url: "https://kad.arbitr.ru/Card/123",
      case_number: "А40-12345/2024",
      title: "Определение арбитражного суда",
      research_issue_ids: ["issue-1", "issue-1"],
    });

    expect(result?.provider).toBe("kad");
    expect(result?.source_type).toBe("kad_case");
    expect(result?.source_family).toBe("judicial");
    expect(result?.case_number).toBe("А40-12345/2024");
    expect(result?.legal_authority).toBe(false);
    expect(result?.substantive_use_allowed).toBe(false);
    expect(result?.search_inference_only).toBe(true);
    expect(result?.research_issue_ids).toEqual(["issue-1"]);
  });

  test("accepts a case title when the case number is not available yet", () => {
    const result = sanitizeKadManualImport({
      mode: "user_session",
      url: "https://www.kad.arbitr.ru/Kad/SearchInstances",
      title: "Поиск дела по участнику",
    });

    expect(result?.retrieval_method).toBe("user_session");
    expect(result?.case_number).toBeNull();
  });

  test("rejects non-official hosts, HTTP and unsupported automatic modes", () => {
    expect(sanitizeKadManualImport({
      mode: "automatic",
      url: "https://kad.arbitr.ru/Card/123",
      title: "case",
    })).toBeNull();

    expect(sanitizeKadManualImport({
      mode: "manual",
      url: "http://kad.arbitr.ru/Card/123",
      title: "case",
    })).toBeNull();

    expect(sanitizeKadManualImport({
      mode: "manual",
      url: "https://example.com/Card/123",
      title: "case",
    })).toBeNull();
  });

  test("does not accept free-form narrative without an official URL and identity", () => {
    expect(sanitizeKadManualImport({
      mode: "import",
      url: "https://kad.arbitr.ru/Card/123",
      text: "Суд отказал, потому что позиция неверна",
    })).toBeNull();

    expect(normalizeKadCaseNumber(" А40–12345/2024 ")).toBe("А40-12345/2024");
    expect(normalizeKadCaseNumber("not-a-case")).toBeNull();
  });
});
