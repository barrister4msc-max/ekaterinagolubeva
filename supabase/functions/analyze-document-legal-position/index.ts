// supabase/functions/analyze-document-legal-position/index.ts
// Legal Research Engine (Stage 1).
// 1. Loads OCR of intake-session documents + questionnaire answers.
// 2. Runs a cascaded research over legal_knowledge_chunks
//    (laws / court_practice / fns_letter / minfin_letter / ekaterina_practice / manuals)
//    + practice_document_legal_analysis + practice_legal_analysis_sources.
// 3. Builds a document audit (used / rejected with reason).
// 4. Asks Gemini for a structured legal_analysis grounded ONLY in the provided sources.
// 5. Merges model output with the registry (URLs come from DB, not the model).
// 6. Persists everything into the existing document_intake_ai_runs row.
//
// IMPORTANT: schema, generate-legal-document-v2, review-generated-legal-document,
// document-intake-ai-fill are NOT touched.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-2.5-pro";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ───────────────────────── types ─────────────────────────

type ResearchBucket =
  | "laws"
  | "court_practice"
  | "fns_letters"
  | "minfin_letters"
  | "ekaterina"
  | "manuals";

type ResearchSource = {
  bucket: ResearchBucket;
  source_table: string;
  source_id: string;
  source_type: string;
  title: string;
  official_url: string | null;
  citation: string | null;
  snippet: string;
  verification_status: "verified" | "needs_check" | "missing_url";
  actuality_status: "actual" | "requires_actuality_check" | "requires_manual_verification";
  why_selected: string;
  used_for: string;
};

type DocAuditEntry = {
  id: string;
  title: string;
  ocr_length: number;
  used: boolean;
  reason?:
    | "no_ocr"
    | "text_too_short"
    | "archive_zip"
    | "technical_file"
    | "duplicate"
    | "irrelevant";
};

type AnalysisResult = {
  facts: string[];
  legal_qualification: string;
  main_legal_position: string;
  tax_authority_position: string;
  taxpayer_position: string;

  applicable_laws: Array<Record<string, unknown>>;
  rejected_laws: Array<{ law: string; reason: string }>;

  fact_to_law_mapping: Array<{ fact: string; law: string; reasoning: string; conclusion: string }>;
  alternative_positions: string[];
  why_rejected: string[];

  counter_arguments: string[];
  weak_points: string[];
  missing_evidence: string[];
  risks: Array<{ risk: string; severity?: string; mitigation?: string }>;

  court_practice: Array<Record<string, unknown>>;
  rejected_court_practice: Array<{ case: string; reason: string }>;

  fns_letters: Array<Record<string, unknown>>;
  minfin_letters: Array<Record<string, unknown>>;
  ekaterina_practice: Array<Record<string, unknown>>;
  manuals: Array<Record<string, unknown>>;

  sources: Array<Record<string, unknown>>;
  source_actuality: Array<{ source: string; status: string; note?: string }>;

  recommendations: string[];
  generation_instructions: string[];

  documents_audit: { used: DocAuditEntry[]; rejected: DocAuditEntry[] };
  research_summary: Record<string, number>;
};

const EMPTY: AnalysisResult = {
  facts: [],
  legal_qualification: "",
  main_legal_position: "",
  tax_authority_position: "",
  taxpayer_position: "",
  applicable_laws: [],
  rejected_laws: [],
  fact_to_law_mapping: [],
  alternative_positions: [],
  why_rejected: [],
  counter_arguments: [],
  weak_points: [],
  missing_evidence: [],
  risks: [],
  court_practice: [],
  rejected_court_practice: [],
  fns_letters: [],
  minfin_letters: [],
  ekaterina_practice: [],
  manuals: [],
  sources: [],
  source_actuality: [],
  recommendations: [],
  generation_instructions: [],
  documents_audit: { used: [], rejected: [] },
  research_summary: {},
};

// ─────────────────── helpers ───────────────────

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function classifyDocument(d: {
  id: string;
  title: string;
  file_name: string | null;
  ocr_text: string | null;
}): DocAuditEntry {
  const name = (d.file_name || d.title || "").toLowerCase();
  const ocr = (d.ocr_text ?? "").trim();
  const ocrLen = ocr.length;
  const base: DocAuditEntry = {
    id: d.id,
    title: d.title || d.file_name || "Документ",
    ocr_length: ocrLen,
    used: false,
  };
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return { ...base, reason: "archive_zip" };
  if (/\.(exe|dll|bin|iso)$/i.test(name)) return { ...base, reason: "technical_file" };
  if (!ocr) return { ...base, reason: "no_ocr" };
  if (ocrLen <= 50) return { ...base, reason: "text_too_short" };
  return { ...base, used: true };
}

