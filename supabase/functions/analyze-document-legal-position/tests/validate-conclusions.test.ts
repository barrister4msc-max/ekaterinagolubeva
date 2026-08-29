import { describe, expect, test } from "bun:test";
import {
  buildConclusionsAndIndex,
  buildFactRecords,
  setActuallyUsedInGeneration,
  validateConclusions,
  type Conclusion,
  type TrustedSource,
} from "../enrich.ts";

function source(sourceRef: string, overrides: Partial<TrustedSource> = {}): TrustedSource {
  return {
    source_id: sourceRef,
    source_ref: sourceRef,
    source_table: "legal_knowledge_chunks",
    source_type: "law_full_text",
    bucket: "laws",
    title: sourceRef,
    official_url: "https://example.test/source",
    url: null,
    citation: null,
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
    actuality_status: "requires_actuality_check",
    actually_used_in_generation: false,
    ...overrides,
  };
}

function conclusion(
  kind: Conclusion["kind"],
  refs: string[],
  sufficiency: Conclusion["provenance"]["sufficiency"]["status"] = "partial",
): Conclusion {
  return {
    conclusion_id: `c_${kind}`,
    kind,
    statement: `Вывод ${kind}`,
    provenance: {
      facts_used: [],
      documents_used: [],
      laws_used: refs,
      court_practice_used: [],
      letters_used: [],
      ekaterina_used: [],
      manuals_used: [],
      trust_summary: {
        min_trust_score: refs.length ? 100 : 0,
        weighted_avg: refs.length ? 100 : 0,
        lowest_source: refs[0] ?? null,
      },
      sufficiency: { status: sufficiency, reason: "test" },
      derivation: "fact→law",
      confidence: 0.9,
      reviewed_by_challenge: false,
      hallucinated_source: false,
      provenance_missing: refs.length === 0,
      support_level: "partial",
      needs_source: false,
      use_in_generation: true,
      unsupported_reason: null,
    },
  };
}

