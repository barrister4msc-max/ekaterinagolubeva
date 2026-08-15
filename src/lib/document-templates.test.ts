import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  selectFlagshipTaxTemplates,
  resolveTemplateForSession,
  type DocumentTemplate,
} from "./document-templates";

function template(overrides: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return {
    id: "template-id",
    code: "active-template",
    title: "Шаблон",
    category: "TAX",
    subcategory: null,
    practice_area: "tax",
    jurisdiction: ["RU"],
    languages: ["ru"],
    complexity: "basic",
    is_active: true,
    requires_intake: true,
    description: null,
    sort_order: 1,
    metadata: {},
    ...overrides,
  };
}

describe("resolveTemplateForSession", () => {
  test("uses the active catalog entry without a fallback lookup", async () => {
    const active = template();
    let lookupCalled = false;

    const result = await resolveTemplateForSession([active], active.code, async () => {
      lookupCalled = true;
      return null;
    });

    assert.equal(result, active);
    assert.equal(lookupCalled, false);
  });

  test("loads an inactive template by code for a saved session", async () => {
    const inactive = template({ code: "deprecated-template", is_active: false });

    const result = await resolveTemplateForSession([], inactive.code, async (code) => {
      assert.equal(code, inactive.code);
      return inactive;
    });

    assert.equal(result, inactive);
  });

  test("returns null when the saved template code no longer exists", async () => {
    const result = await resolveTemplateForSession([], "missing", async () => null);
    assert.equal(result, null);
  });
});

describe("selectFlagshipTaxTemplates", () => {
  test("returns the five approved templates in flagship rank order", () => {
    const templates = [
      template({ code: "tax_court_position", metadata: { flagship: true, flagship_rank: 5 } }),
      template({ code: "tax_vat_explanations", metadata: { flagship: true, flagship_rank: 3 } }),
      template({ code: "response_to_tax_request", metadata: { flagship: true, flagship_rank: 1 } }),
      template({ code: "tax_strategy_memo", metadata: { flagship: true, flagship_rank: 4 } }),
      template({ code: "tax_explanations", metadata: { flagship: true, flagship_rank: 2 } }),
      template({ code: "ordinary_tax_template", metadata: { flagship: true, flagship_rank: 1 } }),
    ];

    const result = selectFlagshipTaxTemplates(templates);

    assert.deepEqual(
      result.map(({ code, flagship_rank }) => ({ code, flagship_rank })),
      [
        { code: "response_to_tax_request", flagship_rank: 1 },
        { code: "tax_explanations", flagship_rank: 2 },
        { code: "tax_vat_explanations", flagship_rank: 3 },
        { code: "tax_strategy_memo", flagship_rank: 4 },
        { code: "tax_court_position", flagship_rank: 5 },
      ],
    );
  });

  test("does not promote a template when its metadata rank is inconsistent", () => {
    const result = selectFlagshipTaxTemplates([
      template({
        code: "tax_court_position",
        metadata: { flagship: true, flagship_rank: 4 },
      }),
    ]);

    assert.deepEqual(result, []);
  });
});
