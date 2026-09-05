import { describe, expect, test } from "bun:test";
import {
  isSubstantiveLegalBucketType,
  sourceFamilyForType,
  sourceFamilyMetadataForType,
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
    expect(sourceTypesForBucket("court_practice")).toContain("vsrf_case_card");
    expect(sourceFamilyForType("vsrf_case_card")).toBe("judicial");
    expect(sourceFamilyForType("vsrf_court_act")).toBe("judicial");
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

  test("new imported source types are fail-closed even if importer tries to self-promote", () => {
    const meta = sourceFamilyMetadataForType("ruslawod_act", {
      substantive_use_allowed: true,
    });
    expect(meta.substantive_use_allowed).toBe(false);
  });

  test("new source type can become substantive only with a fully verified official safety observation", () => {
    const meta = sourceFamilyMetadataForType("russian_law_mcp_provision", {
      official_verification: {
        official_origin_verified: true,
        document_identity_verified: true,
        content_verified: true,
        actuality_status: "verified",
        substantive_use_allowed: true,
      },
    });
    expect(meta.substantive_use_allowed).toBe(true);
  });

  test("legacy source behavior is not changed by the new family contract", () => {
    const meta = sourceFamilyMetadataForType("law_full_text", {});
    expect(meta.source_family).toBe("normative_retrieval");
    expect("substantive_use_allowed" in meta).toBe(false);
  });
});
