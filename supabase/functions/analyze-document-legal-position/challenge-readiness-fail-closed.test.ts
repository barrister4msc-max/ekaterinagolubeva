import { describe, expect, test } from "bun:test";
import { decideGeneration } from "./enrich.ts";

const base = {
  sufficiency: { status: "sufficient" },
  warnings: [],
  conclusions: [],
  trusted: [],
};

function decision(execution_status: string, status: string | null = null, issues: any[] = []) {
  return decideGeneration({
    ...base,
    challenge: { execution_status, status, issues },
  } as any);
}

describe("Prompt 07A challenge execution readiness", () => {
  test("unavailable challenge preserves draft but blocks final", () => {
    const result = decision("unavailable");
    expect(result.draft).toBe(true);
    expect(result.final).toBe(false);
    expect(result.reasons).toContain("challenge_execution:unavailable");
  });

  test("failed challenge preserves draft but blocks final", () => {
    const result = decision("failed");
    expect(result.draft).toBe(true);
    expect(result.final).toBe(false);
    expect(result.reasons).toContain("challenge_execution:failed");
  });

  test("invalid response preserves draft but blocks final", () => {
    const result = decision("invalid_response");
    expect(result.draft).toBe(true);
    expect(result.final).toBe(false);
    expect(result.reasons).toContain("challenge_execution:invalid_response");
  });

  test("not-run or legacy missing execution status cannot become final", () => {
    expect(decision("not_run").final).toBe(false);
    const legacy = decideGeneration({
      ...base,
      challenge: { status: "passed", issues: [] },
    } as any);
    expect(legacy.final).toBe(false);
    expect(legacy.reasons).toContain("challenge_execution:not_run");
  });

  test("completed valid challenge can allow final when all other gates pass", () => {
    const result = decision("passed", "passed");
    expect(result.draft).toBe(true);
    expect(result.final).toBe(true);
  });

  test("completed challenge with blocking issue blocks draft and final", () => {
    const result = decision("passed", "blocked", [{ kind: "critical_missing_evidence" }]);
    expect(result.draft).toBe(false);
    expect(result.final).toBe(false);
  });
});
