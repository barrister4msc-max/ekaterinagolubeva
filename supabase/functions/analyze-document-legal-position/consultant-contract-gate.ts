export type ConsultantContractGateStatus = "verified" | "blocked_until_contract_verified";

export type ConsultantApiContractEvidence = {
  contract_id: string;
  official_document_url: string;
  api_endpoint: string;
  api_version: string;
  allowed_scopes: readonly string[];
  credential_mode: "vault_secret_ref";
  rate_limit_per_minute: number;
  retention_policy: string;
  machine_use_allowed: true;
};

export type ConsultantContractGateResult = {
  status: ConsultantContractGateStatus;
  reasons: readonly string[];
  evidence: ConsultantApiContractEvidence | null;
  network_allowed: false;
  executable: false;
};

const REQUIRED_KEYS = [
  "contract_id",
  "official_document_url",
  "api_endpoint",
  "api_version",
  "allowed_scopes",
  "credential_mode",
  "rate_limit_per_minute",
  "retention_policy",
  "machine_use_allowed",
] as const;

/**
 * Prompt 08O precondition. This is deliberately pure and offline: no endpoint
 * is inferred and no credential is accepted until contractual evidence exists.
 */
export function evaluateConsultantContractGate(value: unknown): ConsultantContractGateResult {
  const missing: string[] = [];
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  for (const key of REQUIRED_KEYS) {
    const present = key === "allowed_scopes"
      ? Array.isArray(raw[key]) && raw[key].length > 0
      : key === "rate_limit_per_minute"
        ? typeof raw[key] === "number" && Number.isFinite(raw[key]) && raw[key] > 0
        : key === "machine_use_allowed"
          ? raw[key] === true
          : typeof raw[key] === "string" && raw[key].trim().length > 0;
    if (!present) missing.push(key);
  }

  if (raw.credential_mode !== "vault_secret_ref") {
    missing.push("credential_mode:vault_secret_ref");
  }

  if (missing.length > 0) {
    return {
      status: "blocked_until_contract_verified",
      reasons: [...new Set(missing)].sort(),
      evidence: null,
      network_allowed: false,
      executable: false,
    };
  }

  const evidence: ConsultantApiContractEvidence = {
    contract_id: String(raw.contract_id).trim(),
    official_document_url: String(raw.official_document_url).trim(),
    api_endpoint: String(raw.api_endpoint).trim(),
    api_version: String(raw.api_version).trim(),
    allowed_scopes: (raw.allowed_scopes as unknown[]).map(String),
    credential_mode: "vault_secret_ref",
    rate_limit_per_minute: raw.rate_limit_per_minute as number,
    retention_policy: String(raw.retention_policy).trim(),
    machine_use_allowed: true,
  };

  return {
    status: "verified",
    reasons: [],
    evidence,
    network_allowed: false,
    executable: false,
  };
}
