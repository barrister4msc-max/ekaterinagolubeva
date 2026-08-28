import type { ModelEligibility } from "./model-registry.ts";
import type {
  ModelAttempt,
  ModelRawStatus,
  ModelRunResult,
  ModelSpec,
  ModelTaskType,
} from "./model-types.ts";

/**
 * Shadow execution is comparison-only. It receives an already accepted primary
 * result and never exposes a method to mutate it or any accepted product state.
 */
export type ShadowConfig = {
  enabled: boolean;
  /** A value in [0, 1). Full-traffic shadowing is deliberately rejected. */
  sample_rate: number;
  timeout_ms: number;
  budget: {
    budget_day: string;
    budget_scope: string;
    daily_cap_usd: number;
    per_run_cap_usd: number;
    /** Reserved atomically before execution. Unknown cost fails closed. */
    reserved_cost_usd: number | null;
  };
};

export type ShadowSkipReason =
  | "feature_disabled"
  | "not_sampled"
  | "candidate_ineligible"
  | "cost_unknown"
  | "per_run_cap_exceeded"
  | "daily_cap_exceeded"
  | "budget_store_unavailable"
  | "invalid_shadow_config";

export type SourceRefFidelity = "not_evaluated" | "pass" | "fail";

/** Summary-only: no prompt, OCR, output body, provider body, error body, or secret. */
export type ShadowValidationSummary = {
  schema_valid: boolean | null;
  semantic_valid: boolean | null;
  source_ref_fidelity: SourceRefFidelity;
  /** Stable safe codes, never reviewer prose or model output. */
  reviewer_finding_codes: readonly string[];
};

export type ShadowRunTelemetry = {
  operation_run_id: string;
  shadow_run_id: string;
  task_type: ModelTaskType;
  provider: ModelSpec["provider"];
  model: string;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cost_known: boolean;
  estimated_cost_usd: number | null;
  raw_status: ModelRawStatus;
  json_valid: boolean;
  schema_valid: boolean | null;
  semantic_valid: boolean | null;
  source_ref_fidelity: SourceRefFidelity;
  reviewer_finding_codes: string[];
  reviewer_findings_count: number;
  /** True only when the adapter result identifies the requested candidate. */
  candidate_identity_verified: boolean | null;
};

export type ShadowBudgetReservation = {
  shadow_run_id: string;
  budget_day: string;
  budget_scope: string;
  reserved_cost_usd: number;
  daily_cap_usd: number;
  per_run_cap_usd: number;
};

/**
 * Implementations must reserve against shared durable state atomically. A caller
 * cannot substitute a stale local daily-spend number for this gate.
 */
export type ShadowStore = {
  reserveBudget(input: ShadowBudgetReservation): Promise<{ reserved: boolean }>;
  persistTelemetry(telemetry: ShadowRunTelemetry): Promise<void>;
};

export type ShadowHarnessResult<T> = {
  /** Always the pre-existing primary result; a shadow can never replace it. */
  accepted_result: ModelRunResult<T>;
  shadow_run: ShadowRunTelemetry | null;
  shadow_telemetry_persisted: boolean;
  skipped_reason: ShadowSkipReason | null;
};

export type ShadowHarnessRequest<T> = {
  operation_run_id: string;
  task_type: ModelTaskType;
  /** The already accepted primary result. The harness neither computes nor mutates it. */
  primary_result: ModelRunResult<T>;
  candidate: ModelSpec;
  /** Evidence created by P1-A registry/capability/availability/approval gates. */
  candidate_eligibility: ModelEligibility;
  /** Stable caller-supplied sample bucket in [0, 1); never random full-traffic sampling. */
  sampling_bucket: number;
  config: ShadowConfig;
  store: ShadowStore;
  run_candidate: (input: { candidate: ModelSpec; signal: AbortSignal }) => Promise<ModelAttempt<T>>;
  validate?: (output: T) => ShadowValidationSummary;
  create_shadow_run_id?: () => string;
  now?: () => number;
};

const EMPTY_VALIDATION: ShadowValidationSummary = {
  schema_valid: null,
  semantic_valid: null,
  source_ref_fidelity: "not_evaluated",
  reviewer_finding_codes: [],
};

