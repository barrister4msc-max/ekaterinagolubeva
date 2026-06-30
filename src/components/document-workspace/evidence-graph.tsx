/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 8 — Evidence Graph + Fact Inspector.
 *
 * Frontend-only. Builds nodes/edges from existing AI analysis + review data.
 * Layout: 5 columns (Факт → Документы → Нормы → Практика → Вывод).
 * Click any node → right panel shows full details. AI Review comments
 * matching the selected node are surfaced under the inspector.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  Gavel,
  Landmark,
  MessageSquare,
  ShieldCheck,
  Target,
  XCircle,
} from "lucide-react";
import { resolveCitation } from "@/lib/citation-resolver";
import { trCaseLabel } from "@/lib/case-intelligence-i18n";
const PANEL = "rounded-2xl border border-slate-700/70 bg-slate-900/95 shadow-xl";
const PANEL_SUB = "rounded-xl border border-slate-700/60 bg-slate-800/90";
const COL = "rounded-xl border border-slate-700/60 bg-slate-900/70 p-2";
const NODE_BASE =
  "w-full cursor-pointer rounded-lg border px-2.5 py-1.5 text-left text-[14px] leading-6 transition focus:outline-none focus:ring-2 focus:ring-sky-400";
const COL_TITLE = "mb-2 flex items-center gap-1.5 text-[15px] font-semibold uppercase tracking-wider text-slate-300";

type GraphNodeKind = "fact" | "doc" | "law" | "practice" | "conclusion" | "review";

type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  sub?: string;
  data: any;
  /** Linked node ids in adjacent columns */
  links: string[];
  warn?: boolean;
};

type Props = {
  analysis: any;
  review: any;
  attachments: any[];
  onOpenSource?: (source: any) => void;
};

