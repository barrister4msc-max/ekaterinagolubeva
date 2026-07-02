// Quality Review Center — pure compute + persistence helpers.
// Не создаёт новых таблиц, не вызывает Edge Functions.
// Все данные читаются из существующих:
//   - generated_legal_documents.metadata (включая matter_snapshot,
//     legal_analysis_run_id, source_sufficiency_status, challenge_status и т.д.)
//   - document_intake_ai_runs.review_result.source_warning_reviews
//
// Запись:
//   - generated_legal_documents.metadata.quality_review
//   - generated_legal_documents.metadata.ready_for_lawyer
//   - generated_legal_documents.metadata.review_timeline (append)

import { supabase } from "@/integrations/supabase/client";
import {
  loadReviewMap,
  warningKey,
  computeRemainingWarnings,
  type SourceWarningReviewMap,
} from "./source-warning-reviews";
import type {
  LegalAnalysisConclusion,
  LegalAnalysisEvidenceMatrix,
  LegalAnalysisProvenanceIndex,
  LegalAnalysisSourceWarning,
  LegalAnalysisTrustedSource,
} from "./legal-analysis";

export type QualityCheckStatus = "success" | "warning" | "blocked" | "unknown";

export type QualityCheckId =
  | "documents"
  | "ocr"
  | "legal_analysis"
  | "matter_snapshot"
  | "evidence_matrix"
  | "source_sufficiency"
  | "challenge"
  | "source_review"
  | "provenance"
  | "ai_review"
  | "redaction"
  | "generation_metadata"
  | "case_intelligence_review"
  | "ready_for_lawyer";

export type QualityCheck = {
  id: QualityCheckId;
  label: string;
  status: QualityCheckStatus;
  message: string;
};

export type QualityReviewStatus =
  | "ready_for_lawyer"
  | "ready_with_warnings"
  | "blocked"
  | "unknown";

export type QualityReviewResult = {
  status: QualityReviewStatus;
  checked_at: string;
  ready_for_lawyer: boolean;
  counts: { success: number; warning: number; blocked: number };
  checks: QualityCheck[];
  summary: string;
};

export type ReviewTimelineEvent = {
  type: "quality_review";
  status: QualityReviewStatus;
  created_at: string;
  summary: string;
};

// ---------------- compute ----------------

type ComputeInput = {
  meta: Record<string, any> | null | undefined;
  reviewRun?: { status?: string | null; ai_result?: any } | null;
  reviews: SourceWarningReviewMap;
  reviewContext?: Record<string, any> | null;
};

const LABELS: Record<QualityCheckId, string> = {
  documents: "Документы",
  ocr: "OCR",
  legal_analysis: "AI правовой анализ",
  matter_snapshot: "Matter Snapshot",
  evidence_matrix: "Evidence Matrix",
  source_sufficiency: "Source Sufficiency",
  challenge: "Quality Challenge",
  source_review: "Source Review",
  provenance: "Provenance",
  ai_review: "AI Review",
  redaction: "Redaction",
  generation_metadata: "Generation Metadata",
  case_intelligence_review: "Case Intelligence",
  ready_for_lawyer: "Готовность к юристу",
};

function ok(id: QualityCheckId, message = "OK"): QualityCheck {
  return { id, label: LABELS[id], status: "success", message };
}
function warn(id: QualityCheckId, message: string): QualityCheck {
  return { id, label: LABELS[id], status: "warning", message };
}
function block(id: QualityCheckId, message: string): QualityCheck {
  return { id, label: LABELS[id], status: "blocked", message };
}
function unk(id: QualityCheckId, message: string): QualityCheck {
  return { id, label: LABELS[id], status: "unknown", message };
}

