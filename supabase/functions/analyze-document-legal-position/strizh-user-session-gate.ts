export type StrizhUserSessionGateStatus = "ready" | "user_session_pending_terms";
export type StrizhBrowserAction = "search" | "open" | "download";
export type StrizhAttestationKind = "terms" | "threat_model" | "credential_lifecycle";

export type StrizhTrustedAttestation = {
  attestation_version: "08P-v1";
  attestation_id: string;
  kind: StrizhAttestationKind;
  status: "approved";
  issuer: "kati_security_registry";
  verification_method: "trusted_registry";
  receipt: string;
  verified_at: string;
  expires_at: string;
};

export type StrizhUserSessionEvidence = {
  attestations: readonly StrizhTrustedAttestation[];
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
const ATTESTATION_KINDS: readonly StrizhAttestationKind[] = ["terms", "threat_model", "credential_lifecycle"];
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const SAFE_CREDENTIAL_REF = /^secret:\/\/strizh\/user-session\/[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTrustedAttestation(
  value: unknown,
  kind: StrizhAttestationKind,
  nowMs: number,
): StrizhTrustedAttestation | null {
  if (!isRecord(value)) return null;
  const id = typeof value.attestation_id === "string" ? value.attestation_id.trim() : "";
  const receipt = typeof value.receipt === "string" ? value.receipt.trim() : "";
  const verifiedAt = typeof value.verified_at === "string" ? Date.parse(value.verified_at) : Number.NaN;
  const expiresAt = typeof value.expires_at === "string" ? Date.parse(value.expires_at) : Number.NaN;
  if (
    value.attestation_version !== "08P-v1" ||
    value.kind !== kind ||
    value.status !== "approved" ||
    value.issuer !== "kati_security_registry" ||
    value.verification_method !== "trusted_registry" ||
    !SAFE_IDENTIFIER.test(id) ||
    !SAFE_IDENTIFIER.test(receipt) ||
    !Number.isFinite(verifiedAt) ||
    !Number.isFinite(expiresAt) ||
    verifiedAt > nowMs ||
    expiresAt <= nowMs
  ) return null;
  return {
    attestation_version: "08P-v1",
    attestation_id: id,
    kind,
    status: "approved",
    issuer: "kati_security_registry",
    verification_method: "trusted_registry",
    receipt,
    verified_at: new Date(verifiedAt).toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
  };
}

/**
 * Offline Prompt 08P precondition. It does not launch a browser or accept a
 * password. Only structured, approved receipts from the trusted attestation
 * registry and a scoped secret reference can produce a neutral "ready" result;
 * execution remains disabled until a separately approved adapter stage.
 */
export function evaluateStrizhUserSessionGate(
  value: unknown,
  now: Date = new Date(),
): StrizhUserSessionGateResult {
  const raw = isRecord(value) ? value : {};
  const reasons: string[] = [];
  const nowMs = now.getTime();
  const rawAttestations = Array.isArray(raw.attestations) ? raw.attestations : [];
  const attestations: StrizhTrustedAttestation[] = [];

  for (const kind of ATTESTATION_KINDS) {
    const matches = rawAttestations.filter((item) => isRecord(item) && item.kind === kind);
    if (matches.length !== 1) {
      reasons.push("attestations");
      continue;
    }
    const parsed = parseTrustedAttestation(matches[0], kind, nowMs);
    if (!parsed) reasons.push("attestations");
    else attestations.push(parsed);
  }

  const credentialRef = typeof raw.encrypted_credential_ref === "string"
    ? raw.encrypted_credential_ref.trim()
    : "";
  if (!SAFE_CREDENTIAL_REF.test(credentialRef)) reasons.push("encrypted_credential_ref");

  const actions = Array.isArray(raw.allowed_actions) ? raw.allowed_actions : [];
  if (!actions.length || actions.some((action) => typeof action !== "string" || !ALLOWED_ACTIONS.has(action as StrizhBrowserAction))) {
    reasons.push("allowed_actions");
  }

  if (reasons.length || attestations.length !== ATTESTATION_KINDS.length) {
    return {
      status: "user_session_pending_terms",
      reasons: [...new Set(reasons)].sort(),
      evidence: null,
      browser_worker_allowed: false,
      password_exposed_to_model: false,
    };
  }

  return {
    status: "ready",
    reasons: [],
    evidence: {
      attestations,
      encrypted_credential_ref: credentialRef,
      allowed_actions: [...new Set(actions as StrizhBrowserAction[])],
    },
    browser_worker_allowed: false,
    password_exposed_to_model: false,
  };
}
