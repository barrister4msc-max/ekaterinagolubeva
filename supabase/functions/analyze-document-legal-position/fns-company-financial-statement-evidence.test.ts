import { describe, expect, it } from "bun:test";
import { SupabaseFnsRevexpTransport, loadFnsRevexpFactualEvidence } from "./fns-company-financial-statement-evidence.ts";

const SHA = "bada16ef2497084edd342c0e2f00442293ac708f28a51fb8954fa21a0941f8d8";
const row = (overrides: Record<string, unknown> = {}) => ({
  inn: "7701234567", organization_name: "ООО Ромашка", income_amount: "11623000.10", expense_amount: "10969000.20",
  document_id: "revexp-doc-2025", document_date: "2026-07-25", reporting_date: "2025-12-31",
  dataset_id: "7707329152-revexp",
  source_url: "https://file.nalog.ru/opendata/7707329152-revexp/data-20260725-structure-20180110.zip",
  source_sha256: SHA, ...overrides,
});

describe("FNS REVEXP factual evidence adapter", () => {
  it("uses the text RPC and preserves exact annual statement semantics", async () => {
    const calls: string[] = [];
    const transport = new SupabaseFnsRevexpTransport({ async rpc(fn) { calls.push(fn); return { data: [row()], error: null }; } });
    const evidence = await transport.lookup("7701234567", "2025-12-31");
    expect(calls).toEqual(["fns_open_data_get_financial_statement_text"]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      evidence_id: "fns_revexp:7701234567:2025-12-31:revexp-doc-2025",
      fact_kind: "financial_statement",
      data_as_of: "2025-12-31",
      factual_only: true,
      legal_authority: false,
      substantive_use_allowed: false,
      use_as_legal_source: false,
      turnover_claim_allowed: false,
      taxable_income_claim_allowed: false,
      current_financial_position_claim_allowed: false,
    });
    expect(evidence[0]?.attributes).toEqual({
      organization_name: "ООО Ромашка",
      income_amount: "11623000.10",
      expense_amount: "10969000.20",
      reporting_scope: "annual_accounting_statement",
    });
  });

  it("fails closed on malformed provenance or numeric shape", async () => {
    for (const bad of [row({ source_url: "https://example.com/x" }), row({ source_sha256: "bad" }), row({ income_amount: "1.001" }), row({ reporting_date: "31.12.2025" })]) {
      const transport = new SupabaseFnsRevexpTransport({ async rpc() { return { data: [bad], error: null }; } });
      expect(await transport.lookup("7701234567")).toEqual([]);
    }
  });

  it("does not mine narrative text for INN", async () => {
    let calls = 0;
    const evidence = await loadFnsRevexpFactualEvidence({
      answers: { note: "ИНН 7701234567 только в свободном тексте" },
      sb: { async rpc() { calls += 1; return { data: [row()], error: null }; } },
    });
    expect(calls).toBe(0);
    expect(evidence).toEqual([]);
  });
});
