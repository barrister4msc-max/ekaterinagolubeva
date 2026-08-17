import { describe, expect, test } from "bun:test";
import { dedupe } from "./dedupe.ts";
import type { ScoredSource } from "./ranking.ts";

function scored(overrides: Partial<ScoredSource> = {}): ScoredSource {
  return {
    bucket: "laws",
    source_table: "legal_knowledge_chunks",
    source_id: "source-a",
    source_type: "federal_law",
    title: "Федеральный закон № 425-ФЗ",
    official_url: null,
    citation: "425-ФЗ",
    snippet: "text",
    metadata: {},
    code: null,
    article: null,
    part: null,
    case_number: null,
    letter_number: null,
    letter_date: null,
    scores: { semantic: 0.8, keyword: 0.8, priority: 0.5, relevance: 1, final: 0.7 },
    ...overrides,
  };
}

describe("canonical-aware dedupe", () => {
  test("dedupes the same legal document across providers by canonical_document_key", () => {
    const canonical = "ru:laws:document:425-фз:2025-11-28";
    const local = scored({
      source_id: "local",
      metadata: {
        canonical_document_key: canonical,
        legal_source_registry_id: "11111111-1111-1111-1111-111111111111",
        authority_level: "primary",
        verification_status: "verified",
      },
    });
    const external = scored({
      source_table: "external_official_source",
      source_id: "pravo:0001",
      official_url: "https://publication.pravo.gov.ru/document/0001",
      metadata: {
        canonical_document_key: canonical,
        provider_id: "pravo",
      },
      scores: { semantic: 0.9, keyword: 0.9, priority: 0.5, relevance: 1, final: 0.9 },
    });

    const result = dedupe([local, external]);
    expect(result).toHaveLength(1);
    expect(result[0].appearances).toBe(2);
    expect(result[0].metadata.legal_source_registry_id).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result[0].metadata.authority_level).toBe("primary");
    expect(result[0].metadata.verification_status).toBe("verified");
    expect(result[0].metadata.provider_id).toBe("pravo");
  });

  test("keeps different canonical versions separate", () => {
    const a = scored({
      source_id: "v1",
      metadata: {
        canonical_version_key: "ru:nk:54.1:2024-01-01",
        canonical_document_key: "ru:nk:54.1",
      },
    });
    const b = scored({
      source_id: "v2",
      metadata: {
        canonical_version_key: "ru:nk:54.1:2026-01-01",
        canonical_document_key: "ru:nk:54.1",
      },
    });

    expect(dedupe([a, b])).toHaveLength(2);
  });

  test("does not use a case-level canonical_document_key as judicial-act identity", () => {
    const base = scored({
      bucket: "court_practice",
      source_type: "court_practice",
      case_number: "А40-123/2025",
      metadata: { canonical_document_key: "ru:court:case:а40-123/2025" },
    });
    const first = { ...base, source_id: "decision", title: "Решение по делу А40-123/2025" };
    const second = {
      ...base,
      source_id: "cassation",
      title: "Постановление кассации по делу А40-123/2025",
    };

    // Legacy behaviour still groups by case number until an act-level key is
    // available; the important safety property here is that a case-level
    // canonical_document_key is not mistaken for a new act-level contract.
    const result = dedupe([first, second]);
    expect(result).toHaveLength(1);

    const withActKeys = dedupe([
      { ...first, metadata: { ...first.metadata, canonical_court_act_key: "act:decision" } },
      { ...second, metadata: { ...second.metadata, canonical_court_act_key: "act:cassation" } },
    ]);
    expect(withActKeys).toHaveLength(2);
  });
});