export function computeQualityReview(input: ComputeInput): QualityReviewResult {
  const meta = input.meta ?? {};
  const snap = (meta.matter_snapshot ?? null) as Record<string, any> | null;
  const reviews = input.reviews ?? {};
  const reviewContext = input.reviewContext ?? {};
  const checks: QualityCheck[] = [];

  // ---- Documents
  const docs: Array<{ id: string; title: string; used: boolean }> = snap?.documents ?? [];
  if (docs.length === 0) {
    checks.push(block("documents", "В Matter Snapshot нет документов клиента."));
  } else {
    const used = docs.filter((d) => d.used).length;
    if (used === 0) checks.push(warn("documents", `Документов ${docs.length}, но ни один не помечен used.`));
    else checks.push(ok("documents", `Документов: ${docs.length}, использовано: ${used}.`));
  }

  // ---- OCR
  if (docs.length === 0) {
    checks.push(block("ocr", "Нет документов для OCR."));
  } else {
    const usedDocs = docs.filter((d) => d.used);
    if (usedDocs.length === docs.length) checks.push(ok("ocr", "Все документы готовы и используются."));
    else if (usedDocs.length === 0) checks.push(block("ocr", "OCR-результаты не использованы ни в одном выводе."));
    else
      checks.push(
        warn(
          "ocr",
          `Использовано ${usedDocs.length} из ${docs.length}; часть документов не вошла в анализ.`,
        ),
      );
  }

  // ---- AI правовой анализ
  const runId: string | null = meta.legal_analysis_run_id ?? snap?.legal_analysis_run_id ?? null;
  if (runId) checks.push(ok("legal_analysis", `Run ${String(runId).slice(0, 8)}…`));
  else checks.push(block("legal_analysis", "legal_analysis_run_id отсутствует."));

  // ---- Matter Snapshot
  if (snap) checks.push(ok("matter_snapshot", "Snapshot записан в metadata."));
  else checks.push(block("matter_snapshot", "metadata.matter_snapshot отсутствует."));

  // ---- Evidence Matrix
  const matrix: LegalAnalysisEvidenceMatrix = snap?.evidence_matrix ?? [];
  const conclusions: LegalAnalysisConclusion[] = snap?.conclusions ?? [];
  if (matrix.length === 0) {
    checks.push(snap ? warn("evidence_matrix", "Evidence Matrix пуст.") : block("evidence_matrix", "Snapshot отсутствует."));
  } else {
    const usedFactIdsInConclusions = new Set<string>();
    for (const c of conclusions) for (const f of c.provenance?.facts_used ?? []) usedFactIdsInConclusions.add(f);
    const missingUsed = matrix.filter(
      (m) => m.evidence_status === "missing" && usedFactIdsInConclusions.has(m.fact_id),
    );
    const partial = matrix.filter((m) => m.evidence_status === "partial").length;
    if (missingUsed.length > 0)
      checks.push(block("evidence_matrix", `Факты без доказательств используются в выводах: ${missingUsed.length}.`));
    else if (partial > 0) checks.push(warn("evidence_matrix", `Частичные доказательства: ${partial}.`));
    else checks.push(ok("evidence_matrix", `Факты подтверждены, всего: ${matrix.length}.`));
  }

  // ---- Source Sufficiency
  const sufficiency = snap?.source_sufficiency?.status ?? meta.source_sufficiency_status ?? null;
  if (!sufficiency) checks.push(unk("source_sufficiency", "Статус достаточности источников неизвестен."));
  else if (sufficiency === "sufficient") checks.push(ok("source_sufficiency", "Источников достаточно."));
  else if (sufficiency === "partial") checks.push(warn("source_sufficiency", "Источников частично достаточно."));
  else if (sufficiency === "insufficient_critical")
    checks.push(block("source_sufficiency", "Критическая недостаточность источников."));
  else checks.push(warn("source_sufficiency", `Статус: ${sufficiency}.`));

  // ---- Challenge
  const challengeStatus = snap?.challenge_result?.status ?? meta.challenge_status ?? null;
  if (!challengeStatus) checks.push(unk("challenge", "Quality Challenge не выполнен."));
  else if (challengeStatus === "passed") checks.push(ok("challenge", "Challenge пройден."));
  else if (challengeStatus === "needs_revision") checks.push(warn("challenge", "Challenge требует ревизии."));
  else if (challengeStatus === "blocked") checks.push(block("challenge", "Challenge заблокировал генерацию."));
  else checks.push(warn("challenge", `Статус: ${challengeStatus}.`));

  // ---- Source Review
  const warnings: LegalAnalysisSourceWarning[] = snap?.source_warnings ?? [];
  const trustedByRef = new Map<string, LegalAnalysisTrustedSource>();
  for (const s of (snap?.trusted_sources ?? []) as LegalAnalysisTrustedSource[]) trustedByRef.set(s.source_ref, s);
  if (warnings.length === 0) {
    checks.push(ok("source_review", "Предупреждений по источникам нет."));
  } else {
    const remaining = computeRemainingWarnings(warnings, reviews);
    const usedDangerous = remaining.filter((w) => {
      const ts = trustedByRef.get(w.source_ref);
      return ts?.actually_used_in_generation === true;
    });
    if (usedDangerous.length > 0)
      checks.push(
        block(
          "source_review",
          `${usedDangerous.length} предупреждение(й) по источникам, фактически использованным в генерации, без accept.`,
        ),
      );
    else if (remaining.length > 0)
      checks.push(
        warn("source_review", `Без решения reviewer-а: ${remaining.length} из ${warnings.length}.`),
      );
    else checks.push(ok("source_review", "Все предупреждения accepted."));
  }

  // ---- Provenance
  const provIndex: LegalAnalysisProvenanceIndex | null = snap?.provenance_index ?? null;
  if (!provIndex && conclusions.length === 0) {
    checks.push(snap ? warn("provenance", "Provenance index отсутствует.") : block("provenance", "Snapshot отсутствует."));
  } else {
    const missing = conclusions.filter((c) => c.provenance?.provenance_missing).length;
    const hallucinated = conclusions.filter((c) => c.provenance?.hallucinated_source).length;
    if (missing > 0 || hallucinated > 0)
      checks.push(
        block(
          "provenance",
          `Conclusions с provenance_missing: ${missing}, hallucinated_source: ${hallucinated}.`,
        ),
      );
    else if (!provIndex)
      checks.push(warn("provenance", "provenance_index отсутствует, но conclusions имеют provenance."));
    else checks.push(ok("provenance", "Provenance полный."));
  }

  // ---- AI Review (review-generated-legal-document)
  const reviewStatus = input.reviewRun?.status ?? null;
  const reviewResult = (input.reviewRun?.ai_result ?? {}) as Record<string, any>;
  const criticalIssues = Number(
    reviewResult?.critical_issues_count ?? reviewResult?.critical?.length ?? 0,
  );
  if (!reviewStatus) checks.push(warn("ai_review", "AI Review ещё не выполнен."));
  else if (reviewStatus === "completed" && criticalIssues > 0)
    checks.push(block("ai_review", `AI Review нашёл критические проблемы: ${criticalIssues}.`));
  else if (reviewStatus === "completed") checks.push(ok("ai_review", "AI Review завершён без критических проблем."));
  else if (reviewStatus === "failed") checks.push(block("ai_review", "AI Review завершился с ошибкой."));
  else checks.push(warn("ai_review", `AI Review: ${reviewStatus}.`));

  // ---- Redaction
  const redactionUsed: boolean = Boolean(snap?.redaction_used ?? meta.redaction_used);
  const redactionRequired: boolean = Boolean(
    meta.redaction_required ?? snap?.redaction_required ?? false,
  );
  const redactionAccepted: boolean = Boolean(
    meta.redaction_accepted ?? snap?.redaction_accepted ?? redactionUsed,
  );
  if (!redactionRequired) checks.push(ok("redaction", "Обезличивание не требуется."));
  else if (redactionAccepted) checks.push(ok("redaction", "Обезличивание принято."));
  else if (!docs.some((d) => d.used))
    checks.push(warn("redaction", "Требуется обезличивание, но документы не используются в генерации."));
  else checks.push(block("redaction", "Требуется обезличивание используемых документов."));

  // ---- Generation Metadata
  const genFromAnalysis = Boolean(meta.generated_from_legal_analysis);
  const provPresent = Boolean(meta.provenance_index_present ?? !!provIndex);
  const matrixPresent = Boolean(meta.evidence_matrix_present ?? matrix.length > 0);
  if (genFromAnalysis && runId && snap && provPresent && matrixPresent)
    checks.push(ok("generation_metadata", "Все ключи provenance metadata присутствуют."));
  else {
    const missing: string[] = [];
    if (!genFromAnalysis) missing.push("generated_from_legal_analysis");
    if (!runId) missing.push("legal_analysis_run_id");
    if (!snap) missing.push("matter_snapshot");
    if (!provPresent) missing.push("provenance_index_present");
    if (!matrixPresent) missing.push("evidence_matrix_present");
    checks.push(block("generation_metadata", `Отсутствуют поля: ${missing.join(", ")}.`));
  }

  // ---- Aggregate
  const blocked = checks.filter((c) => c.status === "blocked").length;
  const warningCount = checks.filter((c) => c.status === "warning").length;
  const success = checks.filter((c) => c.status === "success").length;

  const status: QualityReviewStatus = blocked > 0 ? "blocked" : warningCount > 0 ? "ready_with_warnings" : "ready_for_lawyer";
  const ready = blocked === 0;

  // ready_for_lawyer as a row in the checklist
  checks.push(
    ready
      ? ok("ready_for_lawyer", warningCount === 0 ? "Готов к юридической проверке." : "Готов с предупреждениями.")
      : block("ready_for_lawyer", "Есть блокирующие проблемы."),
  );

  const summary =
    status === "ready_for_lawyer"
      ? `Готов: ${success} ok`
      : status === "ready_with_warnings"
        ? `Готов с предупреждениями: ${warningCount} warn, ${success} ok`
        : `Заблокировано: ${blocked} блок., ${warningCount} warn`;

  return {
    status,
    checked_at: new Date().toISOString(),
    ready_for_lawyer: ready,
    counts: { success, warning: warningCount, blocked },
    checks,
    summary,
  };
}

