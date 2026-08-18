import { describe, expect, test } from "bun:test";
import type { TemporalAnchor } from "./fact-extraction.ts";
import type { ResearchPlan, ResearchQuestion } from "./research-routing.ts";
import type { TrustedSource } from "./enrich.ts";
import { evaluateTemporalApplicability } from "./temporal-applicability.ts";

const pointAnchor: TemporalAnchor = {
  role: "transaction_date",
  label: "Дата спорной операции",
  date: "2022-03-01",
  date_from: null,
  date_to: null,
  basis: "Дата прямо указана в договоре и первичных документах",
};

function question(
  id = "issue-1",
  issue = "Применимая редакция ст. 54.1 НК РФ к спорной операции",
  anchors: TemporalAnchor[] = [pointAnchor],
): ResearchQuestion {
  return {
    id,
    issue,
    modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
    source_roles: ["normative", "judicial", "official_explanation", "adverse", "temporal"],
    exact_terms: [],
    metadata_terms: [],
    semantic_terms: [],
    fact_pattern_terms: [],
    argument_terms: [],
    adverse_terms: [],
    temporal_terms: anchors.flatMap((anchor) => [anchor.date, anchor.date_from, anchor.date_to].filter((v): v is string => !!v)),
    temporal_anchors: anchors,
    buckets: ["laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals"],
  };
}

function plan(questions: ResearchQuestion[] = [question()]): ResearchPlan {
  return {
    questions,
    all_modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
    buckets: ["laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals"],
  };
}

function source(overrides: Record<string, unknown> = {}): TrustedSource {
  return {
    source_id: "law-1",
    source_ref: "legal_knowledge_chunks:law-1",
    source_type: "law_full_text",
    bucket: "laws",
    title: "НК РФ ст. 54.1",
    official_url: "https://publication.pravo.gov.ru/",
    citation: "НК РФ ст. 54.1",
    scores: { semantic: 0.9, keyword: 1, priority: 1, relevance: 1, final: 0.95 },
    appearances: 1,
    trust_score: 95,
    trust_reason: "test",
    use_in_generation: true,
    actually_used_in_generation: false,
    research_issue_ids: ["issue-1"],
    ...overrides,
  } as TrustedSource;
}

