/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 8 — Coverage Report + AI Grounding Score.
 *
 * Pure frontend metric, computed from existing analysis/review/attachments.
 * Does NOT call AI. Returns a transparent breakdown:
 *   - Facts:     confirmed / partial / unsupported
 *   - Documents: used / unused / rejected / no_ocr
 *   - Laws:      used / rejected
 *   - Practice:  count
 *   - Review:    critical / high / medium / low
 *
 * Grounding Score = weighted mean of coverage ratios. Each component shows
 * its own input — the user can audit the score.
 */

import { useMemo } from "react";
import { CheckCircle2, AlertTriangle, XCircle, FileText, Landmark, Gavel, MessageSquare, ShieldCheck } from "lucide-react";
import { trCaseLabel } from "@/lib/case-intelligence-i18n";
import {
  normalizeCaseEvidence,
  normalizeCaseFacts,
  normalizeMissingEvidence,
} from "@/lib/case-intelligence-adapters";
const PANEL = "rounded-2xl border border-slate-700/70 bg-slate-900/95 shadow-xl";
const PANEL_SUB = "rounded-xl border border-slate-700/60 bg-slate-800/90";
const LABEL = "text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400";

export type CoverageData = {
  facts: { total: number; confirmed: number; partial: number; unsupported: number };
  documents: { total: number; used: number; unused: number; rejected: number; noOcr: number };
  laws: { total: number; used: number; rejected: number };
  practice: { total: number };
  review: { total: number; critical: number; high: number; medium: number; low: number };
  grounding: {
    score: number;
    components: Array<{ key: string; label: string; weight: number; ratio: number; sub: string }>;
  };
};

export function computeCoverage(analysis: any, review: any, attachments: any[]): CoverageData {
  const factToLaw: any[] = Array.isArray(analysis?.fact_to_law_mapping) ? analysis.fact_to_law_mapping : [];
  const factToEvidence: any[] = Array.isArray(analysis?.fact_to_evidence_mapping)
    ? analysis.fact_to_evidence_mapping
    : Array.isArray(analysis?.evidence_mapping)
      ? analysis.evidence_mapping
      : [];
  const applicableLaws: any[] = Array.isArray(analysis?.applicable_laws) ? analysis.applicable_laws : [];
  const rejectedLaws: any[] = Array.isArray(analysis?.rejected_laws) ? analysis.rejected_laws : [];
  const practice = [
    ...(Array.isArray(analysis?.court_practice) ? analysis.court_practice : []),
    ...(Array.isArray(analysis?.fns_letters) ? analysis.fns_letters : []),
    ...(Array.isArray(analysis?.minfin_letters) ? analysis.minfin_letters : []),
  ];

  // Facts
  let confirmed = 0;
  let partial = 0;
  let unsupported = 0;
  for (const m of factToLaw) {
    const factKey = String(m?.fact_id ?? m?.fact_key ?? m?.fact ?? "").toLowerCase();
    const e = factToEvidence.find((ev: any) => {
      const k = String(ev?.fact ?? ev?.fact_id ?? ev?.fact_key ?? "").toLowerCase();
      return k && (k === factKey || k.includes(factKey) || factKey.includes(k));
    });
    const docs: any[] = e
      ? (Array.isArray(e.documents) ? e.documents : Array.isArray(e.evidence) ? e.evidence : [])
      : [];
    const hasLaw = Boolean(m?.law ?? m?.law_id ?? m?.article ?? m?.code);
    if (docs.length >= 2 && hasLaw) confirmed++;
    else if (docs.length >= 1 || hasLaw) partial++;
    else unsupported++;
  }

  // Documents
  const docTotal = attachments.length;
  const used = attachments.filter((a) => a.audit_status === "used").length;
  const rejected = attachments.filter((a) => a.audit_status === "rejected").length;
  const unused = Math.max(0, docTotal - used - rejected);
  const noOcr = attachments.filter((a) => (a.ocr_length ?? 0) === 0).length;

  // Laws
  const lawsUsedKeys = new Set<string>();
  for (const m of factToLaw) {
    const ref = m?.law ?? m?.law_id ?? m?.article ?? m?.code;
    const key = String(typeof ref === "object" ? (ref?.id ?? ref?.article ?? ref?.title) : ref ?? "").toLowerCase();
    if (key) lawsUsedKeys.add(key);
  }
  const lawsUsed = applicableLaws.filter((l: any) => {
    const key = String(l?.id ?? l?.law_id ?? l?.article ?? l?.title ?? l?.name ?? "").toLowerCase();
    return Array.from(lawsUsedKeys).some((k) => key.includes(k) || k.includes(key));
  }).length;

  // Review
  const items = [
    ...((review?.problems as any[]) ?? []),
    ...((review?.required_fixes as any[]) ?? []),
    ...((review?.recommendations as any[]) ?? []),
  ];
  const sev = (it: any) => String(it?.severity ?? it?.priority ?? "").toLowerCase();
  const critical = items.filter((it) => sev(it) === "critical").length;
  const high = items.filter((it) => sev(it) === "high").length;
  const medium = items.filter((it) => sev(it) === "medium").length;
  const low = items.filter((it) => sev(it) === "low" || sev(it) === "").length;

  // Grounding
  const factsTotal = factToLaw.length;
  const factsRatio = factsTotal ? (confirmed + partial * 0.5) / factsTotal : 0;
  const docsRatio = docTotal ? used / docTotal : 0;
  const lawsRatio = applicableLaws.length ? lawsUsed / applicableLaws.length : 0;
  const practiceRatio = practice.length ? Math.min(1, practice.length / Math.max(1, factsTotal)) : 0;
  const reviewRatio = items.length === 0 ? 1 : Math.max(0, 1 - (critical * 0.4 + high * 0.2 + medium * 0.08 + low * 0.02));
  const sourcesTotal = applicableLaws.length + practice.length;
  const sourcesRatio = sourcesTotal === 0 ? 0 : 1;

  const components = [
    { key: "facts", label: "Покрытие фактов", weight: 0.3, ratio: factsRatio, sub: `${confirmed}/${factsTotal} подтверждено, ${partial} частично` },
    { key: "docs", label: "Использование документов", weight: 0.2, ratio: docsRatio, sub: `${used}/${docTotal} использовано AI` },
    { key: "laws", label: "Привязка норм", weight: 0.2, ratio: lawsRatio, sub: `${lawsUsed}/${applicableLaws.length} норм связаны с фактами` },
    { key: "practice", label: "Подкреплено практикой", weight: 0.1, ratio: practiceRatio, sub: `${practice.length} источников практики` },
    { key: "review", label: "AI Review", weight: 0.15, ratio: reviewRatio, sub: `critical: ${critical}, high: ${high}` },
    { key: "sources", label: "Источники присутствуют", weight: 0.05, ratio: sourcesRatio, sub: `${sourcesTotal} источников всего` },
  ];
  const score = Math.round(components.reduce((acc, c) => acc + c.weight * c.ratio, 0) * 100);

  return {
    facts: { total: factsTotal, confirmed, partial, unsupported },
    documents: { total: docTotal, used, unused, rejected, noOcr },
    laws: { total: applicableLaws.length, used: lawsUsed, rejected: rejectedLaws.length },
    practice: { total: practice.length },
    review: { total: items.length, critical, high, medium, low },
    grounding: { score, components },
  };
}

