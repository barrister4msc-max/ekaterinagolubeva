// Phase C0 — UX Preflight before prepareAndGenerate.
//
// Deterministically reports whether the session is ready for document
// generation. Uses ONLY existing data sources:
//   - documents table (filtered by metadata->>intake_session_id)
//   - fetchLatestLegalAnalysis (document_intake_ai_runs)
//   - matter-snapshot signals (computeSessionSignals + detectStaleReasons)
//
// No new tables, no edge functions, no schema changes.

import { supabase } from "@/integrations/supabase/client";
import { fetchLatestLegalAnalysis, type LegalAnalysisRun } from "./legal-analysis";
import { computeSessionSignals } from "./matter-snapshot";
import { detectStaleReasons, type StaleReason } from "./matter-analysis";

export type PreflightCheckStatus = "ok" | "pending" | "fail" | "warn";

export type PreflightCheck = {
  id:
    | "documents"
    | "ocr"
    | "legal_analysis"
    | "analysis_fresh"
    | "matter_snapshot"
    | "generation_allowed"
    | "challenge"
    | "source_warnings";
  label: string;
  status: PreflightCheckStatus;
  message?: string;
};

export type PreflightResult = {
  ready: boolean;
  checks: PreflightCheck[];
  blocking_reasons: string[];
  warnings: string[];
  // Convenience: surface raw run id when we have a fresh analysis (helps debug).
  legal_analysis_run_id: string | null;
};

type SessionDocStat = {
  id: string;
  extraction_status: string | null;
  ocr_text_length: number;
};

async function loadSessionDocStats(sessionId: string): Promise<SessionDocStat[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, ocr_text, metadata")
    .filter("metadata->>intake_session_id", "eq", sessionId)
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((d: any) => ({
    id: d.id as string,
    extraction_status: ((d.metadata ?? {}) as Record<string, unknown>)?.extraction_status as
      | string
      | null,
    ocr_text_length: typeof d.ocr_text === "string" ? (d.ocr_text as string).length : 0,
  }));
}

const STALE_LABEL: Record<StaleReason, string> = {
  answers_changed: "ответы изменились",
  documents_changed: "состав документов изменился",
  sources_changed: "источники изменились",
  redaction_changed: "редакция документов изменилась",
  ocr_changed: "OCR изменился",
  analysis_schema_outdated: "схема анализа устарела",
  manual_rerun: "ручной перезапуск",
  no_analysis: "нет анализа",
};

