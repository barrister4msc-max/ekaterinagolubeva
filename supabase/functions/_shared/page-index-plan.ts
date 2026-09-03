/**
 * P0-C runtime scale: page-aware bounded indexing contract for large PDFs
 * (600+ pages) shared by the extraction Edge Function and the intake UI.
 *
 * Pure functions only — no network, no storage, no Supabase. The contract is
 * deterministic so a 600-page packet can be indexed across several bounded
 * invocations, resumed after a failure, and reported honestly in the UI.
 */

/** Pages per indexing unit. Matches the existing chunked OCR window. */
export const PAGE_UNIT_SIZE = 6;

/**
 * Maximum units a single invocation may process. Bounded so one call always
 * finishes inside the function deadline; the remaining units are resumed by
 * the next invocation instead of failing the whole document.
 */
export const MAX_UNITS_PER_INVOCATION = 8;

/** Concurrency inside one invocation. */
export const UNIT_CONCURRENCY = 3;

export type PageUnitStatus = "pending" | "completed" | "failed";

export type PageUnit = {
  /** 0-based inclusive first page. */
  start: number;
  /** 0-based exclusive last page. */
  end: number;
  status: PageUnitStatus;
  text_length: number;
  /** Cached OCR text for this unit, retained for out-of-order completion. */
  text?: string;
  attempts: number;
  error?: string | null;
};

export type PageIndexState = {
  page_count: number;
  unit_size: number;
  units: PageUnit[];
  updated_at?: string;
};

export type PageIndexProgress = {
  totalUnits: number;
  completedUnits: number;
  failedUnits: number;
  pendingUnits: number;
  totalPages: number;
  indexedPages: number;
  percent: number;
  complete: boolean;
  degraded: boolean;
};

/** Deterministic unit plan for a document of `pageCount` pages. */
export function planPageUnits(pageCount: number, unitSize = PAGE_UNIT_SIZE): PageUnit[] {
  const pages = Math.max(0, Math.floor(pageCount) || 0);
  const size = Math.max(1, Math.floor(unitSize) || PAGE_UNIT_SIZE);
  const units: PageUnit[] = [];
  for (let start = 0; start < pages; start += size) {
    units.push({
      start,
      end: Math.min(start + size, pages),
      status: "pending",
      text_length: 0,
      attempts: 0,
    });
  }
  return units;
}

export function createPageIndexState(pageCount: number, unitSize = PAGE_UNIT_SIZE): PageIndexState {
  const size = Math.max(1, Math.floor(unitSize) || PAGE_UNIT_SIZE);
  return { page_count: Math.max(0, Math.floor(pageCount) || 0), unit_size: size, units: planPageUnits(pageCount, size) };
}

function isPageUnit(value: unknown): value is PageUnit {
  if (!value || typeof value !== "object") return false;
  const u = value as Record<string, unknown>;
  return typeof u.start === "number" && typeof u.end === "number" && u.end > u.start;
}

/**
 * Rebuilds state for the current document, reusing any cached unit result whose
 * page window still matches the plan. Never trusts a cached unit for a page
 * range that no longer exists.
 */
export function resumePageIndexState(
  pageCount: number,
  cached: unknown,
  unitSize = PAGE_UNIT_SIZE,
): PageIndexState {
  const fresh = createPageIndexState(pageCount, unitSize);
  const raw = (cached ?? null) as Partial<PageIndexState> | null;
  if (!raw || !Array.isArray(raw.units)) return fresh;
  if (typeof raw.page_count === "number" && raw.page_count !== fresh.page_count) return fresh;
  if (typeof raw.unit_size === "number" && raw.unit_size !== fresh.unit_size) return fresh;

  const byStart = new Map<number, PageUnit>();
  for (const unit of raw.units) {
    if (isPageUnit(unit)) byStart.set(unit.start, unit);
  }
  fresh.units = fresh.units.map((unit) => {
    const prior = byStart.get(unit.start);
    const reusable = Boolean(prior && prior.end === unit.end);
    const status: PageUnitStatus =
      reusable && prior?.status === "completed" && Number(prior.text_length) > 0
        ? "completed"
        : "pending";
    return {
      ...unit,
      status,
      text_length: status === "completed" && prior ? Number(prior.text_length) || 0 : 0,
      text: status === "completed" && prior && typeof prior.text === "string" ? prior.text : undefined,
      attempts: reusable && prior ? Number(prior.attempts) || 0 : 0,
      error: status === "completed" ? null : (reusable && prior ? prior.error ?? null : null),
    };
  });
  return fresh;
}

