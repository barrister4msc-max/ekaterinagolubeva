// Layer 1: Fact Extraction — OCR + answers → ResearchQuery (+ optional query embedding)

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const FLASH_MODEL = "gemini-2.5-flash";

export type TemporalAnchorRole =
  | "contract_date"
  | "transaction_date"
  | "tax_period"
  | "inspection_period"
  | "requirement_date"
  | "authority_decision_date"
  | "court_event_date"
  | "other_relevant_legal_date";

export type TemporalAnchor = {
  role: TemporalAnchorRole;
  label: string;
  date: string | null;
  date_from: string | null;
  date_to: string | null;
  basis: string;
};

export type ResearchQuery = {
  practice_area: string | null;
  subcategory: string | null;
  document_type: string | null;
  facts: string[];
  parties: string[];
  amounts: string[];
  dates: string[];
  temporal_anchors: TemporalAnchor[];
  legal_issues: string[];
  research_topics: string[];
  keywords: string[];
  articles: string[];
  organizations: string[];
  inn: string[];
  ogrn: string[];
  // Semantic Legal Research Contract. These fields are SEARCH-ONLY and must
  // never be promoted to established facts without independent evidence.
  semantic_intents: string[];
  legal_concepts: string[];
  metadata_terms: string[];
  search_hypotheses: string[];
};

