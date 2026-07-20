import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, ShieldAlert } from "lucide-react";

export type CheckStatus = "pass" | "warn" | "fail" | "skip";
export type CheckSeverity = "critical" | "warning";

export type ConsistencyCheckItem = {
  id: string;
  label: string;
  severity: CheckSeverity;
  status: CheckStatus;
  detail?: string;
};

export type ConsistencyResult = {
  checks: ConsistencyCheckItem[];
  criticalFailed: ConsistencyCheckItem[];
  warningsFailed: ConsistencyCheckItem[];
  ready: boolean; // no critical fail
  blockReason: string | null;
};

type BuildInput = {
  doc: { id: string; status?: string | null; lawyer_approved_at?: string | null } | null;
  legalAnalysisRunId: string | null;
  analysisRun: { status?: string | null; ai_result?: any } | null;
  reviewRun: { status?: string | null; ai_result?: any } | null;
  analysis: any;
  review: any;
  meta: any;
  argumentsCount: number;
  sources: any[];
  usedContext: boolean;
  contextQuality: number | null;
};

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function isCritical(item: any): boolean {
  const s = String(item?.severity ?? item?.level ?? item?.priority ?? "").toLowerCase();
  return s === "critical" || s === "high" || s === "blocker" || s === "severe";
}

function hasPreciseLocalization(s: any): boolean {
  if (!s || typeof s !== "object") return false;
  const candidates = [
    s.article, s.paragraph, s.point, s.clause, s.page, s.section,
    s.статья, s.пункт, s.абзац, s.страница,
    s.localization, s.location, s.quote, s.fragment,
  ];
  return candidates.some((v) => v != null && String(v).trim() !== "");
}

