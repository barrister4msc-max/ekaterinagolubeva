import { describe, expect, test } from "bun:test";
import {
  SupabaseFnsSshr2019Transport,
  loadFnsSshr2019FactualEvidence,
} from "./fns-company-headcount-evidence.ts";

const SHA = "265eca8b05a234ff629f57779ebbc647d07e42c7e43612b40e9ae84340de1464";

function row(overrides: Record<string, unknown> = {}) {
  return {
    inn: "7701234567",
    organization_name: "ООО Ромашка",
    average_headcount: 0,
    document_id: "doc-1",
    document_date: "2026-07-25",
    reporting_date: "2025-12-31",
    dataset_id: "7707329152-sshr2019",
    source_url: "https://file.nalog.ru/opendata/7707329152-sshr2019/data-20260725-structure-20200408.zip",
    source_sha256: SHA,
    ...overrides,
  };
}

describe("SSHR2019 factual evidence adapter", () => {
  test("preserves zero average headcount and factual-only safety flags", async () => {
    const transport = new SupabaseFnsSshr2019Transport({
      async rpc(fn, args) {
        expect(fn).toBe("fns_open_data_get_average_headcount");
        expect(args).toEqual({ p_inn: "7701234567", p_as_of_date: "2025-12-31" });
        return { data: [row()], error: null };
      },
    });
    const evidence = await transport.lookup("7701234567", "2025-12-31");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      evidence_id: "fns_sshr2019:7701234567:2025-12-31:doc-1",
      fact_kind: "headcount",
      attributes: { average_headcount: 0, reporting_scope: "annual_average_headcount" },
      factual_only: true,
      legal_authority: false,
      substantive_use_allowed: false,
      use_as_legal_source: false,
      current_employee_count_claim_allowed: false,
      fte_claim_allowed: false,
      payroll_claim_allowed: false,
    });
  });

  test("fails closed on malformed RPC rows", async () => {
    for (const bad of [
      row({ average_headcount: -1 }),
      row({ average_headcount: "1.5" }),
      row({ inn: "123" }),
      row({ reporting_date: "31.12.2025" }),
      row({ dataset_id: "other" }),
      row({ source_url: "https://example.com/file.zip" }),
    ]) {
      const transport = new SupabaseFnsSshr2019Transport({ async rpc() { return { data: [bad], error: null }; } });
      expect(await transport.lookup("7701234567")).toEqual([]);
    }
  });

  test("uses explicit structured INN fields only", async () => {
    let calls = 0;
    const evidence = await loadFnsSshr2019FactualEvidence({
      answers: { note: "ИНН 7701234567 only in narrative" },
      sb: { async rpc() { calls += 1; return { data: [row()], error: null }; } },
    });
    expect(calls).toBe(0);
    expect(evidence).toEqual([]);
  });

  test("returns empty on RPC error", async () => {
    const transport = new SupabaseFnsSshr2019Transport({ async rpc() { return { data: null, error: { message: "unavailable" } }; } });
    expect(await transport.lookup("7701234567")).toEqual([]);
  });
});
