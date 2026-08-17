import type { TemporalAnchor } from "./fact-extraction.ts";
import type { ResearchPlan } from "./research-routing.ts";
import type { TrustedSource } from "./enrich.ts";

export type TemporalApplicabilityStatus =
  | "covered"
  | "conflict"
  | "unresolved"
  | "not_required";

export type TemporalApplicabilityCheck = {
  issue_id: string;
  issue: string;
  source_id: string;
  source_ref: string;
  source_title: string;
  anchor_role: TemporalAnchor["role"];
  anchor_label: string;
  anchor_from: string;
  anchor_to: string;
  effective_from: string | null;
  effective_to: string | null;
  status: TemporalApplicabilityStatus;
  reason: string;
};

export type TemporalApplicabilityResult = {
  checks: TemporalApplicabilityCheck[];
  gaps: string[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOnly(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso?.[1] ?? null;
}

function anchorBounds(anchor: TemporalAnchor): { from: string; to: string } | null {
  const exact = dateOnly(anchor.date);
  if (exact) return { from: exact, to: exact };
  const from = dateOnly(anchor.date_from);
  const to = dateOnly(anchor.date_to);
  if (from && to) return { from, to };
  if (from) return { from, to: from };
  if (to) return { from: to, to };
  return null;
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
): { status: TemporalApplicabilityStatus; reason: string; bounds: { from: string; to: string } | null } {
  const bounds = anchorBounds(anchor);
  if (!bounds) {
    return {
      status: "unresolved",
      reason: "Temporal anchor не имеет нормализованной ISO-даты/периода.",
      bounds: null,
    };
  }

  if (!effectiveFrom && !effectiveTo) {
    return {
      status: "unresolved",
      reason: "У источника нет достаточных effective_from/effective_to metadata для проверки периода.",
      bounds,
    };
  }

  if (effectiveFrom && bounds.to < effectiveFrom) {
    return {
      status: "conflict",
      reason: `Источник начал действовать ${effectiveFrom}, после исследуемого периода.`,
      bounds,
    };
  }
  if (effectiveTo && bounds.from > effectiveTo) {
    return {
      status: "conflict",
      reason: `Источник прекратил действие ${effectiveTo}, до исследуемого периода.`,
      bounds,
    };
  }

  const coversStart = !effectiveFrom || effectiveFrom <= bounds.from;
  const coversEnd = !effectiveTo || effectiveTo >= bounds.to;
  if (coversStart && coversEnd) {
    return {
      status: "covered",
      reason: "Период источника покрывает temporal anchor исследовательского вопроса.",
      bounds,
    };
  }

  return {
    status: "unresolved",
    reason: "Metadata частично пересекаются с исследуемым периодом, но не подтверждают покрытие целиком.",
    bounds,
  };
}

/**
 * Deterministic temporal research coverage.
 * It NEVER invents a relevant date and NEVER disables a source for generation by itself.
 * It only reports issue-specific covered/conflict/unresolved states and returns Sufficiency gaps.
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
      let covered = false;
      let sawResolvable = false;

      for (const source of issueSources) {
        const effectiveFrom = dateOnly((source as Record<string, unknown>).effective_from);
        const effectiveTo = dateOnly((source as Record<string, unknown>).effective_to);
        const result = assess(anchor, effectiveFrom, effectiveTo);
        if (result.status !== "unresolved") sawResolvable = true;
        if (result.status === "covered") covered = true;
        if (!result.bounds) continue;

        checks.push({
          issue_id: question.id,
          issue: question.issue,
          source_id: source.source_id,
          source_ref: source.source_ref,
          source_title: source.title,
          anchor_role: anchor.role,
          anchor_label: anchor.label,
          anchor_from: result.bounds.from,
          anchor_to: result.bounds.to,
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
          status: result.status,
          reason: result.reason,
        });
      }

      if (!covered) {
        gaps.add(
          sawResolvable
            ? `[${question.id}] Не подтверждена применимая редакция/период источника для ${anchor.label}: ${question.issue}`
            : `[${question.id}] Недостаточно temporal metadata для проверки ${anchor.label}: ${question.issue}`,
        );
      }
    }
  }

  return { checks, gaps: [...gaps] };
}
