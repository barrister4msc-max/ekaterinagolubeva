import type { Bucket } from "./repositories.ts";
import type { ResearchMode, ResearchQuestion, ResearchSourceRole } from "./research-routing.ts";

export type ResearchQueryObjective =
  | "exact_case"
  | "issue_search"
  | "adverse_search"
  | "temporal_search";

export type ResearchJurisdiction =
  | "RU"
  | "RU_ARBITRATION"
  | "RU_GENERAL_JURISDICTION"
  | "RU_TAX";

export type ResearchCourtLevel =
  | "any"
  | "first_instance"
  | "appeal"
  | "cassation"
  | "supreme_court"
  | "constitutional_court";

export type ResearchProcedureStage =
  | "any"
  | "pretrial"
  | "first_instance"
  | "appeal"
  | "cassation"
  | "supervisory"
  | "enforcement";

export type ResearchSensitivityClass =
  | "unclassified"
  | "public_legal_issue"
  | "public_case_reference"
  | "restricted_exact_party";

export type ResearchIssueArgumentType =
  | "issue"
  | "argument"
  | "counter_argument"
  | "adverse";

export type ResearchQueryFacet = {
  kind:
    | "case_number"
    | "legal_issue"
    | "applicable_provision"
    | "jurisdiction"
    | "court_level"
    | "temporal_from"
    | "temporal_to"
    | "research_mode";
  value: string;
};

export type ResearchExternalQuery = {
  privacy_version: "08G-v1";
  classification_provenance: "explicit_input" | "unclassified_fail_closed";
  redaction: "structured_facets_only";
  facets: readonly ResearchQueryFacet[];
  external_execution_allowed: boolean;
};

export type ResearchQueryPlan = {
  plan_id: string;
  plan_version: "08B-v1";
  revision: number;
  lineage: {
    matter_id: string;
    legal_analysis_run_id: string;
    research_issue_id: string;
  };
  objective: ResearchQueryObjective;
  required_capabilities: Bucket[];
  source_roles: ResearchSourceRole[];
  jurisdiction: ResearchJurisdiction;
  procedure_stage: ResearchProcedureStage;
  court_level: ResearchCourtLevel;
  issue_argument_type: ResearchIssueArgumentType;
  applicable_provisions: string[];
  temporal_window: { from: string | null; to: string | null };
  adverse_search: boolean;
  allowlisted_facets: ResearchQueryFacet[];
  sensitivity_class: ResearchSensitivityClass;
  external_query: ResearchExternalQuery;
  query_expansion_proposals: string[];
  planner_provenance: {
    planner: "deterministic_research_query_planner";
    version: "08B-v1";
    source_question_id: string;
    network_used: false;
    provider_selected: false;
  };
  transport: {
    provider_id: null;
    transport_id: null;
  };
};

export type ResearchQueryPlanInput = {
  matter_id: string;
  legal_analysis_run_id: string;
  research_issue: ResearchQuestion;
  revision?: number;
  objective?: ResearchQueryObjective;
  jurisdiction?: ResearchJurisdiction;
  procedure_stage?: ResearchProcedureStage;
  court_level?: ResearchCourtLevel;
  issue_argument_type?: ResearchIssueArgumentType;
  applicable_provisions?: string[];
  temporal_window?: { from?: string | null; to?: string | null };
  exact_case_number?: string | null;
  sensitivity_class?: ResearchSensitivityClass;
  model_expansion_proposals?: string[];
};