/**
 * Units this invocation should process: pending or previously failed windows,
 * in page order, capped by the invocation budget.
 */
export function selectUnitsForInvocation(
  state: PageIndexState,
  budget = MAX_UNITS_PER_INVOCATION,
): PageUnit[] {
  const cap = Math.max(1, Math.min(Math.floor(budget) || 1, MAX_UNITS_PER_INVOCATION));
  return state.units.filter((u) => u.status !== "completed").slice(0, cap);
}

export function applyUnitResult(
  state: PageIndexState,
  start: number,
  result: { text: string } | { error: string },
): PageIndexState {
  const units = state.units.map((unit) => {
    if (unit.start !== start) return unit;
    const attempts = unit.attempts + 1;
    if ("text" in result && result.text.trim().length > 0) {
      const text = result.text.trim();
      return { ...unit, status: "completed" as const, text, text_length: text.length, attempts, error: null };
    }
    const error = "error" in result ? result.error : "empty_unit_text";
    return { ...unit, status: "failed" as const, text: undefined, text_length: 0, attempts, error };
  });
  return { ...state, units, updated_at: new Date().toISOString() };
}

export function computePageIndexProgress(state: PageIndexState | null | undefined): PageIndexProgress {
  const units = state?.units ?? [];
  const totalUnits = units.length;
  const completed = units.filter((u) => u.status === "completed");
  const failedUnits = units.filter((u) => u.status === "failed").length;
  const pendingUnits = units.filter((u) => u.status === "pending").length;
  const totalPages = state?.page_count ?? 0;
  const indexedPages = completed.reduce((sum, u) => sum + (u.end - u.start), 0);
  const complete = totalUnits > 0 && completed.length === totalUnits;
  // Never round up to 100% before every required unit is done.
  const rawPercent = totalUnits === 0 ? 0 : (completed.length / totalUnits) * 100;
  const percent = complete ? 100 : Math.min(99, Math.floor(rawPercent));
  return {
    totalUnits,
    completedUnits: completed.length,
    failedUnits,
    pendingUnits,
    totalPages,
    indexedPages,
    percent,
    complete,
    degraded: !complete && completed.length > 0,
  };
}

export function isFullyIndexed(state: PageIndexState | null | undefined): boolean {
  return computePageIndexProgress(state).complete;
}

/**
 * Extraction status derived from the index plan. A partially indexed document
 * is never reported as `completed`.
 */
export function derivePageIndexStatus(
  state: PageIndexState | null | undefined,
): "completed" | "partial_pages" | "ocr_required" {
  const progress = computePageIndexProgress(state);
  if (progress.complete) return "completed";
  if (progress.completedUnits > 0) return "partial_pages";
  return "ocr_required";
}

export function describePageIndexProgress(state: PageIndexState | null | undefined): string {
  const p = computePageIndexProgress(state);
  if (p.totalUnits === 0) return "";
  if (p.complete) return `Проиндексировано ${p.totalPages} стр. (100%)`;
  const tail = p.failedUnits > 0 ? `, не удалось: ${p.failedUnits} блок(ов)` : "";
  return `Проиндексировано ${p.indexedPages} из ${p.totalPages} стр. (${p.percent}%)${tail}`;
}
