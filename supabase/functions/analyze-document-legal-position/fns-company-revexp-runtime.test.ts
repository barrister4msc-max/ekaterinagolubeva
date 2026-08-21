import { describe, expect, it } from "bun:test";
import { loadCompanyFactualRuntimeSnapshot } from "./fns-company-factual-runtime.ts";

const SHA = "bada16ef2497084edd342c0e2f00442293ac708f28a51fb8954fa21a0941f8d8";
const revexpRow = {
  inn: "7701234567",
  organization_name: "ООО Ромашка",
  income_amount: "11623000.10",
  expense_amount: "10969000.20",
  document_id: "revexp-doc-2025",
  document_date: "2026-07-25",
  reporting_date: "2025-12-31",
  dataset_id: "7707329152-revexp",
  source_url: "https://file.nalog.ru/opendata/7707329152-revexp/data-20260725-structure-20180110.zip",
  source_sha256: SHA,
};

describe("REVEXP company factual runtime", () => {
  it("exposes financial statements in a third separate factual channel", async () => {
    const snapshot = await loadCompanyFactualRuntimeSnapshot({
      answers: { taxpayer_inn: "7701234567" },
      sb: {
        async rpc(fn) {
          if (fn === "fns_open_data_get_financial_statement_text") return { data: [revexpRow], error: null };
          return { data: null, error: { message: "not loaded" } };
        },
      },
    });
    expect(snapshot.company_factual_evidence).toEqual([]);
    expect(snapshot.company_tax_debt_evidence).toEqual([]);
    expect(snapshot.company_financial_statement_evidence).toHaveLength(1);
    expect(snapshot.company_financial_statement_evidence[0]?.fact_kind).toBe("financial_statement");
    expect(snapshot.dataset_diagnostics.revexp).toMatchObject({
      requested_count: 1,
      loaded_count: 1,
      evidence_rows: 1,
      fact_kind: "financial_statement",
      model_input_status: "not_injected",
      legal_source_status: "excluded",
    });
  });

  it("does not query any factual dataset without an explicit INN answer", async () => {
    let calls = 0;
    const snapshot = await loadCompanyFactualRuntimeSnapshot({
      answers: { note: "ИНН 7701234567 только в описании" },
      sb: { async rpc() { calls += 1; return { data: null, error: null }; } },
    });
    expect(calls).toBe(0);
    expect(snapshot.company_financial_statement_evidence).toEqual([]);
    expect(snapshot.dataset_diagnostics.revexp.evidence_rows).toBe(0);
  });
});
