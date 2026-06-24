/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 9 — Source Backlinks.
 *
 * Builds backlinks from a given source (law / court / fns / minfin / client_doc / generic)
 * to facts, arguments, documents, risks and AI Review items.
 *
 * Strict rules:
 *   - only existing analysis/review fields are used (no AI calls);
 *   - exact matches are preferred; substring/normalised matches are flagged as fuzzy;
 *   - if no link can be derived, the caller should render the "no links" notice.
 */

export type BacklinkFact = {
  index: number;
  text: string;
  factKey: string;
  fuzzy: boolean;
};

export type BacklinkArg = {
  index: number;
  title: string;
  fuzzy: boolean;
};

export type BacklinkDoc = {
  fileName: string | null;
  id: string | null;
  audit_status?: "used" | "rejected" | "unknown";
  doc?: any;
  fuzzy: boolean;
};

export type BacklinkRisk = {
  kind: "missing_evidence" | "weak_point" | "risk" | "counter_argument";
  text: string;
  fuzzy: boolean;
};

export type BacklinkReview = {
  kind: "problem" | "required_fix" | "recommendation";
  text: string;
  severity?: string;
  fuzzy: boolean;
};

export type Backlinks = {
  facts: BacklinkFact[];
  args: BacklinkArg[];
  documents: BacklinkDoc[];
  risks: BacklinkRisk[];
  reviews: BacklinkReview[];
  fuzzy: boolean; // overall — any heuristic match used
  empty: boolean;
};

function norm(v: any): string {
  return String(v ?? "").trim().toLowerCase();
}

function nonEmpty(v: any): boolean {
  return v != null && String(v).trim() !== "";
}

