import { describe, expect, test } from "bun:test";

import {
  attachCompanyContextToSnapshot,
} from "../../src/lib/matter-snapshot";
import {
  buildAutofillPlan,
  buildCompanyMetadataPatch,
  buildMatterTitle,
  decideMatterAction,
  detectCompanyConflicts,
  extractCompanyContextFromMetadata,
  extractDocumentCompanyProfile,
  fetchDaDataParty,
  isValidInn,
  mapDaDataParty,
  mapMatterType,
  mergeMetadata,
  normalizeInn,
  selectRegistryCandidate,
  type AnswerRow,
  type CompanyRegistryProfile,
} from "../../src/lib/company-registry";

const CHECKED_AT = "2026-08-16T12:00:00.000Z";

const DADATA_SUGGESTION = {
  value: 'ООО "МЕТЕОР"',
  data: {
    inn: "7701234567",
    kpp: "770101001",
    ogrn: "1157746000000",
    type: "LEGAL",
    branch_type: "MAIN",
    name: {
      full_with_opf: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "МЕТЕОР"',
      short_with_opf: 'ООО "МЕТЕОР"',
    },
    address: {
      value: "г Москва, ул Тверская, д 1",
      unrestricted_value: "101000, г Москва, ул Тверская, д 1",
    },
    okved: "62.01",
    okveds: [
      { main: true, code: "62.01", name: "Разработка компьютерного программного обеспечения" },
      { main: false, code: "63.11", name: "Обработка данных" },
    ],
    state: {
      status: "ACTIVE",
      registration_date: 1420070400000,
      actuality_date: 1755302400000,
    },
    management: { name: "Иванов Иван Иванович", post: "ГЕНЕРАЛЬНЫЙ ДИРЕКТОР" },
  },
};

function profile(): CompanyRegistryProfile {
  const mapped = mapDaDataParty(DADATA_SUGGESTION, CHECKED_AT);
  if (!mapped) throw new Error("fixture mapping failed");
  return mapped;
}

describe("PR27 — INN validation", () => {
  test("accepts exactly 10 or 12 digits after stripping spaces", () => {
    expect(isValidInn("7701234567")).toBe(true);
    expect(isValidInn("770 123 456 789")).toBe(true);
    expect(isValidInn("7701234567\u00a0")).toBe(true);
    expect(normalizeInn("77 0123 4567")).toBe("7701234567");
  });

  test("rejects other lengths and non-digits", () => {
    expect(isValidInn("770123456")).toBe(false);
    expect(isValidInn("77012345678")).toBe(false);
    expect(isValidInn("7701234567890")).toBe(false);
    expect(isValidInn("77012345AB")).toBe(false);
    expect(isValidInn(null)).toBe(false);
  });
});

describe("PR27 — provider mapping", () => {
  test("maps name, OGRN, KPP, address, OKVED and status", () => {
    const p = profile();
    expect(p.inn).toBe("7701234567");
    expect(p.name_full).toBe('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "МЕТЕОР"');
    expect(p.name_short).toBe('ООО "МЕТЕОР"');
    expect(p.ogrn).toBe("1157746000000");
    expect(p.ogrnip).toBeNull();
    expect(p.kpp).toBe("770101001");
    expect(p.legal_address).toBe("101000, г Москва, ул Тверская, д 1");
    expect(p.okved_main).toBe("62.01");
    expect(p.business_activity_name).toBe("Разработка компьютерного программного обеспечения");
    expect(p.company_status).toBe("ACTIVE");
    expect(p.registration_date).toBe("2015-01-01");
    expect(p.management_post).toBe("ГЕНЕРАЛЬНЫЙ ДИРЕКТОР");
  });

  test("provenance is truthful: dadata / fns-derived, never direct FNS", () => {
    const p = profile();
    expect(p.provider).toBe("dadata");
    expect(p.upstream_source).toBe("egrul/fns-derived");
    expect(p.upstream_source).not.toContain("direct");
    expect(p.checked_at).toBe(CHECKED_AT);
  });

  test("individual entrepreneur maps OGRN into ogrnip", () => {
    const ip = mapDaDataParty(
      { data: { inn: "770123456789", type: "INDIVIDUAL", ogrn: "315774600000000" } },
      CHECKED_AT,
    );
    expect(ip?.ogrnip).toBe("315774600000000");
    expect(ip?.ogrn).toBeNull();
  });

  test("branch ambiguity is preserved, MAIN wins when unique", () => {
    const branch = {
      ...DADATA_SUGGESTION,
      data: { ...DADATA_SUGGESTION.data, branch_type: "BRANCH", kpp: "500101001" },
    };
    expect(
      selectRegistryCandidate([DADATA_SUGGESTION, branch], "7701234567", CHECKED_AT).status,
    ).toBe("verified");

    const ambiguous = selectRegistryCandidate([branch, branch], "7701234567", CHECKED_AT);
    expect(ambiguous.status).toBe("ambiguous_candidates");
    expect(selectRegistryCandidate([], "7701234567", CHECKED_AT).status).toBe("not_found");
  });
});

