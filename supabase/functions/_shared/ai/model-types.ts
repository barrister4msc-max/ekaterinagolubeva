export type ModelProvider = "gemini" | "openai";

export type FallbackMode = "none" | "optional" | "required";

/** Technical capabilities only. They are not evidence of legal quality. */
export type ModelCapability = "text_generation" | "structured_json" | "long_context";

export type ModelTier = "baseline" | "standard" | "advanced";

export type CostProfile = "unknown" | "low" | "medium" | "high";

export type ModelSpec = {
  provider: ModelProvider;
  model: string;
};

export type ModelDescriptor = ModelSpec & {
  tier: ModelTier;
  capabilities: ModelCapability[];
  cost_profile: CostProfile;
  enabled: boolean;
};

export type ModelTaskType =
  | "classification"
  | "fact_extraction"
  | "ai_fill"
  | "legal_research"
  | "generation"
  | "review"
  | "challenge";

export type ModelRawStatus =
  | "success"
  | "http_error"
  | "invalid_json"
  | "timeout"
  | "cost_cap_exceeded"
  | "policy_blocked";

export type ProviderError = {
  provider: ModelProvider;
  model: string;
  status_code: number | null;
  code:
    | "timeout"
    | "rate_limited"
    | "server_error"
    | "malformed_request"
    | "unauthorized"
    | "forbidden"
    | "model_unavailable"
    | "network_error"
    | "invalid_response";
  retryable: boolean;
  /** Safe for telemetry/UI: never include a secret, prompt, OCR or provider body. */
  safe_message: string;
};

export type ProviderState = {
  registered: boolean;
  configured: boolean;
  /** Unknown is deliberately not promoted to true merely because a key exists. */
  authorized: boolean | null;
  model_available: boolean | null;
  reachable: boolean | null;
  checked_at: string | null;
};

/** Result of a level-2 provider/model availability request (no inference). */
export type ProviderModelAvailability = Pick<
  ProviderState,
  "authorized" | "model_available" | "reachable" | "checked_at"
>;

export type ModelAttemptRecord = {
  provider: ModelProvider;
  model: string;
  attempt: number;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  estimated_cost_usd: number | null;
  raw_status: ModelRawStatus;
  json_valid: boolean;
  validation_errors: string[];
  fallback_used: boolean;
};

export type ModelRunResult<T = unknown> = {
  provider: ModelProvider;
  model: string;
  task_type: ModelTaskType;
  attempt: number;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  estimated_cost_usd: number | null;
  total_estimated_cost_usd: number | null;
  raw_status: ModelRawStatus;
  json_valid: boolean;
  validation_errors: string[];
  fallback_used: boolean;
  attempt_history: ModelAttemptRecord[];
  source_document_ids: string[];
  source_quote_refs: string[];
  confidence: number | null;
  output?: T;
};

export type ModelAttempt<T = unknown> = {
  provider: ModelProvider;
  model: string;
  output?: T;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cached_input_tokens?: number | null;
  estimated_cost_usd?: number | null;
  raw_status?: ModelRawStatus;
  retryable?: boolean;
  json_valid?: boolean;
  validation_errors?: string[];
  source_document_ids?: string[];
  source_quote_refs?: string[];
  confidence?: number | null;
  provider_error?: ProviderError | null;
};

export type ModelPolicy = {
  task_type: ModelTaskType;
  allowed_models: ModelSpec[];
  primary: ModelSpec;
  fallback: ModelSpec[];
  max_attempts: number;
  timeout_ms: number;
  max_cost_per_run_usd: number | null;
  requires_explicit_cost_cap: boolean;
  fallback_mode: FallbackMode;
  required_capabilities: ModelCapability[];
  minimum_quality_tier: ModelTier;
  /** Kept separate from normal fallback: never selected by Router v1. */
  fallback_candidates: ModelSpec[];
  escalation_candidates: ModelSpec[];
  requires_human_review: boolean;
};
