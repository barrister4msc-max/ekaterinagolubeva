import { describe, expect, it } from "bun:test";
import {
  SupabaseFnsDebtamTransport,
  loadFnsDebtamFactualEvidence,
} from "./fns-company-tax-debt-evidence.ts";

const SHA = "0bf119d728c4c6876e6aebe2331bfbfe8a9c0db87682b89d18e3b3d70a8845f5";

function debtRow(overrides: Record<string, unknown> = {}) {
  return {
    inn: "7701234567",
    organization_name: "ООО Ромашка",
    tax_name: "Налог на прибыль",
    tax_debt_amount: "100.00",
    penalty_amount: "2.50",
    fine_amount: "0.00",
    total_debt_amount: "102.50",
    document_id: "doc-1",
    document_date: "2026-07-25",
    data_as_of: "2026-07-01",
    debt_row_ordinal: 1,
    dataset_id: "7707329152-debtam",
    source_url: "https://file.nalog.ru/opendata/7707329152-debtam/data-20260725-structure-20181201.zip",
    source_sha256: SHA,
    ...overrides,
  };
}

describe("FNS DEBTAM factual evidence adapter", () => {
  it("preserves all debt-category rows and exact decimal text", async () => {
    const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const transport = new SupabaseFnsDebtamTransport({
      async rpc(fn, args) {
        calls.push({ fn, args });
        return {
          data: [
            debtRow(),
            debtRow({ tax_name: "НДС", tax_debt_amount: "0.00", penalty_amount: "10.00", fine_amount: "5.00", total_debt_amount: "15.00", debt_row_ordinal: 2 }),
          ],
          error: null,
        };
      },
    });

    const evidence = await transport.lookup("7701234567", "2026-07-10");
    expect(calls).toEqual([{
      fn: "fns_open_data_get_tax_debts_text",
      args: { p_inn: "7701234567", p_as_of_date: "2026-07-10" },
    }]);
    expect(evidence).toHaveLength(2);
    expect(evidence.map((item) => item.debt_row_ordinal)).toEqual([1, 2]);
    expect(evidence[0]?.attributes.total_debt_amount).toBe("102.50");
    expect(evidence[1]?.attributes.tax_debt_amount).toBe("0.00");
    expect(evidence[0]?.evidence_id).toBe("fns_debtam:7701234567:2026-07-01:doc-1:1");
  });

  it("is explicitly point-in-time factual evidence, never legal authority/current balance", async () => {
    const transport = new SupabaseFnsDebtamTransport({
      async rpc() {
        return { data: [debtRow()], error: null };
      },
    });
    const [evidence] = await transport.lookup("7701234567");
    expect(evidence?.fact_kind).toBe("tax_debt");
    expect(evidence?.source_family).toBe("factual_official_data");
    expect(evidence?.factual_only).toBe(true);
    expect(evidence?.legal_authority).toBe(false);
    expect(evidence?.substantive_use_allowed).toBe(false);
    expect(evidence?.use_as_legal_source).toBe(false);
    expect(evidence?.current_balance_claim_allowed).toBe(false);
    expect(evidence?.attributes.observation_scope).toBe("point_in_time_not_live_balance");
  });

  it("fails closed for one malformed row instead of returning a partial observation", async () => {
    const transport = new SupabaseFnsDebtamTransport({
      async rpc() {
        return { data: [debtRow(), debtRow({ total_debt_amount: 102.5, debt_row_ordinal: 2 })], error: null };
      },
    });
    expect(await transport.lookup("7701234567")).toEqual([]);
  });

  it("does not mine narrative text for INNs", async () => {
    let calls = 0;
    const evidence = await loadFnsDebtamFactualEvidence({
      answers: { note: "ИНН 7701234567 указан только в тексте" },
      sb: {
        async rpc() {
          calls += 1;
          return { data: [debtRow()], error: null };
        },
      },
    });
    expect(calls).toBe(0);
    expect(evidence).toEqual([]);
  });

  it("rejects non-official provenance and wrong dataset identity", async () => {
    const transport = new SupabaseFnsDebtamTransport({
      async rpc() {
        return { data: [debtRow({ source_url: "https://example.com/data.zip" })], error: null };
      },
    });
    expect(await transport.lookup("7701234567")).toEqual([]);

    const wrongDataset = new SupabaseFnsDebtamTransport({
      async rpc() {
        return { data: [debtRow({ dataset_id: "7707329152-snr" })], error: null };
      },
    });
    expect(await wrongDataset.lookup("7701234567")).toEqual([]);
  });
});
