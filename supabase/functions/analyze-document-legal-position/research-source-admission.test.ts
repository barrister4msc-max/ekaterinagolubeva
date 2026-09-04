import { describe, expect, test } from "bun:test";
import type { OfficialSourceSafety } from "./official-sources.ts";
import type { RawSource } from "./repositories.ts";
import {
  admitResearchRetrievalCandidates,
  normalizeRawSourceCandidate,
  type VerificationObservation,
} from "./research-source-admission.ts";
import { sourceFamilyForType, sourceFamilyMetadataForType } from "./source-family-contract.ts";

const KEY = "ru:laws:document:425-фз:2025-11-28";

function safety(overrides: Partial<OfficialSourceSafety> = {}): OfficialSourceSafety {
  return {
    official_origin_verified: true,
    document_identity_verified: true,
    content_verified: true,
    actuality_status: "verified",
    substantive_use_allowed: true,
    verification_level: "substantive",
    ...overrides,
  };
}

function candidate(overrides: Partial<RawSource> = {}, metadata: Record<string, unknown> = {}): RawSource {
  return {
    bucket: "laws",
    source_table: "external_official_source",
    source_id: "pravo:425-fz",
    source_type: "official_publication_pravo",
    title: "Федеральный закон № 425-ФЗ",
    official_url: "https://publication.pravo.gov.ru/document/425-fz",
    citation: "Федеральный закон № 425-ФЗ",
    snippet: "Синтетический официальный источник",
    metadata: {
      provider_id: "pravo",
      retrieval_candidate_only: true,
      research_transport_status: "approved_retrieval",
      research_query_plan_id: "rqp_fixture",
      research_transport_id: "pravo_official_api",
      research_retrieval_adapter_version: "08D-v1",
      canonical_document_key: KEY,
      safety: safety(),
      ...metadata,
    },
    ...overrides,
  };
}

function localSource(): RawSource {
  return {
    bucket: "laws",
    source_table: "legal_knowledge_chunks",
    source_id: "local:425-fz",
    source_type: "federal_law",
    title: "Федеральный закон № 425-ФЗ",
    official_url: null,
    citation: "Федеральный закон № 425-ФЗ",
    snippet: "Локальный нормативный текст",
    metadata: { canonical_document_key: KEY },
  };
}

function verification(
  source: RawSource,
  evidence: OfficialSourceSafety = safety(),
): VerificationObservation {
  const normalized = normalizeRawSourceCandidate(source);
  if (!normalized.canonical_identity.canonical_document_key) throw new Error("fixture requires canonical identity");
  return {
    observation_version: "08J-v1",
    candidate_id: normalized.candidate_id,
    canonical_document_key: normalized.canonical_identity.canonical_document_key,
    verifier: "official_verification_gate",
    safety: evidence,
  };
}