// ---------------- persistence ----------------

export type LoadInputsArgs = {
  documentId: string;
  legalAnalysisRunId: string | null;
};

export async function loadReviewInputs(args: LoadInputsArgs): Promise<{
  reviews: SourceWarningReviewMap;
  reviewRun: { status?: string | null; ai_result?: any } | null;
}> {
  const [reviewsRaw, reviewRunResp] = await Promise.all([
    args.legalAnalysisRunId
      ? loadReviewMap(args.legalAnalysisRunId).catch(() => ({}) as SourceWarningReviewMap)
      : Promise.resolve({} as SourceWarningReviewMap),
    supabase
      .from("document_intake_ai_runs")
      .select("status, ai_result")
      .eq("generated_document_id" as any, args.documentId)
      .eq("run_type", "review")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    reviews: reviewsRaw ?? {},
    reviewRun: (reviewRunResp.data as any) ?? null,
  };
}

export async function persistQualityReview(
  documentId: string,
  result: QualityReviewResult,
): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from("generated_legal_documents")
    .select("metadata")
    .eq("id", documentId)
    .maybeSingle();
  if (readErr) throw readErr;

  const current = (row?.metadata ?? {}) as Record<string, any>;
  const timeline = Array.isArray(current.review_timeline) ? current.review_timeline.slice() : [];
  const event: ReviewTimelineEvent = {
    type: "quality_review",
    status: result.status,
    created_at: result.checked_at,
    summary: result.summary,
  };
  timeline.push(event);

  const nextMetadata = {
    ...current,
    quality_review: {
      status: result.status,
      checked_at: result.checked_at,
      counts: result.counts,
      checks: result.checks,
      summary: result.summary,
    },
    ready_for_lawyer: result.ready_for_lawyer,
    review_timeline: timeline,
  };

  const { error: writeErr } = await supabase
    .from("generated_legal_documents")
    .update({ metadata: nextMetadata })
    .eq("id", documentId);
  if (writeErr) throw writeErr;
}

// Re-export key for UI consumers that want to match warning keys with reviews.
export { warningKey };
