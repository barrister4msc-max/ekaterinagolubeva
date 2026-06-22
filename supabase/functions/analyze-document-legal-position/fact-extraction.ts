// Layer 1: Fact Extraction — OCR + answers → ResearchQuery (+ optional query embedding)

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const FLASH_MODEL = "gemini-2.5-flash";
const LOVABLE_FLASH_MODEL = "google/gemini-2.5-flash";

export type ResearchQuery = {
  practice_area: string | null;
  subcategory: string | null;
  document_type: string | null;
  facts: string[];
  parties: string[];
  amounts: string[];
  dates: string[];
  legal_issues: string[];
  research_topics: string[];
  keywords: string[];
  articles: string[];
  organizations: string[];
  inn: string[];
  ogrn: string[];
};

export const EMPTY_QUERY: ResearchQuery = {
  practice_area: null,
  subcategory: null,
  document_type: null,
  facts: [],
  parties: [],
  amounts: [],
  dates: [],
  legal_issues: [],
  research_topics: [],
  keywords: [],
  articles: [],
  organizations: [],
  inn: [],
  ogrn: [],
};

// ---------- Robust JSON parsing ----------
function safeParseJson(text: string): unknown {
  if (!text) throw new Error("empty response");
  try { return JSON.parse(text); } catch { /* fallthrough */ }
  let cleaned = text
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/m, "")
    .trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const objStart = cleaned.indexOf("{");
  const arrStart = cleaned.indexOf("[");
  const isArr = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
  const start = isArr ? arrStart : objStart;
  const end = isArr ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON structure");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ---------- Deterministic regex extraction (always runs) ----------
const INN_RE = /\b(\d{10}|\d{12})\b/g;
const OGRN_RE = /\b(\d{13}|\d{15})\b/g;
const DATE_RE =
  /\b(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\s*(?:г\.?)?)\b/gi;
const AMOUNT_RE =
  /\b\d[\d\s.,]{2,}\s*(?:руб(?:лей|\.?)?|₽|тыс\.?\s*руб|млн\.?\s*руб)\b/gi;
const ARTICLE_RE =
  /\b(?:ст\.?|статья|статьи|статьей)\s*\d+(?:\.\d+)*\s*(?:НК|ГК|УК|АПК|ГПК|КоАП|ТК|ЖК|СК|БК|НК\sРФ|ГК\sРФ|УК\sРФ)\s*(?:РФ)?/gi;
const ORG_RE =
  /\b(?:ООО|АО|ПАО|ЗАО|ИП|ОАО|НКО|ФГУП|МУП|ФГБУ)\s+["«][^"»]{1,120}["»]/gi;

function uniq(xs: string[]): string[] {
  const s = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const v = x.trim().replace(/\s+/g, " ");
    if (!v) continue;
    const key = v.toLowerCase();
    if (s.has(key)) continue;
    s.add(key);
    out.push(v);
  }
  return out;
}

function regexExtract(text: string) {
  const m = (re: RegExp) => Array.from(text.matchAll(re), (m) => m[0]);
  return {
    inn: uniq(m(INN_RE)).filter((v) => v.length === 10 || v.length === 12),
    ogrn: uniq(m(OGRN_RE)).filter((v) => v.length === 13 || v.length === 15),
    dates: uniq(m(DATE_RE)),
    amounts: uniq(m(AMOUNT_RE)),
    articles: uniq(m(ARTICLE_RE)),
    organizations: uniq(m(ORG_RE)),
  };
}

function harvestFromAnswers(answers: Record<string, unknown>): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "string") { if (v.trim()) parts.push(v); return; }
    if (typeof v === "number" || typeof v === "boolean") { parts.push(String(v)); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") Object.values(v as any).forEach(walk);
  };
  walk(answers);
  return parts.join("\n");
}

function mergeQueryWithRegex(q: ResearchQuery, joinedText: string): ResearchQuery {
  const r = regexExtract(joinedText);
  return {
    ...q,
    inn: uniq([...(q.inn ?? []), ...r.inn]),
    ogrn: uniq([...(q.ogrn ?? []), ...r.ogrn]),
    dates: uniq([...(q.dates ?? []), ...r.dates]),
    amounts: uniq([...(q.amounts ?? []), ...r.amounts]),
    articles: uniq([...(q.articles ?? []), ...r.articles]),
    organizations: uniq([...(q.organizations ?? []), ...r.organizations]),
  };
}

// ---------- LLM call ----------
async function callFlashViaLovable(prompt: string): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: LOVABLE_FLASH_MODEL,
        messages: [
          { role: "system", content: "Ты — юрист-аналитик. Возвращай только строго валидный JSON, без markdown и комментариев." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("[fact-extraction] lovable gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error("[fact-extraction] lovable gateway exception", e);
    return null;
  }
}

import { callGeminiWithFallback, FLASH_GEMINI_MODELS } from "./gemini-fallback.ts";

async function callFlashViaGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const { text } = await callGeminiWithFallback(prompt, {
      models: FLASH_GEMINI_MODELS,
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    });
    return text || null;
  } catch (e) {
    console.error("[fact-extraction] gemini fallback exhausted:", (e as Error).message);
    return null;
  }
}

