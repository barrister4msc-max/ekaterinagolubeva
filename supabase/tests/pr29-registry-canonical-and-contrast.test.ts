import { describe, expect, test } from "bun:test";

import {
  buildCanonicalRegistryOverrides,
  filterFormattingOnlyConflicts,
  formatRegistryBusinessActivity,
} from "../../src/lib/company-registry-canonical";
import {
  detectCompanyConflicts,
  extractDocumentCompanyProfile,
  mapDaDataParty,
  type AnswerRow,
  type CompanyRegistryProfile,
} from "../../src/lib/company-registry";

const CHECKED_AT = "2026-08-17T00:00:00.000Z";

function profile(): CompanyRegistryProfile {
  const mapped = mapDaDataParty(
    {
      value: 'ООО "БРОННИЦКИЙ ДСК"',
      data: {
        inn: "7727454987",
        kpp: "772701001",
        ogrn: "1207700414063",
        type: "LEGAL",
        branch_type: "MAIN",
        name: {
          full_with_opf: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "БРОННИЦКИЙ ДОМOСТРОИТЕЛЬНЫЙ КОМБИНАТ"',
          short_with_opf: 'ООО "БРОННИЦКИЙ ДСК"',
        },
        address: {
          value: "г Москва, ул Большая Черёмушкинская, д 25, стр 97, этаж/офис 5/508А",
          unrestricted_value:
            "117218, г Москва, ул Большая Черёмушкинская, д 25, стр 97, этаж/офис 5/508А",
        },
        okved: "68.20",
        okveds: [
          {
            main: true,
            code: "68.20",
            name: "Аренда и управление собственным или арендованным недвижимым имуществом",
          },
        ],
        state: { status: "ACTIVE" },
      },
    },
    CHECKED_AT,
  );
  if (!mapped) throw new Error("registry fixture mapping failed");
  return mapped;
}

const SCHEMA_FIELDS = [
  "taxpayer_name",
  "taxpayer_inn",
  "taxpayer_ogrn",
  "taxpayer_kpp",
  "taxpayer_legal_address",
  "business_activity",
];

describe("PR29 — канонические реквизиты из реестра", () => {
  test("заменяет машинно извлечённые значения, но не изменяет исходные строки", () => {
    const answers: AnswerRow[] = [
      {
        field_name: "taxpayer_legal_address",
        field_value: "117218,РОССИЯ,МОСКВА Г,,,БОЛЬШАЯ ЧЕРЁМУШКИНСКАЯ УЛИЦА,ДОМ 25,стр97,ЭТАЖ/ОФИС 5/508А",
        value_source: "ai_document",
      },
      {
        field_name: "business_activity",
        field_value: "Аренда и управление собственным или арендованным недвижимым имуществом.",
        value_source: "ocr_extract",
      },
    ];
    const before = structuredClone(answers);
    const plan = buildCanonicalRegistryOverrides({
      profile: profile(),
      answers,
      schemaFieldKeys: SCHEMA_FIELDS,
      conflicts: [],
    });

    expect(plan.find((entry) => entry.field_name === "taxpayer_legal_address")?.field_value).toBe(
      profile().legal_address,
    );
    expect(plan.find((entry) => entry.field_name === "business_activity")?.field_value).toBe(
      "68.20 Аренда и управление собственным или арендованным недвижимым имуществом",
    );
    expect(answers).toEqual(before);
    expect(plan.every((entry) => entry.value_source === "registry")).toBe(true);
  });

  test("не перезаписывает ручное или подтверждённое юристом значение", () => {
    const answers: AnswerRow[] = [
      {
        field_name: "taxpayer_name",
        field_value: "Название, которое оставил юрист",
        value_source: "manual",
      },
      {
        field_name: "taxpayer_legal_address",
        field_value: "Адрес, подтверждённый юристом",
        value_source: "lawyer_confirmed",
        is_verified: true,
      },
    ];
    const plan = buildCanonicalRegistryOverrides({
      profile: profile(),
      answers,
      schemaFieldKeys: SCHEMA_FIELDS,
      conflicts: [],
    });
    expect(plan.some((entry) => entry.field_name === "taxpayer_name")).toBe(false);
    expect(plan.some((entry) => entry.field_name === "taxpayer_legal_address")).toBe(false);
  });

  test("не заменяет ИНН, ОГРН или КПП при существенном расхождении", () => {
    const answers: AnswerRow[] = [
      { field_name: "taxpayer_inn", field_value: "7700000000", value_source: "ai_document" },
      { field_name: "taxpayer_ogrn", field_value: "1111111111111", value_source: "ai_document" },
      { field_name: "taxpayer_kpp", field_value: "770001001", value_source: "ai_document" },
    ];
    const documentProfile = extractDocumentCompanyProfile(answers);
    const conflicts = detectCompanyConflicts(documentProfile, profile());
    const plan = buildCanonicalRegistryOverrides({
      profile: profile(),
      answers,
      schemaFieldKeys: SCHEMA_FIELDS,
      conflicts,
    });
    expect(plan.some((entry) => entry.field_name === "taxpayer_inn")).toBe(false);
    expect(plan.some((entry) => entry.field_name === "taxpayer_ogrn")).toBe(false);
    expect(plan.some((entry) => entry.field_name === "taxpayer_kpp")).toBe(false);
  });

  test("обновляет прежнее реестровое значение при повторной проверке", () => {
    const answers: AnswerRow[] = [
      {
        field_name: "taxpayer_legal_address",
        field_value: "старый адрес",
        value_source: "registry",
        is_verified: true,
      },
    ];
    const plan = buildCanonicalRegistryOverrides({
      profile: profile(),
      answers,
      schemaFieldKeys: SCHEMA_FIELDS,
      conflicts: [],
    });
    expect(plan.some((entry) => entry.field_name === "taxpayer_legal_address")).toBe(true);
  });
});