/* ============ UI ============ */

export function CoverageReportTab({
  analysis,
  review,
  attachments,
}: {
  analysis: any;
  review: any;
  attachments: any[];
}) {
  const data = useMemo(() => computeCoverage(analysis, review, attachments), [analysis, review, attachments]);
  return (
    <section className={`${PANEL} space-y-4 p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[16px] font-semibold text-white">
       Отчёт о полноте доказательств
       </h2>
          <p className="mt-1 text-[14px] leading-6 text-slate-300">
            Покрытие фактов, документов, норм и практики. Метрики рассчитаны из существующих данных, без обращения к AI.
          </p>
        </div>
        <GroundingScore score={data.grounding.score} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <CoverageCard
          icon={<ShieldCheck size={14} />}
          title="Факты"
          total={data.facts.total}
          rows={[
            { label: "Подтверждено", value: data.facts.confirmed, tone: "good" },
            { label: "Частично", value: data.facts.partial, tone: "warn" },
            { label: "Не подтверждено", value: data.facts.unsupported, tone: "bad" },
          ]}
        />
        <CoverageCard
          icon={<FileText size={14} />}
          title="Документы"
          total={data.documents.total}
          rows={[
            { label: "Использовано", value: data.documents.used, tone: "good" },
            { label: "Не использовано", value: data.documents.unused, tone: "warn" },
            { label: "Отклонено", value: data.documents.rejected, tone: "bad" },
            { label: "Без OCR", value: data.documents.noOcr, tone: "warn" },
          ]}
        />
        <CoverageCard
          icon={<Landmark size={14} />}
          title="Нормы"
          total={data.laws.total}
          rows={[
            { label: "Использовано", value: data.laws.used, tone: "good" },
            { label: "Не использовано", value: data.laws.total - data.laws.used, tone: "warn" },
            { label: "Отклонено AI", value: data.laws.rejected, tone: "bad" },
          ]}
        />
        <CoverageCard
          icon={<Gavel size={14} />}
          title="Практика"
          total={data.practice.total}
          rows={[{ label: "Источников", value: data.practice.total, tone: "good" }]}
        />
        <CoverageCard
          icon={<MessageSquare size={14} />}
          title="AI Review"
          total={data.review.total}
          rows={[
            { label: "Critical", value: data.review.critical, tone: data.review.critical ? "bad" : "good" },
            { label: "High", value: data.review.high, tone: data.review.high ? "warn" : "good" },
            { label: "Medium", value: data.review.medium, tone: "warn" },
            { label: "Low", value: data.review.low, tone: "warn" },
          ]}
        />
        <GroundingBreakdown components={data.grounding.components} />
      </div>
    </section>
  );
}

function CoverageCard({
  icon,
  title,
  total,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  total: number;
  rows: Array<{ label: string; value: number; tone: "good" | "warn" | "bad" }>;
}) {
  return (
    <div className={`${PANEL_SUB} p-3 text-[14px] leading-6 text-slate-100`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-slate-200">
          {icon}
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        <div className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] text-slate-300">всего {total}</div>
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center justify-between">
            <span className="text-slate-300">{r.label}</span>
            <span
              className={
                r.tone === "good"
                  ? "text-emerald-200"
                  : r.tone === "bad"
                    ? "text-red-200"
                    : "text-amber-200"
              }
            >
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroundingScore({ score }: { score: number }) {
  const tone =
    score >= 75 ? "bg-emerald-500/25 text-emerald-50 border-emerald-400/50"
    : score >= 50 ? "bg-amber-500/25 text-amber-50 border-amber-400/50"
    : "bg-red-500/25 text-red-50 border-red-400/50";
  return (
    <div className={`rounded-2xl border px-4 py-3 text-center ${tone}`}>
      <div className={LABEL}>Обоснование</div>
      <div className="mt-1 text-3xl font-bold leading-none">{score}</div>
      <div className="mt-1 text-[14px] opacity-80">из 100</div>
    </div>
  );
}

function GroundingBreakdown({
  components,
}: {
  components: CoverageData["grounding"]["components"];
}) {
  return (
    <div className={`${PANEL_SUB} p-3 text-xs text-slate-100 md:col-span-2 lg:col-span-3`}>
      <div className="flex items-center gap-1.5 text-slate-200">
        <CheckCircle2 size={14} />
        <span className="text-sm font-semibold text-white">Как считается оценка обоснования</span>
      </div>
      <p className="mt-1 text-[14px] leading-6 text-slate-400">
        Взвешенное среднее по шести компонентам. Считается на клиенте из данных AI-анализа, AI Review и аудита документов.
      </p>
      <ul className="mt-2 space-y-2">
        {components.map((c) => (
          <li key={c.key}>
            <div className="flex items-center justify-between text-[14px]">
              <span className="text-slate-200">
                {c.label} <span className="text-slate-500">· вес {Math.round(c.weight * 100)}%</span>
              </span>
              <span className="text-slate-200">{Math.round(c.ratio * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
              <div
                className={
                  c.ratio >= 0.75
                    ? "h-full bg-emerald-400"
                    : c.ratio >= 0.5
                      ? "h-full bg-amber-400"
                      : "h-full bg-red-400"
                }
                style={{ width: `${Math.round(c.ratio * 100)}%` }}
              />
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">{c.sub}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Compact summary for the side panel. */
export function GroundingScoreCompact({
  analysis,
  review,
  attachments,
  onClick,
}: {
  analysis: any;
  review: any;
  attachments: any[];
  onClick?: () => void;
}) {
  const data = useMemo(() => computeCoverage(analysis, review, attachments), [analysis, review, attachments]);
  const score = data.grounding.score;
  const tone =
    score >= 75 ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-50"
    : score >= 50 ? "border-amber-400/50 bg-amber-500/15 text-amber-50"
    : "border-red-400/50 bg-red-500/15 text-red-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-2 text-left transition hover:opacity-90 ${tone}`}
    >
      <div className="flex items-center justify-between">
        <div className={LABEL}>Обоснование</div>
        <div className="text-lg font-bold leading-none">{score}</div>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] opacity-90">
        <span>
          <CheckCircle2 size={9} className="inline" /> {data.facts.confirmed}/{data.facts.total}
        </span>
        <span>
          <AlertTriangle size={9} className="inline" /> {data.facts.partial}
        </span>
        <span>
          <XCircle size={9} className="inline" /> {data.facts.unsupported}
        </span>
      </div>
    </button>
  );
}
