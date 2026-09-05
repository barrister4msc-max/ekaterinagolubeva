import { describe, expect, test } from "bun:test";
import { buildVsrfManualImport } from "./vsrf-manual-import.ts";

describe("ВС РФ manual document adapter", () => {
  test("keeps multiple acts in one case distinct and preserves act metadata", () => {
    const result = buildVsrfManualImport([
      {
        title: "Карточка дела А40-123/2024",
        url: "https://vsrf.ru/stor_pdf.php?id=case-1#top",
        document_kind: "case_card",
        court_instance: "unknown",
        text_status: "missing",
        case_number: "А40-123/2024",
      },
      {
        title: "Определение ВС РФ",
        url: "https://supcourt.ru/stor_pdf.php?id=act-1",
        document_kind: "individual_act",
        court_instance: "cassation",
        text_status: "complete",
        case_number: "А40-123/2024",
        document_number: "305-ЭС25-1234",
        document_date: "2025-06-01",
        adverse: true,
      },
      {
        title: "Позднейшее определение ВС РФ",
        url: "https://vsrf.ru/stor_pdf.php?id=act-2",
        document_kind: "individual_act",
        court_instance: "cassation",
        text_status: "redacted",
        case_number: "А40-123/2024",
        document_number: "305-ЭС25-5678",
        document_date: "2025-08-01",
        later_act: true,
      },
    ], ["issue-1"]);
    expect(result?.provider).toBe("vsrf");
    expect(result?.candidates).toHaveLength(3);
    expect(result?.candidates?.[0]?.court_document_kind).toBe("case_card");
    expect(result?.candidates?.[1]?.court_instance).toBe("cassation");
    expect(result?.candidates?.[1]?.adverse).toBe(true);
    expect(result?.candidates?.[2]?.text_status).toBe("redacted");
    expect(result?.candidates?.[2]?.later_act).toBe(true);
    expect(result?.research_issue_ids).toEqual(["issue-1"]);
  });

  test("rejects non-official URLs, missing identity and empty input", () => {
    expect(buildVsrfManualImport([{
      title: "Подмена",
      url: "https://example.test/act",
      document_kind: "court_act",
      text_status: "complete",
      case_number: "А40-123/2024",
    }])).toBeNull();
    expect(buildVsrfManualImport([{
      title: "Без реквизитов",
      url: "https://vsrf.ru/act",
      document_kind: "court_act",
      text_status: "complete",
    }])).toBeNull();
    expect(buildVsrfManualImport([])).toBeNull();
  });
});
