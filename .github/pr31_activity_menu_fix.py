from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing snippet: {label}")
    return text.replace(old, new, 1)

# 1) Separate document OKVED from activity description.
p = Path("src/lib/company-registry.ts")
s = p.read_text()
s = replace_once(
    s,
    '  taxpayer_legal_address: string | null;\n  business_activity: string | null;\n',
    '  taxpayer_legal_address: string | null;\n  okved_main: string | null;\n  business_activity: string | null;\n',
    "DocumentCompanyProfile okved_main",
)
s = replace_once(
    s,
    '  taxpayer_legal_address: [\n    "taxpayer_legal_address",\n    "legal_address",\n    "registration_address",\n  ],\n  business_activity: ["business_activity", "okved", "activity"],\n',
    '  taxpayer_legal_address: [\n    "taxpayer_legal_address",\n    "legal_address",\n    "registration_address",\n  ],\n  okved_main: ["main_okved", "okved_main", "okved_code", "taxpayer_okved", "okved"],\n  business_activity: ["business_activity", "business_activity_name", "activity"],\n',
    "document field aliases",
)
s = replace_once(
    s,
    'export function normalizeDigits(value: string): string {\n  return value.replace(/\\D/g, "");\n}\n',
    'export function normalizeDigits(value: string): string {\n  return value.replace(/\\D/g, "");\n}\n\nexport function normalizeOkvedCode(value: string): string {\n  return value.trim().replace(/[^0-9]/g, "");\n}\n',
    "normalizeOkvedCode",
)
s = replace_once(
    s,
    '    {\n      field: "business_activity",\n      documentValue: documentProfile.business_activity,\n      registryValue: registryProfile.business_activity_name ?? registryProfile.okved_main,\n      normalize: normalizeCompanyName,\n      severity: "low",\n      reason: "Вид деятельности в документе отличается от ОКВЭД в реестре",\n    },\n',
    '    {\n      field: "okved_main",\n      documentValue: documentProfile.okved_main,\n      registryValue: registryProfile.okved_main,\n      normalize: normalizeOkvedCode,\n      severity: "low",\n      reason: "Основной ОКВЭД в документе отличается от реестра",\n    },\n    {\n      field: "business_activity",\n      documentValue: documentProfile.business_activity,\n      registryValue: registryProfile.business_activity_name,\n      normalize: normalizeCompanyName,\n      severity: "low",\n      reason: "Описание вида деятельности в документе отличается от реестра",\n    },\n',
    "activity conflicts",
)
p.write_text(s)

# 2) Restore document activity only after deterministic OKVED match.
p = Path("src/lib/company-registry-canonical.ts")
s = p.read_text()
s = replace_once(
    s,
    '  normalizeDigits,\n  REGISTRY_VALUE_SOURCE,\n',
    '  normalizeDigits,\n  normalizeOkvedCode,\n  REGISTRY_VALUE_SOURCE,\n',
    "canonical okved import",
)
s = replace_once(
    s,
    '  taxpayer_legal_address: "Юридический адрес",\n  business_activity: "Сфера деятельности",\n',
    '  taxpayer_legal_address: "Юридический адрес",\n  main_okved: "Основной ОКВЭД",\n  business_activity: "Сфера деятельности",\n',
    "canonical field labels",
)
old = '''export function getPreservedDocumentBusinessActivity(params: {\n  profile: CompanyRegistryProfile;\n  documentProfile: DocumentCompanyProfile;\n  answers: AnswerRow[];\n}): string | null {\n  if (params.profile.business_activity_name) return null;\n  const preserved = params.documentProfile.business_activity?.trim();\n  if (!preserved) return null;\n  const current = params.answers.find((row) => row.field_name === "business_activity");\n  if (!current || current.value_source !== REGISTRY_VALUE_SOURCE) return null;\n  const currentValue = answerToString(current.field_value);\n  const code = params.profile.okved_main?.trim();\n  if (!currentValue || !code) return null;\n  // Repair the precise regression seen in production: the former descriptive\n  // document value was replaced by a verified registry code without a name.\n  if (normalizeCompanyName(currentValue) !== normalizeCompanyName(code)) return null;\n  return preserved;\n}\n'''
new = '''export function getPreservedDocumentBusinessActivity(params: {\n  profile: CompanyRegistryProfile;\n  documentProfile: DocumentCompanyProfile;\n  answers: AnswerRow[];\n}): string | null {\n  // Registry text wins when it exists. Document fallback is allowed only when\n  // both layers independently point to the same main OKVED code.\n  if (params.profile.business_activity_name) return null;\n  const preserved = params.documentProfile.business_activity?.trim();\n  const registryCode = params.profile.okved_main?.trim();\n  if (!preserved || !registryCode) return null;\n\n  const current = params.answers.find((row) => row.field_name === "business_activity");\n  if (isHumanProtectedAnswer(current)) return null;\n\n  const registryNormalized = normalizeOkvedCode(registryCode);\n  if (!registryNormalized) return null;\n\n  const documentCode = params.documentProfile.okved_main?.trim();\n  if (documentCode) {\n    if (normalizeOkvedCode(documentCode) !== registryNormalized) return null;\n    return preserved;\n  }\n\n  // Backward compatibility for older document snapshots where code and text\n  // were stored in one field (e.g. "68.20 Аренда ...").\n  const codeCandidates = preserved.match(/\\d{2}(?:\\.\\d{1,3}){1,2}/g) ?? [];\n  if (codeCandidates.some((candidate) => normalizeOkvedCode(candidate) === registryNormalized)) {\n    return preserved;\n  }\n\n  return null;\n}\n'''
s = replace_once(s, old, new, "preserved business activity rule")
s = replace_once(
    s,
    '    ["taxpayer_legal_address", params.profile.legal_address],\n    ["business_activity", formatRegistryBusinessActivity(params.profile)],\n',
    '    ["taxpayer_legal_address", params.profile.legal_address],\n    ["main_okved", params.profile.okved_main],\n    ["business_activity", formatRegistryBusinessActivity(params.profile)],\n',
    "canonical mapping main_okved",
)
p.write_text(s)