// ─────────────────── cascade research ───────────────────

type SbClient = ReturnType<typeof createClient>;

async function selectChunksByTypes(
  sb: SbClient,
  types: string[],
  practiceArea: string | null,
  limit: number,
): Promise<any[]> {
  // primary: metadata->>source_type IN (...)
  const orMeta = types.map((t) => `metadata->>source_type.eq.${t}`).join(",");
  let q = sb
    .from("legal_knowledge_chunks")
    .select("id, title, content, metadata, category, source_type")
    .eq("is_active", true)
    .or(orMeta)
    .limit(limit);
  if (practiceArea) q = q.eq("category", practiceArea);
  const { data: a } = await q;
  let rows = (a ?? []) as any[];

  // fallback to column source_type if metadata is empty
  if (rows.length < limit) {
    let q2 = sb
      .from("legal_knowledge_chunks")
      .select("id, title, content, metadata, category, source_type")
      .eq("is_active", true)
      .in("source_type", types)
      .limit(limit);
    if (practiceArea) q2 = q2.eq("category", practiceArea);
    const { data: b } = await q2;
    const extra = ((b ?? []) as any[]).filter(
      (r) => !rows.some((x) => x.id === r.id),
    );
    rows = rows.concat(extra).slice(0, limit);
  }

  // global fallback (no practice_area filter) if nothing found
  if (rows.length === 0 && practiceArea) {
    const { data: c } = await sb
      .from("legal_knowledge_chunks")
      .select("id, title, content, metadata, category, source_type")
      .eq("is_active", true)
      .or(orMeta)
      .limit(limit);
    rows = (c ?? []) as any[];
  }
  return rows;
}

function mapChunkToSource(
  row: any,
  bucket: ResearchBucket,
  used_for: string,
): ResearchSource {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const url = pickStr(meta.official_url, meta.url, meta.source_url);
  const sourceType =
    pickStr(meta.source_type) ?? (row.source_type as string | null) ?? bucket;
  return {
    bucket,
    source_table: "legal_knowledge_chunks",
    source_id: row.id as string,
    source_type: sourceType,
    title: (row.title as string) || pickStr(meta.title) || sourceType,
    official_url: url,
    citation: pickStr(meta.citation, meta.document_number) ?? null,
    snippet: ((row.content as string) ?? "").slice(0, 1800),
    verification_status: url ? "needs_check" : "missing_url",
    actuality_status: url ? "requires_actuality_check" : "requires_manual_verification",
    why_selected: `bucket=${bucket}${row.category ? `, area=${row.category}` : ""}`,
    used_for,
  };
}

