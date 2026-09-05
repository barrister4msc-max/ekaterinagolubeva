import { describe, expect, test } from "bun:test";
import { evaluateStrizhUserSessionGate } from "./strizh-user-session-gate.ts";

describe("Strizh user-session gate", () => {
  test("fails closed until terms and security attestations exist", () => {
    const result = evaluateStrizhUserSessionGate({});
    expect(result.status).toBe("user_session_pending_terms");
    expect(result.reasons).toContain("terms_attestation_id");
    expect(result.reasons).toContain("threat_model_attestation_id");
    expect(result.browser_worker_allowed).toBe(false);
    expect(result.password_exposed_to_model).toBe(false);
  });

  test("rejects unsupported browser actions", () => {
    const result = evaluateStrizhUserSessionGate({
      terms_attestation_id: "terms-1",
      threat_model_attestation_id: "threat-1",
      credential_lifecycle_attestation_id: "cred-1",
      encrypted_credential_ref: "vault://strizh/session",
      allowed_actions: ["search", "solve_captcha"],
    });
    expect(result.status).toBe("user_session_pending_terms");
    expect(result.reasons).toContain("allowed_actions");
  });

  test("accepts attestations but remains non-executable", () => {
    const result = evaluateStrizhUserSessionGate({
      terms_attestation_id: "terms-1",
      threat_model_attestation_id: "threat-1",
      credential_lifecycle_attestation_id: "cred-1",
      encrypted_credential_ref: "vault://strizh/session",
      allowed_actions: ["search", "open", "download"],
    });
    expect(result.status).toBe("ready");
    expect(result.evidence?.encrypted_credential_ref).toBe("vault://strizh/session");
    expect(result.browser_worker_allowed).toBe(false);
    expect(result.password_exposed_to_model).toBe(false);
  });
});
