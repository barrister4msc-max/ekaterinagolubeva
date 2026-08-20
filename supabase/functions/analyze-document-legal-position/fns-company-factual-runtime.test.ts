import { describe, expect, it } from "bun:test";
import { loadCompanyFactualRuntimeSnapshot } from "./fns-company-factual-runtime.ts";

const SHA = "a0b1c63d38569e65acd2011a72e578f2b12ebd42b1c553fe352628ed480f475a";

function row(overrides: Record<string, unknown> = {}) {
  return {
    inn: "7701234567",
    organization_name: "ООО Ромашка",
    regimes: ["usn"],
    document_id: "doc-1",
    document_date: "2026-06-25",
    data_as_of: "2026-06-01",
    dataset_id: "7707329152-snr",
    source_url: "https://file.nalog.ru/opendata/7707329152-snr/data-20260625-structure-20230425.zip",
    source_sha256: SHA,
    ...overrides,
  };
}

describe("Company factual runtime boundary", () => {
  it("does not query FNS when no explicit INN answer field exists", async () => {
    let calls = 0;
    const snapshot = await loadCompanyFactualRuntimeSnapshot({
      answers: { note: "ИНН 7701234567 упомянут только в свободном тексте" },
      sb: {
        async rpc() {
          calls += 1;
          return { data: [row()], error: null };
        },
      },
    });

    expect(calls).toBe(0);
    expect(snapshot.company_factual_evidence).toEqual([]);
    expect(snapshot.diagnostics).toEqual({
      explicit_legal_entity_inns: [],
      requested_count: 0,
      loaded_count: 0,
      source_types: [],
      fact_linking_status: "not_linked",
      model_input_status: "not_injected",
      legal_source_status: "excluded",
    });
  });

  it("loads bounded factual evidence for explicit legal-entity INN answers", async () => {
    const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const snapshot = await loadCompanyFactualRuntimeSnapshot({
      answers: { taxpayer_inn: "7701234567" },
      asOfDate: "2026-06-15",
      sb: {
        async rpc(fn, args) {
          calls.push({ fn, args });
          return { data: [row()], error: null };
        },
      },
    });

    expect(calls).toEqual([
      {
        fn: "fns_open_data_get_tax_regime",
        args: { p_inn: "7701234567", p_as_of_date: "2026-06-15" },
      },
    ]);
    expect(snapshot.company_factual_evidence).toHaveLength(1);
    expect(snapshot.company_factual_evidence[0]?.source_family).toBe("factual_official_data");
    expect(snapshot.company_factual_evidence[0]?.factual_only).toBe(true);
    expect(snapshot.company_factual_evidence[0]?.legal_authority).toBe(false);
    expect(snapshot.company_factual_evidence[0]?.substantive_use_allowed).toBe(false);
    expect(snapshot.company_factual_evidence[0]?.use_as_legal_source).toBe(false);
    expect(snapshot.diagnostics).toEqual({
      explicit_legal_entity_inns: ["7701234567"],
      requested_count: 1,
      loaded_count: 1,
      source_types: ["fns_open_data"],
      fact_linking_status: "not_linked",
      model_input_status: "not_injected",
      legal_source_status: "excluded",
    });
  });

  it("fails soft when the FNS transport returns an error", async () => {
    const snapshot = await loadCompanyFactualRuntimeSnapshot({
      answers: { taxpayer_inn: "7701234567" },
      sb: {
        async rpc() {
          return { data: null, error: { message: "unavailable" } };
        },
      },
    });

    expect(snapshot.company_factual_evidence).toEqual([]);
    expect(snapshot.diagnostics.requested_count).toBe(1);
    expect(snapshot.diagnostics.loaded_count).toBe(0);
    expect(snapshot.diagnostics.source_types).toEqual([]);
    expect(snapshot.diagnostics.fact_linking_status).toBe("not_linked");
    expect(snapshot.diagnostics.model_input_status).toBe("not_injected");
    expect(snapshot.diagnostics.legal_source_status).toBe("excluded");
  });

  it("fails soft when the transport throws instead of returning an error", async () => {
    const snapshot = await loadCompanyFactualRuntimeSnapshot({
      answers: { taxpayer_inn: "7701234567" },
      sb: {
        async rpc() {
          throw new Error("network down");
        },
      },
    });

    expect(snapshot.company_factual_evidence).toEqual([]);
    expect(snapshot.diagnostics).toEqual({
      explicit_legal_entity_inns: ["7701234567"],
      requested_count: 1,
      loaded_count: 0,
      source_types: [],
      fact_linking_status: "not_linked",
      model_input_status: "not_injected",
      legal_source_status: "excluded",
    });
  });
});
