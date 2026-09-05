export type StrizhUserSessionGateStatus = "ready" | "user_session_pending_terms";
export type StrizhBrowserAction = "search" | "open" | "download";

export type StrizhUserSessionEvidence = {
  terms_attestation_id: string;
  threat_model_attestation_id: string;
  credential_lifecycle_attestation_id: string;
  encrypted_credential_ref: string;
  allowed_actions: readonly StrizhBrowserAction[];
};

export type StrizhUserSessionGateResult = {
  status: StrizhUserSessionGateStatus;
  reasons: readonly string[];
  evidence: StrizhUserSessionEvidence | null;
  browser_worker_allowed: false;
  password_exposed_to_model: false;
};

const ALLOWED_ACTIONS = new Set<StrizhBrowserAction>(["search", "open", "download"]);

/**
 * Offline Prompt 08P precondition. It does not launch a browser or accept a
 * password. User-session execution remains disabled until terms/security
 * attestations and an encrypted credential reference are supplied.
 */
export function evaluateStrizhUserSessionGate(value: unknown): StrizhUserSessionGateResult {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const reasons: string[] = [];
  for (const key of ["terms_attestation_id", "threat_model_attestation_id", "credential_lifecycle_attestation_id", "encrypted_credential_ref"]) {
    if (typeof raw[key] !== "string" || !raw[key].trim()) reasons.push(key);
  }
  const actions = Array.isArray(raw.allowed_actions) ? raw.allowed_actions : [];
  if (!actions.length || actions.some((action) => typeof action !== "string" || !ALLOWED_ACTIONS.has(action as StrizhBrowserAction))) {
    reasons.push("allowed_actions");
  }
  if (reasons.length) {
    return { status: "user_session_pending_terms", reasons: [...new Set(reasons)].sort(), evidence: null, browser_worker_allowed: false, password_exposed_to_model: false };
  }
  return {
    status: "ready",
    reasons: [],
    evidence: {
      terms_attestation_id: String(raw.terms_attestation_id).trim(),
      threat_model_attestation_id: String(raw.threat_model_attestation_id).trim(),
      credential_lifecycle_attestation_id: String(raw.credential_lifecycle_attestation_id).trim(),
      encrypted_credential_ref: String(raw.encrypted_credential_ref).trim(),
      allowed_actions: [...new Set(actions as StrizhBrowserAction[])],
    },
    browser_worker_allowed: false,
    password_exposed_to_model: false,
  };
}
