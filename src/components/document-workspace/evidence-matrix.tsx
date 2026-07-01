/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  FileText,
  Scale,
  BookOpen,
  Search,
  ExternalLink,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { openAttachment, type AttachmentRow } from "./attachments-viewer";
import { trCaseLabel } from "@/lib/case-intelligence-i18n";
import {
  normalizeCaseDocuments,
  normalizeCaseEvidence,
  normalizeCaseFacts,
  normalizeCaseContradictions,
  normalizeMissingEvidence,
} from "@/lib/case-intelligence-adapters";
const PANEL = "rounded-2xl border border-slate-700/70 bg-slate-900/95 shadow-xl";
const PANEL_SUB = "rounded-xl border border-slate-700/60 bg-slate-800/90";
const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1 text-[14px] text-slate-100 hover:bg-slate-700";

/* ============ Types ============ */

type FactStatus = "confirmed" | "partial" | "unconfirmed" | "to_check";

type FactRow = {
  key: string;
  text: string;
  raw: any;
  evidenceDocs: any[];
  laws: any[];
  practice: any[];
  missing: any[];
  weak: any[];
  reviewComments: any[];
  status: FactStatus;
  status_reason: string;
};

/* ============ Events ============ */

export function openFactCheck(payload: { fact: FactRow; attachments: AttachmentRow[] }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ws:open-fact-check", { detail: payload }));
}

/* ============ Helpers ============ */

function toText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    return String(
      v.text ?? v.fact ?? v.description ?? v.summary ?? v.title ?? v.name ?? JSON.stringify(v).slice(0, 240),
    );
  }
  return String(v);
}

function asArr(v: any): any[] {
  return Array.isArray(v) ? v : v ? [v] : [];
}

function matchAttachment(ev: any, list: AttachmentRow[]): AttachmentRow | null {
  if (!ev) return null;
  const id = ev.document_id ?? ev.id ?? null;
  const name = String(ev.file_name ?? ev.title ?? ev.name ?? ev.document ?? "").trim().toLowerCase();
  for (const d of list) {
    if (id && String(d.id) === String(id)) return d;
    const dn = String(d.file_name ?? "").trim().toLowerCase();
    if (name && dn && (dn === name || dn.includes(name) || name.includes(dn))) return d;
  }
  return null;
}

function precisionOf(item: any): { level: "exact" | "general" | "none" | "manual"; label: string } {
  if (!item || typeof item !== "object") return { level: "none", label: "Нет ссылки" };
  const hasArticle =
    item.article || item.clause || item.point || item.paragraph || item.section || item.page;
  const hasCase = item.case_number || item.docket;
  const hasUrl = item.url || item.link;
  if (hasArticle || hasCase) return { level: "exact", label: "Точная ссылка есть" };
  if (hasUrl || item.source || item.title) return { level: "general", label: "Есть только общий источник" };
  return { level: "manual", label: "Требуется ручная проверка" };
}

function PrecisionBadge({ item }: { item: any }) {
  const p = precisionOf(item);
  const cls =
    p.level === "exact"
      ? "bg-emerald-500/25 text-emerald-50"
      : p.level === "general"
        ? "bg-sky-500/25 text-sky-50"
        : p.level === "manual"
          ? "bg-amber-500/25 text-amber-50"
          : "bg-slate-600/40 text-slate-100";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {p.label}
    </span>
  );
}

