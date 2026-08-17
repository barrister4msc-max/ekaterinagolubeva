import { describe, expect, test } from "bun:test";
import {
  attachCanonicalRegistryMetadata,
  carryCanonicalMetadataToTrusted,
  chooseCanonicalRegistryMatch,
  projectRegistryMetadata,
} from "./source-metadata-bridge.ts";
import type { RawSource } from "./repositories.ts";

const source: RawSource = {
  bucket: "laws",
  source_table: "legal_knowledge_chunks",
  source_id: "chunk-1",
  source_type: "federal_law",
  title: "Федеральный закон № 425-ФЗ",
  official_url: null,
  citation: "425-ФЗ",
  snippet: "text",
  metadata: {
    document_number: "425-ФЗ",
    document_date: "2025-11-28",
    canonical_document_key: "ru:laws:document:425-фз:2025-11-28",
  },
};

const row = {
  id: "11111111-1111-1111-1111-111111111111",
  source_type: "federal_law",
  official_url: "https://publication.pravo.gov.ru/document/0001202511280017",
  external_id: "0001202511280017",
  authority_name: "Государственная Дума / Совет Федерации / Президент РФ",
  authority_level: "primary",
  jurisdiction: "RU",
  practice_area: "tax",
  citation: "Федеральный закон от 28.11.2025 № 425-ФЗ",
  document_number: "425-ФЗ",
  publication_date: "2025-11-28",
  effective_from: "2026-01-01",
  effective_to: null,
  revision_date: "2025-11-28",
  is_official: true,
  is_active: true,
  current_status: "current",
  verification_status: "verified",
  last_checked_at: "2026-08-17T10:00:00+00:00",
  retrieved_at: "2026-08-17T09:00:00+00:00",
  metadata: { canonical_document_key: "ru:laws:document:425-фз:2025-11-28" },
};

describe("Canonical Source Metadata Bridge", () => {
  test("prefers exact canonical identity and rejects ambiguous number-only matches", () => {
    const match = chooseCanonicalRegistryMatch(source, [row]);
    expect(match?.method).toBe("canonical_document_key");
    expect(match?.row.id).toBe(row.id);

    const ambiguousSource = {
      ...source,
      metadata: { document_number: "425-ФЗ" },
    };
    const second = {
      ...row,
      id: "22222222-2222-2222-2222-222222222222",
      publication_date: "2024-11-28",
      metadata: {},
    };
    expect(chooseCanonicalRegistryMatch(ambiguousSource, [row, second])).toBeNull();
  });

  test("projects structured registry columns as canonical runtime metadata", () => {
    const projected = projectRegistryMetadata(source, row, "canonical_document_key");
    expect(projected.metadata.authority_level).toBe("primary");
    expect(projected.metadata.effective_from).toBe("2026-01-01");
    expect(projected.metadata.current_status).toBe("current");
    expect(projected.metadata.verification_status).toBe("verified");
    expect(projected.metadata.legal_source_registry_id).toBe(row.id);
    expect(projected.metadata.registry_match_attempted).toBe(true);
    expect(projected.official_url).toBe(row.official_url);
  });

  test("carries canonical metadata to TrustedSource without changing source_ref or trust", () => {
    const projected = projectRegistryMetadata(source, row, "canonical_document_key");
    const trusted: Array<Record<string, any>> = [{
      source_id: "chunk-1",
      source_ref: "law:нк рф:54.1",
      trust_score: 100,
      verification_status: "needs_check",
    }];
    carryCanonicalMetadataToTrusted(trusted, [projected]);
    expect(trusted[0].source_ref).toBe("law:нк рф:54.1");
    expect(trusted[0].trust_score).toBe(100);
    expect(trusted[0].authority_level).toBe("primary");
    expect(trusted[0].effective_from).toBe("2026-01-01");
    expect(trusted[0].verification_status).toBe("verified");
    expect(trusted[0].canonical_document_key).toBe("ru:laws:document:425-фз:2025-11-28");
  });

  test("does not query legal_source_registry again after projection was attempted", async () => {
    let fromCalls = 0;
    const sb = {
      from() {
        fromCalls++;
        throw new Error("registry lookup should not run for attempted sources");
      },
    };
    const attempted: RawSource = {
      ...source,
      metadata: { ...source.metadata, registry_match_attempted: true },
    };

    const result = await attachCanonicalRegistryMetadata(sb, [attempted]);
    expect(result).toEqual([attempted]);
    expect(fromCalls).toBe(0);
  });
});
