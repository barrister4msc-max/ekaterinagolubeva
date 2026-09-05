import { describe, expect, test } from "bun:test";
import { evaluateStrizhUserSessionGate } from "./strizh-user-session-gate.ts";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function attestation(kind: "terms" | "threat_model" | "credential_lifecycle") {
  return {
    attestation_version: "08P-v1",
    attestation_id: `${kind}-attestation-1`,
    kind,
    status: "approved",
    issuer: "kati_security_registry",
    verification_method: "trusted_registry",
    receipt: `${kind}-receipt-1`,
    verified_at: "2026-09-05T11:00:00.000Z",
    expires_at: "2026-09-06T11:00:00.000Z",
  };
}

function approvedInput() {
  return {
    attestations: [attestation("terms"), attestation("threat_model"), attestation("credential_lifecycle")],
    encrypted_credential_ref: "secret://strizh/user-session/session-1",
    allowed_actions: ["search", "open", "download"],
  };
}

describe("Strizh user-session gate", () => {
  test("fails closed until trusted attestation evidence exists", () => {
    const result = evaluateStrizhUserSessionGate({}, NOW);
    expect(result.status).toBe("user_session_pending_terms");
    expect(result.reasons).toContain("attestations");
    expect(result.reasons).toContain("encrypted_credential_ref");
    expect(result.browser_worker_allowed).toBe(false);
    expect(result.password_exposed_to_model).toBe(false);
  });

  test("does not treat caller-provided attestation ids as approval", () => {
    const result = evaluateStrizhUserSessionGate({
      terms_attestation_id: "terms-1",
      threat_model_attestation_id: "threat-1",
      credential_lifecycle_attestation_id: "cred-1",
      encrypted_credential_ref: "vault://strizh/session",
      allowed_actions: ["search", "open", "download"],
    }, NOW);
    expect(result.status).toBe("user_session_pending_terms");
    expect(result.reasons).toContain("attestations");
    expect(result.reasons).toContain("encrypted_credential_ref");
  });

  test("rejects untrusted, expired, and duplicate attestations", () => {
    const input = approvedInput();
    input.attestations[0] = { ...attestation("terms"), issuer: "caller" };
    input.attestations[1] = { ...attestation("threat_model"), expires_at: "2026-09-05T11:59:00.000Z" };
    input.attestations.push(attestation("terms"));
    const result = evaluateStrizhUserSessionGate(input, NOW);
    expect(result.status).toBe("user_session_pending_terms");
    expect(result.reasons).toContain("attestations");
  });

  test("rejects an unscoped credential reference", () => {
    const input = approvedInput();
    input.encrypted_credential_ref = "https://example.test/session-secret";
    const result = evaluateStrizhUserSessionGate(input, NOW);
    expect(result.status).toBe("user_session_pending_terms");
    expect(result.reasons).toContain("encrypted_credential_ref");
  });

  test("accepts trusted attestations but remains non-executable", () => {
    const result = evaluateStrizhUserSessionGate(approvedInput(), NOW);
    expect(result.status).toBe("ready");
    expect(result.evidence?.attestations).toHaveLength(3);
    expect(result.evidence?.encrypted_credential_ref).toBe("secret://strizh/user-session/session-1");
    expect(result.browser_worker_allowed).toBe(false);
    expect(result.password_exposed_to_model).toBe(false);
  });

  test("rejects unsupported browser actions", () => {
    const input = approvedInput();
    input.allowed_actions = ["search", "solve_captcha"];
    const result = evaluateStrizhUserSessionGate(input, NOW);
    expect(result.status).toBe("user_session_pending_terms");
    expect(result.reasons).toContain("allowed_actions");
  });
});