export function buildConsistencyChecks(input: BuildInput): ConsistencyResult {
  const {
    doc, legalAnalysisRunId, analysisRun, reviewRun, analysis, review,
    argumentsCount, sources, usedContext, contextQuality,
  } = input;

  const checks: ConsistencyCheckItem[] = [];

  // 1. Document exists
  checks.push({
    id: "doc",
    label: "Документ загружен",
    severity: "critical",
    status: doc ? "pass" : "fail",
  });

  // 2. legal_analysis_run_id present
  checks.push({
    id: "run_id",
    label: "Привязка к AI-анализу",
    severity: "critical",
    status: legalAnalysisRunId ? "pass" : "fail",
    detail: legalAnalysisRunId ? undefined : "В метаданных документа нет legal_analysis_run_id",
  });

  // 3. completed AI analysis
  const analysisStatus = String(analysisRun?.status ?? "").toLowerCase();
  checks.push({
    id: "analysis_completed",
    label: "AI-анализ завершён",
    severity: "critical",
    status: analysisRun ? (analysisStatus === "completed" ? "pass" : "fail") : "fail",
    detail: analysisRun ? `статус: ${analysisStatus || "—"}` : "Запуск анализа не найден",
  });

  // 4. fact_to_law_mapping / reasoning
  const factToLaw = asArray(analysis?.fact_to_law_mapping);
  const hasReasoning = factToLaw.length > 0 || argumentsCount > 0;
  checks.push({
    id: "reasoning",
    label: "Юридическое обоснование",
    severity: "critical",
    status: hasReasoning ? "pass" : "fail",
    detail: hasReasoning
      ? `${factToLaw.length || argumentsCount} аргументов`
      : "Нет цепочки факт → норма",
  });

  // 5. AI Review
  const reviewStatus = String(reviewRun?.status ?? "").toLowerCase();
  checks.push({
    id: "review",
    label: "AI Review проведён",
    severity: "critical",
    status: reviewRun
      ? (reviewStatus === "completed" || reviewStatus === "" ? "pass" : "warn")
      : "fail",
    detail: reviewRun ? undefined : "Нет AI Review для текущей версии",
  });

  // 6. DocumentContext used
  checks.push({
    id: "context_used",
    label: "DocumentContext использован при генерации",
    severity: "warning",
    status: usedContext ? "pass" : "warn",
    detail: usedContext ? undefined : "Документ сгенерирован без подготовленного контекста",
  });

  // 7. context_quality >= 60
  checks.push({
    id: "context_quality",
    label: "Качество контекста ≥ 60",
    severity: "warning",
    status: contextQuality == null
      ? "skip"
      : contextQuality >= 60 ? "pass" : "warn",
    detail: contextQuality == null
      ? "оценка не доступна"
      : `текущее: ${contextQuality}`,
  });

  // 8. no critical hallucinated_sources
  const hallucinated = asArray(review?.hallucinated_sources);
  const criticalHallucinated = hallucinated.filter(isCritical);
  checks.push({
    id: "no_hallucinated",
    label: "Нет критических ложных источников",
    severity: "critical",
    status: criticalHallucinated.length === 0
      ? (hallucinated.length === 0 ? "pass" : "warn")
      : "fail",
    detail: criticalHallucinated.length > 0
      ? `${criticalHallucinated.length} критич. из ${hallucinated.length}`
      : hallucinated.length > 0
      ? `${hallucinated.length} некритич. отметок`
      : undefined,
  });

  // 9. no critical unsupported_claims
  const unsupported = asArray(review?.unsupported_claims);
  const criticalUnsupported = unsupported.filter(isCritical);
  checks.push({
    id: "no_unsupported",
    label: "Нет критических неподтверждённых утверждений",
    severity: "critical",
    status: criticalUnsupported.length === 0
      ? (unsupported.length === 0 ? "pass" : "warn")
      : "fail",
    detail: criticalUnsupported.length > 0
      ? `${criticalUnsupported.length} критич. из ${unsupported.length}`
      : unsupported.length > 0
      ? `${unsupported.length} некритич. отметок`
      : undefined,
  });

  // 9b. P0-C: review.problems[].severity=critical|blocker OR review_status=needs_revision|blocked
  const reviewProblems = asArray(review?.problems);
  const criticalReviewProblems = reviewProblems.filter((p: any) => {
    const s = String(p?.severity ?? "").toLowerCase();
    return s === "critical" || s === "blocker";
  });
  const reviewStatusRaw = String(review?.review_status ?? "").toLowerCase();
  const reviewIsNeedsRevision = reviewStatusRaw === "needs_revision" || reviewStatusRaw === "blocked";
  const reviewGateFail = criticalReviewProblems.length > 0 || reviewIsNeedsRevision;
  checks.push({
    id: "review_problems",
    label: "AI Review: нет критических проблем",
    severity: "critical",
    status: reviewGateFail
      ? "fail"
      : reviewProblems.length > 0
      ? "warn"
      : "pass",
    detail: reviewGateFail
      ? (criticalReviewProblems.length > 0
          ? `${criticalReviewProblems.length} критич. из ${reviewProblems.length}${reviewIsNeedsRevision ? `; статус: ${reviewStatusRaw}` : ""}`
          : `статус AI Review: ${reviewStatusRaw}`)
      : reviewProblems.length > 0
      ? `${reviewProblems.length} некритич. отметок`
      : undefined,
  });

  // 10. sources exist
  checks.push({
    id: "sources",
    label: "Указаны источники",
    severity: "critical",
    status: sources.length > 0 ? "pass" : "fail",
    detail: sources.length > 0 ? `${sources.length} источн.` : "Источники не приложены",
  });

  // 11. documents_audit.used
  const auditUsed = asArray(analysis?.documents_audit?.used);
  checks.push({
    id: "audit_used",
    label: "Использованы документы клиента",
    severity: "critical",
    status: auditUsed.length > 0 ? "pass" : "fail",
    detail: auditUsed.length > 0
      ? `${auditUsed.length} док.`
      : "AI не использовал ни одного загруженного документа",
  });

  // 12. no sources without localization (warning)
  const noLocalization = sources.filter((s) => !hasPreciseLocalization(s));
  checks.push({
    id: "sources_localization",
    label: "Источники с точной локализацией",
    severity: "warning",
    status: sources.length === 0
      ? "skip"
      : noLocalization.length === 0
      ? "pass"
      : "warn",
    detail: sources.length === 0
      ? undefined
      : noLocalization.length === 0
      ? "у всех источников указана статья/пункт/абзац"
      : `${noLocalization.length} из ${sources.length} без точной локализации`,
  });

  const criticalFailed = checks.filter((c) => c.severity === "critical" && c.status === "fail");
  const warningsFailed = checks.filter((c) => c.severity === "warning" && (c.status === "warn" || c.status === "fail"));

  let blockReason: string | null = null;
  if (criticalFailed.length > 0) {
    const parts = criticalFailed.map((c) => c.label.toLowerCase()).join("; ");
    blockReason = `Нельзя утвердить документ: ${parts}.`;
  }

  return {
    checks,
    criticalFailed,
    warningsFailed,
    ready: criticalFailed.length === 0,
    blockReason,
  };
}

