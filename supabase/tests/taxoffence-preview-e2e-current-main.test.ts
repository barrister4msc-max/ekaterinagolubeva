import { describe, expect, test } from "bun:test";
import {
  SupabaseFnsTaxOffenceTransport,
  toCompanyTaxOffenceEvidence,
} from "../functions/analyze-document-legal-position/fns-company-tax-offence-evidence.ts";

const SYNTHETIC_ROW = {
  inn: "7701234567",
  organization_name: "ООО Synthetic TAXOFFENCE E2E",
  fine_amount: "250.00",
  document_id: "preview-taxoffence-e2e-1",
  document_date: "2025-12-02",
  data_as_of: "2024-12-31",
  format_version: "4.01" as const,
  dataset_id: "7707329152-taxoffence" as const,
  source_url: "https://data.nalog.ru/opendata/7707329152-taxoffence/data-20251201-structure-20191201.zip",
  source_sha256: "1a388022e0db361dc1cc78d65b4eb6f5f08a1d1fc59a9c6d035e1e8b4b4e384b",
};

describe("TAXOFFENCE Preview E2E gate", () => {
  test("synthetic RPC row remains factual-only and point-in-time", () => {
    const evidence = toCompanyTaxOffenceEvidence(SYNTHETIC_ROW);
    expect(evidence.evidence_id).toBe("fns_taxoffence:7701234567:2024-12-31:preview-taxoffence-e2e-1");
    expect(evidence.source_family).toBe("factual_official_data");
    expect(evidence.factual_only).toBe(true);
    expect(evidence.legal_authority).toBe(false);
    expect(evidence.substantive_use_allowed).toBe(false);
    expect(evidence.use_as_legal_source).toBe(false);
    expect(evidence.current_liability_claim_allowed).toBe(false);
    expect(evidence.attributes.observation_scope).toBe("published_factual_record_not_current_liability");
  });
  test("lookup uses explicit INN and preserves service response without model promotion", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const transport = new SupabaseFnsTaxOffenceTransport({
      async rpc(fn, args) { calls.push({ fn, args: args ?? {} }); return { data: [SYNTHETIC_ROW], error: null }; },
    });
    const evidence = await transport.lookup("7701234567", "2024-12-31");
    expect(calls).toEqual([{ fn: "fns_open_data_get_tax_offences", args: { p_inn: "7701234567", p_as_of_date: "2024-12-31" } }]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.subject_key).toEqual({ inn: "7701234567" });
    expect(evidence[0]?.substantive_use_allowed).toBe(false);
    expect(evidence[0]?.current_liability_claim_allowed).toBe(false);
  });
  test("fails closed for non-explicit or invalid INN input", async () => {
    let calls = 0;
    const transport = new SupabaseFnsTaxOffenceTransport({ async rpc() { calls += 1; return { data: [SYNTHETIC_ROW], error: null }; } });
    expect(await transport.lookup("ИНН 7701234567")).toEqual([]);
    expect(await transport.lookup("770123")).toEqual([]);
    expect(calls).toBe(0);
  });
});