export async function runGenerationPreflight(
  sessionId: string | null | undefined,
): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (!sessionId) {
    checks.push({
      id: "documents",
      label: "Документы загружены",
      status: "fail",
      message: "Сессия опросника не создана — загрузите документы.",
    });
    blocking.push("session_missing");
    return {
      ready: false,
      checks,
      blocking_reasons: blocking,
      warnings,
      legal_analysis_run_id: null,
    };
  }

  // -------------------------------------------------------------------------
  // 1. Documents present
  // -------------------------------------------------------------------------
  const docs = await loadSessionDocStats(sessionId);
  const completed = docs.filter(
    (d) => d.extraction_status === "completed" && d.ocr_text_length > 0,
  );
  const pendingOcr = docs.filter(
    (d) => d.extraction_status !== "completed" || d.ocr_text_length === 0,
  );

  if (docs.length === 0) {
    checks.push({
      id: "documents",
      label: "Документы загружены",
      status: "fail",
      message: "Документы не найдены. Загрузите документы для этой сессии.",
    });
    blocking.push("no_documents");
  } else {
    checks.push({
      id: "documents",
      label: "Документы загружены",
      status: "ok",
      message: `Загружено документов: ${docs.length}`,
    });
  }

  // -------------------------------------------------------------------------
  // 2. OCR finished
  // -------------------------------------------------------------------------
  if (docs.length > 0 && completed.length === 0) {
    checks.push({
      id: "ocr",
      label: "OCR завершён",
      status: "pending",
      message: "Извлечение текста ещё выполняется.",
    });
    blocking.push("ocr_pending");
  } else if (docs.length > 0 && pendingOcr.length > 0) {
    checks.push({
      id: "ocr",
      label: "OCR завершён",
      status: "warn",
      message: `Часть документов ещё обрабатывается (${pendingOcr.length} из ${docs.length}).`,
    });
    warnings.push("ocr_partial");
  } else if (docs.length > 0) {
    checks.push({
      id: "ocr",
      label: "OCR завершён",
      status: "ok",
      message: `Готовых документов: ${completed.length}.`,
    });
  } else {
    checks.push({
      id: "ocr",
      label: "OCR завершён",
      status: "fail",
      message: "Нет документов для извлечения.",
    });
  }

  // If documents/OCR not ready — short-circuit subsequent checks but still
  // surface them as pending so the user sees the full checklist.
  const docsBlock = blocking.length > 0;

  // -------------------------------------------------------------------------
  // 3. Legal analysis exists
  // -------------------------------------------------------------------------
  let run: LegalAnalysisRun | null = null;
  try {
    run = await fetchLatestLegalAnalysis(sessionId);
  } catch (e) {
    checks.push({
      id: "legal_analysis",
      label: "AI правовой анализ выполнен",
      status: "fail",
      message: `Ошибка получения анализа: ${(e as Error).message}`,
    });
    blocking.push("legal_analysis_fetch_error");
    return {
      ready: false,
      checks,
      blocking_reasons: blocking,
      warnings,
      legal_analysis_run_id: null,
    };
  }

  if (!run || !run.analysis) {
    checks.push({
      id: "legal_analysis",
      label: "AI правовой анализ выполнен",
      status: docsBlock ? "pending" : "fail",
      message: "Запустите AI правовой анализ в карточке опросника.",
    });
    blocking.push("legal_analysis_missing");
    return {
      ready: false,
      checks,
      blocking_reasons: blocking,
      warnings,
      legal_analysis_run_id: null,
    };
  }

  checks.push({
    id: "legal_analysis",
    label: "AI правовой анализ выполнен",
    status: "ok",
    message: `Run ${run.id.slice(0, 8)}… от ${new Date(run.created_at).toLocaleString("ru-RU")}`,
  });

  // -------------------------------------------------------------------------
  // 4. Analysis freshness
  // -------------------------------------------------------------------------
  try {
    const signals = await computeSessionSignals(sessionId);
    const reasons = detectStaleReasons(run, signals);
    if (reasons.length === 0) {
      checks.push({
        id: "analysis_fresh",
        label: "Анализ актуален",
        status: "ok",
      });
    } else {
      const human = reasons.map((r) => STALE_LABEL[r] ?? r).join(", ");
      const isSchemaOutdated = reasons.includes("analysis_schema_outdated");
      checks.push({
        id: "analysis_fresh",
        label: "Анализ актуален",
        status: "warn",
        message: isSchemaOutdated
          ? `Требуется обновление анализа (${human}).`
          : `Требуется повторный AI анализ (${human}).`,
      });
      warnings.push("analysis_stale");
      // Staleness is informational only — generation_allowed.draft is the
      // source of truth (Phase B). UI surfaces it as a warning.
    }
  } catch (e) {
    checks.push({
      id: "analysis_fresh",
      label: "Анализ актуален",
      status: "warn",
      message: `Не удалось проверить актуальность: ${(e as Error).message}`,
    });
    warnings.push("analysis_freshness_unknown");
  }

  // -------------------------------------------------------------------------
  // 5. Matter Snapshot (proxy: analysis present with Phase B keys)
  // -------------------------------------------------------------------------
  const analysis = run.analysis;
  const hasSnapshotShape =
    Array.isArray(analysis.trusted_sources) || Array.isArray(analysis.conclusions);
  checks.push({
    id: "matter_snapshot",
    label: "Matter Snapshot готов",
    status: hasSnapshotShape ? "ok" : "warn",
    message: hasSnapshotShape ? undefined : "Snapshot построен без trusted_sources/conclusions.",
  });

  // -------------------------------------------------------------------------
  // 6. generation_allowed.draft
  // -------------------------------------------------------------------------
  const decision = analysis.generation_allowed;
  if (decision) {
    if (decision.draft) {
      checks.push({
        id: "generation_allowed",
        label: "Draft разрешён",
        status: "ok",
      });
    } else {
      checks.push({
        id: "generation_allowed",
        label: "Draft разрешён",
        status: "fail",
        message: decision.reasons.length
          ? `Причины: ${decision.reasons.join("; ")}`
          : "Анализ заблокировал генерацию.",
      });
      blocking.push(...decision.reasons.map((r) => `generation_blocked:${r}`));
    }
  } else {
    checks.push({
      id: "generation_allowed",
      label: "Draft разрешён",
      status: "warn",
      message: "Поле generation_allowed отсутствует — будет применена устаревшая логика.",
    });
    warnings.push("generation_decision_missing");
  }

  // -------------------------------------------------------------------------
  // 7. Challenge status
  // -------------------------------------------------------------------------
  const challenge = analysis.challenge_result;
  if (!challenge) {
    checks.push({
      id: "challenge",
      label: "Quality Challenge пройден",
      status: "warn",
      message: "Результат challenge отсутствует.",
    });
  } else if (challenge.status === "blocked") {
    checks.push({
      id: "challenge",
      label: "Quality Challenge пройден",
      status: "fail",
      message: challenge.reasoning || "Challenge заблокировал генерацию.",
    });
    blocking.push("challenge_blocked");
  } else if (challenge.status === "needs_revision") {
    checks.push({
      id: "challenge",
      label: "Quality Challenge пройден",
      status: "warn",
      message: "Challenge требует ревизии — Draft разрешён, но проверьте предупреждения.",
    });
    warnings.push("challenge_needs_revision");
  } else {
    checks.push({
      id: "challenge",
      label: "Quality Challenge пройден",
      status: "ok",
    });
  }

  // -------------------------------------------------------------------------
  // 8. Source warnings (informational, never blocking for draft)
  // -------------------------------------------------------------------------
  const srcWarnings = analysis.source_warnings ?? [];
  if (srcWarnings.length > 0) {
    checks.push({
      id: "source_warnings",
      label: "Предупреждения по источникам",
      status: "warn",
      message: `${srcWarnings.length} предупреждение(й) — требуют ручной проверки.`,
    });
    warnings.push("source_warnings_present");
  } else {
    checks.push({
      id: "source_warnings",
      label: "Предупреждения по источникам",
      status: "ok",
    });
  }

  return {
    ready: blocking.length === 0,
    checks,
    blocking_reasons: blocking,
    warnings,
    legal_analysis_run_id: run.id,
  };
}
