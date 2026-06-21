// Layer 5: Prompt building for Gemini Pro.

import type { ResearchQuery } from "./fact-extraction.ts";
import type { Bucket } from "./repositories.ts";
import type { MergedSource } from "./dedupe.ts";

const LABELS: Record<Bucket, string> = {
  laws: "LAWS",
  court_practice: "COURT_PRACTICE",
  fns_letters: "FNS",
  minfin_letters: "MINFIN",
  ekaterina: "EKATERINA",
  manuals: "MANUALS",
};

function bucketBlock(label: string, src: MergedSource[]): string {
  if (src.length === 0) return `### ${label}\n(нет данных)`;
  return (
    `### ${label}\n` +
    src
      .map(
        (s, i) =>
          `[${label}-${i + 1}] source_id=${s.source_id} score=${s.scores.final.toFixed(2)} appearances=${s.appearances}\n` +
          `TITLE: ${s.title}\nURL: ${s.official_url ?? "—"}\n${s.snippet}`,
      )
      .join("\n---\n")
  );
}

export function buildPrompt(input: {
  templateCode: string;
  jurisdiction: string;
  language: string;
  query: ResearchQuery;
  documents: Array<{ id: string; title: string; text: string }>;
  sources: MergedSource[];
}): string {
  const docsBlock = input.documents.length
    ? input.documents
        .map((d, i) => `[ДОК-${i + 1}] doc_id=${d.id}\nTITLE: ${d.title}\n${d.text.slice(0, 7000)}`)
        .join("\n\n---\n\n")
    : "(нет документов)";

  const byBucket = (b: Bucket) => input.sources.filter((s) => s.bucket === b);
  const kbBlock = (Object.keys(LABELS) as Bucket[])
    .map((b) => bucketBlock(LABELS[b], byBucket(b)))
    .join("\n\n");

  const docIds = input.documents.map((d) => d.id).join(", ");

  return `Ты — старший российский юрист и руководитель Legal Research Engine. Сформируй итоговый правовой анализ.

ШАБЛОН: ${input.templateCode}
ЮРИСДИКЦИЯ: ${input.jurisdiction}
ЯЗЫК: ${input.language}

RESEARCH QUERY (готовый запрос на исследование):
${JSON.stringify(input.query, null, 2)}

ДОКУМЕНТЫ КЛИЕНТА (OCR):
${docsBlock}

ИСТОЧНИКИ (отранжированы и дедуплицированы):
${kbBlock}

ЖЕСТКИЕ ПРАВИЛА:
1. Запрещено выдумывать законы, письма, дела, URL. Используй ТОЛЬКО source_id из секции ИСТОЧНИКИ.
2. Каждая запись в applicable_laws / court_practice / fns_letters / minfin_letters / ekaterina_practice / manuals содержит "source_id".
3. Нерелевантные нормы / практику клади в rejected_laws / rejected_court_practice с reason.
4. fact_to_law_mapping — связки ФАКТ → НОРМА → ВЫВОД.
5. Раздели позицию клиента (taxpayer_position) и оппонента (tax_authority_position).
6. Недостающие факты — в missing_evidence.
7. generation_instructions — указания для следующего этапа (генерации документа).
8. recommendations — что юристу/клиенту делать дальше.
9. document_usage — для КАЖДОГО doc_id из [${docIds}] укажи массив used_for из закрытого набора:
   ["facts","legal_qualification","taxpayer_position","court_practice","risks","recommendations","generation"].

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
  "generation_instructions":[string],
  "document_usage":[{"doc_id":string,"used_for":[string]}]
}
Никакого текста кроме JSON.`;
}

export async function callGeminiPro(prompt: string): Promise<{ text: string; model: string }> {
  const KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
  const MODEL = "gemini-2.5-pro";
  if (!KEY) throw new Error("GEMINI_API_KEY is not set");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
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
  return { text, model: MODEL };
}