async function runCascadeResearch(
  sb: SbClient,
  practiceArea: string | null,
): Promise<{ sources: ResearchSource[]; counts: Record<string, number> }> {
  const [laws, courts, fns, minfin, ekChunks, manuals] = await Promise.all([
    selectChunksByTypes(sb, ["law_full_text", "federal_law", "law_full_text_placeholder"], practiceArea, 10),
    selectChunksByTypes(sb, ["court_practice", "vs_review"], practiceArea, 8),
    selectChunksByTypes(sb, ["fns_letter"], practiceArea, 6),
    selectChunksByTypes(sb, ["minfin_letter"], practiceArea, 6),
    selectChunksByTypes(sb, ["ekaterina_practice"], practiceArea, 6),
    selectChunksByTypes(sb, ["manual", "manual_seed", "template"], practiceArea, 4),
  ]);

  const sources: ResearchSource[] = [];
  for (const r of laws) sources.push(mapChunkToSource(r, "laws", "applicable_laws"));
  for (const r of courts) sources.push(mapChunkToSource(r, "court_practice", "court_practice"));
  for (const r of fns) sources.push(mapChunkToSource(r, "fns_letters", "fns_letters"));
  for (const r of minfin) sources.push(mapChunkToSource(r, "minfin_letters", "minfin_letters"));
  for (const r of ekChunks) sources.push(mapChunkToSource(r, "ekaterina", "ekaterina_practice"));
  for (const r of manuals) sources.push(mapChunkToSource(r, "manuals", "generation_instructions"));

  // Ekaterina: practice_document_legal_analysis
  let ekPractice: any[] = [];
  try {
    let q = sb
      .from("practice_document_legal_analysis")
      .select(
        "id, document_id, practice_area, document_type, legal_position, legal_reasoning, applicable_laws, court_practice, fns_letters, minfin_letters, quality_level, use_in_rag",
      )
      .eq("use_in_rag", true)
      .limit(6);
    if (practiceArea) q = q.eq("practice_area", practiceArea);
    const { data } = await q;
    ekPractice = (data ?? []) as any[];
  } catch (_) {
    ekPractice = [];
  }
  for (const r of ekPractice) {
    sources.push({
      bucket: "ekaterina",
      source_table: "practice_document_legal_analysis",
      source_id: r.id as string,
      source_type: "ekaterina_practice",
      title:
        `Практика Екатерины — ${r.document_type ?? ""} ${r.practice_area ?? ""}`.trim() ||
        "Практика Екатерины",
      official_url: null,
      citation: null,
      snippet:
        ((r.legal_position as string) ?? "") +
        "\n" +
        ((r.legal_reasoning as string) ?? "").slice(0, 1200),
      verification_status: "needs_check",
      actuality_status: "requires_actuality_check",
      why_selected: `practice_area=${r.practice_area ?? "*"}, quality=${r.quality_level ?? "n/a"}`,
      used_for: "ekaterina_practice",
    });
  }

  // Ekaterina: practice_legal_analysis_sources (highest relevance first)
  let ekSrc: any[] = [];
  try {
    const { data } = await sb
      .from("practice_legal_analysis_sources")
      .select("id, source_type, source_title, source_url, relevance_score, why_used, used_for")
      .order("relevance_score", { ascending: false })
      .limit(8);
    ekSrc = (data ?? []) as any[];
  } catch (_) {
    ekSrc = [];
  }
  for (const r of ekSrc) {
    const url = (r.source_url as string | null) ?? null;
    sources.push({
      bucket: "ekaterina",
      source_table: "practice_legal_analysis_sources",
      source_id: r.id as string,
      source_type: (r.source_type as string) ?? "ekaterina_practice",
      title: (r.source_title as string) ?? "Источник практики",
      official_url: url,
      citation: null,
      snippet: (r.why_used as string) ?? "",
      verification_status: url ? "needs_check" : "missing_url",
      actuality_status: url ? "requires_actuality_check" : "requires_manual_verification",
      why_selected: `relevance=${r.relevance_score ?? "n/a"}`,
      used_for: (r.used_for as string) ?? "ekaterina_practice",
    });
  }

  const counts: Record<string, number> = {
    laws_found: laws.length,
    court_practice_found: courts.length,
    fns_found: fns.length,
    minfin_found: minfin.length,
    ekaterina_found: ekChunks.length + ekPractice.length + ekSrc.length,
    manuals_found: manuals.length,
  };

  return { sources, counts };
}

// ─────────────────── prompt ───────────────────

function bucketBlock(label: string, src: ResearchSource[]): string {
  if (src.length === 0) return `### ${label}\n(нет данных)`;
  return (
    `### ${label}\n` +
    src
      .map(
        (s, i) =>
          `[${label}-${i + 1}] source_id=${s.source_id}\nTITLE: ${s.title}\nURL: ${s.official_url ?? "—"}\n${s.snippet}`,
      )
      .join("\n---\n")
  );
}

