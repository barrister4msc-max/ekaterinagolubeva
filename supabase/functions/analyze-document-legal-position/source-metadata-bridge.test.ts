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
  metadata: {
    canonical_document_key: "ru:laws:document:425-фз:2025-11-28",
    source_group_id: "group-425",
    is_source_head: true,
  },
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
      metadata: {
        source_group_id: "group-425-old",
        is_source_head: true,
      },
    };
    expect(chooseCanonicalRegistryMatch(ambiguousSource, [row, second])).toBeNull();
  });

  test("collapses chunk-level registry rows to the existing source-group head", () => {
    const chunkRow = {
      ...row,
      id: "33333333-3333-3333-3333-333333333333",
      metadata: {
        ...row.metadata,
        is_source_head: false,
        chunk_index: 7,
      },
    };
    const byExplicitChunk: RawSource = {
      ...source,
      metadata: {
        ...source.metadata,
        legal_source_registry_id: chunkRow.id,
      },
    };

    const match = chooseCanonicalRegistryMatch(byExplicitChunk, [chunkRow, row]);
    expect(match?.method).toBe("registry_id_source_head");
    expect(match?.row.id).toBe(row.id);
  });

  test("uses document number and date to disambiguate shared provider URLs between source heads", () => {
    const sharedUrl = "https://www.nalog.gov.ru/rn77/promo/na/";
    const target = {
      ...row,
      id: "44444444-4444-4444-4444-444444444444",
      source_type: "fns_letter",
      official_url: sharedUrl,
      document_number: null,
      publication_date: null,
      metadata: {
        source_group_id: "fns-target",
        is_source_head: true,
        document_number: "№ БВ-4-7/8051@ ",
        document_date: "2024-07-16",
      },
    };
    const other = {
      ...target,
      id: "55555555-5555-5555-5555-555555555555",
      metadata: {
        source_group_id: "fns-other",
        is_source_head: true,
        document_number: "ЕД-1-23/228@ ",
        document_date: "2026-04-03",
      },
    };
    const fnsSource: RawSource = {
      ...source,
      bucket: "fns_letters",
      source_type: "fns_letter",
      official_url: sharedUrl,
      letter_number: "БВ-4-7/8051@",
      letter_date: "2024-07-16",
      metadata: {
        document_number: "БВ-4-7/8051@",
        document_date: "2024-07-16",
      },
    };

    const match = chooseCanonicalRegistryMatch(fnsSource, [target, other]);
    expect(match?.method).toBe("document_number_date_source_head");
    expect(match?.row.id).toBe(target.id);
  });

  test("projects structured registry columns as canonical runtime metadata", () => {
    const projected = projectRegistryMetadata(source, row, "canonical_document_key");
    expect(projected.metadata.authority_level).toBe("primary");
    expect(projected.metadata.effective_from).toBe("2026-01-01");
    expect(projected.metadata.current_status).toBe("current");
    expect(projected.metadata.verification_status).toBe("verified");
    expect(projected.metadata.legal_source_registry_id).toBe(row.id);
    expect(projected.metadata.registry_source_group_id).toBe("group-425");
    expect(projected.metadata.registry_match_attempted).toBe(true);
    expect(projected.official_url).toBe(row.official_url);
  });

  test("preserves useful legacy registry metadata when structured temporal columns are null", () => {
    const legacy = {
      ...row,
      document_number: null,
      publication_date: null,
      effective_from: null,
      effective_to: null,
      revision_date: null,
      authority_name: null,
      current_status: "unknown",
      verification_status: "needs_check",
      metadata: {
        source_group_id: "legacy-group",
        is_source_head: true,
        document_number: "N 146-ФЗ ",
        document_date: "1998-07-31",
        edition_date: "2026-01-01",
        authority: "Федеральный законодатель",
        official_status: "unverified",
        verification_status: "official_verified",
        trust_level: "medium",
      },
    };
    const projected = projectRegistryMetadata(source, legacy, "official_url_source_head");
    expect(projected.metadata.document_number).toBe("146-ФЗ");
    expect(projected.metadata.document_date).toBe("1998-07-31");
    expect(projected.metadata.revision_date).toBe("2026-01-01");
    expect(projected.metadata.authority_name).toBe("Федеральный законодатель");
    // Structured verification remains canonical and safer than contradictory legacy metadata.
    expect(projected.metadata.verification_status).toBe("needs_check");
    expect(projected.metadata.registry_legacy_verification_status).toBe("official_verified");
    expect(projected.metadata.registry_official_status).toBe("unverified");
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

  test("carries research provider provenance without treating it as legal authority", () => {
    const providerSource: RawSource = {
      ...source,
      metadata: {
        ...source.metadata,
        provider_id: "law7",
        provider_type: "research",
        provider_integration_mode: "mcp",
        provider_source_class: "retrieval_intermediary",
        authority_level: "primary",
        official_origin_verified: false,
      },
    };
    const trusted: Array<Record<string, any>> = [{
      source_id: "chunk-1",
      source_ref: "law:нк рф:54.1",
      trust_score: 95,
    }];

    carryCanonicalMetadataToTrusted(trusted, [providerSource]);

    expect(trusted[0].provider_id).toBe("law7");
    expect(trusted[0].provider_type).toBe("research");
    expect(trusted[0].provider_integration_mode).toBe("mcp");
    expect(trusted[0].provider_source_class).toBe("retrieval_intermediary");
    expect(trusted[0].authority_level).toBe("primary");
    // Provider provenance does not self-certify official origin.
    expect(trusted[0].official_origin_verified).toBeUndefined();
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
