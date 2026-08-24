import { describe, expect, it } from "bun:test";
import { loadCompanyFactualRuntimeSnapshot } from "./fns-company-factual-runtime.ts";

const SNR_SHA = "a0b1c63d38569e65acd2011a72e578f2b12ebd42b1c553fe352628ed480f475a";
const DEBT_SHA = "0bf119d728c4c6876e6aebe2331bfbfe8a9c0db87682b89d18e3b3d70a8845f5";
const HEADCOUNT_SHA = "265eca8b05a234ff629f57779ebbc647d07e42c7e43612b40e9ae84340de1464";

function snrRow(overrides: Record<string, unknown> = {}) {
  return {
    inn: "7701234567",
    organization_name: "ООО Ромашка",
    regimes: ["usn"],
    document_id: "snr-doc-1",
    document_date: "2026-06-25",
    data_as_of: "2026-06-01",
    dataset_id: "7707329152-snr",
    source_url: "https://file.nalog.ru/opendata/7707329152-snr/data-20260625-structure-20230425.zip",
    source_sha256: SNR_SHA,
    ...overrides,
  };
}

function debtRow(overrides: Record<string, unknown> = {}) {
  return {
    inn: "7701234567",
    organization_name: "ООО Ромашка",
    tax_name: "Налог на прибыль",
    tax_debt_amount: "100.00",
    penalty_amount: "2.50",
    fine_amount: "0.00",
    total_debt_amount: "102.50",
    document_id: "debt-doc-1",
    document_date: "2026-07-25",
    data_as_of: "2026-07-01",
    debt_row_ordinal: 1,
    dataset_id: "7707329152-debtam",
    source_url: "https://file.nalog.ru/opendata/7707329152-debtam/data-20260725-structure-20181201.zip",
    source_sha256: DEBT_SHA,
    ...overrides,
  };
}

function headcountRow(overrides: Record<string, unknown> = {}) {
  return {
    inn: "7701234567", organization_name: "ООО Ромашка", average_headcount: 0,
    document_id: "headcount-doc-1", document_date: "2026-07-25", reporting_date: "2025-12-31",
    dataset_id: "7707329152-sshr2019",
    source_url: "https://file.nalog.ru/opendata/7707329152-sshr2019/data-20260725-structure-20200408.zip",
    source_sha256: HEADCOUNT_SHA, ...overrides,
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
          return { data: null, error: null };
        },
      },
    });

    expect(calls).toBe(0);
    expect(snapshot.company_factual_evidence).toEqual([]);
    expect(snapshot.company_tax_debt_evidence).toEqual([]);
    expect(snapshot.company_average_headcount_evidence).toEqual([]);
    expect(snapshot.diagnostics).toEqual({
      explicit_legal_entity_inns: [],
      requested_count: 0,
      loaded_count: 0,
      source_types: [],
      fact_linking_status: "not_linked",
      model_input_status: "not_injected",
      legal_source_status: "excluded",
    });
    expect(snapshot.dataset_diagnostics.debtam.evidence_rows).toBe(0);
  });

  it("loads SNR and multiple DEBTAM rows into separate factual channels", async () => {
    const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const snapshot = await loadCompanyFactualRuntimeSnapshot({
      answers: { taxpayer_inn: "7701234567" },
      asOfDate: "2026-07-10",
      sb: {
        async rpc(fn, args) {
          calls.push({ fn, args });
          if (fn === "fns_open_data_get_tax_regime") return { data: [snrRow()], error: null };
          if (fn === "fns_open_data_get_tax_debts_text") {
            return {
              data: [
                debtRow(),
                debtRow({ tax_name: "НДС", tax_debt_amount: "0.00", penalty_amount: "10.00", fine_amount: "5.00", total_debt_amount: "15.00", debt_row_ordinal: 2 }),
              ],
              error: null,
            };
          }
          if (fn === "fns_open_data_get_average_headcount") return { data: [headcountRow()], error: null };
          return { data: null, error: { message: "unexpected rpc" } };
        },
      },
    });

    expect(calls.map((call) => call.fn).sort()).toEqual([
      "fns_open_data_get_average_headcount",
      "fns_open_data_get_financial_statement_text",
      "fns_open_data_get_tax_debts_text",
      "fns_open_data_get_tax_regime",
    ]);
    expect(snapshot.company_factual_evidence).toHaveLength(1);
    expect(snapshot.company_factual_evidence[0]?.fact_kind).toBe("tax_regime");
    expect(snapshot.company_tax_debt_evidence).toHaveLength(2);
    expect(snapshot.company_tax_debt_evidence.every((row) => row.fact_kind === "tax_debt")).toBe(true);
    expect(snapshot.company_tax_debt_evidence.map((row) => row.debt_row_ordinal)).toEqual([1, 2]);
    expect(snapshot.company_average_headcount_evidence).toHaveLength(1);
    expect(snapshot.company_average_headcount_evidence[0]?.attributes.average_headcount).toBe(0);
    expect(snapshot.diagnostics.loaded_count).toBe(4);
    expect(snapshot.dataset_diagnostics.snr).toMatchObject({ loaded_count: 1, evidence_rows: 1, fact_kind: "tax_regime" });
    expect(snapshot.dataset_diagnostics.debtam).toMatchObject({ loaded_count: 1, evidence_rows: 2, fact_kind: "tax_debt" });
    expect(snapshot.dataset_diagnostics.sshr2019).toMatchObject({ loaded_count: 1, evidence_rows: 1, fact_kind: "headcount" });
  });

  it("keeps the SNR channel available if DEBTAM lookup fails", async () => {
    const snapshot = await loadCompanyFactualRuntimeSnapshot({
      answers: { taxpayer_inn: "7701234567" },
      sb: {
        async rpc(fn) {
          if (fn === "fns_open_data_get_tax_regime") return { data: [snrRow()], error: null };
          return { data: null, error: { message: "debtam unavailable" } };
        },
      },
    });

    expect(snapshot.company_factual_evidence).toHaveLength(1);
    expect(snapshot.company_tax_debt_evidence).toEqual([]);
    expect(snapshot.dataset_diagnostics.snr.evidence_rows).toBe(1);
    expect(snapshot.dataset_diagnostics.debtam.evidence_rows).toBe(0);
  });

  it("keeps DEBTAM rows available if SNR lookup fails", async () => {
    const snapshot = await loadCompanyFactualRuntimeSnapshot({
      answers: { taxpayer_inn: "7701234567" },
      sb: {
        async rpc(fn) {
          if (fn === "fns_open_data_get_tax_debts_text") return { data: [debtRow()], error: null };
          return { data: null, error: { message: "snr unavailable" } };
        },
      },
    });

    expect(snapshot.company_factual_evidence).toEqual([]);
    expect(snapshot.company_tax_debt_evidence).toHaveLength(1);
    expect(snapshot.diagnostics.source_types).toEqual(["fns_open_data"]);
  });

  it("fails soft for thrown transport errors without promoting factual data", async () => {
    const snapshot = await loadCompanyFactualRuntimeSnapshot({
      answers: { taxpayer_inn: "7701234567" },
      sb: {
        async rpc() {
          throw new Error("network down");
        },
      },
    });

    expect(snapshot.company_factual_evidence).toEqual([]);
    expect(snapshot.company_tax_debt_evidence).toEqual([]);
    expect(snapshot.diagnostics.legal_source_status).toBe("excluded");
    expect(snapshot.dataset_diagnostics.debtam.model_input_status).toBe("not_injected");
    expect(snapshot.dataset_diagnostics.debtam.legal_source_status).toBe("excluded");
  });
});
