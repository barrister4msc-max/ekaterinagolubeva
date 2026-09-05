import { describe, expect, test } from "bun:test";
import { Q0_BENCHMARK_VERSION } from "./q0-benchmark.ts";
import {
  Q0_PREVIEW_CAPTURE_VERSION,
  canExecuteQ0PreviewCapture,
  validateQ0PreviewCaptureAdmission,
  type Q0PreviewCaptureAdmission,
} from "./q0-preview-capture.ts";

function admission(): Q0PreviewCaptureAdmission {
  return {
    admission_id: "q0-preview-001",
    benchmark_version: Q0_BENCHMARK_VERSION,
    environment: "preview",
    preview_deployment_ref: "preview://pr-139",
    case_id: "q0-response_to_tax_request-001",
    case_kind: "expert_synthetic",
    test_only: true,
    real_client_data_present: false,
    accepted_writes_allowed: false,
    safe_telemetry_only: true,
    correlation_id: "q0-correlation-001",
    post_run_cleanup_required: true,
  };
}

describe("Prompt 09C-2 controlled Preview capture admission", () => {
  test("admits only the bounded Preview-only configuration", () => {
    expect(Q0_PREVIEW_CAPTURE_VERSION).toBe("09C-2-v1");
    expect(validateQ0PreviewCaptureAdmission(admission())).toEqual([]);
    expect(canExecuteQ0PreviewCapture(admission())).toBe(true);
  });

  test("fails closed for Production-shaped scope, real data, accepted writes or unsafe telemetry", () => {
    expect(validateQ0PreviewCaptureAdmission({ ...admission(), environment: "production" as "preview" }))
      .toContain("preview_environment_required");
    expect(validateQ0PreviewCaptureAdmission({ ...admission(), real_client_data_present: true as false }))
      .toContain("real_client_data_forbidden");
    expect(validateQ0PreviewCaptureAdmission({ ...admission(), accepted_writes_allowed: true as false }))
      .toContain("accepted_writes_forbidden");
    expect(validateQ0PreviewCaptureAdmission({ ...admission(), safe_telemetry_only: false as true }))
      .toContain("safe_telemetry_only_required");
    expect(canExecuteQ0PreviewCapture({ ...admission(), test_only: false as true })).toBe(false);
  });

  test("requires a preview identity, correlation and post-run cleanup obligation", () => {
    const errors = validateQ0PreviewCaptureAdmission({
      ...admission(),
      preview_deployment_ref: "",
      correlation_id: "",
      post_run_cleanup_required: false as true,
    });
    expect(errors).toContain("preview_deployment_ref_missing");
    expect(errors).toContain("correlation_id_missing");
    expect(errors).toContain("post_run_cleanup_required");
  });
});
