import { describe, expect, test } from "bun:test";
import { mergeWithRegistry } from "./merge.ts";
import type { MergedSource } from "./dedupe.ts";

function source(metadata: Record<string, unknown>): MergedSource {
  return {
    bucket: "laws",
    source_table: "legal_knowledge_chunks",
    source_id: "law-1",
    source_type: "federal_law",
    title: "Федеральный закон № 425-ФЗ",
    official_url: "https://publication.pravo.gov.ru/document/0001202511280017",
    citation: "Федеральный закон от 28.11.2025 № 425-ФЗ",
    snippet: "text",
    metadata,
    scores: { semantic: 0.8, keyword: 0.8, priority: 0.5, relevance: 1, final: 0.8 },
    merged_from: [{ source_table: "legal_knowledge_chunks", source_id: "law-1" }],
    appearances: 1,
  };
}

describe("source metadata continuity through mergeWithRegistry", () => {
  test("preserves canonical registry verification, authority and temporal metadata", () => {
    const registry = source({
      legal_source_registry_id: "11111111-1111-1111-1111-111111111111",
      authority_level: "primary",
      authority_name: "Российская Федерация",
      publication_date: "2025-11-28",
      effective_from: "2026-01-01",
      effective_to: null,
      revision_date: "2025-11-28",
      is_official: true,
      current_status: "current",
      verification_status: "verified",
      canonical_document_key: "ru:laws:document:425-фз:2025-11-28",
      official_verification: {
        official_origin_verified: true,
        document_identity_verified: true,
        content_verified: true,
        actuality_status: "verified",
        substantive_use_allowed: true,
        verification_level: "substantive",
      },
    });
    const parsed: any = {
      applicable_laws: [{ source_id: "law-1", used_for: "qualification" }],
      court_practice: [],
      fns_letters: [],
      minfin_letters: [],
      ekaterina_practice: [],
      manuals: [],
      conclusion_source_links: [],
    };

    const result = mergeWithRegistry(parsed, [registry]);
    expect(parsed.applicable_laws[0].verification_status).toBe("verified");
    expect(parsed.applicable_laws[0].actuality_status).toBe("verified");
    expect(parsed.applicable_laws[0].authority_level).toBe("primary");
    expect(parsed.applicable_laws[0].effective_from).toBe("2026-01-01");
    expect(result.combined_sources[0].verification_status).toBe("verified");
    expect(result.combined_sources[0].actuality_status).toBe("verified");
    expect(result.combined_sources[0].canonical_document_key).toBe(
      "ru:laws:document:425-фз:2025-11-28",
    );
    expect(result.source_actuality[0].status).toBe("verified");
  });

  test("keeps legacy URL heuristics when canonical metadata is absent", () => {
    const registry = source({});
    const parsed: any = {
      applicable_laws: [{ source_id: "law-1" }],
      court_practice: [],
      fns_letters: [],
      minfin_letters: [],
      ekaterina_practice: [],
      manuals: [],
      conclusion_source_links: [],
    };

    const result = mergeWithRegistry(parsed, [registry]);
    expect(parsed.applicable_laws[0].verification_status).toBe("needs_check");
    expect(parsed.applicable_laws[0].actuality_status).toBe("requires_actuality_check");
    expect(result.combined_sources[0].verification_status).toBe("needs_check");
  });
});