const BUCKETS = new Set<Bucket>([
  "laws",
  "court_practice",
  "fns_letters",
  "minfin_letters",
  "ekaterina",
  "manuals",
]);
const MODES = new Set<ResearchMode>([
  "exact",
  "metadata",
  "semantic",
  "fact_pattern",
  "issue_argument",
  "adverse",
  "temporal",
]);
const OBJECTIVES = new Set<ResearchQueryObjective>([
  "exact_case",
  "issue_search",
  "adverse_search",
  "temporal_search",
]);
const JURISDICTIONS = new Set<ResearchJurisdiction>([
  "RU",
  "RU_ARBITRATION",
  "RU_GENERAL_JURISDICTION",
  "RU_TAX",
]);
const COURT_LEVELS = new Set<ResearchCourtLevel>([
  "any",
  "first_instance",
  "appeal",
  "cassation",
  "supreme_court",
  "constitutional_court",
]);
const PROCEDURE_STAGES = new Set<ResearchProcedureStage>([
  "any", "pretrial", "first_instance", "appeal", "cassation", "supervisory", "enforcement",
]);
const SOURCE_ROLES = new Set<ResearchSourceRole>([
  "normative", "official_explanation", "judicial", "fact_pattern", "adverse", "temporal", "factual_data", "secondary_discovery",
]);
const ISSUE_TYPES = new Set<ResearchIssueArgumentType>([
  "issue",
  "argument",
  "counter_argument",
  "adverse",
]);
const SENSITIVITY = new Set<ResearchSensitivityClass>([
  "unclassified",
  "public_legal_issue",
  "public_case_reference",
  "restricted_exact_party",
]);

const ARBITRATION_CASE_RE = /^А\d+-\d+\/\d{4}$/u;
const FORBIDDEN_IDENTIFIER_RE = /(?:\b\d{10}\b|\b\d{12}\b|\b\d{13}\b|\b\d{15}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:^|[^А-ЯЁA-Z0-9])(?:ООО|АО|ПАО|ЗАО|ИП|ОАО)\s+["«][^"»]+["»])/iu;
const FREE_TEXT_KEYS = new Set([
  "document_text",
  "ocr_text",
  "full_text",
  "facts",
  "parties",
  "inn",
  "ogrn",
  "addresses",
  "emails",
  "phones",
]);
const ALLOWED_INPUT_KEYS = new Set([
  "matter_id",
  "legal_analysis_run_id",
  "research_issue",
  "revision",
  "objective",
  "jurisdiction",
  "procedure_stage",
  "court_level",
  "issue_argument_type",
  "applicable_provisions",
  "temporal_window",
  "exact_case_number",
  "sensitivity_class",
  "model_expansion_proposals",
]);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`invalid_${field}`);
  return value.trim();
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : null;
}

