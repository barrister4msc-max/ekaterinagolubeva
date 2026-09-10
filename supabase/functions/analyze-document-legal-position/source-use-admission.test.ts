import { expect, test } from "bun:test";
import { applyRuntimeSourceAdmission } from "./source-use-admission.ts";

function one(metadata: Record<string, unknown>) {
  return applyRuntimeSourceAdmission([{ metadata } as any])[0] as any;
}

test("unverified internal source remains retrieval-only", () => {
  const source = one({
    substantive_use_allowed: false,
    content_verified: false,
    temporal_verified: false,
  });
  expect(source.use_in_generation).toBe(false);
  expect(source.metadata.source_use_admission.status).toBe("retrieval_only");
});

test("content-verified but temporally unresolved source cannot support a conclusion", () => {
  const source = one({
    substantive_use_allowed: true,
    content_verified: true,
    temporal_verified: false,
  });
  expect(source.use_in_generation).toBe(false);
  expect(source.metadata.source_use_admission.status).toBe("temporal_unresolved");
});

test("provider verification outage remains fail-closed", () => {
  const source = one({
    substantive_use_allowed: true,
    content_verified: true,
    temporal_verified: true,
    freshness_status: "verification_unavailable",
  });
  expect(source.use_in_generation).toBe(false);
  expect(source.metadata.source_use_admission.status).toBe("verification_unavailable");
});

test("missing freshness status remains fail-closed", () => {
  const source = one({
    substantive_use_allowed: true,
    content_verified: true,
    temporal_verified: true,
  });
  expect(source.use_in_generation).toBe(false);
  expect(source.metadata.source_use_admission.status).toBe("freshness_unresolved");
});

test("fully verified current source is eligible only in this analysis run", () => {
  const source = one({
    substantive_use_allowed: true,
    content_verified: true,
    temporal_verified: true,
    freshness_status: "current",
  });
  expect(source.use_in_generation).toBe(true);
  expect(source.actually_used_in_generation).toBe(false);
  expect(source.metadata.source_use_admission).toMatchObject({
    status: "admitted",
    eligible_for_conclusion: true,
    selected_for_run: false,
    actually_used_in_generation: false,
  });
});
