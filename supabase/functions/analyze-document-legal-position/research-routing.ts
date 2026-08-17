import type { ResearchQuery } from "./fact-extraction.ts";
import type { Bucket } from "./repositories.ts";

export type ResearchMode =
  | "exact"
  | "metadata"
  | "semantic"
  | "fact_pattern"
  | "issue_argument"
  | "adverse"
  | "temporal";

export type ResearchSourceRole =
  | "normative"
  | "official_explanation"
  | "judicial"
  | "fact_pattern"
  | "adverse"
  | "temporal"
  | "factual_data"
  | "secondary_discovery";

export type ResearchQuestion = {
  id: string;
  issue: string;
  modes: ResearchMode[];
  source_roles: ResearchSourceRole[];
  exact_terms: string[];
  metadata_terms: string[];
  semantic_terms: string[];
  fact_pattern_terms: string[];
  argument_terms: string[];
  adverse_terms: string[];
  temporal_terms: string[];
  buckets: Bucket[];
};

export type ResearchPlan = {
  questions: ResearchQuestion[];
  all_modes: ResearchMode[];
  buckets: Bucket[];
};

const ALL_MODES: ResearchMode[] = [
  "exact",
  "metadata",
  "semantic",
  "fact_pattern",
  "issue_argument",
  "adverse",
  "temporal",
];

function uniq(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function isTaxIssue(text: string): boolean {
  return /налог|фнс|инспекц|ндс|ндфл|налогоплатель|54\.1|вычет|доначис|реконструкц/iu.test(text);
}

function needsCounterpartyFacts(text: string): boolean {
  return /контрагент|реальност|операци|поставк|товар|перевоз|склад|ресурс|техническ|номинальн|движени.{0,10}денеж|упд|счет.?фактур/iu.test(text);
}

function bucketsForIssue(issue: string): Bucket[] {
  const buckets: Bucket[] = ["laws", "court_practice"];
  if (isTaxIssue(issue)) buckets.push("fns_letters", "minfin_letters");
  buckets.push("ekaterina", "manuals");
  return [...new Set(buckets)];
}

function sourceRolesForIssue(issue: string): ResearchSourceRole[] {
  const roles: ResearchSourceRole[] = [
    "normative",
    "judicial",
    "fact_pattern",
    "adverse",
    "temporal",
  ];
  if (isTaxIssue(issue)) roles.push("official_explanation");
  if (needsCounterpartyFacts(issue)) roles.push("factual_data");
  return [...new Set(roles)];
}

function fallbackIssue(query: ResearchQuery): string {
  return (
    query.legal_issues?.[0] ??
    query.research_topics?.[0] ??
    query.semantic_intents?.[0] ??
    query.document_type ??
    "Общий правовой вопрос по материалам дела"
  );
}

export function buildResearchPlan(query: ResearchQuery): ResearchPlan {
  const issues = uniq([
    ...(query.legal_issues ?? []),
    ...(query.research_topics ?? []),
  ]).slice(0, 12);
  if (issues.length === 0) issues.push(fallbackIssue(query));

  const exactBase = uniq([
    ...(query.articles ?? []),
    ...(query.inn ?? []),
    ...(query.ogrn ?? []),
    ...(query.organizations ?? []),
    ...(query.dates ?? []),
  ]);

  const questions = issues.map((issue, index): ResearchQuestion => {
    const semanticTerms = uniq([
      issue,
      ...(query.semantic_intents ?? []),
      ...(query.legal_concepts ?? []),
    ]).slice(0, 12);

    const factPatternTerms = uniq([
      issue,
      ...(query.facts ?? []).slice(0, 8),
      ...(query.search_hypotheses ?? []).filter((value) => /факт|реальн|контрагент|поставк|исполн|доказ|операци/iu.test(value)),
    ]).slice(0, 12);

    return {
      id: `issue-${index + 1}`,
      issue,
      modes: [...ALL_MODES],
      source_roles: sourceRolesForIssue(issue),
      exact_terms: exactBase.slice(0, 16),
      metadata_terms: uniq([issue, ...(query.metadata_terms ?? [])]).slice(0, 12),
      semantic_terms: semanticTerms,
      fact_pattern_terms: factPatternTerms,
      argument_terms: uniq([issue, ...(query.legal_concepts ?? []), ...(query.research_topics ?? [])]).slice(0, 12),
      adverse_terms: uniq([
        `практика против позиции по вопросу: ${issue}`,
        `исключения и ограничения по вопросу: ${issue}`,
        `неблагоприятная судебная практика: ${issue}`,
      ]),
      temporal_terms: uniq([
        issue,
        ...(query.dates ?? []),
        ...(query.metadata_terms ?? []).filter((value) => /период|дата|редакц|действовал|год/iu.test(value)),
      ]).slice(0, 12),
      buckets: bucketsForIssue(issue),
    };
  });

  return {
    questions,
    all_modes: [...ALL_MODES],
    buckets: [...new Set(questions.flatMap((q) => q.buckets))],
  };
}

export function queryForBucket(query: ResearchQuery, plan: ResearchPlan, bucket: Bucket): ResearchQuery {
  const relevant = plan.questions.filter((question) => question.buckets.includes(bucket));
  if (relevant.length === 0) return query;

  return {
    ...query,
    legal_issues: uniq(relevant.map((q) => q.issue)),
    research_topics: uniq([
      ...(query.research_topics ?? []),
      ...relevant.flatMap((q) => q.argument_terms),
    ]),
    semantic_intents: uniq([
      ...(query.semantic_intents ?? []),
      ...relevant.flatMap((q) => q.semantic_terms),
      ...relevant.flatMap((q) => q.fact_pattern_terms),
      ...relevant.flatMap((q) => q.adverse_terms),
    ]),
    metadata_terms: uniq([
      ...(query.metadata_terms ?? []),
      ...relevant.flatMap((q) => q.metadata_terms),
      ...relevant.flatMap((q) => q.temporal_terms),
    ]),
    // Search hypotheses remain retrieval-only. They are not copied into facts.
    search_hypotheses: uniq([
      ...(query.search_hypotheses ?? []),
      ...relevant.flatMap((q) => q.adverse_terms),
    ]),
  };
}
