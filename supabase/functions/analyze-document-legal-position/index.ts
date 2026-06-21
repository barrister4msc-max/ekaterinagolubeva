// supabase/functions/analyze-document-legal-position/index.ts
// AI Legal Analysis stage for the document builder pipeline.
// Loads intake session, answers, attached documents (extracted_text/ocr_text)
// and relevant legal_knowledge_chunks; asks Gemini for a structured legal
// position analysis; persists the result into public.document_intake_ai_runs
// with run_type = 'legal_analysis'.

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

type AnalysisResult = {
  facts: string[];
  legal_qualification: string;
  main_legal_position: string;
  tax_authority_position: string;
  taxpayer_position: string;
  applicable_laws: Array<{ code?: string; article?: string; title?: string; quote?: string }>;
  fact_to_law_mapping: Array<{ fact: string; law: string; reasoning: string; conclusion: string }>;
  alternative_positions: string[];
  rejected_laws: Array<{ law: string; reason: string }>;
  why_rejected: string[];
  counter_arguments: string[];
  weak_points: string[];
  missing_evidence: string[];
  risks: Array<{ risk: string; severity?: string; mitigation?: string }>;
  court_practice: Array<{ case?: string; court?: string; date?: string; conclusion?: string; url?: string }>;
  fns_letters: Array<{ number?: string; date?: string; topic?: string; url?: string }>;
  minfin_letters: Array<{ number?: string; date?: string; topic?: string; url?: string }>;
  ekaterina_practice: Array<{ case?: string; year?: string; outcome?: string }>;
  sources: Array<{ id?: string; title: string; url?: string; type?: string; cited_for?: string }>;
  source_actuality: Array<{ source: string; status: "actual" | "outdated" | "unknown" | "needs_check" | "requires_actuality_check"; note?: string }>;
  generation_instructions: string[];
};

const EMPTY_RESULT: AnalysisResult = {
  facts: [],
  legal_qualification: "",
  main_legal_position: "",
  tax_authority_position: "",
  taxpayer_position: "",
  applicable_laws: [],
  fact_to_law_mapping: [],
  alternative_positions: [],
  rejected_laws: [],
  why_rejected: [],
  counter_arguments: [],
  weak_points: [],
  missing_evidence: [],
  risks: [],
  court_practice: [],
  fns_letters: [],
  minfin_letters: [],
  ekaterina_practice: [],
  sources: [],
  source_actuality: [],
  generation_instructions: [],
};

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

