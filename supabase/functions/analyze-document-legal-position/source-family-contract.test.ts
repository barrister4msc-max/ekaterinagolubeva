import { describe, expect, test } from "bun:test";
import {
  isSubstantiveLegalBucketType,
  sourceFamilyForType,
  sourceTypesForBucket,
} from "./source-family-contract.ts";

describe("legal research source family contract", () => {
  test("routes broad normative retrieval into existing laws bucket", () => {
    const laws = sourceTypesForBucket("laws");
    expect(laws).toContain("ruslawod_act");
    expect(laws).toContain("russian_law_mcp_provision");
    expect(sourceFamilyForType("ruslawod_act")).toBe("normative_retrieval");
  });

  test("routes official explanation families into existing authority buckets", () => {
    expect(sourceTypesForBucket("fns_letters")).toContain("fns_appeal_decision");
    expect(sourceTypesForBucket("fns_letters")).toContain("fns_explanation");
    expect(sourceTypesForBucket("minfin_letters")).toContain("minfin_explanation");
    expect(sourceFamilyForType("fns_appeal_decision")).toBe("official_explanation");
  });

  test("keeps judicial discovery distinguishable from official court material", () => {
    expect(sourceTypesForBucket("court_practice")).toContain("vsrf_act");
    expect(sourceTypesForBucket("court_practice")).toContain("kad_case");
    expect(sourceTypesForBucket("court_practice")).toContain("sudact_case");
    expect(sourceFamilyForType("vsrf_act")).toBe("judicial");
    expect(sourceFamilyForType("sudact_case")).toBe("secondary_discovery");
  });

  test("does not treat Duma process or FNS factual registries as substantive-law material", () => {
    expect(sourceFamilyForType("duma_bill")).toBe("legislative_process");
    expect(sourceFamilyForType("fns_egrul")).toBe("factual_official_data");
    expect(isSubstantiveLegalBucketType("duma_bill")).toBe(false);
    expect(isSubstantiveLegalBucketType("fns_bfo_public")).toBe(false);
    expect(sourceTypesForBucket("laws")).not.toContain("duma_bill");
    expect(sourceTypesForBucket("laws")).not.toContain("fns_egrul");
  });
});