export async function extractFacts(input: {
  templateCode: string;
  practiceArea: string | null;
  answers: Record<string, unknown>;
  documents: Array<{ title: string; text: string }>;
}): Promise<ResearchQuery> {
  const docsBlock = input.documents
    .map((d, i) => `[ДОК-${i + 1}] ${d.title}\n${(d.text ?? "").slice(0, 6000)}`)
    .join("\n---\n");
  const answersStr = JSON.stringify(input.answers ?? {}, null, 2);
  const joinedRaw =
    harvestFromAnswers(input.answers ?? {}) +
    "\n" +
    input.documents.map((d) => d.text ?? "").join("\n");

  const prompt = `Извлеки из документов и ответов опросника структурированный Research Query для последующего юридического поиска.

ШАБЛОН: ${input.templateCode}
ОБЛАСТЬ ПРАВА (подсказка): ${input.practiceArea ?? "—"}

ОТВЕТЫ КЛИЕНТА (JSON):
${answersStr}

ДОКУМЕНТЫ КЛИЕНТА (OCR):
${docsBlock || "(нет документов)"}

ВЕРНИ СТРОГО ОДИН JSON следующей структуры (все поля обязательны; если данных нет — [] или null):
{
  "practice_area": string|null,
  "subcategory": string|null,
  "document_type": string|null,
  "parties": [string],
  "dates": [string],
  "amounts": [string],
  "facts": [string],
  "legal_issues": [string],
  "keywords": [string],
  "research_topics": [string],
  "articles": [string],
  "organizations": [string],
  "inn": [string],
  "ogrn": [string]
}

ПРАВИЛА ФОРМАТИРОВАНИЯ:
- Только валидный JSON. Без markdown, без комментариев, без trailing commas.
- Все строковые значения корректно экранированы.

ПРАВИЛА СОДЕРЖИМОГО:
- practice_area: определи по содержанию (налоговое, корпоративное, договорное, банкротство, аренда, и т.п.). Не оставляй null, если в документах есть явные признаки.
- subcategory: конкретизация (НДС, налог на прибыль, споры с арендатором, уменьшение УК ООО и т.п.).
- document_type: тип ключевого документа клиента (требование ФНС, акт проверки, договор аренды, решение суда, претензия и т.п.).
- parties: ВСЕ участники из шапок документов и ответов (наименования юр.лиц и ФИО).
- dates: ВСЕ значимые даты (договор, требование, решение, сроки).
- amounts: ВСЕ денежные суммы в рублях.
- facts: 5–15 кратких фактических утверждений из документов (что произошло).
- legal_issues: короткие формулировки спорных правовых вопросов.
- keywords: расширенный набор терминов и синонимов для keyword-поиска (15–30).
- research_topics: темы для поиска норм и практики ("ст. 54.1 НК", "реальность операции", "деловая цель").
- articles: явно упомянутые статьи (НК, ГК, УК, АПК, ГПК, КоАП и т.п.) в формате "ст. 54.1 НК РФ".
- organizations: наименования юр.лиц с организационно-правовой формой.
- inn: только ИНН (10 или 12 цифр).
- ogrn: только ОГРН/ОГРНИП (13 или 15 цифр).
- Никаких выдумок. Если поле не выводится из материалов — пустой массив или null.`;

  let raw = await callFlashViaLovable(prompt);
  if (!raw) raw = await callFlashViaGemini(prompt);

  let llmQuery: Partial<ResearchQuery> = {};
  if (raw) {
    try {
      llmQuery = (safeParseJson(raw) as Partial<ResearchQuery>) ?? {};
    } catch (e) {
      console.error("[fact-extraction] JSON parse failed", (e as Error).message, raw.slice(0, 500));
    }
  } else {
    console.error("[fact-extraction] no LLM response (LOVABLE_API_KEY/GEMINI_API_KEY missing or error)");
  }

  // Normalize arrays/strings from LLM
  const norm = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const normStr = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s : null;
  };

  const fromLlm: ResearchQuery = {
    practice_area: normStr(llmQuery.practice_area) ?? input.practiceArea ?? null,
    subcategory: normStr(llmQuery.subcategory),
    document_type: normStr(llmQuery.document_type),
    parties: norm(llmQuery.parties),
    dates: norm(llmQuery.dates),
    amounts: norm(llmQuery.amounts),
    facts: norm(llmQuery.facts),
    legal_issues: norm(llmQuery.legal_issues),
    keywords: norm(llmQuery.keywords),
    research_topics: norm(llmQuery.research_topics),
    articles: norm((llmQuery as any).articles),
    organizations: norm((llmQuery as any).organizations),
    inn: norm((llmQuery as any).inn ?? (llmQuery as any).INN),
    ogrn: norm((llmQuery as any).ogrn ?? (llmQuery as any).OGRN),
  };

  // Always merge deterministic regex extraction so the query is never empty
  return mergeQueryWithRegex(fromLlm, joinedRaw);
}

export function queryToSearchString(q: ResearchQuery): string {
  return [
    q.practice_area ?? "",
    q.subcategory ?? "",
    q.document_type ?? "",
    ...q.legal_issues,
    ...q.research_topics,
    ...q.keywords,
    ...q.articles,
    ...q.facts.slice(0, 5),
  ]
    .filter(Boolean)
    .join(". ");
}

export async function embedQuery(text: string): Promise<number[] | null> {
  if (!LOVABLE_API_KEY || !text.trim()) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-embedding-001",
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const emb = data?.data?.[0]?.embedding;
    return Array.isArray(emb) ? emb : null;
  } catch {
    return null;
  }
}
