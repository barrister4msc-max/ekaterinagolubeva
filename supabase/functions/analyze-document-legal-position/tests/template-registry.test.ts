import { describe, expect, test } from "bun:test";
import { getTemplateByCode, type TemplateRegistryEntry } from "../../_shared/template-registry.ts";

const activeTemplate: TemplateRegistryEntry = {
  code: "tax_strategy_memo",
  title: "Стратегия защиты по налоговому спору",
  category: "TAX",
  subcategory: "strategy",
  practice_area: "tax",
  jurisdiction: ["RU"],
  languages: ["ru"],
  complexity: "expert",
  is_active: true,
  requires_intake: true,
  description: "План защиты",
  sort_order: 90,
  metadata: {},
};

function client(result: { data: TemplateRegistryEntry | null; error: unknown | null }) {
  const calls: Array<[string, string?]> = [];
  return {
    calls,
    from(relation: string) {
      calls.push(["from", relation]);
      return {
        select(columns: string) {
          calls.push(["select", columns]);
          return {
            eq(column: string, value: string) {
              calls.push([column, value]);
              return { maybeSingle: async () => result };
            },
          };
        },
      };
    },
  };
}

describe("getTemplateByCode", () => {
  test("returns found from the canonical registry", async () => {
    const fake = client({ data: activeTemplate, error: null });
    expect(await getTemplateByCode(fake, activeTemplate.code)).toEqual({
      status: "found",
      template: activeTemplate,
    });
    expect(fake.calls[0]).toEqual(["from", "legal_document_templates"]);
    expect(fake.calls.at(-1)).toEqual(["code", activeTemplate.code]);
  });

  test("returns not_found only for a successful empty result", async () => {
    expect(await getTemplateByCode(client({ data: null, error: null }), "missing")).toEqual({
      status: "not_found",
      code: "missing",
    });
  });

  test("keeps database errors distinct from not_found", async () => {
    const error = new Error("sensitive database detail");
    expect(await getTemplateByCode(client({ data: null, error }), "broken")).toEqual({
      status: "error",
      code: "broken",
      error,
    });
  });

  test("resolves inactive deprecated templates for historical references", async () => {
    const inactive = {
      ...activeTemplate,
      code: "tax_strategy",
      is_active: false,
      metadata: { deprecated: true, replacement_code: "tax_strategy_memo" },
    };
    expect(await getTemplateByCode(client({ data: inactive, error: null }), inactive.code)).toEqual(
      {
        status: "found",
        template: inactive,
      },
    );
  });
});

describe("Analyzer template-registry wiring", () => {
  test("uses the canonical adapter and preserves the document-intent fallback", async () => {
    const source = await Bun.file(new URL("../index.ts", import.meta.url)).text();
    expect(source).toContain("getTemplateByCode(sb, session.template_code)");
    expect(source).toContain(
      "resolveDocumentIntent(\n      session.template_code as string | null,\n      templateTitle,",
    );
    expect(source).not.toContain('.from("document_templates")');
    expect(source).not.toContain('.select("practice_area, title")');
  });

  test("logs only the safe structured warning on lookup error", async () => {
    const source = await Bun.file(new URL("../index.ts", import.meta.url)).text();
    const warning = source.match(
      /console\.warn\("template_registry_lookup_failed", \{([\s\S]*?)\}\);/,
    );
    expect(warning).not.toBeNull();
    expect(warning![1]).toContain('code: "template_registry_lookup_failed"');
    expect(warning![1]).toContain("template_code: session.template_code");
    expect(warning![1]).toContain("lookup_status: templateLookup.status");
    expect(warning![1]).not.toMatch(/\.error|message|stack|query|credential/i);
  });
});
