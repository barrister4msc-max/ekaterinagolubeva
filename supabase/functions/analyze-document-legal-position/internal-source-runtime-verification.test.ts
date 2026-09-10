import { describe, expect, test } from "bun:test";
import type { RawSource } from "./repositories.ts";
import type { OfficialSourceResult, OfficialSourceSafety } from "./official-sources.ts";
import {
  buildInternalSourceVerificationObservation,
  buildRuntimeVerificationPlan,
  compareLegalText,
  failClosedSafety,
} from "./internal-source-runtime-verification.ts";

const KEY = "ru:laws:norm:нк рф:54.1";

function local(): RawSource {
  return {
    bucket: "laws",
    source_table: "legal_law_chunks",
    source_id: "nk:54.1",
    source_type: "codex",
    title: "НК РФ, статья 54.1",
    official_url: null,
    citation: "НК РФ, статья 54.1",
    snippet: "Локальный snapshot",
    code: "НК РФ",
    article: "54.1",
    metadata: {
      canonical_document_key: KEY,
      source_namespace: "garant_user_supplied_nk",
      content_verified: false,
      temporal_verified: false,
      substantive_use_allowed: false,
    },
  };
}

function verified(): OfficialSourceResult {
  const safety: OfficialSourceSafety = {
    official_origin_verified: true,
    document_identity_verified: true,
    content_verified: true,
    actuality_status: "verified",
    substantive_use_allowed: true,
    verification_level: "substantive",
  };
  return {
    bucket: "laws",
    source_table: "external_official_source",
    source_id: "pravo:nk:54.1",
    source_type: "official_publication_pravo",
    title: "НК РФ, статья 54.1",
    official_url: "https://publication.pravo.gov.ru/document/fixture",
    citation: "НК РФ, статья 54.1",
    snippet: "Официальный текст",
    code: "НК РФ",
    article: "54.1",
    metadata: { canonical_document_key: KEY, safety },
  };
}

describe("internal legal source runtime verification", () => {
  test("plans official-first verification and internet fallback only for official discovery", () => {
    expect(buildRuntimeVerificationPlan(local())).toEqual({
      version: "internal-source-runtime-verification-v1",
      canonical_document_key: KEY,
      stages: ["official_provider", "official_site_discovery", "internet_official_discovery", "unavailable"],
      internet_fallback_may_only_admit_official_hosts: true,
    });
  });

  test("normalizes harmless whitespace and soft hyphen differences", () => {
    expect(compareLegalText("Статья 54.1\nНК\u00ad РФ", "  статья 54.1 НК РФ  ").exact_normalized_match).toBe(true);
  });

  test("bridges independently verified official evidence to the matching internal source", () => {
    const observation = buildInternalSourceVerificationObservation(local(), verified());
    expect(observation).not.toBeNull();
    expect(observation).toMatchObject({
      candidate_id: "legal_law_chunks:nk:54.1",
      canonical_document_key: KEY,
      verifier: "official_verification_gate",
      safety: { substantive_use_allowed: true, actuality_status: "verified" },
    });
  });

  test("refuses to bridge different canonical identities", () => {
    const source = verified();
    source.metadata.canonical_document_key = "ru:laws:norm:нк рф:54.2";
    expect(buildInternalSourceVerificationObservation(local(), source)).toBeNull();
  });

  test("refuses provider metadata without a complete safety observation", () => {
    const source = verified();
    source.metadata.safety = { substantive_use_allowed: true };
    expect(buildInternalSourceVerificationObservation(local(), source)).toBeNull();
  });

  test("fails closed when verification is unavailable or content mismatches", () => {
    expect(failClosedSafety("unavailable")).toMatchObject({
      substantive_use_allowed: false,
      verification_level: "discovery",
    });
    expect(failClosedSafety("content_mismatch")).toMatchObject({
      official_origin_verified: true,
      document_identity_verified: true,
      content_verified: false,
      substantive_use_allowed: false,
      verification_level: "identity",
    });
  });
});
