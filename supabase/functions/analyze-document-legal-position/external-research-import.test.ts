import { describe, expect, test } from "bun:test";
import { normalizeExternalResearchImport } from "./external-research-import.ts";

describe("external legal research import", () => {
  test("does not turn provider narrative into a legal source", () => {
    const result = normalizeExternalResearchImport({
      provider: "strizh",
      answer_text: "Стриж считает, что налогоплательщик прав по ст. 54.1 НК РФ.",
    });

    expect(result.sources).toEqual([]);
    expect(result.diagnostics.narrative_received).toBe(true);
    expect(result.diagnostics.warnings).toContain(
      "narrative_not_imported_without_explicit_source_candidates",
    );
  });

  test("imports explicit references only as unverified retrieval candidates", () => {
    const result = normalizeExternalResearchImport({
      provider: "garant",
      research_issue_ids: ["issue-54-1"],
      candidates: [
        {
          title: "НК РФ. Статья 54.1",
          url: "https://publication.pravo.gov.ru/example#fragment",
          citation: "НК РФ ст. 54.1",
          article: "54.1",
          code: "НК РФ",
          excerpt: "Фрагмент, скопированный пользователем из внешнего research-инструмента.",
        },
      ],
    });

    expect(result.sources).toHaveLength(1);
    const source = result.sources[0];
    expect(source.bucket).toBe("laws");
    expect(source.metadata.provider_id).toBe("garant");
    expect(source.metadata.provider_integration_mode).toBe("manual_import");
    expect(source.metadata.provider_source_class).toBe("retrieval_intermediary");
    expect(source.metadata.research_issue_ids).toEqual(["issue-54-1"]);
    expect(source.metadata.official_origin_verified).toBe(false);
    expect(source.metadata.document_identity_verified).toBe(false);
    expect(source.metadata.content_verified).toBe(false);
    expect(source.metadata.substantive_use_allowed).toBe(false);
    expect(source.metadata.verification_status).toBe("needs_check");
    expect(source.metadata.actuality_status).toBe("requires_actuality_check");
  });

  test("classifies official explanations without elevating their authority", () => {
    const result = normalizeExternalResearchImport({
      provider: "consultant",
      candidates: [
        {
          title: "Письмо ФНС России от 10.03.2022 № АБ-4-20/1234",
          url: "https://www.nalog.gov.ru/example",
          citation: "Письмо ФНС России от 10.03.2022 № АБ-4-20/1234",
          document_number: "АБ-4-20/1234",
          document_date: "2022-03-10",
        },
      ],
    });

    expect(result.sources).toHaveLength(1);
    const source = result.sources[0];
    expect(source.bucket).toBe("fns_letters");
    expect(source.letter_number).toBe("АБ-4-20/1234");
    expect(source.letter_date).toBe("2022-03-10");
    expect(source.metadata.authority_level).toBeUndefined();
    expect(source.metadata.is_official).toBeUndefined();
    expect(source.metadata.substantive_use_allowed).toBe(false);
  });

  test("deduplicates the same external reference and preserves issue provenance", () => {
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
    expect(result.sources[0].bucket).toBe("court_practice");
    expect(result.sources[0].metadata.research_issue_ids).toEqual([
      "issue-2",
      "issue-1",
      "issue-3",
    ]);
  });

  test("skips unidentifiable prose candidates", () => {
    const result = normalizeExternalResearchImport({
      provider: "other",
      candidates: [
        {
          title: "Общий вывод консультанта",
          excerpt: "Никаких реквизитов или ссылки нет.",
        },
      ],
    });

    expect(result.sources).toEqual([]);
    expect(result.diagnostics.warnings).toContain("invalid_or_unidentifiable_candidates_skipped");
  });
});
