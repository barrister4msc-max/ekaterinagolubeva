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
  | "OCR_NOT_READY";

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

const CRITICAL_CHALLENGE_KINDS = new Set([
  "hallucinated_source",
  "missing_applicable_norm",
  "outdated_law_without_replacement",
  "critical_missing_evidence",
  "critical_legal_contradiction",
  // these are emitted only when actually_used_in_generation=true:
  "low_trust_source_used",
  "newer_norm_revision",
]);

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

  const decision = snapshot.generation_allowed;
  const allowed = purpose === "final" ? decision.draft && decision.final : decision.draft;
  if (allowed) return;

  // Translate decision reasons into the most specific error code we can.
  const reasons = decision.reasons;
  const issues = snapshot.challenge_result?.issues ?? [];
  const hallucinated = reasons.includes("hallucinated_source");
  const provMissing = reasons.includes("provenance_missing");
  const insufficient = reasons.includes("source_sufficiency_insufficient_critical");
  const lowTrustUsed = reasons.includes("low_trust_or_superseded_used_in_generation");
  const criticalChallenge = issues.some((i) => CRITICAL_CHALLENGE_KINDS.has(i.kind));

  if (hallucinated) {
    throw new MatterGateError(
      "HALLUCINATED_SOURCE",
      "Обнаружены ссылки на источники вне реестра — генерация заблокирована.",
      reasons,
    );
  }
  if (provMissing) {
    throw new MatterGateError(
      "PROVENANCE_MISSING",
      "Часть выводов не имеет указания источников (provenance).",
      reasons,
    );
  }
  if (insufficient) {
    throw new MatterGateError(
      "SOURCE_SUFFICIENCY_INSUFFICIENT",
      "Недостаточно источников для обоснования позиции.",
      reasons,
    );
  }
  if (lowTrustUsed) {
    throw new MatterGateError(
      "LOW_TRUST_OR_SUPERSEDED_USED",
      "В генерации участвуют источники с use_in_generation=false или вытесненные более авторитетными.",
      reasons,
    );
  }
  if (criticalChallenge) {
    throw new MatterGateError(
      "CHALLENGE_CRITICAL",
      "AI Challenge нашёл критические нарушения правовой позиции.",
      issues.filter((i) => CRITICAL_CHALLENGE_KINDS.has(i.kind)).map((i) => i.description),
    );
  }
  throw new MatterGateError(
    "GENERATION_NOT_ALLOWED",
    purpose === "final"
      ? "Финальная генерация запрещена текущим решением Matter Snapshot."
      : "Генерация черновика запрещена текущим решением Matter Snapshot.",
    reasons,
  );
}
