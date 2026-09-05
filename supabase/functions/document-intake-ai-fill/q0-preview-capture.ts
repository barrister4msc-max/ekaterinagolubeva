import { Q0_BENCHMARK_VERSION } from "./q0-benchmark.ts";

/**
 * Offline admission record for a single controlled Q0 capture. This is not a
 * transport, does not invoke AI-fill and cannot authorize a Production run.
 */
export const Q0_PREVIEW_CAPTURE_VERSION = "09C-2-v1" as const;

export type Q0PreviewCaptureAdmission = {
  admission_id: string;
  benchmark_version: typeof Q0_BENCHMARK_VERSION;
  environment: "preview";
  preview_deployment_ref: string;
  case_id: string;
  case_kind: "expert_synthetic" | "approved_anonymized";
  test_only: true;
  real_client_data_present: false;
  accepted_writes_allowed: false;
  safe_telemetry_only: true;
  correlation_id: string;
  post_run_cleanup_required: true;
};

export function validateQ0PreviewCaptureAdmission(
  input: Q0PreviewCaptureAdmission,
): readonly string[] {
  const errors: string[] = [];
  if (!input.admission_id.trim()) errors.push("admission_id_missing");
  if (input.benchmark_version !== Q0_BENCHMARK_VERSION) errors.push("benchmark_version_mismatch");
  if (input.environment !== "preview") errors.push("preview_environment_required");
  if (!input.preview_deployment_ref.trim()) errors.push("preview_deployment_ref_missing");
  if (!input.case_id.trim()) errors.push("case_id_missing");
  if (input.case_kind !== "expert_synthetic" && input.case_kind !== "approved_anonymized") {
    errors.push("case_kind_invalid");
  }
  if (input.test_only !== true) errors.push("test_only_required");
  if (input.real_client_data_present !== false) errors.push("real_client_data_forbidden");
  if (input.accepted_writes_allowed !== false) errors.push("accepted_writes_forbidden");
  if (input.safe_telemetry_only !== true) errors.push("safe_telemetry_only_required");
  if (!input.correlation_id.trim()) errors.push("correlation_id_missing");
  if (input.post_run_cleanup_required !== true) errors.push("post_run_cleanup_required");
  return errors;
}

export function canExecuteQ0PreviewCapture(input: Q0PreviewCaptureAdmission): boolean {
  return validateQ0PreviewCaptureAdmission(input).length === 0;
}
