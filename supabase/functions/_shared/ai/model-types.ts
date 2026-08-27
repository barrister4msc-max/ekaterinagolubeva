export type ModelProvider = "gemini" | "openai";

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

export type ModelAttemptRecord = {
  provider: ModelProvider;
  model: string;
  attempt: number;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
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
  estimated_cost_usd: number | null;
  total_estimated_cost_usd: number | null;
  raw_status: ModelRawStatus;
  json_valid: boolean;
  validation_errors: string[];
  fallback_used: boolean;
  attempt_history: ModelAttemptRecord[];
  source_document_ids: string[];
  source_quotes: string[];
  confidence: number | null;
  output?: T;
};

export type ModelAttempt<T = unknown> = {
  provider: ModelProvider;
  model: string;
  output?: T;
  input_tokens?: number | null;
  output_tokens?: number | null;
  estimated_cost_usd?: number | null;
  raw_status?: ModelRawStatus;
  json_valid?: boolean;
  validation_errors?: string[];
  source_document_ids?: string[];
  source_quotes?: string[];
  confidence?: number | null;
};

export type ModelPolicy = {
  task_type: ModelTaskType;
  allowed_models: string[];
  primary: string;
  fallback: string[];
  max_attempts: number;
  timeout_ms: number;
  max_cost_per_run_usd: number | null;
  requires_cross_provider_fallback: boolean;
  requires_human_review: boolean;
};