function tokens(v: any): string[] {
  return norm(v)
    .split(/[\s,;:.()«»"'\\/\-—–]+/u)
    .filter((t) => t.length >= 3);
}

/** Generate identity tokens for a source so we can match it against free-text fields. */
function sourceIdentity(source: any): {
  exact: Set<string>;
  loose: Set<string>;
  kind: string;
} {
  const exact = new Set<string>();
  const loose = new Set<string>();
  const add = (set: Set<string>, v: any) => {
    const t = norm(v);
    if (t) set.add(t);
  };
  const kind = norm(source?.kind ?? source?.type ?? source?.source_type);

  // law
  add(exact, source?.id);
  add(exact, source?.law_id);
  add(exact, source?.source_id);
  add(exact, source?.case_number);
  add(exact, source?.number);
  add(exact, source?.letter_number);
  add(exact, source?.file_name);
  add(exact, source?.file);

  for (const k of ["article", "act", "code", "title", "name", "law"]) {
    add(loose, source?.[k]);
  }
  // combine article + act for laws like "ст. 54.1 НК"
  if (nonEmpty(source?.article) && nonEmpty(source?.act ?? source?.code)) {
    loose.add(`${norm(source.article)} ${norm(source.act ?? source.code)}`);
  }
  return { exact, loose, kind };
}

function valueIncludesAny(value: string, needles: Set<string>): boolean {
  if (!value) return false;
  for (const n of needles) {
    if (n && (value === n || value.includes(n))) return true;
  }
  return false;
}

function anyFieldMatches(item: any, fields: string[], needles: Set<string>): boolean {
  for (const f of fields) {
    const v = item?.[f];
    if (v == null) continue;
    if (typeof v === "string" && valueIncludesAny(norm(v), needles)) return true;
    if (typeof v === "object" && v) {
      for (const inner of Object.values(v)) {
        if (typeof inner === "string" && valueIncludesAny(norm(inner), needles)) return true;
      }
    }
  }
  return false;
}

export function buildBacklinks(
  source: any,
  analysis: any,
  review: any,
  attachments: any[] | undefined,
): Backlinks {
  const empty: Backlinks = {
    facts: [],
    args: [],
    documents: [],
    risks: [],
    reviews: [],
    fuzzy: false,
    empty: true,
  };
  if (!source || typeof source !== "object" || !analysis) return empty;

  const ident = sourceIdentity(source);
  const isClientDoc = ident.kind.includes("client") || ident.kind.includes("intake") ||
    ident.kind.includes("ocr") || nonEmpty(source?.file_name);
  const isLaw = ident.kind.includes("law") || ident.kind.includes("норм") ||
    nonEmpty(source?.article) || nonEmpty(source?.code);
  const isPractice = ident.kind.includes("court") || ident.kind.includes("plenum") ||
    ident.kind.includes("fns") || ident.kind.includes("minfin") ||
    nonEmpty(source?.case_number);

  const factToLaw: any[] = Array.isArray(analysis.fact_to_law_mapping) ? analysis.fact_to_law_mapping : [];
  const factToEvidence: any[] = Array.isArray(analysis.fact_to_evidence_mapping)
    ? analysis.fact_to_evidence_mapping
    : Array.isArray(analysis.evidence_mapping)
      ? analysis.evidence_mapping
      : [];

  // ---- Facts ----
  const factHits: BacklinkFact[] = [];
  const factMatchedKeys = new Set<string>();
  let anyFuzzy = false;

  factToLaw.forEach((m: any, i: number) => {
    const factText = String(m?.fact ?? m?.fact_text ?? m?.description ?? "").trim();
    const factKey = norm(m?.fact_id ?? m?.fact_key ?? m?.fact ?? factText ?? i);
    const lawRef = m?.law ?? m?.law_id ?? m?.article ?? m?.code;
    const lawStr =
      typeof lawRef === "object" && lawRef
        ? `${norm(lawRef.article)} ${norm(lawRef.code)} ${norm(lawRef.title)} ${norm(lawRef.id)}`
        : norm(lawRef);

    let matched = false;
    let fuzzy = false;

    if (isLaw) {
      if (valueIncludesAny(lawStr, ident.exact)) {
        matched = true;
      } else if (valueIncludesAny(lawStr, ident.loose)) {
        matched = true;
        fuzzy = true;
      }
    }

    if (!matched && isClientDoc) {
      // walk evidence docs and try file_name match
      const evidenceEntry = factToEvidence.find((e: any) => {
        const k = norm(e?.fact ?? e?.fact_id ?? e?.fact_key);
        return k && (k === factKey || k.includes(factKey) || factKey.includes(k));
      });
      const docs: any[] = evidenceEntry
        ? Array.isArray(evidenceEntry.documents)
          ? evidenceEntry.documents
          : Array.isArray(evidenceEntry.evidence)
            ? evidenceEntry.evidence
            : []
        : [];
      for (const d of docs) {
        const dn = norm(d?.file_name ?? d?.file ?? d?.document_name ?? d?.name);
        if (dn && valueIncludesAny(dn, ident.exact)) {
          matched = true;
          break;
        }
        if (dn && valueIncludesAny(dn, ident.loose)) {
          matched = true;
          fuzzy = true;
          break;
        }
      }
    }

    if (!matched && isPractice) {
      // analysis.court_practice etc. may carry related_fact = factKey
      // we test the inverse here: m.related_practice
      const rel = norm(m?.related_practice ?? m?.practice ?? m?.case_number);
      if (rel && valueIncludesAny(rel, ident.exact)) matched = true;
      else if (rel && valueIncludesAny(rel, ident.loose)) {
        matched = true;
        fuzzy = true;
      }
    }

    if (matched) {
      factHits.push({
        index: i,
        text: factText || `Факт №${i + 1}`,
        factKey,
        fuzzy,
      });
      factMatchedKeys.add(factKey);
      if (fuzzy) anyFuzzy = true;
    }
  });

  // Additionally, for court/fns/minfin sources, scan their own related_fact pointing to a fact.
  if (isPractice) {
    const lists = [
      ...((analysis.court_practice as any[]) ?? []),
      ...((analysis.fns_letters as any[]) ?? []),
      ...((analysis.minfin_letters as any[]) ?? []),
    ];
    for (const p of lists) {
      // is it the same source?
      const pId = norm(p?.case_number ?? p?.number ?? p?.letter_number ?? p?.title ?? p?.id);
      if (!pId) continue;
      const isSame = valueIncludesAny(pId, ident.exact) || valueIncludesAny(pId, ident.loose);
      if (!isSame) continue;
      const rel = norm(p?.related_fact ?? p?.fact ?? p?.fact_id);
      if (!rel) continue;
      // find a fact whose key matches rel
      factToLaw.forEach((m: any, i: number) => {
        const factText = String(m?.fact ?? m?.fact_text ?? m?.description ?? "").trim();
        const factKey = norm(m?.fact_id ?? m?.fact_key ?? m?.fact ?? factText ?? i);
        if (factMatchedKeys.has(factKey)) return;
        if (factKey && (factKey === rel || factKey.includes(rel) || rel.includes(factKey))) {
          factHits.push({
            index: i,
            text: factText || `Факт №${i + 1}`,
            factKey,
            fuzzy: !(factKey === rel),
          });
          factMatchedKeys.add(factKey);
          if (factKey !== rel) anyFuzzy = true;
        }
      });
    }
  }

  // ---- Arguments (parallel to fact_to_law_mapping, index-aligned) ----
  const argHits: BacklinkArg[] = factHits.map((f) => {
    const m = factToLaw[f.index];
    const title =
      String(m?.argument_title ?? m?.title ?? m?.fact ?? m?.fact_text ?? "").trim() ||
      `Аргумент ${f.index + 1}`;
    return { index: f.index, title, fuzzy: f.fuzzy };
  });

  // ---- Documents ----
  const docHits: BacklinkDoc[] = [];
  const seenDocs = new Set<string>();
  const pushDoc = (d: BacklinkDoc) => {
    const key = norm(d.fileName ?? d.id);
    if (!key || seenDocs.has(key)) return;
    seenDocs.add(key);
    docHits.push(d);
  };
  const findAttachment = (fileName: string | null | undefined) => {
    if (!fileName || !attachments) return null;
    const n = norm(fileName);
    return (
      attachments.find((a: any) => norm(a?.file_name) === n) ??
      attachments.find((a: any) => {
        const an = norm(a?.file_name);
        return an && (an.includes(n) || n.includes(an));
      }) ??
      null
    );
  };

  if (isClientDoc) {
    const att = findAttachment(source?.file_name ?? source?.file ?? source?.document_name);
    if (att) {
      pushDoc({
        fileName: att.file_name ?? null,
        id: att.id ?? null,
        audit_status: att.audit_status,
        doc: att,
        fuzzy: norm(att.file_name) !== norm(source?.file_name ?? source?.file),
      });
    } else if (source?.file_name) {
      pushDoc({ fileName: source.file_name, id: null, fuzzy: false });
    }
  }

  // For any matched fact, gather its evidence docs.
  for (const f of factHits) {
    const entry = factToEvidence.find((e: any) => {
      const k = norm(e?.fact ?? e?.fact_id ?? e?.fact_key);
      return k && (k === f.factKey || k.includes(f.factKey) || f.factKey.includes(k));
    });
    const docs: any[] = entry
      ? Array.isArray(entry.documents)
        ? entry.documents
        : Array.isArray(entry.evidence)
          ? entry.evidence
          : []
      : [];
    for (const d of docs) {
      const fn = d?.file_name ?? d?.file ?? d?.document_name ?? d?.name;
      const att = findAttachment(fn);
      pushDoc({
        fileName: fn ?? null,
        id: att?.id ?? null,
        audit_status: att?.audit_status,
        doc: att ?? d,
        fuzzy: f.fuzzy || (att != null && norm(att.file_name) !== norm(fn)),
      });
    }
  }

  // ---- Risks ----
  const riskHits: BacklinkRisk[] = [];
  const seenRisk = new Set<string>();
  const pushRisk = (k: BacklinkRisk["kind"], text: string, fuzzy: boolean) => {
    const key = `${k}|${norm(text)}`;
    if (!text || seenRisk.has(key)) return;
    seenRisk.add(key);
    riskHits.push({ kind: k, text, fuzzy });
  };
  const factKeysAll = new Set(factHits.map((f) => f.factKey));
  const riskSources: Array<[BacklinkRisk["kind"], any[]]> = [
    ["missing_evidence", analysis.missing_evidence ?? []],
    ["weak_point", analysis.weak_points ?? []],
    ["risk", analysis.risks ?? []],
    ["counter_argument", analysis.counter_arguments ?? []],
  ];
  for (const [kind, arr] of riskSources) {
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      const text = String(
        r?.text ?? r?.description ?? r?.title ?? r?.problem ?? r?.message ?? "",
      ).trim();
      if (!text) continue;
      // (a) link by related fact
      const rel = norm(r?.fact ?? r?.fact_id ?? r?.related_fact ?? r?.fact_key);
      if (rel && Array.from(factKeysAll).some((k) => k && (k === rel || k.includes(rel) || rel.includes(k)))) {
        pushRisk(kind, text, anyFuzzy);
        continue;
      }
      // (b) link by source mention in free text
      if (
        anyFieldMatches(r, ["text", "description", "title", "problem", "message", "law", "norm"], ident.exact)
      ) {
        pushRisk(kind, text, false);
      } else if (
        anyFieldMatches(r, ["text", "description", "title", "problem", "message", "law", "norm"], ident.loose)
      ) {
        pushRisk(kind, text, true);
        anyFuzzy = true;
      }
    }
  }

  // ---- Review ----
  const reviewHits: BacklinkReview[] = [];
  const seenRev = new Set<string>();
  const pushRev = (k: BacklinkReview["kind"], text: string, severity: any, fuzzy: boolean) => {
    const key = `${k}|${norm(text)}`;
    if (!text || seenRev.has(key)) return;
    seenRev.add(key);
    reviewHits.push({
      kind: k,
      text,
      severity: severity != null ? String(severity) : undefined,
      fuzzy,
    });
  };
  const reviewSrc: Array<[BacklinkReview["kind"], any[]]> = [
    ["problem", review?.problems ?? []],
    ["required_fix", review?.required_fixes ?? []],
    ["recommendation", review?.recommendations ?? []],
  ];
  for (const [kind, arr] of reviewSrc) {
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      const text = String(
        r?.text ?? r?.title ?? r?.message ?? r?.description ?? r?.problem ?? "",
      ).trim();
      if (!text) continue;
      const rel = norm(r?.fact_id ?? r?.fact_key ?? r?.related_fact ?? r?.argument_id);
      const argIndexes = new Set(argHits.map((a) => String(a.index)));
      if (rel && (factKeysAll.has(rel) || argIndexes.has(rel))) {
        pushRev(kind, text, r?.severity, false);
        continue;
      }
      if (
        anyFieldMatches(r, ["text", "title", "message", "description", "law", "norm", "source"], ident.exact)
      ) {
        pushRev(kind, text, r?.severity, false);
      } else if (
        anyFieldMatches(r, ["text", "title", "message", "description", "law", "norm", "source"], ident.loose)
      ) {
        pushRev(kind, text, r?.severity, true);
        anyFuzzy = true;
      }
    }
  }

  const result: Backlinks = {
    facts: factHits,
    args: argHits,
    documents: docHits,
    risks: riskHits,
    reviews: reviewHits,
    fuzzy: anyFuzzy,
    empty:
      factHits.length === 0 &&
      argHits.length === 0 &&
      docHits.length === 0 &&
      riskHits.length === 0 &&
      reviewHits.length === 0,
  };
  return result;
}