describe("PR29 — ложные расхождения из-за оформления", () => {
  test("не считает форматирование одного и того же адреса расхождением", () => {
    const documentProfile = extractDocumentCompanyProfile([
      {
        field_name: "taxpayer_legal_address",
        field_value:
          "117218,РОССИЯ,МОСКВА Г,,,БОЛЬШАЯ ЧЕРЁМУШКИНСКАЯ УЛИЦА,ДОМ 25,СТР 97,ЭТАЖ/ОФИС 5/508А",
      },
    ]);
    const raw = detectCompanyConflicts(documentProfile, profile());
    expect(raw.some((conflict) => conflict.field === "legal_address")).toBe(true);
    const filtered = filterFormattingOnlyConflicts(raw, profile());
    expect(filtered.some((conflict) => conflict.field === "legal_address")).toBe(false);
  });

  test("ОКВЭД с тем же кодом не создаёт ложное расхождение", () => {
    const documentProfile = extractDocumentCompanyProfile([
      {
        field_name: "business_activity",
        field_value: "68.20 Аренда и управление собственным или арендованным недвижимым имуществом.",
      },
    ]);
    const raw = detectCompanyConflicts(documentProfile, profile());
    const filtered = filterFormattingOnlyConflicts(raw, profile());
    expect(filtered.some((conflict) => conflict.field === "business_activity")).toBe(false);
    expect(formatRegistryBusinessActivity(profile())).toBe(
      "68.20 Аренда и управление собственным или арендованным недвижимым имуществом",
    );
  });
});

describe("PR29 — видимость текста во всём рабочем пространстве", () => {
  test("workspace подключает отдельный финальный слой контраста", async () => {
    const route = await Bun.file("src/routes/workspace.tsx").text();
    const css = await Bun.file("src/workspace-contrast.css").text();

    expect(route).toContain('import "@/workspace-contrast.css"');
    expect(css).toContain(".workspace-glass .text-muted-foreground");
    expect(css).toContain(".workspace-glass .text-white\\/70");
    expect(css).toContain(".workspace-glass button:disabled");
    expect(css).toContain(".workspace-glass .registry-card");
    expect(css).toContain("body.workspace-active [role=\"dialog\"][data-state]");
  });
});