# 3) Preserve/read okved_main in the immutable document snapshot.
p = Path("supabase/functions/company-registry-lookup/index.ts")
s = p.read_text()
s = replace_once(
    s,
    '    "taxpayer_legal_address",\n    "business_activity",\n',
    '    "taxpayer_legal_address",\n    "okved_main",\n    "business_activity",\n',
    "edge document profile keys",
)
p.write_text(s)

# 4) Focused Builder: explicit escape back to workspace dashboard + stronger search affordance.
p = Path("src/routes/workspace.document-builder.tsx")
s = p.read_text()
s = replace_once(
    s,
    '      <header className="space-y-4">\n        <div>\n          <h1 className="font-display text-2xl text-foreground">Конструктор документов</h1>\n          <p className="mt-1 text-sm text-muted-foreground">1 Шаблон → 2 Карточка → 3 Опросник</p>\n        </div>\n        <Stepper step={step} />\n      </header>',
    '      <header className="space-y-4">\n        <div className="flex flex-wrap items-start justify-between gap-3">\n          <div>\n            <h1 className="font-display text-2xl text-foreground">Конструктор документов</h1>\n            <p className="mt-1 text-sm text-muted-foreground">1 Шаблон → 2 Карточка → 3 Опросник</p>\n          </div>\n          <button\n            type="button"\n            onClick={() => navigate({ to: "/workspace/dashboard" })}\n            className="db-ghost shrink-0"\n            aria-label="Вернуться в меню Workspace"\n          >\n            <ArrowLeft size={14} /> Вернуться в меню\n          </button>\n        </div>\n        <Stepper step={step} />\n      </header>',
    "builder menu exit",
)
s = replace_once(
    s,
    '<Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />',
    '<Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground opacity-90 stroke-[2.25]" />',
    "search icon contrast",
)
s = replace_once(
    s,
    'className="db-search w-full pl-9"',
    'className="db-search w-full pl-9 text-foreground placeholder:text-foreground/60"',
    "search placeholder contrast",
)
p.write_text(s)

# 5) Regression tests.
p = Path("supabase/tests/pr31-activity-match-and-builder-exit.test.ts")
p.write_text(r'''import { describe, expect, test } from "bun:test";
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

describe("PR31 focused builder escape and search contrast", () => {
  const source = readFileSync("src/routes/workspace.document-builder.tsx", "utf8");

  test("provides explicit return to workspace menu", () => {
    expect(source).toContain("Вернуться в меню");
    expect(source).toContain('navigate({ to: "/workspace/dashboard" })');
  });

  test("search icon and placeholder use explicit foreground contrast", () => {
    expect(source).toContain("text-foreground opacity-90 stroke-[2.25]");
    expect(source).toContain("placeholder:text-foreground/60");
  });
});
''')