describe("validateConclusions", () => {
  test("carries explicit model source links into conclusion provenance", () => {
    const trusted = [source("law:nk:54.1")];
    const built = buildConclusionsAndIndex(
      {
        main_legal_position: "Применяется статья 54.1 НК РФ",
        conclusion_source_links: [
          {
            conclusion_key: "main_legal_position",
            source_ids: [trusted[0].source_id],
          },
        ],
      },
      trusted,
      [],
    );
    const [validated] = validateConclusions(built.conclusions, trusted);

    expect(validated.provenance.laws_used).toEqual([trusted[0].source_ref]);
    expect(validated.provenance).toMatchObject({
      sufficiency: { status: "sufficient" },
      support_level: "strong",
      needs_source: false,
      use_in_generation: true,
      hallucinated_source: false,
    });
    expect(built.provenance_index.source_to_conclusions[trusted[0].source_ref]).toEqual([
      validated.conclusion_id,
    ]);
  });

  test("blocks a mixed fact-to-law conclusion without a linked document", () => {
    const trusted = [source("law:nk:54.1")];
    const { records } = buildFactRecords([
      { fact_key: "F1", text: "Поставка товара состоялась" },
    ]);
    const fact = records[0]!;
    const built = buildConclusionsAndIndex(
      {
        fact_to_law_mapping: [
          {
            fact_key: "F1",
            fact: "Поставка товара состоялась",
            law: "Статья 54.1 НК РФ",
            conclusion: "Нужна оценка документального подтверждения поставки",
          },
        ],
        conclusion_source_links: [
          { conclusion_key: "fact_to_law:F1", source_ids: [trusted[0].source_id] },
        ],
      },
      trusted,
      records,
    );
    const [validated] = validateConclusions(built.conclusions, trusted);

    expect(validated.provenance).toMatchObject({
      facts_used: [fact.fact_id],
      documents_used: [],
      sufficiency: { status: "insufficient" },
      support_level: "unsupported",
      needs_source: true,
      use_in_generation: false,
      unsupported_reason: "Для смешанного вывода не установлены связанный факт и документ",
    });
  });

  test("blocks a mixed fact-to-law conclusion with a document but no linked fact", () => {
    const trusted = [source("law:nk:54.1")];
    const mixed = conclusion("fact_to_law", [trusted[0].source_ref], "sufficient");
    mixed.provenance.documents_used = ["doc-1"];

    const [validated] = validateConclusions([mixed], trusted);

    expect(validated.provenance).toMatchObject({
      facts_used: [],
      documents_used: ["doc-1"],
      support_level: "unsupported",
      needs_source: true,
      use_in_generation: false,
      unsupported_reason: "Для смешанного вывода не установлены связанный факт и документ",
    });
  });

  test("keeps a sourced opponent assertion reportable but never strong", () => {
    const trusted = [source("law:nk:54.1")];
    const built = buildConclusionsAndIndex(
      {
        tax_authority_position: "Налоговый орган утверждает наличие схемы дробления бизнеса",
        conclusion_source_links: [
          { conclusion_key: "tax_authority_position", source_ids: [trusted[0].source_id] },
        ],
      },
      trusted,
      [],
    );
    const [validated] = validateConclusions(built.conclusions, trusted);

    expect(validated.provenance).toMatchObject({
      sufficiency: { status: "sufficient" },
      support_level: "partial",
      use_in_generation: true,
    });
  });

  test("does not infer a run-wide source link when explicit linkage is absent", () => {
    const trusted = [source("law:nk:54.1")];
    const built = buildConclusionsAndIndex(
      { main_legal_position: "Применяется статья 54.1 НК РФ" },
      trusted,
      [],
    );
    const [validated] = validateConclusions(built.conclusions, trusted);

    expect(validated.provenance.laws_used).toEqual([]);
    expect(validated.provenance.use_in_generation).toBe(false);
  });

  test("blocks a substantive legal conclusion without a linked source", () => {
    const [validated] = validateConclusions([conclusion("main_position", [])], []);

    expect(validated.provenance).toMatchObject({
      support_level: "unsupported",
      needs_source: true,
      use_in_generation: false,
      confidence: 0.35,
      unsupported_reason: "Для юридического вывода не установлен источник",
    });
  });

  test("marks a sufficiently supported conclusion as strong", () => {
    const trusted = [source("law:nk:54.1"), source("court:a40-1")];
    const [validated] = validateConclusions(
      [
        conclusion(
          "main_position",
          trusted.map((item) => item.source_ref),
          "sufficient",
        ),
      ],
      trusted,
    );

    expect(validated.provenance).toMatchObject({
      support_level: "strong",
      needs_source: false,
      use_in_generation: true,
      confidence: 0.9,
      unsupported_reason: null,
    });
  });

  test("blocks a traceable fact-to-law conclusion without linked fact and document", () => {
    const trusted = [source("law:nk:54.1")];
    const [validated] = validateConclusions(
      [conclusion("fact_to_law", [trusted[0].source_ref])],
      trusted,
    );

    expect(validated.provenance).toMatchObject({
      support_level: "unsupported",
      needs_source: true,
      use_in_generation: false,
      unsupported_reason: "Для смешанного вывода не установлены связанный факт и документ",
    });
  });

  test("blocks a conclusion linked to a source forbidden for generation", () => {
    const trusted = [source("manual:weak", { use_in_generation: false, is_winner: false })];
    const [validated] = validateConclusions(
      [conclusion("recommendation", [trusted[0].source_ref])],
      trusted,
    );

    expect(validated.provenance).toMatchObject({
      support_level: "unsupported",
      needs_source: true,
      use_in_generation: false,
      unsupported_reason: "Вывод опирается на источник, запрещённый для генерации",
    });
  });

  test("allows an operational generation instruction without its own source", () => {
    const [validated] = validateConclusions([conclusion("generation_instruction", [])], []);

    expect(validated.provenance).toMatchObject({
      support_level: "partial",
      needs_source: false,
      use_in_generation: true,
    });
  });

  test("marks sources from generation conclusions only", () => {
    const allowedSource = source("law:allowed");
    const blockedSource = source("law:blocked");
    const allowed = conclusion("main_position", [allowedSource.source_ref]);
    const blocked = conclusion("recommendation", [blockedSource.source_ref]);
    blocked.provenance.use_in_generation = false;

    setActuallyUsedInGeneration([allowedSource, blockedSource], [allowed, blocked]);

    expect(allowedSource.actually_used_in_generation).toBe(true);
    expect(blockedSource.actually_used_in_generation).toBe(false);
  });
});