/**
 * Runs an eligible candidate after the primary result is accepted. All failures,
 * budget denials, and telemetry failures are isolated from the primary path.
 */
export async function runShadowHarness<T>(
  request: ShadowHarnessRequest<T>,
): Promise<ShadowHarnessResult<T>> {
  const skipped = (reason: ShadowSkipReason): ShadowHarnessResult<T> => ({
    accepted_result: request.primary_result,
    shadow_run: null,
    shadow_telemetry_persisted: false,
    skipped_reason: reason,
  });

  const gate = preflight(request);
  if (gate) return skipped(gate);

  const shadowRunId = (request.create_shadow_run_id ?? defaultShadowRunId)();
  const reservation = request.config.budget.reserved_cost_usd as number;
  try {
    const result = await request.store.reserveBudget({
      shadow_run_id: shadowRunId,
      budget_day: request.config.budget.budget_day,
      budget_scope: request.config.budget.budget_scope,
      reserved_cost_usd: reservation,
      daily_cap_usd: request.config.budget.daily_cap_usd,
      per_run_cap_usd: request.config.budget.per_run_cap_usd,
    });
    if (!result.reserved) return skipped("daily_cap_exceeded");
  } catch {
    return skipped("budget_store_unavailable");
  }

  const now = request.now ?? Date.now;
  const startedAt = now();
  const controller = new AbortController();
  let timedOut = false;
  let telemetry: ShadowRunTelemetry;

  try {
    const attempt = await withTimeout(
      request.run_candidate({ candidate: request.candidate, signal: controller.signal }),
      request.config.timeout_ms,
      () => {
        timedOut = true;
        controller.abort();
      },
    );
    telemetry = toTelemetry({
      attempt,
      candidate: request.candidate,
      operationRunId: request.operation_run_id,
      taskType: request.task_type,
      shadowRunId,
      latencyMs: now() - startedAt,
      validation: validationFor(attempt, request.candidate, request.validate),
    });
  } catch {
    telemetry = failedTelemetry({
      candidate: request.candidate,
      operationRunId: request.operation_run_id,
      taskType: request.task_type,
      shadowRunId,
      latencyMs: now() - startedAt,
      rawStatus: timedOut ? "timeout" : "http_error",
    });
  }

  return {
    accepted_result: request.primary_result,
    shadow_run: telemetry,
    shadow_telemetry_persisted: await persistSafely(request.store, telemetry),
    skipped_reason: null,
  };
}

function preflight<T>(request: ShadowHarnessRequest<T>): ShadowSkipReason | null {
  const { config } = request;
  if (!config.enabled) return "feature_disabled";
  if (!isValidConfig(config) || !isSampleBucket(request.sampling_bucket)) return "invalid_shadow_config";
  if (request.sampling_bucket >= config.sample_rate) return "not_sampled";
  if (!request.candidate_eligibility.eligible) return "candidate_ineligible";

  const reserved = config.budget.reserved_cost_usd;
  if (reserved === null || !Number.isFinite(reserved) || reserved < 0) return "cost_unknown";
  if (reserved > config.budget.per_run_cap_usd) return "per_run_cap_exceeded";
  return null;
}

function isValidConfig(config: ShadowConfig): boolean {
  const { budget } = config;
  return Number.isFinite(config.sample_rate) && config.sample_rate >= 0 && config.sample_rate < 1 &&
    Number.isFinite(config.timeout_ms) && config.timeout_ms > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(budget.budget_day) &&
    budget.budget_scope.trim().length > 0 && budget.budget_scope.length <= 128 &&
    Number.isFinite(budget.daily_cap_usd) && budget.daily_cap_usd >= 0 &&
    Number.isFinite(budget.per_run_cap_usd) && budget.per_run_cap_usd >= 0;
}

function isSampleBucket(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 1;
}