export function EvidenceGraphTab({ analysis, review, attachments, onOpenSource }: Props) {
  const graph = useMemo(() => buildGraph(analysis, review, attachments), [analysis, review, attachments]);
  const [selected, setSelected] = useState<string | null>(graph.nodes[0]?.id ?? null);

  if (graph.nodes.length === 0) {
    return (
      <section className={`${PANEL} p-5 text-sm text-slate-200`}>
        <h2 className="font-display text-lg text-white">Evidence Graph</h2>
        <p className="mt-2 text-slate-300">
          В AI-анализе нет данных для построения графа доказательств.
        </p>
      </section>
    );
  }

  const selectedNode = graph.nodes.find((n) => n.id === selected) ?? graph.nodes[0];
  const linkedIds = new Set<string>([selectedNode.id, ...selectedNode.links]);
  // Also include reverse links: any node pointing to the selected one
  for (const n of graph.nodes) {
    if (n.links.includes(selectedNode.id)) linkedIds.add(n.id);
  }

  const byCol = (kind: GraphNodeKind) => graph.nodes.filter((n) => n.kind === kind);

  return (
    <section className={`${PANEL} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg text-white">Evidence Graph</h2>
          <p className="mt-1 text-[14px] text-slate-300">
            Факт → Документы → Нормы → Практика → Вывод. Кликните узел — справа откроется детальная информация.
          </p>
        </div>
        <div className="text-[14px] text-slate-400">
          {graph.nodes.length} узлов · {graph.edges} связей
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        {/* Graph columns */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <GraphColumn title="Факты" icon={<Target size={12} />} nodes={byCol("fact")} selected={selected} highlight={linkedIds} onSelect={setSelected} />
          <GraphColumn title="Документы" icon={<FileText size={12} />} nodes={byCol("doc")} selected={selected} highlight={linkedIds} onSelect={setSelected} />
          <GraphColumn title="Нормы" icon={<Landmark size={12} />} nodes={byCol("law")} selected={selected} highlight={linkedIds} onSelect={setSelected} />
          <GraphColumn title="Практика" icon={<Gavel size={12} />} nodes={byCol("practice")} selected={selected} highlight={linkedIds} onSelect={setSelected} />
          <GraphColumn title="Вывод" icon={<ShieldCheck size={12} />} nodes={byCol("conclusion")} selected={selected} highlight={linkedIds} onSelect={setSelected} />
        </div>

        {/* Inspector */}
        <NodeInspector node={selectedNode} graph={graph} onSelect={setSelected} onOpenSource={onOpenSource} />
      </div>
    </section>
  );
}

function GraphColumn({
  title,
  icon,
  nodes,
  selected,
  highlight,
  onSelect,
}: {
  title: string;
  icon: React.ReactNode;
  nodes: GraphNode[];
  selected: string | null;
  highlight: Set<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={COL}>
      <div className={COL_TITLE}>
        {icon} {title} <span className="text-slate-500">· {nodes.length}</span>
      </div>
      <ul className="space-y-1">
        {nodes.length === 0 && <li className="px-2 py-1 text-[14px] text-slate-500">—</li>}
        {nodes.map((n) => {
          const isSel = n.id === selected;
          const isLinked = highlight.has(n.id) && !isSel;
          const dim = !isSel && !isLinked;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                className={[
                  NODE_BASE,
                  isSel
                    ? "border-sky-400 bg-sky-500/25 text-sky-50"
                    : isLinked
                      ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
                      : "border-slate-700 bg-slate-800/60 text-slate-200",
                  dim ? "opacity-50" : "",
                  n.warn && !isSel ? "border-amber-400/50" : "",
                ].join(" ")}
                title={n.label}
              >
                <div className="flex items-center gap-1">
                  {n.warn && <AlertTriangle size={10} className="shrink-0 text-amber-300" />}
                  <span className="line-clamp-2 break-words">{n.label}</span>
                </div>
                {n.sub && <div className="mt-0.5 truncate text-[10px] text-slate-400">{n.sub}</div>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NodeInspector({
  node,
  graph,
  onSelect,
  onOpenSource,
}: {
  node: GraphNode;
  graph: BuiltGraph;
  onSelect: (id: string) => void;
  onOpenSource?: (source: any) => void;
}) {
  const linkedNodes = graph.nodes.filter((n) => node.links.includes(n.id) || n.links.includes(node.id));
  const grouped: Record<GraphNodeKind, GraphNode[]> = {
    fact: [], doc: [], law: [], practice: [], conclusion: [], review: [],
  };
  for (const n of linkedNodes) grouped[n.kind].push(n);

  // Specific renders by node kind
  if (node.kind === "fact") {
    return <FactInspector node={node} grouped={grouped} onSelect={onSelect} onOpenSource={onOpenSource} />;
  }

  return (
    <aside className={`${PANEL_SUB} p-3 space-y-3 text-[14px] text-slate-100`}>
      <div className="flex items-center gap-2">
        <KindBadge kind={node.kind} />
        <span className="text-[10px] uppercase tracking-wider text-slate-400">узел</span>
      </div>
      <div className="text-sm font-semibold text-white">{node.label}</div>
      {node.sub && <div className="text-[11px] text-slate-300">{node.sub}</div>}

      {(node.kind === "law" || node.kind === "practice") && (
        <CitationBlock source={node.data} onOpenSource={onOpenSource} />
      )}

      {node.kind === "doc" && <DocMetaBlock doc={node.data} />}

      <LinkedGroup title="Связанные факты" items={grouped.fact} onSelect={onSelect} />
      <LinkedGroup title="Связанные документы" items={grouped.doc} onSelect={onSelect} />
      <LinkedGroup title="Связанные нормы" items={grouped.law} onSelect={onSelect} />
      <LinkedGroup title="Связанная практика" items={grouped.practice} onSelect={onSelect} />
      <LinkedGroup title="Замечания AI Review" items={grouped.review} onSelect={onSelect} />
    </aside>
  );
}

function FactInspector({
  node,
  grouped,
  onSelect,
  onOpenSource,
}: {
  node: GraphNode;
  grouped: Record<GraphNodeKind, GraphNode[]>;
  onSelect: (id: string) => void;
  onOpenSource?: (source: any) => void;
}) {
  const fact = node.data;
  const confirming = grouped.doc.filter((d) => !d.data?.contradicts);
  const contradicting = grouped.doc.filter((d) => d.data?.contradicts);
  const missing: any[] = Array.isArray(fact?.missing_evidence) ? fact.missing_evidence : [];
  const risks: any[] = Array.isArray(fact?.risks) ? fact.risks : [];
  const reviewItems = grouped.review;

  return (
    <aside className={`${PANEL_SUB} p-3 space-y-3 text-[14px] text-slate-100`}>
      <div className="flex items-center gap-2">
        <KindBadge kind="fact" />
        <span className="text-[10px] uppercase tracking-wider text-slate-400">Fact Inspector</span>
      </div>
      <div className="text-sm font-semibold text-white">{node.label}</div>
      {node.sub && <div className="text-[11px] text-slate-300">{node.sub}</div>}

      {confirming.length === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-red-400/50 bg-red-500/15 p-2 text-[12px] text-red-50">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Факт документально не подтверждён.</div>
            <div className="mt-0.5 text-[11px] text-red-100/85">
              В AI-анализе не найдено доказательств. Требуется добавить документ или вручную сослаться на источник.
            </div>
          </div>
        </div>
      )}

      <LinkedGroup title="Подтверждающие документы" items={confirming} onSelect={onSelect} emptyHint="не указано" />
      {contradicting.length > 0 && (
        <LinkedGroup title="Опровергающие документы" items={contradicting} onSelect={onSelect} tone="red" />
      )}
      <LinkedGroup title="Применяемые нормы" items={grouped.law} onSelect={onSelect} emptyHint="нет привязки" />
      <LinkedGroup title="Подтверждающая практика" items={grouped.practice} onSelect={onSelect} emptyHint="нет привязки" />

      {missing.length > 0 && (
        <div className="space-y-1">
          <div className={COL_TITLE}>Missing evidence</div>
          <ul className="space-y-1 text-[14px] text-amber-100">
            {missing.map((m, i) => (
              <li key={i} className="rounded-md border border-amber-400/30 bg-amber-500/10 p-1.5">
                {String(m?.what ?? m?.description ?? m?.text ?? m)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {risks.length > 0 && (
        <div className="space-y-1">
          <div className={COL_TITLE}>Риски</div>
          <ul className="space-y-1 text-[14px] text-orange-100">
            {risks.map((r, i) => (
              <li key={i} className="rounded-md border border-orange-400/30 bg-orange-500/10 p-1.5">
                {String(r?.text ?? r?.description ?? r)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reviewItems.length > 0 && (
        <div className="space-y-1">
          <div className={COL_TITLE}>
            <MessageSquare size={12} /> Замечания AI Review
          </div>
          <ul className="space-y-1 text-[14px] text-rose-100">
            {reviewItems.map((r) => (
              <li
                key={r.id}
                className="cursor-pointer rounded-md border border-rose-400/30 bg-rose-500/10 p-1.5 hover:bg-rose-500/20"
                onClick={() => onSelect(r.id)}
              >
                {r.label}
                {r.sub && <div className="text-[10px] text-rose-200/80">{r.sub}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onOpenSource && grouped.law[0] && (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-sky-400/50 bg-sky-500/20 px-2.5 py-1 text-[11px] text-sky-50 hover:bg-sky-500/30"
          onClick={() => onOpenSource(grouped.law[0].data)}
        >
          <ExternalLink size={11} /> Открыть первый источник
        </button>
      )}
    </aside>
  );
}

function LinkedGroup({
  title,
  items,
  onSelect,
  emptyHint,
  tone = "default",
}: {
  title: string;
  items: GraphNode[];
  onSelect: (id: string) => void;
  emptyHint?: string;
  tone?: "default" | "red";
}) {
  if (items.length === 0 && !emptyHint) return null;
  return (
    <div className="space-y-1">
      <div className={COL_TITLE}>{title}</div>
      {items.length === 0 ? (
        <div className="text-[11px] text-slate-500">{emptyHint}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                className={[
                  "flex w-full items-start gap-1 rounded-md border px-2 py-1 text-left text-[14px] transition",
                  tone === "red"
                    ? "border-red-400/40 bg-red-500/10 text-red-50 hover:bg-red-500/20"
                    : "border-slate-700 bg-slate-800/60 text-slate-100 hover:bg-slate-700/60",
                ].join(" ")}
              >
                <ChevronRight size={11} className="mt-0.5 shrink-0 text-slate-400" />
                <span className="line-clamp-2 break-words">{n.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: GraphNodeKind }) {
  const map: Record<GraphNodeKind, [string, string]> = {
    fact: ["Факт", "bg-sky-500/25 text-sky-50"],
    doc: ["Документ", "bg-emerald-500/25 text-emerald-50"],
    law: ["Норма", "bg-indigo-500/25 text-indigo-50"],
    practice: ["Практика", "bg-amber-500/25 text-amber-50"],
    conclusion: ["Вывод", "bg-purple-500/25 text-purple-50"],
    review: ["AI Review", "bg-rose-500/25 text-rose-50"],
  };
  const [label, cls] = map[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function CitationBlock({
  source,
  onOpenSource,
}: {
  source: any;
  onOpenSource?: (source: any) => void;
}) {
  const r = resolveCitation(source);
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900/80 p-2 text-[14px] text-slate-200">
      <div className="font-mono text-[11px] text-sky-100">{r.full}</div>
      {r.warning && (
        <div className="mt-1 flex items-center gap-1 text-amber-200">
          <AlertTriangle size={10} /> {r.warning}
        </div>
      )}
      {onOpenSource && (
        <button
          type="button"
          onClick={() => onOpenSource(source)}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-50 hover:bg-sky-500/25"
        >
          <ExternalLink size={10} /> Открыть источник
        </button>
      )}
    </div>
  );
}

function DocMetaBlock({ doc }: { doc: any }) {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900/80 p-2 text-[14px] text-slate-200 space-y-0.5">
      <div>
        <span className="text-slate-400">Файл: </span>
        {doc?.file_name ?? "—"}
      </div>
      <div>
        <span className="text-slate-400">Тип: </span>
        {doc?.document_type ?? "—"}
      </div>
      <div>
        <span className="text-slate-400">OCR: </span>
        {doc?.ocr_length ? `${doc.ocr_length} симв.` : "—"}
      </div>
      {doc?.audit_status === "used" && (
        <div className="text-emerald-200">
          <CheckCircle2 size={10} className="inline" /> использован AI
        </div>
      )}
      {doc?.audit_status === "rejected" && (
        <div className="text-red-200">
          <XCircle size={10} className="inline" /> отклонён AI
        </div>
      )}
    </div>
  );
}

/* ============ Graph builder ============ */

type BuiltGraph = { nodes: GraphNode[]; edges: number };

function buildGraph(analysis: any, review: any, attachments: any[]): BuiltGraph {
  if (!analysis || typeof analysis !== "object") return { nodes: [], edges: 0 };
  const nodes: GraphNode[] = [];
  let edges = 0;

  const factToLaw: any[] = Array.isArray(analysis.fact_to_law_mapping) ? analysis.fact_to_law_mapping : [];
  const factToEvidence: any[] = Array.isArray(analysis.fact_to_evidence_mapping)
    ? analysis.fact_to_evidence_mapping
    : Array.isArray(analysis.evidence_mapping)
      ? analysis.evidence_mapping
      : [];
  const applicableLaws: any[] = Array.isArray(analysis.applicable_laws) ? analysis.applicable_laws : [];
  const courtPractice: any[] = Array.isArray(analysis.court_practice) ? analysis.court_practice : [];
  const fnsLetters: any[] = Array.isArray(analysis.fns_letters) ? analysis.fns_letters : [];
  const minfinLetters: any[] = Array.isArray(analysis.minfin_letters) ? analysis.minfin_letters : [];
  const reviewProblems: any[] = [
    ...((review?.problems as any[]) ?? []),
    ...((review?.required_fixes as any[]) ?? []),
    ...((review?.recommendations as any[]) ?? []),
  ];
  const overallConclusion = String(
    analysis.conclusion ?? analysis.legal_position ?? analysis.summary ?? "",
  ).trim();

  // Index attachments by name
  const docByName = new Map<string, any>();
  for (const a of attachments ?? []) {
    if (a?.file_name) docByName.set(String(a.file_name).toLowerCase(), a);
  }

  // Fact nodes
  const factIdByKey = new Map<string, string>();
  factToLaw.forEach((m: any, i: number) => {
    const factText = String(m?.fact ?? m?.fact_text ?? m?.description ?? "").trim();
    const factKey = String(m?.fact_id ?? m?.fact_key ?? m?.fact ?? factText ?? i).toLowerCase();
    const id = `fact:${i}`;
    factIdByKey.set(factKey, id);
    nodes.push({
      id,
      kind: "fact",
      label: (factText || `Факт №${i + 1}`).slice(0, 140),
      sub: m?.conclusion ? String(m.conclusion).slice(0, 80) : undefined,
      data: { ...m, key: factKey },
      links: [],
    });
  });

  // Document nodes (from attachments used in analysis)
  const docIdByKey = new Map<string, string>();
  attachments?.forEach((a: any, i: number) => {
    if (a?.audit_status === "rejected") return; // skip rejected from main graph (still visible in matrix)
    const id = `doc:${i}`;
    docIdByKey.set(String(a.file_name ?? a.id).toLowerCase(), id);
    nodes.push({
      id,
      kind: "doc",
      label: a.file_name ?? "Без имени",
      sub: a.document_type ?? a.mime_type ?? undefined,
      data: a,
      links: [],
      warn: a.audit_status === "unknown",
    });
  });

  // Law nodes (deduped by article+code)
  const lawIdByKey = new Map<string, string>();
  applicableLaws.forEach((l: any, i: number) => {
    const key = String(l?.id ?? l?.law_id ?? l?.article ?? l?.title ?? l?.name ?? i).toLowerCase();
    if (lawIdByKey.has(key)) return;
    const id = `law:${i}`;
    lawIdByKey.set(key, id);
    const r = resolveCitation(l);
    nodes.push({
      id,
      kind: "law",
      label: r.label || l?.title || l?.name || `Норма №${i + 1}`,
      sub: r.precise ? r.full : "точная локализация отсутствует",
      data: l,
      links: [],
      warn: !r.precise,
    });
  });

  // Practice nodes (court + fns + minfin)
  const practiceArr = [...courtPractice, ...fnsLetters, ...minfinLetters];
  practiceArr.forEach((p: any, i: number) => {
    const id = `practice:${i}`;
    const r = resolveCitation(p);
    nodes.push({
      id,
      kind: "practice",
      label: r.label || p?.title || p?.name || `Источник №${i + 1}`,
      sub: r.precise ? r.full : "точная локализация отсутствует",
      data: p,
      links: [],
      warn: !r.precise,
    });
  });

  // Conclusion node (one overall)
  let conclusionId: string | null = null;
  if (overallConclusion) {
    conclusionId = "conclusion:0";
    nodes.push({
      id: conclusionId,
      kind: "conclusion",
      label: overallConclusion.slice(0, 160),
      data: { text: overallConclusion },
      links: [],
    });
  }

  // Review nodes
  reviewProblems.forEach((r: any, i: number) => {
    const id = `review:${i}`;
    nodes.push({
      id,
      kind: "review",
      label: String(r?.title ?? r?.text ?? r?.message ?? r?.description ?? `Замечание №${i + 1}`).slice(0, 140),
      sub: r?.severity ? `severity: ${r.severity}` : undefined,
      data: r,
      links: [],
    });
  });

  // ---- Edges ----
  const factNodes = nodes.filter((n) => n.kind === "fact");
  for (const f of factNodes) {
    const m = f.data;
    const factKey = String(f.data.key);

    // fact → docs (via fact_to_evidence_mapping or scan attachments by name in text)
    const evidenceEntry = factToEvidence.find((e: any) => {
      const k = String(e?.fact ?? e?.fact_id ?? e?.fact_key ?? "").toLowerCase();
      return k && (k === factKey || k.includes(factKey) || factKey.includes(k));
    });
    const evidenceDocs: any[] = evidenceEntry
      ? (Array.isArray(evidenceEntry.documents) ? evidenceEntry.documents : Array.isArray(evidenceEntry.evidence) ? evidenceEntry.evidence : [])
      : [];
    for (const ed of evidenceDocs) {
      const name = String(ed?.file_name ?? ed?.file ?? ed?.document_name ?? ed?.name ?? "").toLowerCase();
      const docId = docIdByKey.get(name);
      if (docId) {
        f.links.push(docId);
        edges++;
        // Mark contradiction flag
        const docNode = nodes.find((n) => n.id === docId);
        if (docNode && (ed?.contradicts || ed?.role === "contradicts")) {
          docNode.data = { ...docNode.data, contradicts: true };
        }
      }
    }

    // fact → law
    const lawRef = m?.law ?? m?.law_id ?? m?.article ?? m?.code;
    const lawKey = String(typeof lawRef === "object" ? (lawRef?.id ?? lawRef?.article ?? lawRef?.title) : lawRef ?? "").toLowerCase();
    if (lawKey) {
      const lawId = lawIdByKey.get(lawKey) ?? Array.from(lawIdByKey.entries()).find(([k]) => k.includes(lawKey) || lawKey.includes(k))?.[1];
      if (lawId) {
        f.links.push(lawId);
        edges++;
      }
    }

    // fact → practice (by related_fact / fact field)
    for (let pi = 0; pi < practiceArr.length; pi++) {
      const p = practiceArr[pi];
      const related = String(p?.fact ?? p?.fact_id ?? p?.related_fact ?? "").toLowerCase();
      if (related && (related === factKey || related.includes(factKey) || factKey.includes(related))) {
        f.links.push(`practice:${pi}`);
        edges++;
      }
    }

    // fact → conclusion (always link to overall conclusion if present)
    if (conclusionId) {
      f.links.push(conclusionId);
      edges++;
    }

    // fact → review (by fact_id / argument_id / fuzzy)
    reviewProblems.forEach((r: any, ri: number) => {
      if (
        (r?.fact_id != null && String(r.fact_id).toLowerCase() === factKey) ||
        (r?.argument_id != null && Number(r.argument_id) === f.data && false) // type guard
      ) {
        f.links.push(`review:${ri}`);
        edges++;
        return;
      }
      const hay = JSON.stringify(r ?? "").toLowerCase();
      if (factKey.length > 4 && hay.includes(factKey.slice(0, 30))) {
        f.links.push(`review:${ri}`);
        edges++;
      }
    });
  }

  return { nodes, edges };
}
