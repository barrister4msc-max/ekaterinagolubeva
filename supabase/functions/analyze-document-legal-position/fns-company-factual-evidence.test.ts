import { describe, expect, it } from "bun:test";
import {
  extractExplicitLegalEntityInns,
  loadFnsSnrFactualEvidence,
  normalizeLegalEntityInn,
  SupabaseFnsSnrTransport,
  toCompanyFactualEvidence,
} from "./fns-company-factual-evidence.ts";

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

describe("FNS SNR factual evidence", () => {
  it("accepts only explicit 10-digit legal-entity INNs", () => {
    expect(normalizeLegalEntityInn("77 0123-4567")).toBe("7701234567");
    expect(normalizeLegalEntityInn("123456789012")).toBeNull();
    expect(
      extractExplicitLegalEntityInns({
        taxpayer_inn: "7701234567",
        counterparty_inn: "7712345678",
        free_text: "ИНН 7723456789",
        random_number: "7734567890",
      }),
    ).toEqual(["7701234567", "7712345678"]);
  });

  it("maps SNR rows to factual-only evidence, never a legal source", () => {
    const evidence = toCompanyFactualEvidence(row() as any);
    expect(evidence.source_family).toBe("factual_official_data");
    expect(evidence.factual_only).toBe(true);
    expect(evidence.legal_authority).toBe(false);
    expect(evidence.substantive_use_allowed).toBe(false);
    expect(evidence.use_as_legal_source).toBe(false);
    expect(evidence.evidence_id).toBe("fns_snr:7701234567:2026-06-01");
  });

  it("uses the service-role RPC contract and returns a bounded factual record", async () => {
    const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const transport = new SupabaseFnsSnrTransport({
      async rpc(fn, args) {
        calls.push({ fn, args });
        return { data: [row()], error: null };
      },
    });

    const evidence = await transport.lookup("7701234567", "2026-06-15");
    expect(calls).toEqual([
      {
        fn: "fns_open_data_get_tax_regime",
        args: { p_inn: "7701234567", p_as_of_date: "2026-06-15" },
      },
    ]);
    expect(evidence?.attributes.regimes).toEqual(["usn"]);
  });

  it("fails closed on untrusted dataset metadata or transport errors", async () => {
    const badHost = new SupabaseFnsSnrTransport({
      async rpc() {
        return { data: [row({ source_url: "https://example.com/fake.zip" })], error: null };
      },
    });
    expect(await badHost.lookup("7701234567")).toBeNull();

    const failed = new SupabaseFnsSnrTransport({
      async rpc() {
        return { data: null, error: { message: "rpc failed" } };
      },
    });
    expect(await failed.lookup("7701234567")).toBeNull();
  });

  it("queries only INNs explicitly present in answer fields", async () => {
    const requested: string[] = [];
    const evidence = await loadFnsSnrFactualEvidence({
      answers: {
        client_inn: "7701234567",
        note: "Контрагент 7712345678",
      },
      sb: {
        async rpc(_fn, args) {
          requested.push(String(args?.p_inn));
          return { data: [row()], error: null };
        },
      },
    });
    expect(requested).toEqual(["7701234567"]);
    expect(evidence).toHaveLength(1);
  });
});