function buildPrompt(input: {
  templateCode: string;
  practiceArea: string | null;
  jurisdiction: string;
  language: string;
  answers: Record<string, unknown>;
  documents: Array<{ title: string; text: string }>;
  chunks: Array<{ title: string | null; content: string; metadata: any }>;
  specialInstructions: string;
}) {
  const docsBlock = input.documents.length
    ? input.documents
        .map((d, i) => `[Документ ${i + 1}] ${d.title}\n${d.text.slice(0, 8000)}`)
        .join("\n\n---\n\n")
    : "(документы не приложены)";

  const kbBlock = input.chunks.length
    ? input.chunks
        .map(
          (c, i) =>
            `[KB ${i + 1}] ${c.title ?? ""}\n${(c.content ?? "").slice(0, 2500)}`,
        )
        .join("\n\n")
    : "(нет релевантных фрагментов KB)";

  return `Ты — старший российский юрист. Проведи ПРАВОВОЙ АНАЛИЗ дела для подготовки документа.

ШАБЛОН: ${input.templateCode}
ОБЛАСТЬ ПРАВА: ${input.practiceArea ?? "—"}
ЮРИСДИКЦИЯ: ${input.jurisdiction}
ЯЗЫК ДОКУМЕНТА: ${input.language}

ОТВЕТЫ ОПРОСНИКА (JSON):
${JSON.stringify(input.answers, null, 2)}

ОСОБЫЕ УКАЗАНИЯ КЛИЕНТА:
${input.specialInstructions || "—"}

ПРИЛОЖЕННЫЕ ДОКУМЕНТЫ (извлечённый текст):
${docsBlock}

РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ БАЗЫ ЗНАНИЙ:
${kbBlock}

ТРЕБОВАНИЯ:
1. Для КАЖДОЙ применимой нормы строй связку ФАКТ → НОРМА → ВЫВОД (поле fact_to_law_mapping).
2. Запрещено выдумывать статьи, номера писем ФНС/Минфина, судебные дела. Если источник не известен — не упоминай его, а добавь пункт в missing_evidence.
3. Указывай позицию налогового органа / оппонента и позицию клиента раздельно.
4. Для каждого источника отметь актуальность (actual/outdated/unknown).
5. Если фактов недостаточно — пиши явно в missing_evidence: "Для применения нормы X недостаточно фактических данных…".
6. generation_instructions — это инструкции для следующего этапа (генерации документа): на что сделать акцент, какие нормы цитировать, какие риски прописать.

ВЕРНИ СТРОГО ОДИН JSON-ОБЪЕКТ со следующими полями (массивы могут быть пустыми, строки — пустыми):
{
  "facts": [string],
  "legal_qualification": string,
  "main_legal_position": string,
  "tax_authority_position": string,
  "taxpayer_position": string,
  "applicable_laws": [{ "code": string, "article": string, "title": string, "quote": string }],
  "fact_to_law_mapping": [{ "fact": string, "law": string, "reasoning": string, "conclusion": string }],
  "alternative_positions": [string],
  "rejected_laws": [{ "law": string, "reason": string }],
  "why_rejected": [string],
  "counter_arguments": [string],
  "weak_points": [string],
  "missing_evidence": [string],
  "risks": [{ "risk": string, "severity": "low|medium|high", "mitigation": string }],
  "court_practice": [{ "case": string, "court": string, "date": string, "conclusion": string, "url": string }],
  "fns_letters": [{ "number": string, "date": string, "topic": string, "url": string }],
  "minfin_letters": [{ "number": string, "date": string, "topic": string, "url": string }],
  "ekaterina_practice": [{ "case": string, "year": string, "outcome": string }],
  "sources": [{ "title": string, "url": string, "type": string, "cited_for": string }],
  "source_actuality": [{ "source": string, "status": "actual|outdated|unknown", "note": string }],
  "generation_instructions": [string]
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

function computeMetrics(
  result: AnalysisResult,
  opts: { externalVerificationPerformed: boolean },
): {
  hallucination_risk: "low" | "medium" | "high";
  legal_accuracy_score: number;
  source_verification_status: string;
  needs_lawyer_review: boolean;
} {
  const totalSources = result.sources.length;
  const actualityKnown = result.source_actuality.length;
  const outdated = result.source_actuality.filter((s) => s.status === "outdated").length;
  const unknown = result.source_actuality.filter((s) => s.status === "unknown").length;
  const missing = result.missing_evidence.length;
  const mapped = result.fact_to_law_mapping.length;

  const sourcesWithoutUrl = result.sources.filter(
    (s) => !((s as any).url || (s as any).official_url),
  ).length;

  let score = 0.5;
  if (mapped >= 3) score += 0.15;
  if (totalSources >= 3) score += 0.1;
  if (actualityKnown >= totalSources && totalSources > 0) score += 0.1;
  if (missing === 0) score += 0.1;
  if (outdated > 0) score -= 0.1;
  if (sourcesWithoutUrl > 0) score -= 0.1;
  score = Math.max(0, Math.min(1, score));

  let risk: "low" | "medium" | "high" = "medium";
  if (totalSources === 0 || unknown > totalSources / 2) risk = "high";
  else if (outdated === 0 && unknown === 0 && missing === 0 && sourcesWithoutUrl === 0) risk = "low";

  let status: string;
  if (totalSources === 0) status = "no_sources";
  else if (sourcesWithoutUrl > 0) status = "missing_url";
  else if (!opts.externalVerificationPerformed) status = "needs_check";
  else if (outdated > 0) status = "needs_recheck";
  else if (unknown > 0) status = "partial";
  else status = "verified";

  return {
    hallucination_risk: risk,
    legal_accuracy_score: Number(score.toFixed(2)),
    source_verification_status: status,
    needs_lawyer_review:
      risk !== "low" || missing > 0 || result.weak_points.length > 0 || sourcesWithoutUrl > 0,
  };
}

function normalizeSources(
  sources: AnalysisResult["sources"],
  opts: { externalVerificationPerformed: boolean },
): Array<Record<string, unknown>> {
  return (sources ?? []).map((s) => {
    const url = ((s as any).url || (s as any).official_url || "").toString().trim();
    const hasUrl = url.length > 0;
    let verification_status: string;
    let actuality_status: string;
    if (!hasUrl) {
      verification_status = "missing_url";
      actuality_status = "requires_manual_verification";
    } else if (!opts.externalVerificationPerformed) {
      verification_status = "needs_check";
      actuality_status = "requires_actuality_check";
    } else {
      verification_status = "verified";
      actuality_status = "actual";
    }
    return { ...s, verification_status, actuality_status };
  });
}

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

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Insert "running" run first so UI can poll
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
    // 1. Load session
    const { data: session, error: sessErr } = await sb
      .from("document_intake_sessions")
      .select("id, template_code, jurisdiction, language, matter_id, client_id, lead_id, document_id")
      .eq("id", sessionId)
      .single();
    if (sessErr) throw new Error(`session: ${sessErr.message}`);

    // 2. Load answers
    const { data: answerRows } = await sb
      .from("document_intake_answers")
      .select("field_name, field_value")
      .eq("session_id", sessionId);
    const answers: Record<string, unknown> = {};
    for (const row of answerRows ?? []) {
      answers[row.field_name as string] = row.field_value;
    }

    // 3. Load template (practice_area)
    let practiceArea: string | null = null;
    if (session.template_code) {
      const { data: tpl } = await sb
        .from("document_templates")
        .select("practice_area")
        .eq("code", session.template_code)
        .maybeSingle();
      practiceArea = (tpl?.practice_area as string | null) ?? null;
    }

    // 4. Load documents attached to this session (via metadata.intake_session_id)
    const { data: docs } = await sb
      .from("documents")
      .select("id, title, file_name, ocr_text, metadata")
      .filter("metadata->>intake_session_id", "eq", sessionId)
      .limit(20);
    const documents = (docs ?? [])
      .map((d: any) => ({
        title: (d.title || d.file_name || "Документ") as string,
        text: ((d.ocr_text as string | null) ?? "").trim(),
      }))
      .filter((d) => d.text.length > 0);

    // 5. Load relevant KB chunks (filter by category=practice_area if any)
    let chunksQuery = sb
      .from("legal_knowledge_chunks")
      .select("title, content, metadata, category")
      .eq("is_active", true)
      .limit(15);
    if (practiceArea) chunksQuery = chunksQuery.eq("category", practiceArea);
    const { data: chunks } = await chunksQuery;
    let kbChunks = (chunks ?? []) as any[];
    if (kbChunks.length === 0) {
      const { data: fallback } = await sb
        .from("legal_knowledge_chunks")
        .select("title, content, metadata")
        .eq("is_active", true)
        .limit(8);
      kbChunks = (fallback ?? []) as any[];
    }

    // 6. Prompt + Gemini
    const prompt = buildPrompt({
      templateCode: session.template_code as string,
      practiceArea,
      jurisdiction: (session.jurisdiction as string) ?? "ru",
      language: (session.language as string) ?? "ru",
      answers,
      documents,
      chunks: kbChunks,
      specialInstructions: "",
    });

    const { text, model } = await callGemini(prompt);

    let parsed: AnalysisResult;
    try {
      const raw = extractJson(text) as Partial<AnalysisResult>;
      parsed = { ...EMPTY_RESULT, ...raw } as AnalysisResult;
    } catch (e) {
      throw new Error(`parse_failed: ${(e as Error).message}`);
    }

    // No external source verification is performed in this function yet.
    const externalVerificationPerformed = false;
    const normalizedSources = normalizeSources(parsed.sources, { externalVerificationPerformed });
    parsed.sources = normalizedSources as any;

    const metrics = computeMetrics(parsed, { externalVerificationPerformed });

    const { error: updErr } = await sb
      .from("document_intake_ai_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        model_name: model,
        ai_result: parsed as any,
        used_sources: normalizedSources as any,
        source_verification_status: metrics.source_verification_status,
        hallucination_risk: metrics.hallucination_risk,
        legal_accuracy_score: metrics.legal_accuracy_score,
        needs_lawyer_review: metrics.needs_lawyer_review,
        required_fixes: parsed.missing_evidence as any,
        recommendations: parsed.generation_instructions as any,
        problems: parsed.weak_points as any,
        input_snapshot: {
          documents: documents.length,
          chunks: kbChunks.length,
          answers_count: Object.keys(answers).length,
          template_code: session.template_code,
          practice_area: practiceArea,
          external_verification_performed: externalVerificationPerformed,
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
