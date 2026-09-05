import { describe, expect, test } from "bun:test";
import { evaluateConsultantContractGate } from "./consultant-contract-gate.ts";

describe("Consultant API contract gate", () => {
  test("fails closed without contractual evidence", () => {
    const result = evaluateConsultantContractGate({});
    expect(result.status).toBe("blocked_until_contract_verified");
    expect(result.network_allowed).toBe(false);
    expect(result.executable).toBe(false);
    expect(result.reasons).toContain("api_endpoint");
    expect(result.reasons).toContain("machine_use_allowed");
  });

  test("rejects non-vault credential mode", () => {
    const result = evaluateConsultantContractGate({
      contract_id: "contract-1",
      official_document_url: "https://consultant.ru/terms",
      api_endpoint: "https://api.example.invalid",
      api_version: "v1",
      allowed_scopes: ["search"],
      credential_mode: "frontend_token",
      rate_limit_per_minute: 10,
      retention_policy: "contractual",
      machine_use_allowed: true,
      attestation_id: "att-1",
      attested_by: "security-review",
    });
    expect(result.status).toBe("blocked_until_contract_verified");
    expect(result.reasons).toContain("credential_mode:vault_secret_ref");
  });

  test("accepts complete evidence but remains non-executable until adapter stage", () => {
    const result = evaluateConsultantContractGate({
      contract_id: "contract-1",
      official_document_url: "https://consultant.ru/terms",
      api_endpoint: "https://api.consultant.invalid/v1",
      api_version: "v1",
      allowed_scopes: ["search", "document"],
      credential_mode: "vault_secret_ref",
      rate_limit_per_minute: 10,
      retention_policy: "contractual",
      machine_use_allowed: true,
      attestation_id: "att-1",
      attested_by: "security-review",
    });
    expect(result.status).toBe("verified");
    expect(result.evidence?.contract_id).toBe("contract-1");
    expect(result.network_allowed).toBe(false);
    expect(result.executable).toBe(false);
  });
});
