// Phase B (corrected) — Pre-generation Quality Gate.
// Validates a Matter Snapshot before invoking generate-legal-document-v2.
// Two purposes:
//   - "draft" (default): permissive. Allows partial / needs_revision unless
//     there is a critical issue (hallucination, missing applicable norm,
//     outdated law without replacement, low-trust/superseded source actually
//     used in generation, critical evidence gap, critical legal contradiction).
//   - "final": strict. Requires sufficient sources, no challenge issues, no
//     warnings that flag actual-use of low-trust/superseded sources.
// Superseded sources alone are WARNINGS, never blockers.

import type { MatterSnapshot } from "./matter-snapshot";
import type { LegalAnalysisRun } from "./legal-analysis";
import type { DocumentTemplate } from "./document-templates";

export type GateErrorCode =
  | "LEGAL_ANALYSIS_REQUIRED"
  | "STALE_ANALYSIS"
  | "GENERATION_NOT_ALLOWED"
  | "CHALLENGE_CRITICAL"
  | "SOURCE_SUFFICIENCY_INSUFFICIENT"
  | "PROVENANCE_MISSING"
  | "HALLUCINATED_SOURCE"
  | "LOW_TRUST_OR_SUPERSEDED_USED"
  | "REDACTION_REQUIRED"
  | "OCR_NOT_READY"
  | "UNSUPPORTED_CONCLUSIONS";

export class MatterGateError extends Error {
  code: GateErrorCode;
  reasons: string[];
  constructor(code: GateErrorCode, message: string, reasons: string[] = []) {
    super(message);
    this.code = code;
    this.reasons = reasons;
    this.name = "MatterGateError";
  }
}

export type GatePurpose = "draft" | "final";

export function isComplexTemplate(template: DocumentTemplate): boolean {
  return template.complexity === "advanced" || template.complexity === "expert";
}

export type GateInput = {
  template: DocumentTemplate;
  run: LegalAnalysisRun | null;
  snapshot: MatterSnapshot | null;
  purpose?: GatePurpose;
  wasStale?: boolean;
  staleReasons?: string[];
  redactionRequired?: boolean;
  ocrReady?: boolean;
};
function getUnsupportedConclusions(snapshot: MatterSnapshot) {
  return (snapshot.conclusions ?? []).filter(
    (c) =>
      (c?.provenance as any)?.needs_source === true ||
      (c?.provenance as any)?.use_in_generation === false ||
      (c?.provenance as any)?.support_level === "unsupported",
  );
}

// Issues that always block draft (truly critical).
const DRAFT_BLOCKING_CHALLENGE_KINDS = new Set([
  "hallucinated_source",
  "missing_applicable_norm",
  "critical_missing_evidence",
  "critical_legal_contradiction",
  "outdated_law_without_replacement",
]);

// Additional issues that only block final, not draft.
const FINAL_ONLY_BLOCKING_CHALLENGE_KINDS = new Set([
  "low_trust_source_used",
  "newer_norm_revision",
]);

// Soft warning types — never block draft on their own.
const SOFT_WARNING_TYPES = new Set([
  "superseded_source",
  "low_trust_source",
  "missing_official_url",
  "ekaterina_not_redacted",
]);

function hasActuallyUsedLowTrustSource(snapshot: MatterSnapshot): boolean {
  return (snapshot.trusted_sources ?? []).some(
    (s) => s.actually_used_in_generation === true && s.use_in_generation === false,
  );
}

function computeDraftBlockers(snapshot: MatterSnapshot): { code: GateErrorCode; reasons: string[] } | null {
  const issues = snapshot.challenge_result?.issues ?? [];

  // 1. Hallucinated source — always blocks.
  if (issues.some((i) => i.kind === "hallucinated_source")) {
    return { code: "HALLUCINATED_SOURCE", reasons: ["hallucinated_source"] };
  }
  // Also check conclusions provenance.
  if ((snapshot.conclusions ?? []).some((c) => c.provenance?.hallucinated_source)) {
    return { code: "HALLUCINATED_SOURCE", reasons: ["hallucinated_source"] };
  }

  // 2. Missing applicable norm / critical evidence / contradictions.
  const criticalIssue = issues.find((i) => DRAFT_BLOCKING_CHALLENGE_KINDS.has(i.kind));
  if (criticalIssue) {
    return {
      code: "CHALLENGE_CRITICAL",
      reasons: issues.filter((i) => DRAFT_BLOCKING_CHALLENGE_KINDS.has(i.kind)).map((i) => i.kind),
    };
  }

  // 3. Source actually used in generation despite use_in_generation=false.
  if (hasActuallyUsedLowTrustSource(snapshot)) {
    return {
      code: "LOW_TRUST_OR_SUPERSEDED_USED",
      reasons: ["low_trust_or_superseded_used_in_generation"],
    };
  }
const unsupported = getUnsupportedConclusions(snapshot);

const criticalUnsupported = unsupported.filter((c) =>
  [
    "main_position",
    "qualification",
    "recommendation",
  ].includes(c.kind),
);

if (criticalUnsupported.length > 0) {
  return {
    code: "UNSUPPORTED_CONCLUSIONS",
    reasons: criticalUnsupported.map((c) => c.kind),
  };
}
  // 4. Source sufficiency only blocks draft when explicitly insufficient_critical.
  if (snapshot.source_sufficiency?.status === "insufficient_critical") {
    return {
      code: "SOURCE_SUFFICIENCY_INSUFFICIENT",
      reasons: ["source_sufficiency_insufficient_critical"],
    };
  }

  return null;
}