describe("Prompt 08J universal source admission boundary", () => {
  test("classifies Pravo official publications as fail-closed normative retrieval", () => {
    expect(sourceFamilyForType("official_publication_pravo")).toBe("normative_retrieval");
    expect(sourceFamilyMetadataForType("official_publication_pravo", {})).toMatchObject({
      source_family: "normative_retrieval",
      substantive_use_allowed: false,
    });
    expect(sourceFamilyMetadataForType("official_publication_pravo", {
      official_verification: safety(),
    })).toMatchObject({
      source_family: "normative_retrieval",
      substantive_use_allowed: true,
    });
  });

  test("admits a standalone Pravo candidate only with a separate fully verified observation", () => {
    const source = candidate();
    const result = admitResearchRetrievalCandidates([], [source], [verification(source)]);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      status: "substantive_admitted",
      reason: "fully_verified_official_source",
      substantive_use_allowed: true,
      source_use_eligible: true,
      downstream_use_in_generation_authoritative: true,
    });
    expect(result.discovery_candidates).toEqual([]);
    expect(result.substantive_sources).toHaveLength(1);
    expect(result.substantive_sources[0].metadata.retrieval_candidate_only).toBe(false);
    expect(result.substantive_sources[0].metadata.official_verification).toEqual(safety());
    expect(result.substantive_sources[0].metadata.research_query_plan_id).toBe("rqp_fixture");
  });

  test("links a fully verified candidate to an existing canonical source instead of duplicating it", () => {
    const source = candidate();
    const result = admitResearchRetrievalCandidates([localSource()], [source], [verification(source)]);
    expect(result.decisions[0]).toMatchObject({
      status: "linked_to_canonical",
      reason: "linked_to_existing_canonical",
      source_use_eligible: false,
    });
    expect(result.substantive_sources).toHaveLength(1);
    expect(result.substantive_sources[0].source_id).toBe("local:425-fz");
    expect(result.substantive_sources[0].official_url).toContain("publication.pravo.gov.ru");
    expect(result.substantive_sources[0].metadata.official_verification).toEqual(safety());
  });

  test("uses independent evidence rather than provider metadata when verification fails", () => {
    const metadataOnly = candidate({}, { safety: undefined });
    const unverified = candidate({}, { safety: safety({ official_origin_verified: false, substantive_use_allowed: false, verification_level: "discovery" }) });
    const unverifiedSource = { ...unverified, source_id: "pravo:unverified" };
    const result = admitResearchRetrievalCandidates([], [metadataOnly, unverifiedSource], [
      verification(metadataOnly, {
        official_origin_verified: true,
        document_identity_verified: true,
        content_verified: true,
        actuality_status: "verified",
        substantive_use_allowed: true,
        verification_level: "substantive",
      }),
      verification(unverifiedSource, safety({ official_origin_verified: false, substantive_use_allowed: false, verification_level: "discovery" })),
    ]);
    expect(result.decisions.map((item) => item.reason)).toEqual([
      "fully_verified_official_source",
      "official_origin_not_verified",
    ]);
    expect(result.decisions[0].status).toBe("substantive_admitted");
    expect(result.decisions[1].status).toBe("discovery_only");
    expect(result.substantive_sources).toHaveLength(1);
    expect(result.discovery_candidates).toHaveLength(1);
  });

  test("blocks ambiguous identity, content mismatch, and non-current actuality from substantive admission", () => {
    const ambiguous = candidate({}, { safety: safety({ document_identity_verified: false, substantive_use_allowed: false, verification_level: "origin" }) });
    const mismatch = candidate({ source_id: "pravo:mismatch" }, { safety: safety({ content_verified: false, substantive_use_allowed: false, verification_level: "identity" }) });
    const expired = candidate({ source_id: "pravo:expired" }, { safety: safety({ actuality_status: "unknown", substantive_use_allowed: false, verification_level: "content" }) });
    const result = admitResearchRetrievalCandidates([], [ambiguous, mismatch, expired], [
      verification(ambiguous, safety({ document_identity_verified: false, substantive_use_allowed: false, verification_level: "origin" })),
      verification(mismatch, safety({ content_verified: false, substantive_use_allowed: false, verification_level: "identity" })),
      verification(expired, safety({ actuality_status: "unknown", substantive_use_allowed: false, verification_level: "content" })),
    ]);
    expect(result.decisions.map((item) => item.reason)).toEqual([
      "document_identity_not_verified",
      "content_not_verified",
      "actuality_not_verified",
    ]);
    expect(result.decisions.every((item) => item.substantive_use_allowed === false)).toBe(true);
    expect(result.substantive_sources).toEqual([]);
  });

  test("provider metadata cannot self-promote a candidate without a verification observation", () => {
    const source = candidate({}, { safety: safety() });
    const result = admitResearchRetrievalCandidates([], [source]);
    expect(result.decisions[0]).toMatchObject({
      status: "discovery_only",
      reason: "verification_observation_missing",
      substantive_use_allowed: false,
    });
    expect(result.coverage_gaps).toEqual([{
      candidate_id: "external_official_source:pravo:425-fz",
      research_issue_id: null,
      reason: "verification_observation_missing",
    }]);
  });

  test("rejects verification evidence for a different canonical identity", () => {
    const source = candidate();
    const result = admitResearchRetrievalCandidates([], [source], [{
      ...verification(source),
      canonical_document_key: "ru:laws:document:other",
    }]);
    expect(result.decisions[0]).toMatchObject({
      status: "discovery_only",
      reason: "verification_observation_mismatch",
      substantive_use_allowed: false,
    });
  });

  test("BRAS/KAD manual-only material is blocked before official safety can promote it", () => {
    const manual = candidate({
      source_id: "bras_kad:A40-1/2026",
      source_type: "kad_case",
      bucket: "court_practice",
      official_url: "https://kad.arbitr.ru/Card/test",
    }, {
      provider_id: "bras_kad",
      research_transport_status: "manual_import_only",
      safety: safety(),
      canonical_document_key: "ru:court:A40-1/2026",
    });
    const result = admitResearchRetrievalCandidates([], [manual]);
    expect(result.decisions[0]).toMatchObject({
      status: "blocked",
      reason: "transport_not_approved",
      substantive_use_allowed: false,
    });
    expect(result.substantive_sources).toEqual([]);
  });

  test("missing canonical identity remains discovery-only even with verified safety", () => {
    const noIdentity = candidate({
      source_id: "pravo:no-key",
      citation: null,
      article: null,
      code: null,
    }, {
      canonical_document_key: undefined,
      document_number: undefined,
      document_date: undefined,
      publication_date: undefined,
      safety: safety(),
    });
    const result = admitResearchRetrievalCandidates([], [noIdentity]);
    expect(result.decisions[0]).toMatchObject({
      status: "discovery_only",
      reason: "canonical_identity_missing",
    });
    expect(result.substantive_sources).toEqual([]);
  });

  test("creates source × issue decisions while keeping proposition and generation use unset", () => {
    const source = candidate({}, { research_issue_ids: ["issue-a", "issue-b", "issue-a"] });
    const result = admitResearchRetrievalCandidates([], [source], [verification(source)]);
    expect(result.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        research_issue_id: "issue-a",
        proposition_id: null,
        actually_used_in_generation: false,
        status: "substantive_admitted",
      }),
      expect.objectContaining({
        research_issue_id: "issue-b",
        proposition_id: null,
        actually_used_in_generation: false,
        status: "substantive_admitted",
      }),
    ]));
    expect(result.decisions).toHaveLength(2);
    expect(result.coverage_gaps).toEqual([]);
  });
});