describe("temporal applicability", () => {
  test("1. effective_from before point anchor with no effective_to => APPLICABLE", () => {
    const result = evaluateTemporalApplicability({
      plan: plan(),
      trusted: [source({ effective_from: "2017-08-19", effective_to: null })],
    });

    expect(result.gaps).toEqual([]);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].verdict).toBe("APPLICABLE");
    expect(result.checks[0].status).toBe("covered");
  });

  test("2. anchor before effective_from => NOT_APPLICABLE", () => {
    const result = evaluateTemporalApplicability({
      plan: plan(),
      trusted: [source({ effective_from: "2023-01-01", effective_to: null })],
    });

    expect(result.checks[0].verdict).toBe("NOT_APPLICABLE");
    expect(result.checks[0].status).toBe("conflict");
    expect(result.gaps.some((gap) => gap.includes("не применимы"))).toBe(true);
  });

  test("3. anchor after effective_to => NOT_APPLICABLE", () => {
    const result = evaluateTemporalApplicability({
      plan: plan(),
      trusted: [source({ effective_from: "2017-08-19", effective_to: "2021-12-31" })],
    });

    expect(result.checks[0].verdict).toBe("NOT_APPLICABLE");
    expect(result.gaps.some((gap) => gap.includes("не применимы"))).toBe(true);
  });

  test("4. missing temporal metadata => UNKNOWN", () => {
    const result = evaluateTemporalApplicability({ plan: plan(), trusted: [source()] });

    expect(result.checks[0].verdict).toBe("UNKNOWN");
    expect(result.checks[0].status).toBe("unresolved");
    expect(result.gaps.some((gap) => gap.includes("Не разрешена temporal applicability"))).toBe(true);
  });

  test("5. current_status=repealed does not erase historical applicability", () => {
    const result = evaluateTemporalApplicability({
      plan: plan(),
      trusted: [source({
        effective_from: "2017-08-19",
        effective_to: "2023-12-31",
        current_status: "repealed",
      })],
    });

    expect(result.checks[0].verdict).toBe("APPLICABLE");
    expect(result.checks[0].reason).toContain("историческую применимость");
    expect(result.gaps).toEqual([]);
  });

  test("6. later revision_date is not back-projected to an earlier point anchor", () => {
    const result = evaluateTemporalApplicability({
      plan: plan(),
      trusted: [source({
        effective_from: "2017-08-19",
        effective_to: null,
        revision_date: "2025-01-01",
      })],
    });

    expect(result.checks[0].verdict).toBe("NOT_APPLICABLE");
    expect(result.checks[0].reason).toContain("не может применяться ретроспективно");
  });

  test("7. two issues with different anchors can yield different applicability for one source", () => {
    const secondAnchor: TemporalAnchor = {
      ...pointAnchor,
      label: "Дата второго события",
      date: "2025-03-01",
      basis: "Дата второго события прямо указана в материалах",
    };
    const researchPlan = plan([
      question("issue-1", "Исторический вопрос", [pointAnchor]),
      question("issue-2", "Поздний вопрос", [secondAnchor]),
    ]);
    const shared = source({
      effective_from: "2024-01-01",
      effective_to: null,
      research_issue_ids: ["issue-1", "issue-2"],
    });

    const result = evaluateTemporalApplicability({ plan: researchPlan, trusted: [shared] });
    const first = result.checks.find((check) => check.issue_id === "issue-1");
    const second = result.checks.find((check) => check.issue_id === "issue-2");
    expect(first?.verdict).toBe("NOT_APPLICABLE");
    expect(second?.verdict).toBe("APPLICABLE");
  });

  test("8. later FNS/Minfin letter is not silently treated as contemporaneous", () => {
    const fnsLetter = source({
      source_id: "fns-2026",
      source_ref: "legal_knowledge_chunks:fns-2026",
      source_type: "fns_letter",
      bucket: "fns_letters",
      title: "Письмо ФНС 2026 года",
      effective_from: "2026-01-15",
      revision_date: "2026-01-15",
    });
    const minfinLetter = source({
      source_id: "minfin-2026",
      source_ref: "legal_knowledge_chunks:minfin-2026",
      source_type: "minfin_letter",
      bucket: "minfin_letters",
      title: "Письмо Минфина 2026 года",
      effective_from: "2026-02-10",
      revision_date: "2026-02-10",
    });

    const result = evaluateTemporalApplicability({ plan: plan(), trusted: [fnsLetter, minfinLetter] });
    expect(result.checks).toHaveLength(2);
    expect(result.checks.every((check) => check.verdict === "NOT_APPLICABLE")).toBe(true);
    expect(result.checks.every((check) => check.reason.includes("поздним интерпретационным материалом"))).toBe(true);
    expect(result.gaps.some((gap) => gap.includes("не применимы"))).toBe(true);
  });

  test("9. incomplete/unknown period is not collapsed to one endpoint", () => {
    const incomplete: TemporalAnchor = {
      role: "tax_period",
      label: "Неполный налоговый период",
      date: null,
      date_from: "2022-01-01",
      date_to: null,
      basis: "Модель вернула только начало периода",
    };
    const result = evaluateTemporalApplicability({
      plan: plan([question("issue-1", "Вопрос по периоду", [incomplete])]),
      trusted: [source({ effective_from: "2017-08-19" })],
    });

    expect(result.checks).toEqual([]);
    expect(result.gaps.some((gap) => gap.includes("Не разрешена temporal applicability"))).toBe(true);
  });

  test("10. current date is never used as fallback for an unnormalized anchor", () => {
    const invalid: TemporalAnchor = {
      role: "other_relevant_legal_date",
      label: "Неустановленная дата",
      date: "сегодня",
      date_from: null,
      date_to: null,
      basis: "Дата не установлена документами",
    };
    const result = evaluateTemporalApplicability({
      plan: plan([question("issue-1", "Вопрос без установленной даты", [invalid])]),
      trusted: [source({ effective_from: "2017-08-19" })],
    });

    expect(result.checks).toEqual([]);
    expect(result.gaps.some((gap) => gap.includes("Не разрешена temporal applicability"))).toBe(true);
  });

  test("period partial overlap remains UNKNOWN rather than full applicability", () => {
    const period: TemporalAnchor = {
      role: "tax_period",
      label: "Налоговый период 2022",
      date: null,
      date_from: "2022-01-01",
      date_to: "2022-12-31",
      basis: "Налоговый период прямо указан в материалах",
    };
    const result = evaluateTemporalApplicability({
      plan: plan([question("issue-1", "Вопрос по периоду", [period])]),
      trusted: [source({ effective_from: "2022-06-01", effective_to: null })],
    });

    expect(result.checks[0].verdict).toBe("UNKNOWN");
    expect(result.checks[0].reason).toContain("частично пересекается");
    expect(result.gaps.some((gap) => gap.includes("Не разрешена temporal applicability"))).toBe(true);
  });

  test("does not use a source attributed to another research issue", () => {
    const result = evaluateTemporalApplicability({
      plan: plan(),
      trusted: [source({ research_issue_ids: ["issue-2"], effective_from: "2017-08-19" })],
    });

    expect(result.checks).toEqual([]);
    expect(result.gaps.some((gap) => gap.includes("Не найден источник"))).toBe(true);
  });
});