function buildPrompt(input: {
  templateCode: string;
  practiceArea: string | null;
  jurisdiction: string;
  language: string;
  answers: Record<string, unknown>;
  documents: Array<{ id: string; title: string; text: string }>;
  sources: ResearchSource[];
}) {
  const docsBlock = input.documents.length
    ? input.documents
        .map(
          (d, i) =>
            `[ДОК-${i + 1}] doc_id=${d.id}\nTITLE: ${d.title}\n${d.text.slice(0, 8000)}`,
        )
        .join("\n\n---\n\n")
    : "(нет документов)";

  const byBucket = (b: ResearchBucket) => input.sources.filter((s) => s.bucket === b);
  const kbBlock = [
    bucketBlock("LAWS", byBucket("laws")),
    bucketBlock("COURT_PRACTICE", byBucket("court_practice")),
    bucketBlock("FNS", byBucket("fns_letters")),
    bucketBlock("MINFIN", byBucket("minfin_letters")),
    bucketBlock("EKATERINA", byBucket("ekaterina")),
    bucketBlock("MANUALS", byBucket("manuals")),
  ].join("\n\n");

  return `Ты — старший российский юрист и руководитель Legal Research Engine. Проведи правовой анализ дела.

ШАБЛОН: ${input.templateCode}
ОБЛАСТЬ ПРАВА: ${input.practiceArea ?? "—"}
ЮРИСДИКЦИЯ: ${input.jurisdiction}
ЯЗЫК: ${input.language}

ОТВЕТЫ ОПРОСНИКА (JSON):
${JSON.stringify(input.answers, null, 2)}

ДОКУМЕНТЫ КЛИЕНТА (OCR):
${docsBlock}

ИСТОЧНИКИ (КАСКАДНЫЙ ПОИСК):
${kbBlock}

ЖЕСТКИЕ ПРАВИЛА:
1. Запрещено выдумывать законы, письма, дела, URL. Используй ТОЛЬКО source_id из списка выше.
2. Для каждой ссылки в applicable_laws / court_practice / fns_letters / minfin_letters / ekaterina_practice / manuals укажи поле "source_id" из секции ИСТОЧНИКИ.
3. Если норма / практика рассматривалась, но НЕ применяется — помести её в rejected_laws / rejected_court_practice с reason.
4. Для каждой нормы выстрой цепочку ФАКТ → НОРМА → ВЫВОД (fact_to_law_mapping).
5. Раздели позицию клиента (taxpayer_position) и позицию оппонента / ФНС (tax_authority_position).
6. Если факта не хватает — добавь пункт в missing_evidence.
7. generation_instructions — инструкции для следующего этапа (генерации документа): на что сделать акцент, какие нормы цитировать, какие риски прописать.
8. recommendations — что юристу/клиенту делать дальше.

ВЕРНИ СТРОГО ОДИН JSON:
{
  "facts":[string],
  "legal_qualification":string,
  "main_legal_position":string,
  "tax_authority_position":string,
  "taxpayer_position":string,
  "applicable_laws":[{"source_id":string,"code":string,"article":string,"title":string,"quote":string,"why_selected":string,"used_for":string}],
  "rejected_laws":[{"law":string,"reason":string}],
  "fact_to_law_mapping":[{"fact":string,"law":string,"reasoning":string,"conclusion":string}],
  "alternative_positions":[string],
  "why_rejected":[string],
  "counter_arguments":[string],
  "weak_points":[string],
  "missing_evidence":[string],
  "risks":[{"risk":string,"severity":"low|medium|high","mitigation":string}],
  "court_practice":[{"source_id":string,"case":string,"court":string,"date":string,"conclusion":string,"why_selected":string,"used_for":string}],
  "rejected_court_practice":[{"case":string,"reason":string}],
  "fns_letters":[{"source_id":string,"number":string,"date":string,"topic":string,"used_for":string}],
  "minfin_letters":[{"source_id":string,"number":string,"date":string,"topic":string,"used_for":string}],
  "ekaterina_practice":[{"source_id":string,"title":string,"outcome":string,"used_for":string}],
  "manuals":[{"source_id":string,"title":string,"used_for":string}],
  "recommendations":[string],
  "generation_instructions":[string]
}
Никакого текста кроме JSON.`;
}

async function callGemini(prompt: string): Promise<{ text: string; model: string }> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
  if (!text) throw new Error("empty model output");
  return { text, model: GEMINI_MODEL };
}

// ─────────────────── post-processing ───────────────────

