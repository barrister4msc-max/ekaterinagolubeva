import { describe, expect, test } from "bun:test";
import type { RawSource } from "./repositories.ts";
import {
  linkExternalResearchToLocalSources,
  normalizeExternalResearchImport,
  normalizeExternalResearchImports,
  parseExternalResearchImportInputs,
} from "./external-research-import.ts";

function localSource(overrides: Partial<RawSource> = {}): RawSource {
  return {
    bucket: "laws",
    source_table: "legal_knowledge_chunks",
    source_id: "local-law-1",
    source_type: "law_full_text",
    title: "НК РФ ст. 54.1",
    official_url: "https://publication.pravo.gov.ru/document/local",
    citation: "НК РФ ст. 54.1",
    snippet: "Проверенный локальный текст нормы",
    metadata: {
      legal_source_registry_id: "registry-law-1",
      canonical_document_key: "ru:laws:nk:54.1",
      research_issue_ids: ["issue-1"],
      verification_status: "verified",
    },
    ...overrides,
  };
}

describe("external legal research import", () => {
  test("does not turn provider narrative into a legal source", () => {
    const result = normalizeExternalResearchImport({
      provider: "strizh",
      answer_text: "Стриж считает, что налогоплательщик прав по ст. 54.1 НК РФ.",
    });

    expect(result.sources).toEqual([]);
    expect(result.diagnostics.narrative_received).toBe(true);
    expect(result.diagnostics.warnings).toContain("external_research_narrative_not_imported_as_source");
    expect(result.diagnostics.warnings).toContain("narrative_not_imported_without_explicit_source_candidates");
  });

  test("imports explicit references only as unverified discovery candidates", () => {
    const result = normalizeExternalResearchImport({
      provider: "garant",
      research_issue_ids: ["issue-1"],
      candidates: [{
        title: "НК РФ. Статья 54.1",
        url: "https://publication.pravo.gov.ru/example#fragment",
        citation: "НК РФ ст. 54.1",
        article: "54.1",
        code: "НК РФ",
        excerpt: "Фрагмент из внешнего research-инструмента.",
      }],
    });

    expect(result.sources).toHaveLength(1);
    const source = result.sources[0];
    expect(source.bucket).toBe("laws");
    expect(source.official_url).toBeNull();
    expect(source.metadata.imported_url).toBe("https://publication.pravo.gov.ru/example");
    expect(source.metadata.provider_id).toBe("garant");
    expect(source.metadata.provider_integration_mode).toBe("manual_import");
    expect(source.metadata.provider_source_class).toBe("retrieval_intermediary");
    expect(source.metadata.research_issue_ids).toEqual(["issue-1"]);
    expect(source.metadata.official_origin_verified).toBe(false);
    expect(source.metadata.document_identity_verified).toBe(false);
    expect(source.metadata.content_verified).toBe(false);
    expect(source.metadata.substantive_use_allowed).toBe(false);
  });

  test("classifies FNS letters without elevating authority", () => {
    const result = normalizeExternalResearchImport({
      provider: "consultant",
      candidates: [{
        title: "Письмо ФНС России от 10.03.2022 № АБ-4-20/1234",
        url: "https://www.nalog.gov.ru/example",
        citation: "Письмо ФНС России от 10.03.2022 № АБ-4-20/1234",
        document_number: "АБ-4-20/1234",
        document_date: "2022-03-10",
      }],
    });

    const source = result.sources[0];
    expect(source.bucket).toBe("fns_letters");
    expect(source.letter_number).toBe("АБ-4-20/1234");
    expect(source.letter_date).toBe("2022-03-10");
    expect(source.metadata.authority_level).toBeUndefined();
    expect(source.metadata.is_official).toBeUndefined();
    expect(source.metadata.substantive_use_allowed).toBe(false);
  });

  test("deduplicates same reference and preserves issue provenance", () => {
    const result = normalizeExternalResearchImport({
      provider: "strizh",
      research_issue_ids: ["issue-1"],
      candidates: [
        {
          title: "Постановление суда",
          url: "https://kad.arbitr.ru/Card/123#top",
          case_number: "А40-123/2024",
          research_issue_ids: ["issue-2"],
        },
        {
          title: "То же постановление",
          url: "https://kad.arbitr.ru/Card/123",
          case_number: "А40-123/2024",
          research_issue_ids: ["issue-3"],
        },
      ],
    });

    expect(result.sources).toHaveLength(1);
    expect(result.diagnostics.duplicates_removed).toBe(1);
    expect(result.sources[0].metadata.research_issue_ids).toEqual(["issue-2", "issue-1", "issue-3"]);
  });

  test("skips unidentifiable prose candidates", () => {
    const result = normalizeExternalResearchImport({
      provider: "other",
      candidates: [{ title: "Общий вывод консультанта", excerpt: "Нет реквизитов." }],
    });
    expect(result.sources).toEqual([]);
    expect(result.diagnostics.warnings).toContain("invalid_or_unidentifiable_candidates_skipped");
  });

  test("parses only whitelisted provider identities from session/request staging", () => {
    const parsed = parseExternalResearchImportInputs([
      { provider: "strizh", links: ["https://example.com/1"] },
      { provider: "unknown-provider", links: ["https://example.com/2"] },
      null,
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].provider).toBe("strizh");
  });

  test("batch normalization deduplicates across imports", () => {
    const batch = normalizeExternalResearchImports([
      { provider: "strizh", links: ["https://example.com/source"] },
      { provider: "garant", links: ["https://example.com/source"] },
    ]);
    expect(batch.sources).toHaveLength(1);
    expect(batch.diagnostics.imports_received).toBe(2);
    expect(batch.diagnostics.duplicates_removed).toBe(1);
  });

  test("unmatched imported reference never enters substantive source pool", () => {
    const imported = normalizeExternalResearchImport({
      provider: "strizh",
      candidates: [{
        title: "Неизвестный внешний документ",
        citation: "Документ № 999",
        document_number: "999",
        research_issue_ids: ["issue-2"],
      }],
    }).sources;

    const linked = linkExternalResearchToLocalSources([localSource()], imported);
    expect(linked.sources).toHaveLength(1);
    expect(linked.sources[0].source_id).toBe("local-law-1");
    expect(linked.linked).toBe(0);
    expect(linked.unresolved).toBe(1);
  });

  test("canonical match transfers issue provenance to existing local source only", () => {
    const imported = normalizeExternalResearchImport({
      provider: "garant",
      candidates: [{
        title: "НК РФ ст. 54.1",
        citation: "НК РФ ст. 54.1",
        document_number: "54.1",
        research_issue_ids: ["issue-2"],
      }],
    }).sources;
    imported[0].metadata.legal_source_registry_id = "registry-law-1";
    imported[0].metadata.canonical_document_key = "ru:laws:nk:54.1";

    const local = localSource();
    const originalSnippet = local.snippet;
    const linked = linkExternalResearchToLocalSources([local], imported);

    expect(linked.linked).toBe(1);
    expect(linked.unresolved).toBe(0);
    expect(linked.sources).toHaveLength(1);
    expect(linked.sources[0].source_table).toBe("legal_knowledge_chunks");
    expect(linked.sources[0].snippet).toBe(originalSnippet);
    expect(linked.sources[0].metadata.research_issue_ids).toEqual(["issue-1", "issue-2"]);
    expect(Array.isArray(linked.sources[0].metadata.external_research_discovery)).toBe(true);
  });
});
