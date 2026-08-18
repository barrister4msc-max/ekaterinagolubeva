import { describe, expect, test } from "bun:test";
import { sanitizeExternalLegalResearchImports } from "../src/lib/external-legal-research-staging";

describe("external legal research session staging", () => {
  test("accepts only supported providers and bounded fields", () => {
    const result = sanitizeExternalLegalResearchImports([
      {
        provider: "strizh",
        answer_text: " provider narrative ",
        links: ["https://example.com/a", "https://example.com/a"],
        research_issue_ids: ["issue-1", "issue-1"],
        candidates: [
          {
            title: "Письмо ФНС",
            document_number: "АБ-1/2",
            document_date: "2024-01-01",
            research_issue_ids: ["issue-2"],
          },
        ],
      },
      { provider: "unknown", links: ["https://bad.example"] },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("strizh");
    expect(result[0].answer_text).toBe("provider narrative");
    expect(result[0].links).toEqual(["https://example.com/a"]);
    expect(result[0].research_issue_ids).toEqual(["issue-1"]);
    expect(result[0].candidates).toHaveLength(1);
    expect(result[0].candidates?.[0].document_number).toBe("АБ-1/2");
  });

  test("drops empty candidates but preserves a narrative-only import for audit", () => {
    const result = sanitizeExternalLegalResearchImports([
      {
        provider: "garant",
        answer_text: "Есть вывод, но ссылок пока нет",
        candidates: [{ excerpt: "Без реквизитов" }],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("garant");
    expect(result[0].candidates).toEqual([]);
    expect(result[0].answer_text).toBe("Есть вывод, но ссылок пока нет");
  });

  test("caps imports, links and candidates", () => {
    const imports = Array.from({ length: 12 }, (_, index) => ({
      provider: "other",
      links: Array.from({ length: 30 }, (_, link) => `https://example.com/${index}/${link}`),
      candidates: Array.from({ length: 30 }, (_, candidate) => ({
        title: `source-${candidate}`,
        citation: `citation-${candidate}`,
      })),
    }));

    const result = sanitizeExternalLegalResearchImports(imports);
    expect(result).toHaveLength(8);
    expect(result[0].links).toHaveLength(20);
    expect(result[0].candidates).toHaveLength(20);
  });
});
