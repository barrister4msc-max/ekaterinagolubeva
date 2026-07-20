// Layer 5: Prompt building for Gemini Pro.
// IMPORTANT: prompt and expected output are kept COMPACT to avoid response truncation.
// - Documents go in as short summaries (no full OCR).
// - Sources go in as short snippets (200–400 chars) with hard per-bucket limits.
// - The model returns ONLY source_id + used_for + why_selected per source — URLs,
//   citations, verification/actuality are filled later in mergeWithRegistry.

import type { ResearchQuery } from "./fact-extraction.ts";
import type { Bucket, RawSource } from "./repositories.ts";
import type { MergedSource } from "./dedupe.ts";

const LABELS: Record<Bucket, string> = {
  laws: "LAWS",
  court_practice: "COURT_PRACTICE",
  fns_letters: "FNS",
  minfin_letters: "MINFIN",
  ekaterina: "EKATERINA",
  manuals: "MANUALS",
};

// Hard per-bucket caps (requirement #3).
export const BUCKET_LIMITS: Record<Bucket, number> = {
  laws: 6,
  court_practice: 4,
  fns_letters: 3,
  minfin_letters: 2,
  ekaterina: 3,
  manuals: 2,
};

export type DocSummary = {
  id: string;
  title: string;
  doc_type: string;
  summary: string;
  key_facts: string[];
  ocr_length: number;
  status: "used" | "rejected";
};

export function limitSources(merged: MergedSource[]): MergedSource[] {
  const out: MergedSource[] = [];
  const grouped: Partial<Record<Bucket, MergedSource[]>> = {};
  for (const s of merged) {
    (grouped[s.bucket] ??= []).push(s);
  }
  for (const b of Object.keys(LABELS) as Bucket[]) {
    const arr = (grouped[b] ?? []).slice(0, BUCKET_LIMITS[b]);
    out.push(...arr);
  }
  return out;
}

function shortSnippet(s: string, max = 320): string {
  const clean = (s ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/[,;:.\s]+\S*$/, "") + "…";
}

function bucketBlock(label: string, src: MergedSource[]): string {
  if (src.length === 0) return `### ${label}\n(нет данных)`;
  return (
    `### ${label}\n` +
    src
      .map(
        (s) =>
          `- source_id=${s.source_id} | type=${s.source_type} | score=${s.scores.final.toFixed(2)}\n` +
          `  title: ${s.title}\n` +
          (s.citation ? `  citation: ${s.citation}\n` : "") +
          `  snippet: ${shortSnippet(s.snippet, 320)}`,
      )
      .join("\n")
  );
}

function docBlock(d: DocSummary): string {
  const facts = d.key_facts.length ? d.key_facts.map((f) => `    - ${shortSnippet(f, 200)}`).join("\n") : "    (нет)";
  return (
    `- doc_id=${d.id} | type=${d.doc_type} | status=${d.status} | ocr_length=${d.ocr_length}\n` +
    `  title: ${d.title}\n` +
    `  summary: ${shortSnippet(d.summary, 400)}\n` +
    `  key_facts:\n${facts}`
  );
}

export type PromptIntent = {
  target_document: string | null;
  process_stage: string | null;
  document_intent: string | null;
};