function mergeModelSourcesWithRegistry(
  parsed: AnalysisResult,
  registry: ResearchSource[],
): {
  parsed: AnalysisResult;
  combined_sources: Array<Record<string, unknown>>;
  source_actuality: Array<{ source: string; status: string; note?: string }>;
} {
  const byId = new Map<string, ResearchSource>();
  for (const s of registry) byId.set(s.source_id, s);

  // For each list, replace url/title from registry when source_id present.
  const enrichArr = (arr: Array<Record<string, unknown>>) =>
    (arr ?? []).map((item) => {
      const sid = item.source_id as string | undefined;
      const reg = sid ? byId.get(sid) : undefined;
      if (!reg) return item;
      return {
        ...item,
        title: (item.title as string) ?? reg.title,
        official_url: reg.official_url,
        url: reg.official_url ?? (item.url as string | undefined),
        source_table: reg.source_table,
        verification_status: reg.verification_status,
        actuality_status: reg.actuality_status,
      };
    });

  parsed.applicable_laws = enrichArr(parsed.applicable_laws);
  parsed.court_practice = enrichArr(parsed.court_practice);
  parsed.fns_letters = enrichArr(parsed.fns_letters);
  parsed.minfin_letters = enrichArr(parsed.minfin_letters);
  parsed.ekaterina_practice = enrichArr(parsed.ekaterina_practice);
  parsed.manuals = enrichArr(parsed.manuals);

  // Collect referenced ids
  const used = new Set<string>();
  const collect = (arr: Array<Record<string, unknown>>) =>
    arr.forEach((i) => {
      const sid = i.source_id as string | undefined;
      if (sid) used.add(sid);
    });
  collect(parsed.applicable_laws);
  collect(parsed.court_practice);
  collect(parsed.fns_letters);
  collect(parsed.minfin_letters);
  collect(parsed.ekaterina_practice);
  collect(parsed.manuals);

  const combined_sources: Array<Record<string, unknown>> = [];
  const actuality: Array<{ source: string; status: string; note?: string }> = [];
  for (const sid of used) {
    const r = byId.get(sid);
    if (!r) continue;
    combined_sources.push({
      source_id: r.source_id,
      source_table: r.source_table,
      source_type: r.source_type,
      bucket: r.bucket,
      title: r.title,
      official_url: r.official_url,
      url: r.official_url,
      citation: r.citation,
      verification_status: r.verification_status,
      actuality_status: r.actuality_status,
      why_selected: r.why_selected,
      used_for: r.used_for,
    });
    actuality.push({
      source: r.title,
      status: r.official_url ? "requires_actuality_check" : "needs_check",
      note: r.official_url
        ? "Источник найден, актуальность редакции требует автоматической или ручной проверки."
        : "Источник без публичного URL, требуется проверка юристом.",
    });
  }

  return { parsed, combined_sources, source_actuality: actuality };
}

