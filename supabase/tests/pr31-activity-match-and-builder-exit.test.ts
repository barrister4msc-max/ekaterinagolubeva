import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  extractDocumentCompanyProfile,
  type CompanyRegistryProfile,
  type DocumentCompanyProfile,
} from "../../src/lib/company-registry";
import { getPreservedDocumentBusinessActivity } from "../../src/lib/company-registry-canonical";

const profile = (overrides: Partial<CompanyRegistryProfile> = {}): CompanyRegistryProfile => ({
  inn: "7707083893",
  name_full: "ООО Тест",
  name_short: "ООО Тест",
  ogrn: "1027700132195",
  ogrnip: null,
  kpp: "773601001",
  legal_address: "Москва",
  okved_main: "68.20",
  business_activity_name: null,
  company_status: "ACTIVE",
  registration_date: null,
  management_name: null,
  management_post: null,
  branch_type: "MAIN",
  provider: "dadata",
  upstream_source: "egrul/fns-derived",
  checked_at: "2026-08-17T00:00:00.000Z",
  raw_source_updated_at: null,
  ...overrides,
});

const documentProfile = (overrides: Partial<DocumentCompanyProfile> = {}): DocumentCompanyProfile => ({
  taxpayer_name: null,
  taxpayer_inn: null,
  taxpayer_ogrn: null,
  taxpayer_kpp: null,
  taxpayer_legal_address: null,
  okved_main: "68.20",
  business_activity: "Аренда и управление собственным или арендованным недвижимым имуществом",
  ...overrides,
});

describe("PR31 registry activity fallback", () => {
  test("extracts document OKVED separately from activity text", () => {
    const extracted = extractDocumentCompanyProfile([
      { field_name: "okved", field_value: "68.20", value_source: "ai" },
      { field_name: "business_activity", field_value: "Аренда недвижимости", value_source: "ai" },
    ]);
    expect(extracted.okved_main).toBe("68.20");
    expect(extracted.business_activity).toBe("Аренда недвижимости");
  });

  test("uses preserved document description only when explicit document OKVED matches registry", () => {
    expect(getPreservedDocumentBusinessActivity({
      profile: profile(),
      documentProfile: documentProfile(),
      answers: [{ field_name: "business_activity", field_value: "68.20", value_source: "registry" }],
    })).toContain("Аренда и управление");
  });

  test("rejects preserved description when document OKVED conflicts with registry", () => {
    expect(getPreservedDocumentBusinessActivity({
      profile: profile(),
      documentProfile: documentProfile({ okved_main: "69.10" }),
      answers: [{ field_name: "business_activity", field_value: "69.10 Юридическая деятельность", value_source: "ai" }],
    })).toBeNull();
  });

  test("supports legacy combined code plus description when same OKVED is embedded", () => {
    expect(getPreservedDocumentBusinessActivity({
      profile: profile(),
      documentProfile: documentProfile({ okved_main: null, business_activity: "68.20 Аренда недвижимости" }),
      answers: [],
    })).toBe("68.20 Аренда недвижимости");
  });

  test("never overwrites a human-protected activity", () => {
    expect(getPreservedDocumentBusinessActivity({
      profile: profile(),
      documentProfile: documentProfile(),
      answers: [{ field_name: "business_activity", field_value: "Подтверждено юристом", value_source: "lawyer", is_verified: true }],
    })).toBeNull();
  });
});

describe("PR31 builder escape regression on current main", () => {
  const source = readFileSync("src/routes/workspace.document-builder.tsx", "utf8");

  test("preserves the newer explicit return to workspace dashboard", () => {
    expect(source).toContain('navigate({ to: "/workspace/dashboard" })');
    expect(source).toContain("В дашборд");
  });
});