function uniq(values: Array<string | null | undefined>, max = 16): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = text(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function hash32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function normalizeCaseNumber(value: unknown): string | null {
  const normalized = text(value)?.replace(/\s+/g, "").toUpperCase() ?? null;
  if (!normalized) return null;
  if (!ARBITRATION_CASE_RE.test(normalized)) throw new Error("invalid_exact_case_number");
  return normalized;
}

function safePublicText(value: unknown, field: string): string {
  const normalized = requiredText(value, field).replace(/\s+/g, " ");
  if (FORBIDDEN_IDENTIFIER_RE.test(normalized)) throw new Error(`forbidden_identifier_in_${field}`);
  return normalized;
}

function normalizeDate(value: unknown, field: string): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) throw new Error(`invalid_${field}`);
  const timestamp = Date.parse(`${normalized}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) throw new Error(`invalid_${field}`);
  return normalized;
}

function deriveTemporalWindow(question: ResearchQuestion): { from: string | null; to: string | null } {
  const dates = question.temporal_anchors.flatMap((anchor) => [anchor.date_from, anchor.date, anchor.date_to])
    .filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value));
  if (dates.length === 0) return { from: null, to: null };
  const sorted = [...dates].sort();
  return { from: sorted[0] ?? null, to: sorted[sorted.length - 1] ?? null };
}

function inferObjective(input: ResearchQueryPlanInput, caseNumber: string | null): ResearchQueryObjective {
  if (input.objective) return input.objective;
  if (caseNumber) return "exact_case";
  if (input.research_issue.modes.includes("adverse")) return "adverse_search";
  if (input.research_issue.modes.includes("temporal") && input.research_issue.temporal_anchors.length > 0) {
    return "temporal_search";
  }
  return "issue_search";
}

function validateQuestion(value: unknown): ResearchQuestion {
  if (!value || typeof value !== "object") throw new Error("invalid_research_issue");
  const question = value as ResearchQuestion;
  const id = requiredText(question.id, "research_issue_id");
  const issue = safePublicText(question.issue, "research_issue");
  if (!Array.isArray(question.modes) || question.modes.some((mode) => !MODES.has(mode))) {
    throw new Error("invalid_research_modes");
  }
  if (!Array.isArray(question.buckets) || question.buckets.length === 0 || question.buckets.some((bucket) => !BUCKETS.has(bucket))) {
    throw new Error("invalid_research_capabilities");
  }
  if (!Array.isArray(question.source_roles) || question.source_roles.length === 0 || question.source_roles.some((role) => !SOURCE_ROLES.has(role))) {
    throw new Error("invalid_research_source_roles");
  }
  if (!Array.isArray(question.temporal_anchors)) throw new Error("invalid_temporal_anchors");
  return { ...question, id, issue, source_roles: [...new Set(question.source_roles)] };
}

function assertInputBoundary(input: unknown): asserts input is ResearchQueryPlanInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_query_plan_input");
  const keys = Object.keys(input as Record<string, unknown>);
  for (const key of keys) {
    if (FREE_TEXT_KEYS.has(key)) throw new Error(`forbidden_query_plan_field:${key}`);
    if (!ALLOWED_INPUT_KEYS.has(key)) throw new Error(`unknown_query_plan_field:${key}`);
  }
}

/**
 * Prompt 08B: deterministic, offline, provider-neutral pre-transport contract.
 * It consumes the existing ResearchQuestion emitted by research-routing.ts.
 * It does not execute a provider, choose a transport, call a model/network, or
 * promote model expansion proposals into executable facets.
 */
export function buildResearchQueryPlan(rawInput: unknown): ResearchQueryPlan {
  assertInputBoundary(rawInput);
  const input = rawInput as ResearchQueryPlanInput;
  const question = validateQuestion(input.research_issue);
  const matterId = requiredText(input.matter_id, "matter_id");
  const runId = requiredText(input.legal_analysis_run_id, "legal_analysis_run_id");
  const revision = input.revision ?? 1;
  if (!Number.isInteger(revision) || revision < 1) throw new Error("invalid_query_revision");

  const caseNumber = normalizeCaseNumber(input.exact_case_number);
  const objective = inferObjective({ ...input, research_issue: question }, caseNumber);
  if (!OBJECTIVES.has(objective)) throw new Error("invalid_query_objective");

  const jurisdiction = input.jurisdiction ?? (caseNumber ? "RU_ARBITRATION" : "RU");
  if (!JURISDICTIONS.has(jurisdiction)) throw new Error("invalid_query_jurisdiction");
  const procedureStage = input.procedure_stage ?? "any";
  if (!PROCEDURE_STAGES.has(procedureStage)) throw new Error("invalid_procedure_stage");
  const courtLevel = input.court_level ?? "any";
  if (!COURT_LEVELS.has(courtLevel)) throw new Error("invalid_court_level");
  const issueType = input.issue_argument_type ?? (objective === "adverse_search" ? "adverse" : "issue");
  if (!ISSUE_TYPES.has(issueType)) throw new Error("invalid_issue_argument_type");
  // Classification is not inferred from narrative or the presence of a case number.
  // Unknown classification is a valid planning state but cannot execute externally.
  const sensitivity = input.sensitivity_class ?? "unclassified";
  if (!SENSITIVITY.has(sensitivity)) throw new Error("invalid_sensitivity_class");

  const provisions = uniq(input.applicable_provisions ?? [], 12);
  for (const provision of provisions) {
    if (FORBIDDEN_IDENTIFIER_RE.test(provision)) throw new Error("forbidden_identifier_in_applicable_provision");
  }

  const derivedWindow = deriveTemporalWindow(question);
  const temporalWindow = {
    from: normalizeDate(input.temporal_window?.from ?? derivedWindow.from, "temporal_from"),
    to: normalizeDate(input.temporal_window?.to ?? derivedWindow.to, "temporal_to"),
  };
  if (temporalWindow.from && temporalWindow.to && temporalWindow.from > temporalWindow.to) {
    throw new Error("invalid_temporal_window");
  }

  const requiredCapabilities = [...new Set([
    ...question.buckets,
    ...(caseNumber ? (["court_practice"] as Bucket[]) : []),
  ])];
  const facets: ResearchQueryFacet[] = [
    { kind: "legal_issue", value: question.issue },
    { kind: "jurisdiction", value: jurisdiction },
    { kind: "court_level", value: courtLevel },
    ...question.modes.map((mode): ResearchQueryFacet => ({ kind: "research_mode", value: mode })),
    ...provisions.map((provision): ResearchQueryFacet => ({ kind: "applicable_provision", value: provision })),
  ];
  if (caseNumber) facets.unshift({ kind: "case_number", value: caseNumber });
  if (temporalWindow.from) facets.push({ kind: "temporal_from", value: temporalWindow.from });
  if (temporalWindow.to) facets.push({ kind: "temporal_to", value: temporalWindow.to });

  const externalFacets = facets.filter((facet) =>
    facet.kind === "case_number" ||
    facet.kind === "applicable_provision" ||
    facet.kind === "jurisdiction" ||
    facet.kind === "court_level" ||
    facet.kind === "temporal_from" ||
    facet.kind === "temporal_to"
  );
  const hasExternalRequisite = externalFacets.some((facet) =>
    facet.kind === "case_number" || facet.kind === "applicable_provision"
  );
  const externalQuery: ResearchExternalQuery = {
    privacy_version: "08G-v1",
    classification_provenance: input.sensitivity_class ? "explicit_input" : "unclassified_fail_closed",
    redaction: "structured_facets_only",
    facets: externalFacets,
    external_execution_allowed:
      hasExternalRequisite &&
      (sensitivity === "public_legal_issue" || sensitivity === "public_case_reference"),
  };

  const proposals = uniq(input.model_expansion_proposals ?? [], 8)
    .filter((proposal) => !FORBIDDEN_IDENTIFIER_RE.test(proposal));

  const identityPayload = {
    plan_version: "08B-v1",
    revision,
    lineage: { matter_id: matterId, legal_analysis_run_id: runId, research_issue_id: question.id },
    objective,
    required_capabilities: requiredCapabilities,
    source_roles: question.source_roles,
    jurisdiction,
    procedure_stage: procedureStage,
    court_level: courtLevel,
    issue_argument_type: issueType,
    applicable_provisions: provisions,
    temporal_window: temporalWindow,
    adverse_search: objective === "adverse_search" || question.modes.includes("adverse"),
    allowlisted_facets: facets,
    sensitivity_class: sensitivity,
    external_query: externalQuery,
  };

  return {
    plan_id: `rqp_${hash32(stableStringify(identityPayload))}`,
    plan_version: "08B-v1",
    revision,
    lineage: identityPayload.lineage,
    objective,
    required_capabilities: requiredCapabilities,
    source_roles: question.source_roles,
    jurisdiction,
    procedure_stage: procedureStage,
    court_level: courtLevel,
    issue_argument_type: issueType,
    applicable_provisions: provisions,
    temporal_window: temporalWindow,
    adverse_search: identityPayload.adverse_search,
    allowlisted_facets: facets,
    sensitivity_class: sensitivity,
    external_query: externalQuery,
    // Proposal-only by contract: these values are never copied into facets.
    query_expansion_proposals: proposals,
    planner_provenance: {
      planner: "deterministic_research_query_planner",
      version: "08B-v1",
      source_question_id: question.id,
      network_used: false,
      provider_selected: false,
    },
    transport: { provider_id: null, transport_id: null },
  };
}