function computeFinalExtraBlockers(snapshot: MatterSnapshot): { code: GateErrorCode; reasons: string[] } | null {
  // Final additionally requires "sufficient" sources and no remaining warnings on used sources.
  const status = snapshot.source_sufficiency?.status;
  if (status && status !== "sufficient") {
    return { code: "SOURCE_SUFFICIENCY_INSUFFICIENT", reasons: [`source_sufficiency_${status}`] };
  }
  const issues = snapshot.challenge_result?.issues ?? [];
  const finalIssue = issues.find((i) => FINAL_ONLY_BLOCKING_CHALLENGE_KINDS.has(i.kind));
  if (finalIssue) {
    return {
      code: "CHALLENGE_CRITICAL",
      reasons: issues
        .filter((i) => FINAL_ONLY_BLOCKING_CHALLENGE_KINDS.has(i.kind))
        .map((i) => i.kind),
    };
  }
  // Any warning that explicitly affects conclusions blocks final.
  const warningsOnUsed = (snapshot.source_warnings ?? []).filter(
    (w) => Array.isArray(w.affected_conclusions) && w.affected_conclusions.length > 0,
  );
  if (warningsOnUsed.length > 0) {
    return {
      code: "LOW_TRUST_OR_SUPERSEDED_USED",
      reasons: warningsOnUsed.map((w) => `${w.warning_type}:${w.source_ref}`),
    };
  }
  const unsupported = getUnsupportedConclusions(snapshot);

if (unsupported.length > 0) {
  return {
    code: "UNSUPPORTED_CONCLUSIONS",
    reasons: unsupported.map((c) => c.kind),
  };
}
  return null;
}

export function assertMatterGate(input: GateInput): void {
  const { template, run, snapshot } = input;
  const purpose: GatePurpose = input.purpose ?? "draft";
  if (!isComplexTemplate(template)) return; // simple/basic — gate disabled

  if (!run || run.status !== "completed" || !run.analysis || !snapshot) {
    throw new MatterGateError(
      "LEGAL_ANALYSIS_REQUIRED",
      "Для сложного документа требуется завершённый юридический анализ.",
    );
  }
  if (input.wasStale) {
    throw new MatterGateError(
      "STALE_ANALYSIS",
      "Юридический анализ устарел и был перезапущен. Повторите попытку.",
      input.staleReasons ?? [],
    );
  }
  if (input.redactionRequired && !snapshot.redaction_used) {
    throw new MatterGateError(
      "REDACTION_REQUIRED",
      "Требуется анонимизация документов перед генерацией.",
    );
  }
  if (input.ocrReady === false) {
    throw new MatterGateError(
      "OCR_NOT_READY",
      "Распознавание документов (OCR) ещё не завершено.",
    );
  }

  // Authoritative decision: trust generation_allowed when it exists,
  // BUT independently re-derive blockers from the snapshot so that soft
  // warnings (superseded_source, missing_official_url, ekaterina_not_redacted,
  // low-trust sources NOT actually used) never block a draft.
  const decision = snapshot.generation_allowed;
  const draftBlock = computeDraftBlockers(snapshot);

  if (purpose === "draft") {
    if (!draftBlock) return; // pass — soft warnings are tolerated for draft
    throw new MatterGateError(
      draftBlock.code,
      draftBlock.code === "HALLUCINATED_SOURCE"
        ? "Обнаружены ссылки на источники вне реестра — генерация заблокирована."
        : draftBlock.code === "LOW_TRUST_OR_SUPERSEDED_USED"
        ? "В генерации фактически использован источник с use_in_generation=false."
        : draftBlock.code === "SOURCE_SUFFICIENCY_INSUFFICIENT"
        ? "Недостаточно источников для обоснования позиции (критический уровень)."
        : "AI Challenge нашёл критические нарушения правовой позиции.",
      draftBlock.reasons,
    );
  }

  // purpose === "final"
  if (draftBlock) {
    throw new MatterGateError(draftBlock.code, "Финальная генерация заблокирована.", draftBlock.reasons);
  }
  // Respect generation_allowed.final when explicitly provided.
  if (decision && decision.final === false && decision.draft === true) {
    const finalExtra = computeFinalExtraBlockers(snapshot);
    if (finalExtra) {
      throw new MatterGateError(finalExtra.code, "Финальная генерация заблокирована.", finalExtra.reasons);
    }
    throw new MatterGateError(
      "GENERATION_NOT_ALLOWED",
      "Финальная генерация запрещена текущим решением Matter Snapshot.",
      decision.reasons ?? [],
    );
  }
  const finalExtra = computeFinalExtraBlockers(snapshot);
  if (finalExtra) {
    throw new MatterGateError(finalExtra.code, "Финальная генерация заблокирована.", finalExtra.reasons);
  }
  // Reference SOFT_WARNING_TYPES to keep it exported in type-only builds.
  void SOFT_WARNING_TYPES;
}
