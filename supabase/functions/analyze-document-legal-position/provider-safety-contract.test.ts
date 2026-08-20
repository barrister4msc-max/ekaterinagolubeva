import { describe, expect, test } from "bun:test";
import { carryCanonicalMetadataToTrusted } from "./source-metadata-bridge.ts";
import { validateConclusions, type Conclusion, type TrustedSource } from "./enrich.ts";

describe("Provider Safety Contract enforcement", () => {
  test("Law7 remains useful for retrieval but cannot become generation authority before official verification", () => {
    const trusted = [{
      source_id: "law7:nk_rf:54.1:current",
      source_ref: "law:nk_rf:54.1",
      source_table: "external_official_source",
      source_type: "law7_article_version",
      bucket: "laws",
      title: "НК РФ — Статья 54.1",
      official_url: null,
      url: null,
      citation: "НК РФ ст. 54.1",
      scores: {},
      appearances: 1,
      merged_from: [],
      trust_score: 100,
      trust_reason: "Кодекс/Федеральный закон",
      use_in_generation: true,
      priority_group: null,
      is_winner: true,
      superseded_by: null,
      lower_priority_reason: null,
      verification_status: "needs_check",
      actuality_status: "requires_manual_verification",
      actually_used_in_generation: false,
    }] as TrustedSource[];

    carryCanonicalMetadataToTrusted(trusted as Array<Record<string, any>>, [{
      source_id: "law7:nk_rf:54.1:current",
      metadata: {
        provider_id: "law7",
        provider_type: "research",
        provider_integration_mode: "local",
        provider_source_class: "retrieval_intermediary",
        retrieval_method: "supabase_law7_mirror",
        official_origin_verified: false,
        document_identity_verified: false,
        content_verified: false,
        actuality_status: "unknown",
        substantive_use_allowed: false,
        verification_level: "discovery",
      },
    }]);

    expect(trusted[0].trust_score).toBe(100);
    expect(trusted[0].use_in_generation).toBe(false);
    expect((trusted[0] as any).provider_id).toBe("law7");
    expect((trusted[0] as any).provider_source_class).toBe("retrieval_intermediary");
    expect((trusted[0] as any).official_origin_verified).toBe(false);
    expect((trusted[0] as any).content_verified).toBe(false);
    expect((trusted[0] as any).substantive_use_allowed).toBe(false);
    expect(trusted[0].trust_reason).toContain("substantive_use_allowed=false");

    const conclusion: Conclusion = {
      conclusion_id: "c_law7_only",
      kind: "main_position",
      statement: "Юридический вывод, который ссылается только на Law7",
      provenance: {
        facts_used: [],
        documents_used: [],
        laws_used: ["law:nk_rf:54.1"],
        court_practice_used: [],
        letters_used: [],
        ekaterina_used: [],
        manuals_used: [],
        trust_summary: {
          min_trust_score: 100,
          weighted_avg: 100,
          lowest_source: "law:nk_rf:54.1",
        },
        sufficiency: { status: "partial", reason: "fixture" },
        derivation: "fact→law",
        confidence: 0.6,
        reviewed_by_challenge: false,
        hallucinated_source: false,
        provenance_missing: false,
        support_level: "partial",
        needs_source: false,
        use_in_generation: true,
        unsupported_reason: null,
      },
    };

    const [validated] = validateConclusions([conclusion], trusted);
    expect(validated.provenance.support_level).toBe("unsupported");
    expect(validated.provenance.use_in_generation).toBe(false);
    expect(validated.provenance.needs_source).toBe(true);
    expect(validated.provenance.confidence).toBeLessThanOrEqual(0.35);
    expect(validated.provenance.unsupported_reason).toContain("запрещённый для генерации");
  });

  test("legacy sources without an explicit Safety Contract keep existing behavior", () => {
    const trusted = [{
      source_id: "legacy-law",
      source_ref: "law:nk_rf:1",
      trust_score: 100,
      trust_reason: "Кодекс/Федеральный закон",
      use_in_generation: true,
      verification_status: "needs_check",
    }];

    carryCanonicalMetadataToTrusted(trusted, [{
      source_id: "legacy-law",
      metadata: { provider_id: "legacy" },
    }]);

    expect(trusted[0].use_in_generation).toBe(true);
    expect(trusted[0].trust_score).toBe(100);
  });
});
