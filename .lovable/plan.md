# Legal Research Engine — Этап 2

Расширяем edge function `analyze-document-legal-position` (без изменений других функций и схемы БД). Чтобы остаться обозримым, разбиваем монолитный `index.ts` на модули внутри той же папки функции — Deno подтягивает их относительными import'ами.

## Новая структура каталога функции

```text
supabase/functions/analyze-document-legal-position/
  index.ts             — оркестратор (handler)
  fact-extraction.ts   — Layer 1: OCR → ResearchQuery (Gemini Flash)
  repositories.ts      — Layer 2: Law/Court/FNS/Minfin/Practice/Manual repositories
  ranking.ts           — Layer 3: scoring (semantic/keyword/priority/relevance/final)
  dedupe.ts            — Layer 4: объединение норм/актов из разных таблиц
  prompt.ts            — Layer 5: построение prompt для Gemini Pro
  merge.ts             — Layer 6: пост-обработка ответа модели + URL из реестра
```

## Слои

### 1. Fact Extraction Layer (`fact-extraction.ts`)
Между OCR-документами и Research. Один быстрый вызов Gemini-2.5-Flash с low temperature на конкатенированном OCR + ответах опросника. Возвращает `ResearchQuery`:

```ts
type ResearchQuery = {
  practice_area: string | null;
  subcategory: string | null;
  document_type: string | null;
  facts: string[];
  parties: string[];
  amounts: string[];
  dates: string[];
  legal_issues: string[];      // "уменьшение УК", "оспаривание решения ФНС", ...
  research_topics: string[];   // ключевые слова для поиска
  keywords: string[];          // расширенные синонимы
};
```

ResearchQuery идёт во все репозитории и сохраняется в `ai_result.research_query`.

Опционально (если есть `LOVABLE_API_KEY`) считается query embedding через Lovable AI Gateway (`google/gemini-embedding-001`, 3072) — используется потом для semantic scoring.

### 2. Repository Layer (`repositories.ts`)
Каждый репозиторий — отдельный класс с единым интерфейсом `search(query, opts) → RawSource[]`. Сохраняем уже работающий каскад из этапа 1, но теперь источники инкапсулированы:

- `LawRepository`        — `legal_knowledge_chunks` (`law_full_text`, `federal_law`, `law_full_text_placeholder`)
- `CourtRepository`      — `legal_knowledge_chunks` (`court_practice`, `vs_review`)
- `FNSRepository`        — `legal_knowledge_chunks` (`fns_letter`)
- `MinfinRepository`     — `legal_knowledge_chunks` (`minfin_letter`)
- `PracticeRepository`   — `legal_knowledge_chunks` (`ekaterina_practice`) + `practice_document_legal_analysis` + `practice_legal_analysis_sources`
- `ManualRepository`     — `legal_knowledge_chunks` (`manual`, `manual_seed`, `template`)

Все шесть запускаются `Promise.all`. Каждый возвращает однородный `RawSource` (плюс служебные поля для дальнейшего scoring/dedupe).

### 3. Ranking Engine (`ranking.ts`)
Для каждого `RawSource` считает:

```ts
{
  semantic_score: number,   // cos(query_embedding, chunk_embedding) ∈ [0..1], 0 если embedding нет
  keyword_score:  number,   // доля terms из ResearchQuery.legal_issues+research_topics+keywords, найденных в title+content
  priority_score: number,   // metadata.priority: critical=1.0, high=0.75, medium=0.5, low=0.3
  relevance_score: number,  // bucket weight: laws=1.0, court=0.9, ekaterina=0.85, fns=0.8, minfin=0.8, manuals=0.6
  final_score:    number    // 0.45*semantic + 0.25*keyword + 0.15*priority + 0.15*relevance
}
```

Semantic_score берём через RPC `match_legal_knowledge(query_embedding, match_count=50, category_filter=practice_area)` — она уже есть в БД и возвращает similarity. Маппим её обратно по `id` на наши `RawSource`. Если эмбеддингов нет (`LOVABLE_API_KEY` пуст), semantic=0 и веса автоматически перераспределяются в пользу keyword/priority/relevance.

После scoring каждый bucket сортируется по `final_score` desc и обрезается до лимита (laws=10, court=8, fns=6, minfin=6, ekaterina=8, manuals=4).

### 4. Deduplicate Engine (`dedupe.ts`)
Объединяет одинаковые сущности, найденные в разных репозиториях / таблицах:

- `laws`: ключ = `${code}|${article}|${part ?? ''}` (нормализовано) — например, «НК РФ 54.1» из `legal_knowledge_chunks` и из практики Екатерины слипаются в одну запись.
- `court_practice`: ключ = нормализованный номер дела (`metadata.case_number` или regex `А\d+-\d+/\d+` по title).
- `fns_letters` / `minfin_letters`: ключ = `number|date`.
- `ekaterina` / `manuals`: ключ = `source_id` (уже уникален).

Победителем становится запись с максимальным `final_score`; в неё добавляются поля `merged_from: [{ source_table, source_id }]` и `appearances: N` — это даёт реальный буст уверенности для норм, всплывших в нескольких источниках.

### 5. Prompt + Merge (`prompt.ts`, `merge.ts`)
Перенос текущего `buildPrompt` + `mergeModelSourcesWithRegistry` без изменений контракта. Дополнено:

- prompt передаёт модели готовый `ResearchQuery` (вместо сырых ответов опросника + всего OCR).
- prompt требует для каждого использованного документа массив `used_for` из закрытого набора: `facts | legal_qualification | taxpayer_position | court_practice | risks | recommendations | generation`.
- merge применяет ответ модели поверх `documents_audit.used[].used_for` — если модель не указала, оставляем `["facts"]` по умолчанию.

### 6. Index / orchestrator (`index.ts`)
Последовательность:

```text
load session + answers + documents
   │
   ▼
classify documents → used / rejected
   │ (если used = 0 → fail no_documents, как сейчас)
   ▼
FactExtraction(used docs + answers)  →  ResearchQuery (+ query_embedding)
   │
   ▼
Promise.all(
  LawRepo, CourtRepo, FNSRepo, MinfinRepo, PracticeRepo, ManualRepo
).search(query)
   │
   ▼
RankingEngine.score(all sources, query, query_embedding)
   │
   ▼
DedupEngine.merge(scored sources)
   │
   ▼
Gemini-2.5-Pro (prompt с ResearchQuery + ранжированными источниками)
   │
   ▼
Merge(model output ↔ registry: URL и verification из БД)
   │
   ▼
documents_audit.used[].used_for  ←  из ответа модели
   │
   ▼
document_intake_ai_runs.update({ status='completed', ai_result, used_sources, metrics, input_snapshot })
```

`ai_result` получает два новых опциональных поля поверх этапа 1:
- `research_query: ResearchQuery`
- каждый объект в `sources` получает `scores: { semantic, keyword, priority, relevance, final }`, `merged_from`, `appearances`
- `documents_audit.used[].used_for: string[]`

## Что НЕ меняется

- `generate-legal-document-v2/*` — не открывается
- `review-generated-legal-document/*` — не открывается
- `document-intake-ai-fill` — не трогается
- Схема БД, RLS, миграции — без изменений
- Frontend (`legal-analysis.ts`, `legal-analysis-panel.tsx`) получит только мелкое расширение типов (опциональные `scores`, `merged_from`, `appearances`, `research_query`) и опциональный показ `used_for` рядом с использованными документами

## После реализации

Покажу новую архитектурную схему (Mermaid) + список добавленных модулей и функций.