function computeMetrics(
  combined: Array<Record<string, unknown>>,
  parsed: AnalysisResult,
): {
  hallucination_risk: "low" | "medium" | "high";
  legal_accuracy_score: number;
  source_verification_status: string;
  needs_lawyer_review: boolean;
} {
  const totalSources = combined.length;
  const withUrl = combined.filter((s) => !!s.official_url).length;
  const mapped = parsed.fact_to_law_mapping.length;
  const missing = parsed.missing_evidence.length;
  const weak = parsed.weak_points.length;

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

// ─────────────────── handler ───────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const sessionId: string | undefined = body?.session_id;
  if (!sessionId) return json({ error: "session_id required" }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: runRow, error: runInsertErr } = await sb
    .from("document_intake_ai_runs")
    .insert({
      session_id: sessionId,
      run_type: "legal_analysis",
      status: "running",
      model_name: GEMINI_MODEL,
    })
    .select("id")
    .single();
  if (runInsertErr) return json({ error: runInsertErr.message }, 500);
  const runId = runRow.id;

  try {
    // 1. session
    const { data: session, error: sessErr } = await sb
      .from("document_intake_sessions")
      .select("id, template_code, jurisdiction, language")
      .eq("id", sessionId)
      .single();
    if (sessErr) throw new Error(`session: ${sessErr.message}`);

    // 2. answers
    const { data: answerRows } = await sb
      .from("document_intake_answers")
      .select("field_name, field_value")
      .eq("session_id", sessionId);
    const answers: Record<string, unknown> = {};
    for (const row of answerRows ?? []) {
      answers[row.field_name as string] = row.field_value;
    }

    // 3. practice_area from template
    let practiceArea: string | null = null;
    if (session.template_code) {
      const { data: tpl } = await sb
        .from("document_templates")
        .select("practice_area")
        .eq("code", session.template_code)
        .maybeSingle();
      practiceArea = (tpl?.practice_area as string | null) ?? null;
    }

    // 4. documents + audit
    const { data: docs } = await sb
      .from("documents")
      .select("id, title, file_name, ocr_text")
      .filter("metadata->>intake_session_id", "eq", sessionId)
      .limit(40);
    const audited = (docs ?? []).map((d: any) =>
      classifyDocument({
        id: d.id as string,
        title: (d.title as string | null) ?? "",
        file_name: (d.file_name as string | null) ?? null,
        ocr_text: (d.ocr_text as string | null) ?? null,
      }),
    );
    const usedDocs = audited.filter((d) => d.used);
    const rejectedDocs = audited.filter((d) => !d.used);

    if (usedDocs.length === 0) {
      const failPayload = {
        error: "no_documents",
        message:
          "Для правового анализа необходимо прикрепить документы с извлеченным текстом.",
      };
      await sb
        .from("document_intake_ai_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          ai_result: {
            ...EMPTY,
            documents_audit: { used: [], rejected: audited },
          } as any,
          problems: ["Нет прикрепленных документов или извлеченного текста"] as any,
          source_verification_status: "no_sources",
          hallucination_risk: "high",
          legal_accuracy_score: 0,
          needs_lawyer_review: true,
          error_message: failPayload.message,
          input_snapshot: {
            documents_total: audited.length,
            documents_used: 0,
            documents_rejected: rejectedDocs.length,
            reason: "no_usable_document_text",
          } as any,
        })
        .eq("id", runId);
      return json(
        { success: false, run_id: runId, error: "no_documents", message: failPayload.message },
        200,
      );
    }

    // 5. fetch OCR for used docs
    const docTextById = new Map<string, string>();
    for (const d of docs ?? []) {
      docTextById.set(
        d.id as string,
        ((d.ocr_text as string | null) ?? "").trim(),
      );
    }
    const docsForPrompt = usedDocs.map((d) => ({
      id: d.id,
      title: d.title,
      text: docTextById.get(d.id) ?? "",
    }));

    // 6. cascade research
    const { sources, counts } = await runCascadeResearch(sb, practiceArea);

    // 7. Gemini
    const prompt = buildPrompt({
      templateCode: session.template_code as string,
      practiceArea,
      jurisdiction: (session.jurisdiction as string) ?? "ru",
      language: (session.language as string) ?? "ru",
      answers,
      documents: docsForPrompt,
      sources,
    });
    const { text, model } = await callGemini(prompt);

    let parsed: AnalysisResult;
    try {
      const raw = extractJson(text) as Partial<AnalysisResult>;
      parsed = { ...EMPTY, ...raw } as AnalysisResult;
    } catch (e) {
      throw new Error(`parse_failed: ${(e as Error).message}`);
    }

    // 8. merge with registry (URLs from DB, not the model)
    const merged = mergeModelSourcesWithRegistry(parsed, sources);
    parsed = merged.parsed;
    parsed.sources = merged.combined_sources;
    parsed.source_actuality = merged.source_actuality;
    parsed.documents_audit = { used: usedDocs, rejected: rejectedDocs };
    parsed.research_summary = {
      documents_total: audited.length,
      documents_used: usedDocs.length,
      documents_rejected: rejectedDocs.length,
      ...counts,
      sources_total: merged.combined_sources.length,
    };

    const metrics = computeMetrics(merged.combined_sources, parsed);

    const { error: updErr } = await sb
      .from("document_intake_ai_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        model_name: model,
        ai_result: parsed as any,
        used_sources: merged.combined_sources as any,
        source_verification_status: metrics.source_verification_status,
        hallucination_risk: metrics.hallucination_risk,
        legal_accuracy_score: metrics.legal_accuracy_score,
        needs_lawyer_review: metrics.needs_lawyer_review,
        required_fixes: parsed.missing_evidence as any,
        recommendations: (parsed.recommendations.length
          ? parsed.recommendations
          : parsed.generation_instructions) as any,
        problems: parsed.weak_points as any,
        input_snapshot: {
          template_code: session.template_code,
          practice_area: practiceArea,
          answers_count: Object.keys(answers).length,
          ...parsed.research_summary,
        } as any,
      })
      .eq("id", runId);
    if (updErr) throw new Error(`update_run: ${updErr.message}`);

    return json({ success: true, run_id: runId, analysis: parsed, metrics });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    await sb
      .from("document_intake_ai_runs")
      .update({
        status: "failed",
        error_message: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return json({ success: false, error: msg, run_id: runId }, 500);
  }
});