function StatusPill({ status }: { status: FactStatus }) {
  const m: Record<FactStatus, { label: string; cls: string; Icon: any }> = {
    confirmed: { label: "Подтверждён", cls: "bg-emerald-500/25 text-emerald-50", Icon: CheckCircle2 },
    partial: { label: "Частично подтверждён", cls: "bg-sky-500/25 text-sky-50", Icon: AlertTriangle },
    unconfirmed: { label: "Не подтверждён", cls: "bg-red-500/25 text-red-50", Icon: XCircle },
    to_check: { label: "Требует проверки", cls: "bg-amber-500/25 text-amber-50", Icon: HelpCircle },
  };
  const v = m[status];
  const I = v.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${v.cls}`}>
      <I size={10} /> {v.label}
    </span>
  );
}

/* ============ Build facts ============ */

function buildFacts(analysis: any, attachments: AttachmentRow[], review: any): FactRow[] {
    const matrix =
    analysis?.case_intelligence_matrix ??
    analysis?.metadata?.case_intelligence_matrix ??
    analysis?.result?.case_intelligence_matrix ??
    analysis?.case_intelligence ??
    null;

  const v2Facts = normalizeCaseFacts(matrix);
  const v2Evidence = normalizeCaseEvidence(matrix);
  const v2Documents = normalizeCaseDocuments(matrix);
  const v2Missing = normalizeMissingEvidence(matrix);
  normalizeCaseContradictions(matrix); // подготовлено для следующего этапа
  const factsArr = asArr(analysis?.facts);
  const factToEv = asArr(analysis?.fact_to_evidence_mapping);
  const factToLaw = asArr(analysis?.fact_to_law_mapping);
  const missing = asArr(analysis?.missing_evidence);
  const weak = asArr(analysis?.weak_points);
  const reviewProblems = [
    ...asArr(review?.problems),
    ...asArr(review?.required_fixes),
    ...asArr(review?.recommendations),
  ];

  // collect fact keys
  const map = new Map<string, FactRow>();
  const keyOf = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);

  const pushFact = (text: string, raw: any) => {
    const k = keyOf(text);
    if (!k) return null;
    if (!map.has(k)) {
      map.set(k, {
        key: k,
        text,
        raw,
        evidenceDocs: [],
        laws: [],
        practice: [],
        missing: [],
        weak: [],
        reviewComments: [],
        status: "to_check",
        status_reason: "",
      });
    }
    return map.get(k)!;
  };

  for (const f of factsArr) pushFact(toText(f), f);
  for (const m of factToEv) pushFact(toText(m?.fact ?? m), m);
  for (const m of factToLaw) pushFact(toText(m?.fact ?? m), m);

  for (const m of factToEv) {
    const row = pushFact(toText(m?.fact ?? m), m);
    if (!row) continue;
    const evs = asArr(m?.evidence ?? m?.documents ?? m?.evidences);
    row.evidenceDocs.push(...evs);
  }
  for (const m of factToLaw) {
    const row = pushFact(toText(m?.fact ?? m), m);
    if (!row) continue;
    row.laws.push(...asArr(m?.laws ?? m?.law ?? m?.norms));
    row.practice.push(...asArr(m?.practice ?? m?.court_practice));
  }

  // attach missing / weak / review by simple substring matching on fact text
  const allRows = Array.from(map.values());
  const tag = (items: any[], target: "missing" | "weak" | "reviewComments") => {
    for (const it of items) {
      const text = toText(it).toLowerCase();
      if (!text) continue;
      for (const row of allRows) {
        if (text.includes(row.key.slice(0, 30)) || row.key.includes(text.slice(0, 30))) {
          row[target].push(it);
        }
      }
    }
  };
  tag(missing, "missing");
  tag(weak, "weak");
  tag(reviewProblems, "reviewComments");

  // resolve status
  for (const row of allRows) {
    const resolved = row.evidenceDocs.map((ev) => matchAttachment(ev, attachments)).filter(Boolean);
    const hasEvidence = row.evidenceDocs.length > 0;
    const allUsed = hasEvidence && resolved.length > 0 && resolved.every((r) => r!.audit_status !== "rejected");
    if (!hasEvidence) {
      row.status = row.missing.length > 0 ? "unconfirmed" : "to_check";
      row.status_reason = row.missing.length > 0
        ? "В analysis помечено как missing_evidence."
        : "Нет привязки к документам.";
    } else if (row.weak.length > 0 || resolved.length < row.evidenceDocs.length || !allUsed) {
      row.status = "partial";
      row.status_reason = "Часть доказательств не найдена в приложениях или помечена как слабая.";
    } else {
      row.status = "confirmed";
      row.status_reason = "Все указанные доказательства найдены в приложениях.";
    }
  }

  return allRows;
}

/* ============ Matrix Tab ============ */

export function EvidenceMatrixTab({
  analysis,
  review,
  attachments,
  jumpFilter,
  onClearJumpFilter,
}: {
  analysis: any;
  review: any;
  attachments: AttachmentRow[];
  jumpFilter?: string | null;
  onClearJumpFilter?: () => void;
}) {
  const facts = useMemo(() => buildFacts(analysis, attachments, review), [analysis, attachments, review]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FactStatus>("all");

  useEffect(() => {
    if (jumpFilter) setSearch(jumpFilter);
  }, [jumpFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facts.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (!q) return true;
      if (f.text.toLowerCase().includes(q)) return true;
      return f.evidenceDocs.some((e) => toText(e).toLowerCase().includes(q));
    });
  }, [facts, search, statusFilter]);

  return (
    <section className={`${PANEL} p-5 space-y-3`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-white">Матрица доказательств</h2>
          <p className="mt-1 text-[14px] leading-6 text-slate-300">
            Факт → Документы → Норма → Практика → Статус. Источник: AI-анализ + приложения сессии.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1">
            <Search size={12} className="text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по факту или документу…"
              className="w-[220px] bg-transparent text-[14px] text-slate-100 outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[14px] text-slate-100"
          >
            <option value="all">Все статусы</option>
            <option value="confirmed">Подтверждённые</option>
            <option value="partial">Частично</option>
            <option value="unconfirmed">Не подтверждённые</option>
            <option value="to_check">Требуют проверки</option>
          </select>
          {jumpFilter && onClearJumpFilter && (
            <button type="button" className={BTN} onClick={onClearJumpFilter}>
              Сбросить фильтр «{jumpFilter}»
            </button>
          )}
        </div>
      </div>

      {facts.length === 0 && (
        <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[14px] leading-6 text-amber-100">
          <AlertTriangle size={12} className="mr-1 inline" />
          В AI-анализе нет фактов или маппингов. Матрицу построить невозможно.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-700/70">
          <table className="w-full min-w-[760px] text-left text-[14px] text-slate-100">
            <thead className="bg-slate-800/80 text-[10px] uppercase tracking-wider text-slate-300">
              <tr>
                <th className="px-3 py-2">Факт</th>
                <th className="px-3 py-2">Документы</th>
                <th className="px-3 py-2">Норма</th>
                <th className="px-3 py-2">Практика</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const resolved = f.evidenceDocs.map((ev) => ({ ev, doc: matchAttachment(ev, attachments) }));
                return (
                  <tr key={f.key} className="border-t border-slate-800 align-top">
                    <td className="px-3 py-2 max-w-[280px]">
                      <div className="text-slate-50">{f.text}</div>
                      {f.missing.length > 0 && (
                        <div className="mt-1 text-[10px] text-red-200">
                          Отсутствуют: {f.missing.map(toText).slice(0, 2).join("; ")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {f.evidenceDocs.length === 0 ? (
                        <span className="text-[14px] text-amber-200">
                          Доказательства не привязаны. Требуется ручная проверка.
                        </span>
                      ) : (
                        <ul className="space-y-1">
                          {resolved.slice(0, 5).map((r, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <FileText size={10} className="mt-0.5 text-slate-300" />
                              <div>
                                <div className="text-slate-100">
                                  {toText(r.ev) || r.doc?.file_name || "Документ"}
                                </div>
                                {r.doc ? (
                                  <button
                                    type="button"
                                    className="text-[10px] text-sky-300 hover:underline"
                                    onClick={() => openAttachment({ doc: r.doc!, focusQuote: toText(r.ev?.quote ?? r.ev?.fragment ?? "") })}
                                  >
                                    открыть приложение →
                                  </button>
                                ) : (
                                  <div className="text-[10px] text-amber-200">не найдено среди приложений</div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[220px]">
                      {f.laws.length === 0 ? (
                        <span className="text-[14px] text-slate-400">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {f.laws.slice(0, 3).map((l, i) => (
                            <li key={i} className="text-slate-100">
                              <div className="flex items-center gap-1.5">
                                <Scale size={10} className="text-slate-300" />
                                <span>{toText(l)}</span>
                              </div>
                              <PrecisionBadge item={l} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[220px]">
                      {f.practice.length === 0 ? (
                        <span className="text-[14px] text-slate-400">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {f.practice.slice(0, 3).map((p, i) => (
                            <li key={i} className="text-slate-100">
                              <div className="flex items-center gap-1.5">
                                <BookOpen size={10} className="text-slate-300" />
                                <span>{toText(p)}</span>
                              </div>
                              <PrecisionBadge item={p} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={f.status} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className={BTN}
                          onClick={() => openFactCheck({ fact: f, attachments })}
                        >
                          Проверить факт
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ============ Fact Check Drawer ============ */

export function FactCheckDrawer({ generatedText }: { generatedText: string }) {
  const [payload, setPayload] = useState<{ fact: FactRow; attachments: AttachmentRow[] } | null>(null);
  const open = payload != null;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ fact: FactRow; attachments: AttachmentRow[] }>).detail;
      if (detail) setPayload(detail);
    };
    window.addEventListener("ws:open-fact-check", handler as EventListener);
    return () => window.removeEventListener("ws:open-fact-check", handler as EventListener);
  }, []);

  const fact = payload?.fact;
  const attachments = payload?.attachments ?? [];

  const usagesInDoc = useMemo(() => {
    if (!fact || !generatedText) return [] as string[];
    const text = generatedText;
    const lower = text.toLowerCase();
    const k = fact.key;
    const out: string[] = [];
    if (!k) return out;
    let i = lower.indexOf(k);
    while (i !== -1 && out.length < 5) {
      const start = Math.max(0, i - 80);
      const end = Math.min(text.length, i + k.length + 80);
      out.push(text.slice(start, end));
      i = lower.indexOf(k, i + k.length);
    }
    return out;
  }, [fact, generatedText]);

  const resolved = useMemo(() => {
    if (!fact) return [] as Array<{ ev: any; doc: AttachmentRow | null }>;
    return fact.evidenceDocs.map((ev) => ({ ev, doc: matchAttachment(ev, attachments) }));
  }, [fact, attachments]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && setPayload(null)}>
      <SheetContent
        side="right"
        className="w-[560px] sm:max-w-[600px] border-slate-700 bg-slate-950 p-0 text-slate-100"
      >
        <SheetHeader className="border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-100">
              Проверка факта
            </span>
            {fact && <StatusPill status={fact.status} />}
          </div>
          <SheetTitle className="text-left text-base text-white">
            {fact?.text ?? "Факт"}
          </SheetTitle>
        </SheetHeader>

        {fact && (
          <div className="flex h-[calc(100vh-110px)] flex-col gap-3 overflow-y-auto p-4 text-sm">
            {fact.status === "unconfirmed" && (
              <div className="flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/10 px-2 py-1 text-[14px] text-red-100">
                <AlertTriangle size={12} /> Факт не подтверждён приложенными документами.
              </div>
            )}
            {fact.status_reason && (
              <div className="text-[14px] text-slate-300">{fact.status_reason}</div>
            )}

            <Section title="Где используется в документе">
              {usagesInDoc.length === 0 ? (
                <div className="text-[14px] text-slate-400">
                  Прямых вхождений не найдено (текст может быть перефразирован).
                </div>
              ) : (
                <ul className="space-y-1">
                  {usagesInDoc.map((u, i) => (
                    <li key={i} className="rounded border border-slate-700/70 bg-slate-900/80 p-2 text-[14px]">
                      …{u}…
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`Подтверждающие документы · ${resolved.filter((r) => r.doc && r.doc.audit_status !== "rejected").length}`}>
              {resolved.length === 0 ? (
                <div className="text-[14px] text-amber-200">Доказательства не привязаны.</div>
              ) : (
                <ul className="space-y-1">
                  {resolved.map((r, i) => (
                    <li key={i} className={`${PANEL_SUB} p-2 text-[14px]`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-100">
                          {r.doc?.file_name ?? toText(r.ev) ?? "Документ"}
                        </span>
                        {r.doc ? (
                          <button
                            type="button"
                            className={BTN}
                            onClick={() => openAttachment({ doc: r.doc!, focusQuote: toText(r.ev?.quote ?? r.ev?.fragment ?? "") })}
                          >
                            <ExternalLink size={10} /> Открыть документ
                          </button>
                        ) : (
                          <span className="text-amber-200">не найдено</span>
                        )}
                      </div>
                      {r.ev?.quote && (
                        <div className="mt-1 text-slate-300">«{toText(r.ev.quote)}»</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Не подтверждают / отклонены">
              {resolved.filter((r) => r.doc?.audit_status === "rejected").length === 0 ? (
                <div className="text-[14px] text-slate-400">—</div>
              ) : (
                <ul className="space-y-1">
                  {resolved
                    .filter((r) => r.doc?.audit_status === "rejected")
                    .map((r, i) => (
                      <li key={i} className="text-[14px] text-red-200">
                        {r.doc?.file_name} — отклонён AI ({String(r.doc?.audit_entry?.reason ?? "—")})
                      </li>
                    ))}
                </ul>
              )}
            </Section>

            <Section title={`Применённые нормы · ${fact.laws.length}`}>
              {fact.laws.length === 0 ? (
                <div className="text-[14px] text-slate-400">—</div>
              ) : (
                <ul className="space-y-1">
                  {fact.laws.map((l, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-[14px] text-slate-100">
                      <span className="flex items-center gap-1.5">
                        <Scale size={10} /> {toText(l)}
                      </span>
                      <PrecisionBadge item={l} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`Практика · ${fact.practice.length}`}>
              {fact.practice.length === 0 ? (
                <div className="text-[14px] text-slate-400">—</div>
              ) : (
                <ul className="space-y-1">
                  {fact.practice.map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-[14px] text-slate-100">
                      <span className="flex items-center gap-1.5">
                        <BookOpen size={10} /> {toText(p)}
                      </span>
                      <PrecisionBadge item={p} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {fact.missing.length > 0 && (
              <Section title="Не хватает доказательств">
                <ul className="list-disc space-y-0.5 pl-4 text-[14px] text-red-100">
                  {fact.missing.map((m, i) => (
                    <li key={i}>{toText(m)}</li>
                  ))}
                </ul>
              </Section>
            )}

            {fact.weak.length > 0 && (
              <Section title="Слабые места">
                <ul className="list-disc space-y-0.5 pl-4 text-[14px] text-amber-100">
                  {fact.weak.map((w, i) => (
                    <li key={i}>{toText(w)}</li>
                  ))}
                </ul>
              </Section>
            )}

            {fact.reviewComments.length > 0 && (
              <Section title="Комментарии AI Review">
                <ul className="list-disc space-y-0.5 pl-4 text-[14px] text-sky-100">
                  {fact.reviewComments.map((r, i) => (
                    <li key={i}>{toText(r)}</li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${PANEL_SUB} p-3`}>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">{title}</div>
      {children}
    </div>
  );
}