/* ============ UI ============ */

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />;
  if (status === "fail") return <XCircle size={14} className="text-rose-400 shrink-0" />;
  if (status === "warn") return <AlertTriangle size={14} className="text-amber-300 shrink-0" />;
  return <span className="inline-block h-3.5 w-3.5 rounded-full border border-slate-600 shrink-0" />;
}

function rowTone(c: ConsistencyCheckItem) {
  if (c.status === "pass") return "border-emerald-500/30 bg-emerald-500/5";
  if (c.status === "fail") return c.severity === "critical"
    ? "border-rose-500/50 bg-rose-500/10"
    : "border-amber-500/40 bg-amber-500/10";
  if (c.status === "warn") return "border-amber-500/40 bg-amber-500/10";
  return "border-slate-700/60 bg-slate-800/40";
}

export function ConsistencyCheck({ result }: { result: ConsistencyResult }) {
  return (
    <div className="space-y-1.5">
      {result.checks.map((c) => (
        <div
          key={c.id}
          className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${rowTone(c)}`}
        >
          <StatusIcon status={c.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-100">{c.label}</span>
              <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                {c.severity === "critical" ? "критич." : "предупр."}
              </span>
            </div>
            {c.detail && <div className="mt-0.5 text-[11px] text-slate-300">{c.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function QualityGate({
  result,
  approved,
}: {
  result: ConsistencyResult;
  approved: boolean;
}) {
  const tone = result.ready
    ? "border-emerald-400/50 bg-emerald-500/10"
    : "border-rose-500/50 bg-rose-500/10";
  return (
    <div className={`rounded-2xl border ${tone} p-4 text-sm text-slate-100`}>
      <div className="flex items-center gap-2">
        {result.ready ? (
          <ShieldCheck size={18} className="text-emerald-300" />
        ) : (
          <ShieldAlert size={18} className="text-rose-300" />
        )}
        <h3 className="font-display text-base text-white">
          {result.ready ? "Готов к утверждению" : "Требуется доработка"}
        </h3>
      </div>
      {!result.ready && result.blockReason && (
        <p className="mt-2 text-xs text-rose-100">{result.blockReason}</p>
      )}
      {result.ready && result.warningsFailed.length > 0 && (
        <p className="mt-2 text-xs text-amber-100">
          Есть {result.warningsFailed.length} предупреждение(й) — рекомендуем устранить.
        </p>
      )}
      {approved && !result.ready && (
        <div className="mt-3 rounded-lg border border-amber-400/50 bg-amber-500/15 p-2.5 text-[12px] text-amber-50">
          <AlertTriangle size={14} className="mr-1 inline" />
          Документ утверждён, но качество требует проверки. Рекомендуется создать новую редакцию.
        </div>
      )}
      <div className="mt-3">
        <ConsistencyCheck result={result} />
      </div>
    </div>
  );
}

export function QualityGateSummary({
  result,
  approved,
  onClick,
}: {
  result: ConsistencyResult;
  approved: boolean;
  onClick?: () => void;
}) {
  const passed = result.checks.filter((c) => c.status === "pass").length;
  const total = result.checks.length;
  const tone = !result.ready
    ? "border-rose-500/50 bg-rose-500/10 text-rose-50"
    : result.warningsFailed.length > 0
    ? "border-amber-400/50 bg-amber-500/10 text-amber-50"
    : "border-emerald-400/50 bg-emerald-500/10 text-emerald-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border ${tone} px-3 py-2 text-left text-xs transition hover:brightness-110`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          {result.ready ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
          Контроль качества
        </span>
        <span className="font-mono text-[11px]">{passed}/{total}</span>
      </div>
      <div className="mt-1 text-[11px] opacity-90">
        {result.ready ? "Готов к утверждению" : "Требуется доработка"}
        {result.warningsFailed.length > 0 && ` · ${result.warningsFailed.length} пред.`}
        {result.criticalFailed.length > 0 && ` · ${result.criticalFailed.length} критич.`}
      </div>
      {approved && !result.ready && (
        <div className="mt-1 text-[11px] text-amber-100">⚠ утверждён, но gate не пройден</div>
      )}
    </button>
  );
}
