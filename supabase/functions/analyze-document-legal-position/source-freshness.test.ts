import { describe, expect, test } from "bun:test";
import {
  changeSignalForOutcome,
  classifySourceFreshness,
  derivePositionUpdateSignal,
  deriveRecheckOutcome,
  deriveSourceFreshness,
  findAffectedUsages,
  sourceFreshnessPolicy,
} from "./source-freshness.ts";

describe("Source Freshness contract", () => {
  test("FreshnessState is operational and deterministic", () => {
    expect(
      deriveSourceFreshness({
        sourceType: "law_full_text",
        lastCheckedAt: "2026-08-10T00:00:00Z",
        now: "2026-08-18T00:00:00Z",
        verificationStatus: "verified",
      }),
    ).toBe("CURRENT");

    expect(
      deriveSourceFreshness({
        sourceType: "law_full_text",
        lastCheckedAt: "2026-07-01T00:00:00Z",
        now: "2026-08-18T00:00:00Z",
        verificationStatus: "verified",
      }),
    ).toBe("RECHECK_DUE");

    expect(
      deriveSourceFreshness({
        sourceType: "law_full_text",
        lastCheckedAt: null,
        now: "2026-08-18T00:00:00Z",
        verificationStatus: "verified",
      }),
    ).toBe("RECHECK_DUE");

    expect(
      deriveSourceFreshness({
        sourceType: "law_full_text",
        lastCheckedAt: "not-a-date",
        now: "2026-08-18T00:00:00Z",
      }),
    ).toBe("UNRESOLVED");

    expect(
      deriveSourceFreshness({
        sourceType: "law_full_text",
        lastCheckedAt: "2026-08-17T00:00:00Z",
        now: "2026-08-18T00:00:00Z",
        verificationStatus: "failed",
      }),
    ).toBe("UNRESOLVED");
  });

  test("source classes have intentionally different policy semantics", () => {
    expect(classifySourceFreshness("codex")).toBe("LAW_CODE");
    expect(classifySourceFreshness("fns_letter")).toBe("OFFICIAL_EXPLANATION");
    expect(classifySourceFreshness("court_practice")).toBe("COURT_PRACTICE");

    expect(sourceFreshnessPolicy("codex").documentFreshness).toBe(true);
    expect(sourceFreshnessPolicy("codex").issuePositionFreshness).toBe(false);

    expect(sourceFreshnessPolicy("fns_letter").documentFreshness).toBe(true);
    expect(sourceFreshnessPolicy("fns_letter").issuePositionFreshness).toBe(true);

    expect(sourceFreshnessPolicy("court_practice").documentFreshness).toBe(false);
    expect(sourceFreshnessPolicy("court_practice").practiceFreshness).toBe(true);
  });

  test("recheck outcomes are separate from freshness states", () => {
    expect(
      deriveRecheckOutcome(
        { available: true, revisionDate: "2026-01-01", currentStatus: "active", contentHash: "aaa" },
        { available: true, revisionDate: "2026-01-01", currentStatus: "active", contentHash: "aaa" },
      ),
    ).toBe("UNCHANGED");

    expect(
      deriveRecheckOutcome(
        { available: true, revisionDate: "2026-01-01", currentStatus: "active", contentHash: "aaa" },
        { available: true, revisionDate: "2026-08-01", currentStatus: "active", contentHash: "bbb" },
      ),
    ).toBe("SOURCE_CHANGED");

    expect(
      deriveRecheckOutcome(
        { available: true, currentStatus: "active" },
        { available: true, currentStatus: "repealed" },
      ),
    ).toBe("STATUS_CHANGED");

    expect(
      deriveRecheckOutcome(
        { available: true },
        { available: false },
      ),
    ).toBe("UNAVAILABLE");

    expect(changeSignalForOutcome("SOURCE_CHANGED")).toBe("SOURCE_CHANGED");
    expect(changeSignalForOutcome("STATUS_CHANGED")).toBe("STATUS_CHANGED");
    expect(changeSignalForOutcome("UNCHANGED")).toBeNull();
    expect(changeSignalForOutcome("UNAVAILABLE")).toBeNull();
  });

  test("new FNS/Minfin/court material is POSITION_UPDATE_AVAILABLE, not SOURCE_CHANGED", () => {
    expect(
      derivePositionUpdateSignal({
        sameResearchIssue: true,
        newMaterialIsOfficial: true,
        newMaterialIsLater: true,
      }),
    ).toBe("POSITION_UPDATE_AVAILABLE");

    expect(
      derivePositionUpdateSignal({
        sameResearchIssue: false,
        newMaterialIsOfficial: true,
        newMaterialIsLater: true,
      }),
    ).toBeNull();
  });

  test("affected usage lookup is read-only and registry-granular", () => {
    const result = findAffectedUsages(
      "registry-a",
      [
        { id: "usage-a", source_id: "registry-a" },
        { id: "usage-b", source_id: "registry-b" },
      ],
      [
        {
          id: "run-a",
          used_sources: [
            { source_id: "raw-1", metadata: { legal_source_registry_id: "registry-a" } },
          ],
        },
        {
          id: "run-b",
          used_sources: [
            { source_id: "raw-2", metadata: { legal_source_registry_id: "registry-b" } },
          ],
        },
      ],
    );

    expect(result).toEqual({ usageEventIds: ["usage-a"], runIds: ["run-a"] });
  });
});
