import type { TemporalAnchor } from "./fact-extraction.ts";
import type { ResearchPlan } from "./research-routing.ts";
import type { TrustedSource } from "./enrich.ts";
import { normalizeTemporalDate } from "./temporal-date.ts";

export type TemporalApplicabilityStatus =
  | "covered"
  | "conflict"
  | "unresolved"
  | "not_required";

export type TemporalApplicabilityVerdict =
  | "APPLICABLE"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

export type TemporalApplicabilityCheck = {
  issue_id: string;
  issue: string;
  source_id: string;
  source_ref: string;
  source_title: string;
  source_bucket: TrustedSource["bucket"];
  anchor_role: TemporalAnchor["role"];
  anchor_label: string;
  anchor_from: string;
  anchor_to: string;
  effective_from: string | null;
  effective_to: string | null;
  revision_date: string | null;
  current_status: string | null;
  verdict: TemporalApplicabilityVerdict;
  /** Legacy compatibility for existing research_coverage consumers. */
  status: TemporalApplicabilityStatus;
  reason: string;
};

export type TemporalApplicabilityResult = {
  checks: TemporalApplicabilityCheck[];
  gaps: string[];
};

type Bounds = { from: string; to: string; kind: "point" | "period" };

type Assessment = {
  verdict: TemporalApplicabilityVerdict;
  status: TemporalApplicabilityStatus;
  reason: string;
  bounds: Bounds | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function anchorBounds(anchor: TemporalAnchor): Bounds | null {
  const exact = normalizeTemporalDate(anchor.date);
  if (exact) return { from: exact, to: exact, kind: "point" };

  const from = normalizeTemporalDate(anchor.date_from);
  const to = normalizeTemporalDate(anchor.date_to);

  // A period is never collapsed to an arbitrary endpoint. Incomplete or
  // inverted ranges are unresolved instead of being guessed.
  if (!from || !to || from > to) return null;
  return { from, to, kind: "period" };
}

function sourceIssueIds(source: TrustedSource): string[] {
  return Array.isArray(source.research_issue_ids)
    ? source.research_issue_ids.filter((value): value is string => typeof value === "string" && !!value.trim())
    : [];
}

function assess(
  anchor: TemporalAnchor,
  effectiveFrom: string | null,
  effectiveTo: string | null,
  revisionDate: string | null,
  currentStatus: string | null,
): Assessment {
  const bounds = anchorBounds(anchor);
  if (!bounds) {
    return {
      verdict: "UNKNOWN",
      status: "unresolved",
      reason: "Temporal anchor не имеет полной нормализованной ISO-даты/периода; период не схлопывается в одну дату.",
      bounds: null,
    };
  }

  // revision_date is version metadata, not effective_from. A revision that
  // postdates the researched point/period cannot be projected backward.
  if (revisionDate && revisionDate > bounds.to) {
    return {
      verdict: "NOT_APPLICABLE",
      status: "conflict",
      reason: `Редакция источника от ${revisionDate} появилась после исследуемого периода и не может применяться ретроспективно. Источник может оставаться поздним интерпретационным материалом, но не подтверждает историческую применимость.`,
      bounds,
    };
  }

  // If a revision happens inside a researched interval, one revision cannot
  // silently be treated as covering the entire interval.
  if (bounds.kind === "period" && revisionDate && revisionDate > bounds.from && revisionDate <= bounds.to) {
    return {
      verdict: "UNKNOWN",
      status: "unresolved",
      reason: `Редакция источника изменилась ${revisionDate} внутри исследуемого периода; единая редакция не подтверждает покрытие всего интервала.`,
      bounds,
    };
  }

  // effective_from is required to positively establish applicability under
  // the current contract. Missing start metadata is UNKNOWN, not APPLICABLE.
  if (!effectiveFrom) {
    if (effectiveTo && bounds.from > effectiveTo) {
      return {
        verdict: "NOT_APPLICABLE",
        status: "conflict",
        reason: `Источник прекратил действие ${effectiveTo}, до исследуемого периода.`,
        bounds,
      };
    }
    return {
      verdict: "UNKNOWN",
      status: "unresolved",
      reason: "Недостаточно temporal metadata: effective_from отсутствует, поэтому применимость нельзя подтвердить.",
      bounds,
    };
  }

  if (bounds.to < effectiveFrom) {
    return {
      verdict: "NOT_APPLICABLE",
      status: "conflict",
      reason: `Источник начал действовать ${effectiveFrom}, после исследуемого периода.`,
      bounds,
    };
  }

  if (effectiveTo && bounds.from > effectiveTo) {
    return {
      verdict: "NOT_APPLICABLE",
      status: "conflict",
      reason: `Источник прекратил действие ${effectiveTo}, до исследуемого периода.`,
      bounds,
    };
  }

  const coversStart = effectiveFrom <= bounds.from;
  const coversEnd = !effectiveTo || effectiveTo >= bounds.to;
  if (coversStart && coversEnd) {
    const historicalStatusNote = currentStatus && /repeal|inactive|утрат|отмен|недейств/iu.test(currentStatus)
      ? ` Текущий статус «${currentStatus}» не отменяет подтверждённую историческую применимость.`
      : "";
    return {
      verdict: "APPLICABLE",
      status: "covered",
      reason: `Период действия источника покрывает temporal anchor исследовательского вопроса.${historicalStatusNote}`,
      bounds,
    };
  }

  // Partial interval overlap is intentionally not promoted to APPLICABLE.
  return {
    verdict: "UNKNOWN",
    status: "unresolved",
    reason: "Период действия источника лишь частично пересекается с исследуемым интервалом; полное temporal coverage не подтверждено.",
    bounds,
  };
}

/**
 * Deterministic issue-specific temporal research coverage.
 * It NEVER invents a relevant date, NEVER uses the current date as fallback,
 * and NEVER disables a source for generation by itself.
 *
 * `verdict` is the canonical semantic outcome:
 *   APPLICABLE | NOT_APPLICABLE | UNKNOWN.
 * `status` is retained for compatibility with existing research_coverage UI/data.
 */
export function evaluateTemporalApplicability(opts: {
  plan: ResearchPlan;
  trusted: TrustedSource[];
}): TemporalApplicabilityResult {
  const checks: TemporalApplicabilityCheck[] = [];
  const gaps = new Set<string>();

  for (const question of opts.plan.questions) {
    if (!question.modes.includes("temporal") || question.temporal_anchors.length === 0) continue;

    const issueSources = opts.trusted.filter((source) => sourceIssueIds(source).includes(question.id));
    if (issueSources.length === 0) {
      gaps.add(`[${question.id}] Не найден источник, связанный с temporal research по вопросу: ${question.issue}`);
      continue;
    }

    for (const anchor of question.temporal_anchors) {
      let applicable = false;
      let sawNotApplicable = false;
      let sawUnknown = false;
      let sawCheck = false;

      for (const source of issueSources) {
        const sourceRecord = source as Record<string, unknown>;
        const effectiveFrom = normalizeTemporalDate(sourceRecord.effective_from);
        const effectiveTo = normalizeTemporalDate(sourceRecord.effective_to);
        const revisionDate = normalizeTemporalDate(sourceRecord.revision_date);
        const currentStatus = text(sourceRecord.current_status);
        const result = assess(anchor, effectiveFrom, effectiveTo, revisionDate, currentStatus);
        if (!result.bounds) {
          sawUnknown = true;
          continue;
        }

        sawCheck = true;
        if (result.verdict === "APPLICABLE") applicable = true;
        if (result.verdict === "NOT_APPLICABLE") sawNotApplicable = true;
        if (result.verdict === "UNKNOWN") sawUnknown = true;

        checks.push({
          issue_id: question.id,
          issue: question.issue,
          source_id: source.source_id,
          source_ref: source.source_ref,
          source_title: source.title,
          source_bucket: source.bucket,
          anchor_role: anchor.role,
          anchor_label: anchor.label,
          anchor_from: result.bounds.from,
          anchor_to: result.bounds.to,
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
          revision_date: revisionDate,
          current_status: currentStatus,
          verdict: result.verdict,
          status: result.status,
          reason: result.reason,
        });
      }

      if (applicable) continue;

      if (sawUnknown || !sawCheck) {
        gaps.add(`[${question.id}] Не разрешена temporal applicability для ${anchor.label}: ${question.issue}`);
      } else if (sawNotApplicable) {
        gaps.add(`[${question.id}] Найденные источники не применимы к ${anchor.label}: ${question.issue}`);
      } else {
        gaps.add(`[${question.id}] Недостаточно temporal metadata для проверки ${anchor.label}: ${question.issue}`);
      }
    }
  }

  return { checks, gaps: [...gaps] };
}
