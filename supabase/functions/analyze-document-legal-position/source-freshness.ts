export type FreshnessState = "CURRENT" | "RECHECK_DUE" | "UNRESOLVED";

export type RecheckOutcome =
  | "UNCHANGED"
  | "SOURCE_CHANGED"
  | "STATUS_CHANGED"
  | "UNAVAILABLE";

export type ChangeSignal =
  | "SOURCE_CHANGED"
  | "STATUS_CHANGED"
  | "POSITION_UPDATE_AVAILABLE";

export type SourceFreshnessClass =
  | "LAW_CODE"
  | "OFFICIAL_EXPLANATION"
  | "COURT_PRACTICE"
  | "OTHER";

export type SourceFreshnessPolicy = {
  maxAgeDays: number;
  documentFreshness: boolean;
  issuePositionFreshness: boolean;
  practiceFreshness: boolean;
};

export const SOURCE_FRESHNESS_POLICIES: Record<SourceFreshnessClass, SourceFreshnessPolicy> = {
  LAW_CODE: {
    maxAgeDays: 14,
    documentFreshness: true,
    issuePositionFreshness: false,
    practiceFreshness: false,
  },
  OFFICIAL_EXPLANATION: {
    maxAgeDays: 30,
    documentFreshness: true,
    issuePositionFreshness: true,
    practiceFreshness: false,
  },
  COURT_PRACTICE: {
    maxAgeDays: 30,
    documentFreshness: false,
    issuePositionFreshness: true,
    practiceFreshness: true,
  },
  OTHER: {
    maxAgeDays: 60,
    documentFreshness: true,
    issuePositionFreshness: false,
    practiceFreshness: false,
  },
};

const LAW_CODE_TYPES = new Set([
  "law",
  "law_full_text",
  "federal_law",
  "codex",
  "code",
  "legislation",
  "normative_act",
]);

const EXPLANATION_TYPES = new Set([
  "fns_letter",
  "minfin_letter",
  "official_explanation",
  "tax_explanation",
  "letter",
]);

const COURT_TYPES = new Set([
  "court",
  "court_act",
  "court_practice",
  "vs_review",
  "judicial_practice",
]);

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function classifySourceFreshness(sourceType: string | null | undefined): SourceFreshnessClass {
  const source = normalize(sourceType);
  if (LAW_CODE_TYPES.has(source)) return "LAW_CODE";
  if (EXPLANATION_TYPES.has(source)) return "OFFICIAL_EXPLANATION";
  if (COURT_TYPES.has(source)) return "COURT_PRACTICE";
  return "OTHER";
}

export function sourceFreshnessPolicy(sourceType: string | null | undefined): SourceFreshnessPolicy {
  return SOURCE_FRESHNESS_POLICIES[classifySourceFreshness(sourceType)];
}

function parseInstant(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

const UNRESOLVED_VERIFICATION = new Set([
  "failed",
  "unresolved",
  "unavailable",
  "error",
]);

export type DeriveSourceFreshnessInput = {
  sourceType: string | null | undefined;
  lastCheckedAt: string | null | undefined;
  verificationStatus?: string | null;
  now: string;
  maxAgeDaysOverride?: number | null;
};

/**
 * Operational freshness only. This function does not decide legal applicability
 * and never derives SOURCE_CHANGED from a single registry snapshot.
 */
export function deriveSourceFreshness(input: DeriveSourceFreshnessInput): FreshnessState {
  const now = parseInstant(input.now);
  if (now === null) return "UNRESOLVED";

  if (UNRESOLVED_VERIFICATION.has(normalize(input.verificationStatus))) {
    return "UNRESOLVED";
  }

  if (!input.lastCheckedAt) return "RECHECK_DUE";
  const checkedAt = parseInstant(input.lastCheckedAt);
  if (checkedAt === null || checkedAt > now) return "UNRESOLVED";

  const policy = sourceFreshnessPolicy(input.sourceType);
  const maxAgeDays = input.maxAgeDaysOverride ?? policy.maxAgeDays;
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return "UNRESOLVED";

  const ageMs = now - checkedAt;
  return ageMs >= maxAgeDays * 24 * 60 * 60 * 1000 ? "RECHECK_DUE" : "CURRENT";
}

export type SourceObservation = {
  available: boolean;
  revisionDate?: string | null;
  currentStatus?: string | null;
  contentHash?: string | null;
};

/** Compare a prior verified observation with the new official-provider observation. */
export function deriveRecheckOutcome(
  before: SourceObservation,
  after: SourceObservation,
): RecheckOutcome {
  if (!after.available) return "UNAVAILABLE";

  const beforeStatus = normalize(before.currentStatus);
  const afterStatus = normalize(after.currentStatus);
  if (beforeStatus && afterStatus && beforeStatus !== afterStatus) {
    return "STATUS_CHANGED";
  }

  const beforeRevision = normalize(before.revisionDate);
  const afterRevision = normalize(after.revisionDate);
  const beforeHash = normalize(before.contentHash);
  const afterHash = normalize(after.contentHash);

  if (
    (beforeRevision && afterRevision && beforeRevision !== afterRevision) ||
    (beforeHash && afterHash && beforeHash !== afterHash)
  ) {
    return "SOURCE_CHANGED";
  }

  return "UNCHANGED";
}

export function changeSignalForOutcome(outcome: RecheckOutcome): ChangeSignal | null {
  if (outcome === "SOURCE_CHANGED") return "SOURCE_CHANGED";
  if (outcome === "STATUS_CHANGED") return "STATUS_CHANGED";
  return null;
}

export type PositionUpdateInput = {
  sameResearchIssue: boolean;
  newMaterialIsOfficial: boolean;
  newMaterialIsLater: boolean;
};

/**
 * New official material for the same issue is a position signal, not a mutation
 * of the previously used letter/court act.
 */
export function derivePositionUpdateSignal(input: PositionUpdateInput): ChangeSignal | null {
  return input.sameResearchIssue && input.newMaterialIsOfficial && input.newMaterialIsLater
    ? "POSITION_UPDATE_AVAILABLE"
    : null;
}

export type UsageEventLike = {
  id: string;
  source_id?: string | null;
  source_ref?: string | null;
};

export type AnalysisRunLike = {
  id: string;
  used_sources?: unknown;
};

function runUsesRegistrySource(value: unknown, registryId: string): boolean {
  if (Array.isArray(value)) return value.some((item) => runUsesRegistrySource(item, registryId));
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    record.legal_source_registry_id === registryId ||
    record.registry_source_id === registryId ||
    record.source_registry_id === registryId
  ) {
    return true;
  }
  return Object.values(record).some((item) => runUsesRegistrySource(item, registryId));
}

/** Read-only affected-usage lookup; it never mutates historical analysis snapshots. */
export function findAffectedUsages(
  registryId: string,
  usageEvents: UsageEventLike[],
  runs: AnalysisRunLike[],
): { usageEventIds: string[]; runIds: string[] } {
  const usageEventIds = usageEvents
    .filter((event) => event.source_id === registryId || event.source_ref === registryId)
    .map((event) => event.id);
  const runIds = runs
    .filter((run) => runUsesRegistrySource(run.used_sources, registryId))
    .map((run) => run.id);

  return {
    usageEventIds: [...new Set(usageEventIds)],
    runIds: [...new Set(runIds)],
  };
}
