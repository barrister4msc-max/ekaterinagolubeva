import { describe, expect, test } from "bun:test";
import {
  hasExtractedDocumentText,
  suggestTemplatesForPackage,
} from "../../src/lib/document-template-suggestions";
import type { DocumentTemplate } from "../../src/lib/document-templates";

function template(code: string, category = "TAX", practiceArea = "tax"): DocumentTemplate {
  return {
    id: code,
    code,
    title: code,
    category,
    subcategory: null,
    practice_area: practiceArea,
    jurisdiction: ["RU"],
    languages: ["ru"],
    complexity: "advanced",
    is_active: true,
    requires_intake: true,
    description: null,
    sort_order: 100,
    metadata: {},
  };
}

describe("document package template suggestions", () => {
  test("accepts meaningful short extracted text", () => {
    expect(hasExtractedDocumentText("ООО ВИКОС")).toBe(true);
    expect(hasExtractedDocumentText("   \n ")).toBe(false);
  });

  test("suggests counterparty due diligence for an EGRUL package", () => {
    const selected = template("response_to_tax_request");
    const suggestions = suggestTemplatesForPackage(
      [
        {
          id: "1",
          file_name: "выписка егрюл.pdf",
          text: "Выписка из Единого государственного реестра юридических лиц. ОГРН 1227700119536",
        },
      ],
      [selected, template("tax_counterparty_due_diligence")],
      selected,
    );
    expect(suggestions[0]?.template.code).toBe("tax_counterparty_due_diligence");
  });

  test("marks a category or practice mismatch as a conflict", () => {
    const selected = template("contract_review", "CONTRACTS", "contracts");
    const suggestions = suggestTemplatesForPackage(
      [{ id: "1", text: "Требование ИФНС о представлении документов" }],
      [selected, template("response_to_tax_request")],
      selected,
    );
    expect(suggestions[0]?.conflictsWithSelection).toBe(true);
  });
});
