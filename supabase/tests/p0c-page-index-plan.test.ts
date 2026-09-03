import { describe, expect, test } from "bun:test";
import {
  MAX_UNITS_PER_INVOCATION,
  applyUnitResult,
  computePageIndexProgress,
  createPageIndexState,
  resumePageIndexState,
  selectUnitsForInvocation,
} from "../functions/_shared/page-index-plan";

describe("P0-C page-aware indexing", () => {
  test("plans a 600-page PDF into bounded six-page units", () => {
    const state = createPageIndexState(600);
    expect(state.units).toHaveLength(100);
    expect(state.units[0]?.start).toBe(0);
    expect(state.units[0]?.end).toBe(6);
    expect(state.units.at(-1)?.end).toBe(600);
    expect(selectUnitsForInvocation(state)).toHaveLength(MAX_UNITS_PER_INVOCATION);
  });

  test("resumes completed units and leaves failed units retryable", () => {
    let state = createPageIndexState(18);
    state = applyUnitResult(state, 0, { text: "first" });
    state = applyUnitResult(state, 6, { error: "provider_timeout" });
    state = applyUnitResult(state, 12, { text: "third" });
    const resumed = resumePageIndexState(18, state);
    expect(resumed.units[0]?.status).toBe("completed");
    expect(resumed.units[1]?.status).toBe("pending");
    expect(resumed.units[2]?.status).toBe("completed");
    expect(resumed.units[2]?.text).toBe("third");
    expect(selectUnitsForInvocation(resumed).map((unit) => unit.start)).toEqual([6]);
  });

  test("progress is never 100 percent while required units are incomplete", () => {
    let state = createPageIndexState(600);
    for (const unit of selectUnitsForInvocation(state)) state = applyUnitResult(state, unit.start, { text: "page" });
    const progress = computePageIndexProgress(state);
    expect(progress.percent).toBeLessThan(100);
    expect(progress.complete).toBe(false);
    expect(progress.pendingUnits).toBe(92);
  });
});