export function buildPrompt(input: {
  templateCode: string;
  jurisdiction: string;
  language: string;
  query: ResearchQuery;
  documents: DocSummary[];
  sources: MergedSource[];
  intent?: PromptIntent | null;
}): string {
  const docsBlock = input.documents.length
    ? input.documents.map(docBlock).join("\n")
    : "(нет документов)";

  const byBucket = (b: Bucket) => input.sources.filter((s) => s.bucket === b);
  const kbBlock = (Object.keys(LABELS) as Bucket[])
    .map((b) => bucketBlock(LABELS[b], byBucket(b)))
    .join("\n\n");

  const docIds = input.documents.filter((d) => d.status === "used").map((d) => d.id).join(", ");

  // Compact query (drop empty fields) to keep prompt small.
  const compactQuery: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.query ?? {})) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    compactQuery[k] = v;
  }

  return `Ты — старший российский юрист, руководитель Legal Research Engine. Сформируй КОМПАКТНЫЙ JSON-анализ.

ШАБЛОН: ${input.templateCode}
ЮРИСДИКЦИЯ: ${input.jurisdiction}
ЯЗЫК: ${input.language}

RESEARCH QUERY:
${JSON.stringify(compactQuery)}

ДОКУМЕНТЫ КЛИЕНТА (краткие сводки, без полного OCR):
${docsBlock}

ИСТОЧНИКИ (отранжированы, дедуплицированы, с лимитами):
${kbBlock}

ЖЕСТКИЕ ПРАВИЛА:
1. Используй ТОЛЬКО source_id из секции ИСТОЧНИКИ. Запрещено выдумывать законы, письма, дела, URL.
2. Для каждого использованного источника верни ТОЛЬКО {source_id, used_for, why_selected}. Не возвращай title, URL, цитаты, даты — это подставит код из реестра.
3. Запрещены длинные цитаты, выдержки и пересказы. why_selected — максимум 200 символов.
4. fact_to_law_mapping: ФАКТ → НОРМА (краткое наименование) → ВЫВОД. Каждое поле ≤ 220 символов.
5. document_usage: для КАЖДОГО doc_id из [${docIds}] верни массив used_for из закрытого набора
   ["facts","legal_qualification","taxpayer_position","court_practice","risks","recommendations","generation"].
6. Никаких комментариев, markdown, trailing commas. Только один валидный JSON.

ФОРМАТ ОТВЕТА — ТОЛЬКО ЭТИ ПОЛЯ, БЕЗ ЛИШНИХ:
{
  "facts":[string],
  "legal_qualification":string,
  "main_legal_position":string,
  "taxpayer_position":string,
  "tax_authority_position":string,
  "applicable_laws":[{"source_id":string,"used_for":string,"why_selected":string}],
  "court_practice":[{"source_id":string,"used_for":string,"why_selected":string}],
  "fns_letters":[{"source_id":string,"used_for":string,"why_selected":string}],
  "minfin_letters":[{"source_id":string,"used_for":string,"why_selected":string}],
  "ekaterina_practice":[{"source_id":string,"used_for":string,"why_selected":string}],
  "manuals":[{"source_id":string,"used_for":string,"why_selected":string}],
  "fact_to_law_mapping":[{"fact":string,"law":string,"reasoning":string,"conclusion":string}],
  "counter_arguments":[string],
  "weak_points":[string],
  "missing_evidence":[string],
  "risks":[{"risk":string,"severity":"low|medium|high","mitigation":string}],
  "recommendations":[string],
  "generation_instructions":[string],
  "adverse_practice":[{"source_id":string,"why_against":string}],
  "rebuttal_strategy":[string],
  "source_sufficiency":{"status":"sufficient|partial|insufficient_critical","gaps":[string],"rationale":string},
  "document_usage":[{"doc_id":string,"used_for":[string]}]
}`;
}

import {
  callGeminiWithFallback,
  FULL_GEMINI_MODELS,
  type GeminiCallResult,
} from "./gemini-fallback.ts";

// Backwards-compatible wrapper: now uses cross-model fallback under the hood.
// Order: gemini-2.5-pro → 2.5-flash → 2.0-flash → 1.5-pro → 1.5-flash.
export async function callGeminiPro(prompt: string): Promise<GeminiCallResult> {
  return await callGeminiWithFallback(prompt, {
    models: FULL_GEMINI_MODELS,
    temperature: 0.2,
    maxOutputTokens: 16384,
    responseMimeType: "application/json",
  });
}

// Build a compact document summary from OCR + research query key facts.
// Keeps the prompt small (no full OCR forwarded to the model).
export function summarizeDocument(input: {
  id: string;
  title: string;
  fileName: string | null;
  ocrText: string;
  status: "used" | "rejected";
  queryFacts: string[];
}): DocSummary {
  const ocr = (input.ocrText ?? "").replace(/\s+/g, " ").trim();
  const ocrLen = ocr.length;
  const name = (input.fileName || input.title || "").toLowerCase();

  let docType = "document";
  if (/требован/i.test(ocr) || /требован/i.test(name)) docType = "ifns_requirement";
  else if (/решени[ея].{0,40}(привлечен|проверк)/i.test(ocr)) docType = "ifns_decision";
  else if (/акт.{0,40}проверк/i.test(ocr)) docType = "ifns_act";
  else if (/договор/i.test(ocr) || /договор/i.test(name)) docType = "contract";
  else if (/претензи/i.test(ocr) || /претензи/i.test(name)) docType = "claim";
  else if (/исков[оа][егй]/i.test(ocr) || /иск/i.test(name)) docType = "lawsuit";
  else if (/постановлен/i.test(ocr)) docType = "ruling";
  else if (/протокол/i.test(ocr)) docType = "protocol";

  // Short summary = first 500 chars of OCR (already whitespace-normalized).
  const summary = ocr.slice(0, 500);

  // Key facts: pick up to 5 sentences containing money / dates / article references.
  const keyFacts: string[] = [];
  if (ocr) {
    const sentences = ocr.split(/(?<=[.!?])\s+/).slice(0, 200);
    const interesting = sentences.filter((s) =>
      /(\d{1,3}(?:[\s\u00a0]\d{3})+|\d+\s*руб|ст\.?\s*\d+|№\s*\S+|\d{2}\.\d{2}\.\d{4})/i.test(s),
    );
    for (const s of interesting.slice(0, 5)) keyFacts.push(s.trim());
  }
  if (keyFacts.length < 3) {
    for (const f of input.queryFacts.slice(0, 3 - keyFacts.length)) keyFacts.push(f);
  }

  return {
    id: input.id,
    title: input.title || input.fileName || "Документ",
    doc_type: docType,
    summary,
    key_facts: keyFacts,
    ocr_length: ocrLen,
    status: input.status,
  };
}

// Unused exports kept for type compatibility with index.ts:
export type _RepoSource = RawSource;
