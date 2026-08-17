import { describe, expect, test } from "bun:test";
import type { TrustedSource } from "./enrich.ts";
import { evaluateOfficialExplanationsCoverage } from "./research-coverage.ts";
import type { ResearchPlan } from "./research-routing.ts";

function plan(): ResearchPlan {
  return {
    all_modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
    buckets: ["laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals"],
    questions: [
      {
        id: "issue-1",
        issue: "Применение ст. 54.1 НК РФ",
        modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
        source_roles: ["normative", "judicial", "official_explanation", "adverse", "temporal"],
        exact_terms: [], metadata_terms: [], semantic_terms: [], fact_pattern_terms: [],
        argument_terms: [], adverse_terms: [], temporal_terms: [], temporal_anchors: [],
        buckets: ["laws", "court_practice", "fns_letters", "minfin_letters", "ekaterina", "manuals"],
      },
      {
        id: "issue-2",
        issue: "Недействительность договора",
        modes: ["exact", "metadata", "semantic", "fact_pattern", "issue_argument", "adverse", "temporal"],
        source_roles: ["normative", "judicial", "adverse", "temporal"],
        exact_terms: [], metadata_terms: [], semantic_terms: [], fact_pattern_terms: [],
        argument_terms: [], adverse_terms: [], temporal_terms: [], temporal_anchors: [],
        buckets: ["laws", "court_practice", "ekaterina", "manuals"],
      },
    ],
  };
}

function source(bucket: string, issueIds: string[], trust = 50): TrustedSource {
  return {
    source_id: `${bucket}-${issueIds.join("-")}`,
    source_ref: `ref:${bucket}:${issueIds.join("-")}`,
    source_table: "test",
    source_type: "test",
    bucket,
    title: "test",
    official_url: null,
    url: null,
    citation: null,
    scores: {},
    appearances: 1,
    merged_from: [],
    trust_score: trust,
    trust_reason: "test",
    use_in_generation: false,
    priority_group: null,
    is_winner: false,
    superseded_by: null,
    lower_priority_reason: null,
    verification_status: "needs_check",
    actuality_status: "requires_actuality_check",
    actually_used_in_generation: false,
    research_issue_ids: issueIds,
  };
}

describe("official explanations and letters coverage", () => {
  test("counts FNS and Minfin for the exact issue regardless of trust score", () => {
    const result = evaluateOfficialExplanationsCoverage({
      plan: plan(),
      trusted: [
        source("fns_letters", ["issue-1"], 30),
        source("minfin_letters", ["issue-1"], 40),
      ],
    });
    expect(result.status).toBe("covered");
    expect(result.gaps).toEqual([]);
    expect(result.by_issue[0].covered).toBe(true);
  });

  test("does not use a letter found for another issue as blanket coverage", () => {
    const result = evaluateOfficialExplanationsCoverage({
      plan: plan(),
      trusted: [
        source("fns_letters", ["issue-2"]),
        source("minfin_letters", ["issue-1"]),
      ],
    });
    expect(result.status).toBe("partial");
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toContain("[issue-1]");
    expect(result.gaps[0]).toContain("ФНС");
  });

  test("non-tax issue does not require official explanation coverage", () => {
    const result = evaluateOfficialExplanationsCoverage({ plan: plan(), trusted: [] });
    const nonTax = result.by_issue.find((item) => item.issue_id === "issue-2");
    expect(nonTax?.required).toBe(false);
    expect(nonTax?.covered).toBe(true);
  });
});