export const EMPTY_QUERY: ResearchQuery = {
  practice_area: null,
  subcategory: null,
  document_type: null,
  facts: [],
  parties: [],
  amounts: [],
  dates: [],
  temporal_anchors: [],
  legal_issues: [],
  research_topics: [],
  keywords: [],
  articles: [],
  organizations: [],
  inn: [],
  ogrn: [],
  semantic_intents: [],
  legal_concepts: [],
  metadata_terms: [],
  search_hypotheses: [],
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
  "temporal_anchors": [{"role": string, "label": string, "date": string|null, "date_from": string|null, "date_to": string|null, "basis": string}],
  "amounts": [string],
  "facts": [string],
  "legal_issues": [string],
  "keywords": [string],
  "research_topics": [string],
  "articles": [string],
  "organizations": [string],
  "inn": [string],
  "ogrn": [string],
  "semantic_intents": [string],
  "legal_concepts": [string],
  "metadata_terms": [string],
  "search_hypotheses": [string]
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
- temporal_anchors: только явно установленные из документов/ответов даты или периоды, которые могут определять применимую редакцию права. role только из: contract_date, transaction_date, tax_period, inspection_period, requirement_date, authority_decision_date, court_event_date, other_relevant_legal_date. Не угадывай роль и не создавай anchor, если связь даты с событием не установлена. Для периода используй date_from/date_to; для точечной даты — date. basis — кратко, из какого установленного обстоятельства следует роль даты.
- amounts: ВСЕ денежные суммы в рублях.
- facts: 5–15 кратких фактических утверждений ТОЛЬКО из документов/ответов. Не добавляй сюда предположения для поиска.
- legal_issues: короткие формулировки спорных правовых вопросов.
- keywords: расширенный набор терминов и синонимов для keyword-поиска (15–30).
- research_topics: темы для поиска норм и практики ("ст. 54.1 НК", "реальность операции", "деловая цель").
- articles: явно упомянутые статьи (НК, ГК, УК, АПК, ГПК, КоАП и т.п.) в формате "ст. 54.1 НК РФ".
- organizations: наименования юр.лиц с организационно-правовой формой.
- inn: только ИНН (10 или 12 цифр).
- ogrn: только ОГРН/ОГРНИП (13 или 15 цифр).
- semantic_intents: поисковые формулировки по СМЫСЛУ ситуации, включая релевантные правовые доктрины/виды споров даже если они не названы дословно.
- legal_concepts: юридические понятия и институты, которые следует проверить по официальным источникам и локальной KB.
- metadata_terms: реквизиты и признаки для metadata-поиска: виды актов, органы, налоги, периоды, суды, категории споров, номера и даты, если они следуют из материалов.
- search_hypotheses: допустимые гипотезы ТОЛЬКО ДЛЯ ПОИСКА (например, "проверить практику о техническом контрагенте"). Они НЕ являются фактами дела и не могут подтверждать вывод без найденного источника.
- Можно расширять поиск по контексту и смыслу, но нельзя переносить поисковую гипотезу в facts.
- Никаких выдумок в facts/requisites. Если установленного факта нет — не добавляй его как факт.`;

  const raw = await callFlashViaGemini(prompt);

  let llmQuery: Partial<ResearchQuery> = {};
  if (raw) {
    try {
      llmQuery = (safeParseJson(raw) as Partial<ResearchQuery>) ?? {};
    } catch (e) {
      console.error("[fact-extraction] JSON parse failed", (e as Error).message, raw.slice(0, 500));
    }
  } else {
    console.error("[fact-extraction] no LLM response (GEMINI_API_KEY missing or error)");
  }

  const norm = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const normStr = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s : null;
  };
  const temporalRoles = new Set<TemporalAnchorRole>([
    "contract_date",
    "transaction_date",
    "tax_period",
    "inspection_period",
    "requirement_date",
    "authority_decision_date",
    "court_event_date",
    "other_relevant_legal_date",
  ]);
  const normTemporalAnchors = (value: unknown): TemporalAnchor[] => {
    if (!Array.isArray(value)) return [];
    const out: TemporalAnchor[] = [];
    for (const raw of value) {
      if (!raw || typeof raw !== "object") continue;
      const record = raw as Record<string, unknown>;
      const role = normStr(record.role) as TemporalAnchorRole | null;
      const label = normStr(record.label);
      const date = normStr(record.date);
      const dateFrom = normStr(record.date_from);
      const dateTo = normStr(record.date_to);
      const basis = normStr(record.basis);
      if (!role || !temporalRoles.has(role) || !label || !basis) continue;
      if (!date && !dateFrom && !dateTo) continue;
      out.push({ role, label, date, date_from: dateFrom, date_to: dateTo, basis });
    }
    return out.slice(0, 16);
  };

  const fromLlm: ResearchQuery = {
    practice_area: normStr(llmQuery.practice_area) ?? input.practiceArea ?? null,
    subcategory: normStr(llmQuery.subcategory),
    document_type: normStr(llmQuery.document_type),
    parties: norm(llmQuery.parties),
    dates: norm(llmQuery.dates),
    temporal_anchors: normTemporalAnchors(llmQuery.temporal_anchors),
    amounts: norm(llmQuery.amounts),
    facts: norm(llmQuery.facts),
    legal_issues: norm(llmQuery.legal_issues),
    keywords: norm(llmQuery.keywords),
    research_topics: norm(llmQuery.research_topics),
    articles: norm(llmQuery.articles),
    organizations: norm(llmQuery.organizations),
    inn: norm(llmQuery.inn ?? (llmQuery as any).INN),
    ogrn: norm(llmQuery.ogrn ?? (llmQuery as any).OGRN),
    semantic_intents: norm(llmQuery.semantic_intents),
    legal_concepts: norm(llmQuery.legal_concepts),
    metadata_terms: norm(llmQuery.metadata_terms),
    search_hypotheses: norm(llmQuery.search_hypotheses),
  };

  return mergeQueryWithRegex(fromLlm, joinedRaw);
}

export function queryToSearchString(q: ResearchQuery): string {
  return [
    q.practice_area ?? "",
    q.subcategory ?? "",
    q.document_type ?? "",
    ...q.legal_issues,
    ...q.research_topics,
    ...q.semantic_intents,
    ...q.legal_concepts,
    ...q.search_hypotheses,
    ...q.metadata_terms,
    ...q.keywords,
    ...q.articles,
    ...q.facts.slice(0, 5),
  ]
    .filter(Boolean)
    .join(". ");
}

export async function embedQuery(text: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY || !text.trim()) return null;
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: text.slice(0, 8000) }] },
          embedContentConfig: {
            taskType: "RETRIEVAL_QUERY",
            outputDimensionality: 1536,
          },
        }),
      },
    );
    if (!res.ok) {
      console.error("[fact-extraction] Gemini embedding error", res.status);
      return null;
    }
    const data = await res.json();
    const embedding = data?.embedding?.values;
    return Array.isArray(embedding) && embedding.length === 1536 ? embedding : null;
  } catch (error) {
    console.error("[fact-extraction] Gemini embedding exception", error);
    return null;
  }
}
