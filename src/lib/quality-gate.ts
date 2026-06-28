// Phase B — Pre-generation Quality Gate.
// Validates a Matter Snapshot before invoking generate-legal-document-v2.
// Throws typed errors so the UI can show actionable messages.

import type { MatterSnapshot } from "./matter-snapshot";
import type { LegalAnalysisRun } from "./legal-analysis";
import type { DocumentTemplate } from "./document-templates";

export type GateErrorCode =
  | "LEGAL_ANALYSIS_REQUIRED"
  | "STALE_ANALYSIS"
  | "CHALLENGE_BLOCKED"
  | "SOURCE_SUFFICIENCY_INSUFFICIENT"
  | "PROVENANCE_MISSING"
  | "HALLUCINATED_SOURCE"
  | "LOW_TRUST_SOURCES_USED"
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

export function isComplexTemplate(template: DocumentTemplate): boolean {
  return template.complexity === "advanced" || template.complexity === "expert";
}

export type GateInput = {
  template: DocumentTemplate;
  run: LegalAnalysisRun | null;
  snapshot: MatterSnapshot | null;
  wasStale?: boolean;
  staleReasons?: string[];
  redactionRequired?: boolean;
  ocrReady?: boolean;
};

export function assertMatterGate(input: GateInput): void {
  const { template, run, snapshot } = input;
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
  if (snapshot.challenge_result?.status === "blocked") {
    throw new MatterGateError(
      "CHALLENGE_BLOCKED",
      "AI Challenge заблокировал генерацию: обнаружены критические проблемы в правовой позиции.",
      snapshot.challenge_result.issues.map((i) => i.description),
    );
  }
  if (snapshot.source_sufficiency?.status === "insufficient_critical") {
    throw new MatterGateError(
      "SOURCE_SUFFICIENCY_INSUFFICIENT",
      "Недостаточно источников для обоснования позиции.",
      snapshot.source_sufficiency.gaps ?? [],
    );
  }
  const provMissing = snapshot.conclusions.filter((c) => c.provenance?.provenance_missing);
  if (provMissing.length > 0) {
    throw new MatterGateError(
      "PROVENANCE_MISSING",
      "Часть выводов не имеет указания источников (provenance).",
      provMissing.map((c) => c.conclusion_id),
    );
  }
  const hallucinated = snapshot.conclusions.filter((c) => c.provenance?.hallucinated_source);
  if (hallucinated.length > 0) {
    throw new MatterGateError(
      "HALLUCINATED_SOURCE",
      "Обнаружены ссылки на источники, отсутствующие в реестре.",
      hallucinated.map((c) => c.conclusion_id),
    );
  }
  // Low-trust sources that ended up in generation scope (use_in_generation=false but referenced by a conclusion).
  const usedRefs = new Set<string>();
  for (const c of snapshot.conclusions) {
    for (const r of [
      ...c.provenance.laws_used,
      ...c.provenance.court_practice_used,
      ...c.provenance.letters_used,
      ...c.provenance.ekaterina_used,
      ...c.provenance.manuals_used,
    ]) usedRefs.add(r);
  }
  const lowTrustUsed = snapshot.trusted_sources.filter(
    (s) => usedRefs.has(s.source_ref) && s.use_in_generation === false,
  );
  if (lowTrustUsed.length > 0) {
    throw new MatterGateError(
      "LOW_TRUST_SOURCES_USED",
      "В генерации участвуют источники с use_in_generation=false.",
      lowTrustUsed.map((s) => s.source_ref),
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
}
