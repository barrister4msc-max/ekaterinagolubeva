import { describe, expect, test } from "bun:test";
import type { RawSource } from "./repositories.ts";
import {
  buildExternalResearchRunSnapshot,
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
    const source = result.sources[0];
    expect(source.bucket).toBe("laws");
    expect(source.official_url).toBeNull();
    expect(source.metadata.imported_url).toBe("https://publication.pravo.gov.ru/example");
    expect(source.metadata.provider_source_class).toBe("retrieval_intermediary");
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
    expect(source.metadata.authority_level).toBeUndefined();
    expect(source.metadata.is_official).toBeUndefined();
  });

  test("admits an official BRAS/KAD reference only as unverified court-practice discovery", () => {
    const result = normalizeExternalResearchImport({
      provider: "bras_kad",
      candidates: [{
        title: "Постановление по делу А40-123/2024",
        url: "https://kad.arbitr.ru/Card/123#top",
        case_number: "А40-123/2024",
      }],
    });
    const source = result.sources[0];
    expect(source.bucket).toBe("court_practice");
    expect(source.official_url).toBeNull();
    expect(source.metadata.imported_url).toBe("https://kad.arbitr.ru/Card/123");
    expect(source.metadata.source_family).toBe("bras_kad");
    expect(source.metadata.substantive_use_allowed).toBe(false);
  });

  test("rejects non-official BRAS/KAD URLs even when a case number is supplied", () => {
    const result = normalizeExternalResearchImport({
      provider: "bras_kad",
      candidates: [{ title: "Решение", url: "https://example.test/case/123", case_number: "А40-123/2024" }],
    });
    expect(result.sources).toEqual([]);
    expect(result.diagnostics.warnings).toContain("invalid_or_unidentifiable_candidates_skipped");
  });

  test("admits an identifiable case number without any URL as discovery-only", () => {
    const result = normalizeExternalResearchImport({
      provider: "bras_kad",
      candidates: [{ title: "Дело А40-123/2024", case_number: "А40-123/2024" }],
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].metadata.imported_url).toBeNull();
    expect(result.sources[0].metadata.substantive_use_allowed).toBe(false);
  });

  test("accepts strict ВС manual act metadata only from official hosts", () => {
    const result = normalizeExternalResearchImport({
      provider: "vsrf",
      candidates: [{
        title: "Определение Судебной коллегии по экономическим спорам ВС РФ",
        url: "https://vsrf.ru/stor_pdf.php?id=123",
        citation: "Дело А40-123/2024",
        case_number: "А40-123/2024",
        document_number: "305-ЭС25-1234",
        document_date: "2025-06-01",
        court_document_kind: "individual_act",
        court_instance: "cassation",
        text_status: "complete",
        adverse: true,
        later_act: true,
      }],
    });
    const source = result.sources[0];
    expect(source.bucket).toBe("court_practice");
    expect(source.metadata.source_family).toBe("vsrf");
    expect(source.metadata.court_document_kind).toBe("individual_act");
    expect(source.metadata.court_instance).toBe("cassation");
    expect(source.metadata.text_status).toBe("complete");
    expect(source.metadata.adverse).toBe(true);
    expect(source.metadata.later_act).toBe(true);
    expect(source.metadata.substantive_use_allowed).toBe(false);
  });

  test("rejects ВС candidates without an official URL or act-level metadata", () => {
    const result = normalizeExternalResearchImport({
      provider: "vsrf",
      candidates: [{
        title: "Карточка дела",
        url: "https://example.test/case/123",
        case_number: "А40-123/2024",
      }],
    });
    expect(result.sources).toEqual([]);
  });

  test("deduplicates same reference and preserves issue provenance", () => {
    const result = normalizeExternalResearchImport({
      provider: "strizh",
      research_issue_ids: ["issue-1"],
      candidates: [
        { title: "Постановление суда", url: "https://kad.arbitr.ru/Card/123#top", case_number: "А40-123/2024", research_issue_ids: ["issue-2"] },
        { title: "То же постановление", url: "https://kad.arbitr.ru/Card/123", case_number: "А40-123/2024", research_issue_ids: ["issue-3"] },
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
  });

  test("parses only whitelisted providers and bounds staged input", () => {
    const parsed = parseExternalResearchImportInputs([
      {
        provider: "strizh",
        links: Array.from({ length: 70 }, (_, i) => `https://example.com/${i}`),
        research_issue_ids: Array.from({ length: 20 }, (_, i) => `issue-${i}`),
      },
      { provider: "unknown-provider", links: ["https://example.com/bad"] },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].links).toHaveLength(50);
    expect(parsed[0].research_issue_ids).toHaveLength(12);
  });

  test("batch normalization deduplicates across providers and preserves provider provenance", () => {
    const batch = normalizeExternalResearchImports([
      { provider: "strizh", links: ["https://example.com/source"] },
      { provider: "garant", links: ["https://example.com/source"] },
    ]);
    expect(batch.sources).toHaveLength(1);
    expect(batch.diagnostics.duplicates_removed).toBe(1);
    expect(batch.sources[0].metadata.discovered_via_providers).toEqual(["strizh", "garant"]);
  });

  test("unmatched imported reference never enters substantive source pool", () => {
    const imported = normalizeExternalResearchImport({
      provider: "strizh",
      candidates: [{ title: "Неизвестный внешний документ", citation: "Документ № 999", document_number: "999", research_issue_ids: ["issue-2"] }],
    }).sources;
    const linked = linkExternalResearchToLocalSources([localSource()], imported);
    expect(linked.sources).toHaveLength(1);
    expect(linked.linked).toBe(0);
    expect(linked.unresolved).toBe(1);
  });

  test("canonical match transfers issue provenance to existing local source only", () => {
    const imported = normalizeExternalResearchImport({
      provider: "garant",
      candidates: [{ title: "НК РФ ст. 54.1", citation: "НК РФ ст. 54.1", document_number: "54.1", research_issue_ids: ["issue-2"] }],
    }).sources;
    imported[0].metadata.legal_source_registry_id = "registry-law-1";
    imported[0].metadata.canonical_document_key = "ru:laws:nk:54.1";
    const local = localSource();
    const originalSnippet = local.snippet;
    const linked = linkExternalResearchToLocalSources([local], imported);
    expect(linked.linked).toBe(1);
    expect(linked.sources[0].source_table).toBe("legal_knowledge_chunks");
    expect(linked.sources[0].snippet).toBe(originalSnippet);
    expect(linked.sources[0].metadata.research_issue_ids).toEqual(["issue-1", "issue-2"]);
  });

  test("run snapshot persists references but excludes provider narrative and excerpt", () => {
    const batch = normalizeExternalResearchImports([{
      provider: "strizh",
      answer_text: "Нарратив, который нельзя сохранять как evidence",
      candidates: [{
        title: "Письмо ФНС",
        url: "https://www.nalog.gov.ru/example#x",
        citation: "Письмо ФНС № 1",
        excerpt: "Большой скопированный фрагмент",
        document_number: "1",
        document_date: "2022-01-01",
        research_issue_ids: ["issue-1"],
      }],
    }]);
    const link = {
      sources: [localSource()],
      linked: 0,
      unresolved: 1,
      unresolved_source_ids: [batch.sources[0].source_id],
    };
    const snapshot = buildExternalResearchRunSnapshot(batch, link);
    expect(snapshot.references).toHaveLength(1);
    expect(snapshot.references[0].imported_url).toBe("https://www.nalog.gov.ru/example");
    expect(snapshot.references[0].linked).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("Нарратив");
    expect(JSON.stringify(snapshot)).not.toContain("Большой скопированный фрагмент");
  });
});