/**
 * Fact links for a single attachment — used by the Attachments tab to count and filter.
 */
export function getFactLinksForDoc(
  doc: { id?: string | null; file_name?: string | null },
  analysis: any,
): { count: number; facts: Array<{ index: number; text: string }> } {
  if (!analysis) return { count: 0, facts: [] };
  const factToEvidence: any[] = Array.isArray(analysis.fact_to_evidence_mapping)
    ? analysis.fact_to_evidence_mapping
    : Array.isArray(analysis.evidence_mapping)
      ? analysis.evidence_mapping
      : [];
  const factToLaw: any[] = Array.isArray(analysis.fact_to_law_mapping) ? analysis.fact_to_law_mapping : [];
  if (factToEvidence.length === 0) return { count: 0, facts: [] };

  const dn = norm(doc.file_name);
  if (!dn && !doc.id) return { count: 0, facts: [] };

  const out: Array<{ index: number; text: string }> = [];
  for (const entry of factToEvidence) {
    const docs: any[] = Array.isArray(entry?.documents)
      ? entry.documents
      : Array.isArray(entry?.evidence)
        ? entry.evidence
        : [];
    const hit = docs.some((d: any) => {
      const edn = norm(d?.file_name ?? d?.file ?? d?.document_name ?? d?.name);
      const edid = norm(d?.id);
      if (edid && doc.id && edid === norm(doc.id)) return true;
      if (!edn || !dn) return false;
      return edn === dn || edn.includes(dn) || dn.includes(edn);
    });
    if (!hit) continue;
    const factKey = norm(entry?.fact ?? entry?.fact_id ?? entry?.fact_key);
    // map back to fact_to_law to fetch original text and index
    let idx = factToLaw.findIndex((m: any) => {
      const k = norm(m?.fact_id ?? m?.fact_key ?? m?.fact);
      return k && factKey && (k === factKey || k.includes(factKey) || factKey.includes(k));
    });
    if (idx < 0) idx = out.length;
    const m = factToLaw[idx];
    const text = String(m?.fact ?? m?.fact_text ?? entry?.fact ?? entry?.description ?? "").trim() ||
      `Факт №${idx + 1}`;
    out.push({ index: idx, text });
  }
  return { count: out.length, facts: out };
}
