// Layer 6: post-processing — merge model output with registry (URLs from DB).

import type { MergedSource } from "./dedupe.ts";

export type DocAuditEntry = {
  id: string;
  title: string;
  ocr_length: number;
  used: boolean;
  used_for?: string[];
  reason?:
    | "no_ocr"
    | "text_too_short"
    | "archive_zip"
    | "technical_file"
    | "duplicate"
    | "irrelevant";
};

const ALLOWED_USED_FOR = new Set([
  "facts",
  "legal_qualification",
  "taxpayer_position",
  "court_practice",
  "risks",
  "recommendations",
  "generation",
]);

export function extractJson(text: string): unknown {
  return safeParseGeminiJson(text);
}

/**
 * Robust parser for Gemini output.
 * 1) try JSON.parse(raw)
 * 2) strip markdown fences, slice between first { / [ and last } / ], retry
 * 3) throw with a descriptive message; caller is responsible for persisting diagnostics
 */
export function safeParseGeminiJson(raw: string): unknown {
  const original = raw ?? "";
  // Attempt 1: direct
  try {
    return JSON.parse(original);
  } catch {
    /* fallthrough */
  }

  // Attempt 2: cleanup
  let cleaned = original.trim();
  // Remove ```json ... ``` or ``` ... ``` fences
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) cleaned = fence[1].trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();

  if (!(cleaned.startsWith("{") || cleaned.startsWith("["))) {
    const firstObj = cleaned.indexOf("{");
    const firstArr = cleaned.indexOf("[");
    const candidates = [firstObj, firstArr].filter((i) => i >= 0);
    const start = candidates.length ? Math.min(...candidates) : -1;
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  } else {
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (end > 0) cleaned = cleaned.slice(0, end + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error((e as Error).message || "invalid JSON");
  }
}

export function mergeWithRegistry(
  parsed: any,
  registry: MergedSource[],
): {
  combined_sources: Array<Record<string, unknown>>;
  source_actuality: Array<{ source: string; status: string; note?: string }>;
} {
  const byId = new Map<string, MergedSource>();
  for (const s of registry) {
    byId.set(s.source_id, s);
    for (const m of s.merged_from) byId.set(m.source_id, s);
  }

  const enrich = (arr: any[] | undefined) =>
    (arr ?? []).map((item: any) => {
      const reg = item?.source_id ? byId.get(item.source_id) : undefined;
      if (!reg) return item;
      return {
        ...item,
        title: item.title ?? reg.title,
        official_url: reg.official_url,
        url: reg.official_url ?? item.url,
        source_table: reg.source_table,
        verification_status: reg.official_url ? "needs_check" : "missing_url",
        actuality_status: reg.official_url ? "requires_actuality_check" : "requires_manual_verification",
      };
    });

  parsed.applicable_laws    = enrich(parsed.applicable_laws);
  parsed.court_practice     = enrich(parsed.court_practice);
  parsed.fns_letters        = enrich(parsed.fns_letters);
  parsed.minfin_letters     = enrich(parsed.minfin_letters);
  parsed.ekaterina_practice = enrich(parsed.ekaterina_practice);
  parsed.manuals            = enrich(parsed.manuals);

  const used = new Set<string>();
  for (const arr of [
    parsed.applicable_laws, parsed.court_practice, parsed.fns_letters,
    parsed.minfin_letters,  parsed.ekaterina_practice, parsed.manuals,
  ]) for (const i of arr ?? []) if (i?.source_id) used.add(i.source_id);

  const combined: Array<Record<string, unknown>> = [];
  const actuality: Array<{ source: string; status: string; note?: string }> = [];
  const seen = new Set<string>();
  for (const sid of used) {
    const r = byId.get(sid);
    if (!r || seen.has(r.source_id)) continue;
    seen.add(r.source_id);
    combined.push({
      source_id: r.source_id,
      source_table: r.source_table,
      source_type: r.source_type,
      bucket: r.bucket,
      title: r.title,
      official_url: r.official_url,
      url: r.official_url,
      citation: r.citation,
      verification_status: r.official_url ? "needs_check" : "missing_url",
      actuality_status: r.official_url ? "requires_actuality_check" : "requires_manual_verification",
      scores: r.scores,
      appearances: r.appearances,
      merged_from: r.merged_from,
    });
    actuality.push({
      source: r.title,
      status: r.official_url ? "requires_actuality_check" : "needs_check",
      note: r.official_url
        ? "Источник найден, актуальность редакции требует проверки."
        : "Источник без публичного URL, требуется проверка юристом.",
    });
  }
  return { combined_sources: combined, source_actuality: actuality };
}

export function applyDocumentUsage(
  audit: { used: DocAuditEntry[]; rejected: DocAuditEntry[] },
  modelUsage: Array<{ doc_id: string; used_for: string[] }> | undefined,
): { used: DocAuditEntry[]; rejected: DocAuditEntry[] } {
  const map = new Map<string, string[]>();
  for (const u of modelUsage ?? []) {
    if (!u?.doc_id) continue;
    const labels = (u.used_for ?? [])
      .filter((x) => typeof x === "string" && ALLOWED_USED_FOR.has(x));
    map.set(u.doc_id, labels);
  }
  return {
    rejected: audit.rejected,
    used: audit.used.map((d) => ({
      ...d,
      used_for: map.get(d.id) ?? ["facts"],
    })),
  };
}

export function computeMetrics(
  combined: Array<Record<string, unknown>>,
  parsed: any,
): {
  hallucination_risk: "low" | "medium" | "high";
  legal_accuracy_score: number;
  source_verification_status: string;
  needs_lawyer_review: boolean;
} {
  const totalSources = combined.length;
  const withUrl = combined.filter((s) => !!s.official_url).length;
  const mapped = (parsed.fact_to_law_mapping ?? []).length;
  const missing = (parsed.missing_evidence ?? []).length;
  const weak = (parsed.weak_points ?? []).length;

  let score = 0.4;
  if (mapped >= 3) score += 0.2;
  if (totalSources >= 4) score += 0.15;
  if (withUrl >= totalSources / 2 && totalSources > 0) score += 0.15;
  if (missing === 0) score += 0.1;
  if (weak === 0) score += 0.05;
  if (totalSources === 0) score = 0;
  score = Math.max(0, Math.min(1, score));

  let risk: "low" | "medium" | "high" = "medium";
  if (totalSources === 0) risk = "high";
  else if (withUrl === totalSources && missing === 0 && weak === 0) risk = "low";

  let status: string;
  if (totalSources === 0) status = "no_sources";
  else if (withUrl < totalSources) status = "missing_url";
  else status = "needs_check";

  return {
    hallucination_risk: risk,
    legal_accuracy_score: Number(score.toFixed(2)),
    source_verification_status: status,
    needs_lawyer_review: risk !== "low" || missing > 0 || weak > 0,
  };
}
