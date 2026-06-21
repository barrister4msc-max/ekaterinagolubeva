// Layer 1: Fact Extraction — OCR + answers → ResearchQuery (+ optional query embedding)

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const FLASH_MODEL = "gemini-2.5-flash";

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
};

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in fact extraction");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function extractFacts(input: {
  templateCode: string;
  practiceArea: string | null;
  answers: Record<string, unknown>;
  documents: Array<{ title: string; text: string }>;
}): Promise<ResearchQuery> {
  if (!GEMINI_API_KEY) return { ...EMPTY_QUERY, practice_area: input.practiceArea };

  const docsBlock = input.documents
    .map((d, i) => `[ДОК-${i + 1}] ${d.title}\n${d.text.slice(0, 4000)}`)
    .join("\n---\n");

  const prompt = `Ты — юрист-аналитик. Извлеки из документов и ответов опросника структурированный Research Query для последующего юридического поиска.

ШАБЛОН: ${input.templateCode}
ОБЛАСТЬ ПРАВА: ${input.practiceArea ?? "—"}

ОТВЕТЫ КЛИЕНТА (JSON):
${JSON.stringify(input.answers, null, 2)}

ДОКУМЕНТЫ КЛИЕНТА (OCR):
${docsBlock || "(нет документов)"}

ВЕРНИ СТРОГО ОДИН JSON:
{
  "practice_area": string|null,
  "subcategory": string|null,
  "document_type": string|null,
  "facts": [string],
  "parties": [string],
  "amounts": [string],
  "dates": [string],
  "legal_issues": [string],
  "research_topics": [string],
  "keywords": [string]
}

ПРАВИЛА:
- legal_issues — короткие формулировки спорных правовых вопросов ("оспаривание решения ФНС", "уменьшение УК ООО").
- research_topics — темы для поиска ("ст. 54.1 НК", "деловая цель", "реальность операции").
- keywords — расширенные синонимы и термины для keyword-поиска.
- Никаких выдумок. Если поле неизвестно — пустой массив или null.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${FLASH_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    return { ...EMPTY_QUERY, practice_area: input.practiceArea };
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
  try {
    const parsed = extractJson(text) as Partial<ResearchQuery>;
    return { ...EMPTY_QUERY, ...parsed, practice_area: parsed.practice_area ?? input.practiceArea };
  } catch {
    return { ...EMPTY_QUERY, practice_area: input.practiceArea };
  }
}

export function queryToSearchString(q: ResearchQuery): string {
  return [
    q.practice_area ?? "",
    q.subcategory ?? "",
    q.document_type ?? "",
    ...q.legal_issues,
    ...q.research_topics,
    ...q.keywords,
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
