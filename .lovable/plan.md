# Legal Research Engine — Этап 1

Расширяем существующую edge function `analyze-document-legal-position` до полноценного research-движка. Ни схема БД, ни generator, ни review, ни AI Fill, ни Document Generator не меняются.

## Что меняется

### 1. `supabase/functions/analyze-document-legal-position/index.ts` (расширение)

Перед вызовом Gemini добавляется **каскадный поиск источников**. Текущий простой запрос `legal_knowledge_chunks WHERE category = practice_area` заменяется на 6 параллельных запросов с фильтром по `metadata->>'source_type'` (плюс fallback на колонку `source_type`):

```
laws            → source_type IN ('law_full_text','federal_law','law_full_text_placeholder')
court_practice  → source_type IN ('court_practice','vs_review')
fns_letters     → source_type = 'fns_letter'
minfin_letters  → source_type = 'minfin_letter'
ekaterina       → source_type = 'ekaterina_practice'
                  + practice_document_legal_analysis (use_in_rag=true)
                  + practice_legal_analysis_sources (relevance_score desc)
manuals         → source_type IN ('manual','manual_seed','template')
```

Каждый bucket лимитируется (10/8/6/6/6/4) и упорядочивается. Для каждого источника собирается единый ResearchSource:

```ts
{ source_table, source_id, source_type, title, official_url, citation,
  verification_status, actuality_status, why_selected, used_for }
```

Параллельно строится **document audit**: проходим все `documents` сессии (без фильтра по тексту), для каждого вычисляем `used | rejected` + `reason` (`no_ocr` / `text_too_short` / `archive_zip` / `technical_file` / `duplicate` / `irrelevant`). Использованные документы — те, что попадают в подсказку Gemini.

Prompt дополняется блоками `LAWS / COURT_PRACTICE / FNS / MINFIN / EKATERINA / MANUALS` (вместо одной общей KB-кучи) и требует от модели:

- разделять `applicable_laws` / `rejected_laws`
- разделять `court_practice` / `rejected_court_practice`
- сопоставлять каждый источник с одним из переданных id (поле `source_id`), чтобы избежать выдумки
- заполнить `generation_instructions`, `risks`, `missing_evidence`, `recommendations`

Post-processing:
- список ResearchSource объединяется с тем, что вернула модель (по `source_id`); URL/verification берутся из БД, а не из ответа модели — это снимает риск галлюцинаций URL
- `source_actuality` пересчитывается уже существующей `sanitizeSourceActuality` (правило needs_check / requires_actuality_check / actual)
- метрики `legal_accuracy_score`, `hallucination_risk`, `source_verification_status`, `needs_lawyer_review` считаются как и сейчас, но с учётом наличия URL в реестре

Результат сохраняется в **существующие** колонки `document_intake_ai_runs`:
- `ai_result` — новый объект `legal_analysis` (см. пример ниже)
- `used_sources` — массив ResearchSource
- `input_snapshot` — сводка (documents used/rejected/total, по бакетам сколько найдено)
- `recommendations`, `required_fixes`, `problems`, `source_verification_status`, `hallucination_risk`, `legal_accuracy_score`, `needs_lawyer_review`

Никаких новых колонок и таблиц.

### 2. `src/lib/legal-analysis.ts` (типы)

Расширяю `LegalAnalysisResult`: `rejected_laws`, `rejected_court_practice`, `rejected_fns_letters`, `manuals`, `documents_audit: { used: [...], rejected: [{ title, reason }] }`, `research_summary`. Все поля опциональные — обратная совместимость со старыми runs.

### 3. `src/components/document-builder/legal-analysis-panel.tsx` (UI)

Добавляю секции:
- «Использованные документы» / «Неиспользованные документы (с причиной)»
- «Альтернативные / отклонённые нормы и практика»
- «Сводка исследования» (счётчики по бакетам)
- В существующем списке источников показываю `why_selected` и `used_for`

Никакая логика проверки документов и кнопки запуска не трогается.

## Что НЕ меняется (подтверждение)

- `supabase/functions/generate-legal-document-v2/*` — не трогаю
- `supabase/functions/review-generated-legal-document/*` — не трогаю
- AI Fill (`document-intake-ai-fill`) — не трогаю
- `src/lib/generate-legal-document.ts`, `intake-form.tsx` — не трогаю
- Схема БД (таблицы, колонки, RLS, политики) — без миграций

Контракт между Research Engine и Generator уже сейчас идёт через `ai_result` поле в `document_intake_ai_runs`. Generator получит более богатый объект в том же поле — обратная совместимость сохранена (все новые поля опциональны).

## Пример новой структуры `legal_analysis`

```jsonc
{
  "facts": ["..."],
  "legal_qualification": "...",
  "main_legal_position": "...",
  "taxpayer_position": "...",
  "tax_authority_position": "...",

  "applicable_laws":  [{ "source_id": "...", "code": "НК РФ", "article": "54.1", "title": "...", "official_url": "...", "why_selected": "...", "used_for": "..." }],
  "rejected_laws":    [{ "law": "...", "reason": "..." }],

  "court_practice":          [{ "source_id": "...", "case": "...", "court": "...", "date": "...", "url": "...", "why_selected": "...", "used_for": "..." }],
  "rejected_court_practice": [{ "case": "...", "reason": "..." }],

  "fns_letters":     [{ "source_id": "...", "number": "...", "date": "...", "url": "...", "used_for": "..." }],
  "minfin_letters":  [{ "source_id": "...", "number": "...", "date": "...", "url": "...", "used_for": "..." }],
  "ekaterina_practice": [{ "source_id": "...", "title": "...", "similarity": 0.82, "used_for": "..." }],
  "manuals":         [{ "source_id": "...", "title": "...", "used_for": "..." }],

  "fact_to_law_mapping": [{ "fact": "...", "law": "...", "reasoning": "...", "conclusion": "..." }],
  "counter_arguments":   ["..."],
  "weak_points":         ["..."],
  "missing_evidence":    ["..."],
  "risks":               [{ "risk": "...", "severity": "high", "mitigation": "..." }],
  "recommendations":     ["..."],
  "generation_instructions": ["..."],

  "documents_audit": {
    "used":     [{ "id": "...", "title": "...", "ocr_length": 367, "used_for": ["facts","fact_to_law_mapping[2]"] }],
    "rejected": [{ "id": "...", "title": "архив.zip", "reason": "archive_zip" }]
  },

  "sources":          [/* ResearchSource[] — единый список, на который ссылаются source_id выше */],
  "source_actuality": [/* needs_check / requires_actuality_check / actual */],

  "research_summary": {
    "documents_total": 5, "documents_used": 3, "documents_rejected": 2,
    "laws_found": 7, "court_practice_found": 4,
    "fns_found": 2, "minfin_found": 1,
    "ekaterina_found": 2, "manuals_found": 1
  }
}
```

## Отчёт после реализации

Будет выдан список изменённых файлов, перечень новых helper-функций (`runCascadeResearch`, `buildDocumentAudit`, `mergeModelSourcesWithRegistry`), пример сохранённого `ai_result` и явное подтверждение, что `generate-legal-document-v2` и `review-generated-legal-document` не трогались.
