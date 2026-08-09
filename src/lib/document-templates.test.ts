import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
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