function validationFor<T>(
  attempt: ModelAttempt<T>,
  candidate: ModelSpec,
  validate: ShadowHarnessRequest<T>["validate"],
): ShadowValidationSummary {
  const reportedSuccess = attempt.raw_status === undefined || attempt.raw_status === "success";
  const identityMatches = attempt.provider === candidate.provider && attempt.model === candidate.model;
  if (attempt.json_valid !== true || attempt.output === undefined || !reportedSuccess || !identityMatches || !validate) {
    return EMPTY_VALIDATION;
  }
  try {
    const validation = validate(attempt.output);
    return {
      schema_valid: validation.schema_valid,
      semantic_valid: validation.semantic_valid,
      source_ref_fidelity: validation.source_ref_fidelity,
      reviewer_finding_codes: safeFindingCodes(validation.reviewer_finding_codes),
    };
  } catch {
    return { ...EMPTY_VALIDATION, semantic_valid: false };
  }
}

function toTelemetry<T>(input: {
  attempt: ModelAttempt<T>;
  candidate: ModelSpec;
  operationRunId: string;
  taskType: ModelTaskType;
  shadowRunId: string;
  latencyMs: number;
  validation: ShadowValidationSummary;
}): ShadowRunTelemetry {
  const hasOutput = input.attempt.output !== undefined;
  const reportedSuccess = input.attempt.raw_status === undefined || input.attempt.raw_status === "success";
  const candidateIdentityVerified = input.attempt.provider === input.candidate.provider &&
    input.attempt.model === input.candidate.model;
  const jsonValid = input.attempt.json_valid === true && hasOutput && reportedSuccess && candidateIdentityVerified;
  const estimatedCost = input.attempt.estimated_cost_usd ?? null;
  const findingCodes = safeFindingCodes([
    ...input.validation.reviewer_finding_codes,
    ...(candidateIdentityVerified ? [] : ["candidate_identity_mismatch"]),
  ]);
  return {
    operation_run_id: input.operationRunId,
    shadow_run_id: input.shadowRunId,
    task_type: input.taskType,
    provider: input.attempt.provider,
    model: input.attempt.model,
    latency_ms: input.latencyMs,
    input_tokens: input.attempt.input_tokens ?? null,
    output_tokens: input.attempt.output_tokens ?? null,
    cached_input_tokens: input.attempt.cached_input_tokens ?? null,
    cost_known: estimatedCost !== null,
    estimated_cost_usd: estimatedCost,
    raw_status: jsonValid ? "success" : input.attempt.raw_status ?? "invalid_json",
    json_valid: jsonValid,
    schema_valid: input.validation.schema_valid,
    semantic_valid: input.validation.semantic_valid,
    source_ref_fidelity: input.validation.source_ref_fidelity,
    reviewer_finding_codes: findingCodes,
    reviewer_findings_count: findingCodes.length,
    candidate_identity_verified: candidateIdentityVerified,
  };
}

function failedTelemetry(input: {
  candidate: ModelSpec;
  operationRunId: string;
  taskType: ModelTaskType;
  shadowRunId: string;
  latencyMs: number;
  rawStatus: "timeout" | "http_error";
}): ShadowRunTelemetry {
  return {
    operation_run_id: input.operationRunId,
    shadow_run_id: input.shadowRunId,
    task_type: input.taskType,
    provider: input.candidate.provider,
    model: input.candidate.model,
    latency_ms: input.latencyMs,
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
    cost_known: false,
    estimated_cost_usd: null,
    raw_status: input.rawStatus,
    json_valid: false,
    schema_valid: null,
    semantic_valid: null,
    source_ref_fidelity: "not_evaluated",
    reviewer_finding_codes: [],
    reviewer_findings_count: 0,
    candidate_identity_verified: null,
  };
}

function safeFindingCodes(codes: readonly string[]): string[] {
  const safe = new Set<string>();
  for (const code of codes) {
    if (safe.size >= 20) break;
    if (/^[a-z0-9][a-z0-9_:-]{0,63}$/.test(code)) safe.add(code);
  }
  return [...safe];
}

async function persistSafely(store: ShadowStore, telemetry: ShadowRunTelemetry): Promise<boolean> {
  try {
    await store.persistTelemetry(telemetry);
    return true;
  } catch {
    return false;
  }
}

function defaultShadowRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `shadow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error("shadow timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
