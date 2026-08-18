import type { TrustedSource } from "./enrich.ts";
import type { ResearchPlan } from "./research-routing.ts";

export type OfficialExplanationIssueCoverage = {
  issue_id: string;
  issue: string;
  required: boolean;
  fns_found: boolean;
  minfin_found: boolean;
  covered: boolean;
};

export type OfficialExplanationsCoverage = {
  status: "not_required" | "covered" | "partial";
  gaps: string[];
  by_issue: OfficialExplanationIssueCoverage[];
};

function sourceIssueIds(source: TrustedSource): string[] {
  return Array.isArray(source.research_issue_ids)
    ? source.research_issue_ids.filter((value): value is string => typeof value === "string")
    : [];
}

/**
 * Research coverage is deliberately independent from trust_score.
 * A letter may have lower formal authority than a statute/court act and still
 * be required to understand an authority's position. This function only asks
 * whether the required explanation classes were researched for the issue.
 * Legal weight, verification, actuality and conflicts remain downstream.
 */
export function evaluateOfficialExplanationsCoverage(opts: {
  plan: ResearchPlan;
  trusted: TrustedSource[];
}): OfficialExplanationsCoverage {
  const byIssue: OfficialExplanationIssueCoverage[] = opts.plan.questions.map((question) => {
    const required = question.source_roles.includes("official_explanation");
    if (!required) {
      return {
        issue_id: question.id,
        issue: question.issue,
        required: false,
        fns_found: false,
        minfin_found: false,
        covered: true,
      };
    }

    const sourcesForIssue = opts.trusted.filter((source) => sourceIssueIds(source).includes(question.id));
    const fnsRequired = question.buckets.includes("fns_letters");
    const minfinRequired = question.buckets.includes("minfin_letters");
    const fnsFound = !fnsRequired || sourcesForIssue.some((source) => source.bucket === "fns_letters");
    const minfinFound = !minfinRequired || sourcesForIssue.some((source) => source.bucket === "minfin_letters");

    return {
      issue_id: question.id,
      issue: question.issue,
      required: true,
      fns_found: fnsFound,
      minfin_found: minfinFound,
      covered: fnsFound && minfinFound,
    };
  });

  const required = byIssue.filter((item) => item.required);
  if (required.length === 0) return { status: "not_required", gaps: [], by_issue: byIssue };

  const gaps: string[] = [];
  for (const item of required) {
    if (!item.fns_found) gaps.push(`[${item.issue_id}] Не исследована релевантная позиция ФНС по вопросу: ${item.issue}`);
    if (!item.minfin_found) gaps.push(`[${item.issue_id}] Не исследована релевантная позиция Минфина по вопросу: ${item.issue}`);
  }

  return {
    status: gaps.length === 0 ? "covered" : "partial",
    gaps,
    by_issue: byIssue,
  };
}
