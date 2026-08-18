import { describe, expect, test } from "bun:test";
import type { ResearchQuestion } from "./research-routing.ts";
import { buildGapSearchPatterns } from "./repositories.ts";

function question(): ResearchQuestion {
  return {
    id: "issue-1",
    issue: "Применимая редакция ст. 54.1 НК РФ к спорной операции",
    modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
    source_roles: ["normative", "judicial", "official_explanation", "adverse", "temporal"],
    exact_terms: [],
    metadata_terms: [],
    semantic_terms: [],
    fact_pattern_terms: [],
    argument_terms: [],
    adverse_terms: [],
    temporal_terms: [
      "Применимая редакция ст. 54.1 НК РФ к спорной операции",
      "Налоговый период 2022",
      "2022-01-01",
      "2022-12-31",
      "редакция, действовавшая в спорный период",
    ],
    temporal_anchors: [
      {
        role: "tax_period",
        label: "Налоговый период 2022",
        date: null,
        date_from: "2022-01-01",
        date_to: "2022-12-31",
        basis: "Период прямо установлен материалами дела",
      },
    ],
    buckets: ["laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals"],
  };
}

describe("temporal-aware GAP retry", () => {
  test("temporal applicability gap adds anchor/year and revision patterns", () => {
    const patterns = buildGapSearchPatterns(
      "[issue-1] Не разрешена temporal applicability для Налоговый период 2022: Применимая редакция ст. 54.1 НК РФ к спорной операции",
      question(),
    );

    expect(patterns.length).toBeGreaterThan(1);
    expect(patterns.some((pattern) => pattern.includes("2022"))).toBe(true);
    expect(patterns.some((pattern) => /редакц|действ/iu.test(pattern))).toBe(true);
  });

  test("ordinary non-temporal gap keeps issue-only retry", () => {
    const patterns = buildGapSearchPatterns(
      "[issue-1] Не найдена релевантная позиция ФНС",
      question(),
    );

    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toContain("Применимая");
  });

  test("temporal retry never manufactures current-date fallback", () => {
    const q = question();
    q.temporal_terms = [q.issue, "Неустановленная дата"];
    q.temporal_anchors = [{
      role: "other_relevant_legal_date",
      label: "Неустановленная дата",
      date: null,
      date_from: null,
      date_to: null,
      basis: "Дата не установлена",
    }];

    const patterns = buildGapSearchPatterns(
      "[issue-1] Не разрешена temporal applicability для Неустановленная дата",
      q,
    );

    expect(patterns.join(" ")).not.toMatch(/2026|сегодня|текущ/iu);
  });
});