describe("PR27 — provider configuration", () => {
  test("missing DADATA_API_KEY returns controlled registry_not_configured", async () => {
    let called = false;
    const result = await fetchDaDataParty({
      inn: "7701234567",
      apiKey: undefined,
      fetchImpl: (async () => {
        called = true;
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    expect(result.status).toBe("registry_not_configured");
    expect(called).toBe(false);
  });

  test("provider errors never leak body or key", async () => {
    const result = await fetchDaDataParty({
      inn: "7701234567",
      apiKey: "secret-key",
      fetchImpl: (async () => new Response("token secret-key invalid", { status: 403 })) as
        unknown as typeof fetch,
    });
    expect(result).toEqual({ status: "provider_error", reason: "provider_http_403" });
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });
});

describe("PR27 — conflict detection", () => {
  const documentProfile = extractDocumentCompanyProfile([
    { field_name: "taxpayer_name", field_value: "ООО «Метеор»" },
    { field_name: "taxpayer_inn", field_value: "7701234567" },
    { field_name: "taxpayer_kpp", field_value: "500101001" },
    { field_name: "taxpayer_legal_address", field_value: "город Москва, улица Тверская, дом 1" },
  ]);

  test("differing KPP yields a conflict", () => {
    const conflicts = detectCompanyConflicts(documentProfile, profile());
    const kpp = conflicts.find((c) => c.field === "kpp");
    expect(kpp?.document_value).toBe("500101001");
    expect(kpp?.registry_value).toBe("770101001");
    expect(kpp?.severity).toBe("medium");
  });

  test("normalized equal name/address produce no false conflict", () => {
    const conflicts = detectCompanyConflicts(documentProfile, profile());
    expect(conflicts.some((c) => c.field === "name")).toBe(false);
    expect(conflicts.some((c) => c.field === "inn")).toBe(false);
    // address differs only by "101000," prefix in registry data
    const address = conflicts.find((c) => c.field === "legal_address");
    expect(address?.severity).toBe("low");
  });

  test("identical address text produces no conflict", () => {
    const same = extractDocumentCompanyProfile([
      { field_name: "taxpayer_legal_address", field_value: "101000, г. Москва, ул. Тверская, д. 1" },
    ]);
    expect(detectCompanyConflicts(same, profile())).toHaveLength(0);
  });

  test("missing side is never a conflict", () => {
    expect(detectCompanyConflicts(extractDocumentCompanyProfile([]), profile())).toHaveLength(0);
  });
});

describe("PR27 — autofill plan", () => {
  const schemaFieldKeys = [
    "taxpayer_name",
    "taxpayer_inn",
    "taxpayer_ogrn",
    "taxpayer_kpp",
    "taxpayer_legal_address",
    "business_activity",
  ];

  test("never overwrites a manual/lawyer-confirmed answer", () => {
    const answers: AnswerRow[] = [
      {
        field_name: "taxpayer_name",
        field_value: "ООО Ручное Значение",
        value_source: "manual",
        is_verified: true,
      },
    ];
    const plan = buildAutofillPlan({ profile: profile(), answers, schemaFieldKeys });
    expect(plan.some((entry) => entry.field_name === "taxpayer_name")).toBe(false);
  });

  test("never overwrites AI-extracted values either", () => {
    const answers: AnswerRow[] = [
      { field_name: "taxpayer_kpp", field_value: "500101001", value_source: "ai_document" },
    ];
    const plan = buildAutofillPlan({ profile: profile(), answers, schemaFieldKeys });
    expect(plan.some((entry) => entry.field_name === "taxpayer_kpp")).toBe(false);
  });

  test("fills empty compatible answers and marks provenance as registry", () => {
    const answers: AnswerRow[] = [
      { field_name: "taxpayer_name", field_value: "", value_source: "manual" },
    ];
    const plan = buildAutofillPlan({ profile: profile(), answers, schemaFieldKeys });
    const names = plan.map((entry) => entry.field_name);
    expect(names).toContain("taxpayer_name");
    expect(names).toContain("taxpayer_kpp");
    expect(names).toContain("taxpayer_legal_address");
    expect(plan.every((entry) => entry.value_source === "registry")).toBe(true);
  });

  test("skips fields the intake schema does not define", () => {
    const plan = buildAutofillPlan({
      profile: profile(),
      answers: [],
      schemaFieldKeys: ["taxpayer_name", "taxpayer_inn"],
    });
    expect(plan.map((entry) => entry.field_name).sort()).toEqual([
      "taxpayer_inn",
      "taxpayer_name",
    ]);
  });

  test("refreshes a previous registry-sourced value", () => {
    const answers: AnswerRow[] = [
      { field_name: "taxpayer_kpp", field_value: "000000000", value_source: "registry" },
    ];
    const plan = buildAutofillPlan({ profile: profile(), answers, schemaFieldKeys });
    expect(plan.some((entry) => entry.field_name === "taxpayer_kpp")).toBe(true);
  });
});

describe("PR27 — matter decisions", () => {
  test("tax_* maps to tax, unknown falls back to other", () => {
    expect(mapMatterType("tax_audit_objections_extended")).toBe("tax");
    expect(mapMatterType("weird_template")).toBe("other");
    expect(mapMatterType(null)).toBe("other");
  });

  test("title is human-readable and carries no document content", () => {
    expect(
      buildMatterTitle({ companyName: 'ООО "МЕТЕОР"', templateCode: "tax_audit_objections_extended" }),
    ).toBe('ООО "МЕТЕОР" — tax_audit_objections_extended');
    expect(buildMatterTitle({ companyName: null, templateCode: "x", templateTitle: "Возражения" })).toBe(
      "Возражения",
    );
  });

  test("matter creation is idempotent across retries", () => {
    const sessionId = "session-1";
    expect(decideMatterAction({ sessionMatterId: null, existingMatters: [], sessionId })).toEqual({
      action: "create",
    });
    expect(
      decideMatterAction({ sessionMatterId: "matter-1", existingMatters: [], sessionId }),
    ).toEqual({ action: "use_existing", matter_id: "matter-1" });
    expect(
      decideMatterAction({
        sessionMatterId: null,
        existingMatters: [{ id: "matter-2", metadata: { intake_session_id: sessionId } }],
        sessionId,
      }),
    ).toEqual({ action: "use_existing", matter_id: "matter-2" });
    expect(
      decideMatterAction({
        sessionMatterId: null,
        existingMatters: [{ id: "matter-3", metadata: { intake_session_id: "other" } }],
        sessionId,
      }),
    ).toEqual({ action: "create" });
  });
});

describe("PR27 — metadata persistence", () => {
  const patch = buildCompanyMetadataPatch({
    profile: profile(),
    documentProfile: extractDocumentCompanyProfile([]),
    conflicts: [],
    status: "verified",
    inn: "7701234567",
    checkedAt: CHECKED_AT,
    provider: "dadata",
  });

  test("merge preserves unrelated metadata keys", () => {
    const merged = mergeMetadata(
      { case_intelligence: { version: 2 }, company_profile: null },
      patch,
    );
    expect((merged as any).case_intelligence.version).toBe(2);
    expect((merged as any).company_profile.inn).toBe("7701234567");
    expect((merged as any).company_registry_verification.status).toBe("verified");
  });

  test("no raw provider response or API key is persisted", () => {
    const serialized = JSON.stringify(patch);
    expect(serialized).not.toContain("suggestions");
    expect(serialized).not.toContain("Token ");
    expect(serialized).not.toContain("DADATA_API_KEY");
    expect(Object.keys(patch).sort()).toEqual([
      "company_profile",
      "company_registry_conflicts",
      "company_registry_verification",
      "document_company_profile",
    ]);
  });
});

describe("PR27 — Matter Snapshot propagation", () => {
  const baseSnapshot = {
    session_id: "session-1",
    legal_analysis_run_id: "run-42",
    conclusions: [{ id: "c1" }],
    working_strategy: { id: "strategy-1" },
    quality_gate_preview: { ok: true, reasons: [] },
  } as any;

  test("company profile is attached without losing existing fields", () => {
    const metadata = mergeMetadata(
      {},
      buildCompanyMetadataPatch({
        profile: profile(),
        documentProfile: extractDocumentCompanyProfile([]),
        conflicts: [],
        status: "verified",
        inn: "7701234567",
        checkedAt: CHECKED_AT,
        provider: "dadata",
      }),
    );

    const next = attachCompanyContextToSnapshot(baseSnapshot, { sessionMetadata: metadata });
    expect(next.legal_analysis_run_id).toBe("run-42");
    expect((next as any).working_strategy.id).toBe("strategy-1");
    expect(next.conclusions).toHaveLength(1);
    expect(next.company_profile?.inn).toBe("7701234567");
    expect(next.company_registry_verification?.provider).toBe("dadata");
    expect(next.company_registry_conflicts).toEqual([]);
  });

  test("matter metadata wins over session metadata", () => {
    const sessionMetadata = mergeMetadata({}, { company_profile: { inn: "1111111111" } });
    const matterMetadata = mergeMetadata({}, { company_profile: { inn: "2222222222" } });
    const next = attachCompanyContextToSnapshot(baseSnapshot, {
      sessionMetadata,
      matterMetadata,
    });
    expect(next.company_profile?.inn).toBe("2222222222");
  });

  test("absent company data leaves the snapshot analysis fields intact", () => {
    const next = attachCompanyContextToSnapshot(baseSnapshot, { sessionMetadata: {} });
    expect(next.company_profile).toBeNull();
    expect(next.legal_analysis_run_id).toBe("run-42");
    expect(extractCompanyContextFromMetadata(null).company_registry_conflicts).toEqual([]);
  });
});
