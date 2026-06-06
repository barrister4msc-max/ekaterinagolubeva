## Цель

Добавить в CRM изолированный раздел «База права / Legal Knowledge» для контроля каталога нормативных актов, судебной практики и писем разъяснений, плюс защиту от выдуманных норм в выводе AI-заключений. Существующие Edge Functions (`analyze-legal-query`, `legal-document-review-orchestrator`, `analyze-lead-document`) и таблицы (`legal_laws`, `legal_law_chunks`, `legal_knowledge_chunks`, `legal_document_reviews`) не трогаем.

## Переиспользование схемы

Существующие таблицы оставляем как есть и используем как «локальную базу источников»:
- `legal_laws` + `legal_law_chunks` — нормативные акты (кодексы, законы);
- `legal_knowledge_chunks` — методические материалы, обзоры, разъяснения;
- `legal_regulatory_monitored_sources` — мониторинг актуальности;
- `official_legal_sources`, `external_registry_sources` — реестр официальных источников.

Дублей `legal_sources_catalog / legal_source_documents / legal_source_chunks` создавать не будем — каталог собирается из существующих таблиц через SQL-view `v_legal_sources_catalog`.

## Новые таблицы (миграция)

1. `legal_source_usage_events` — каждый факт использования источника AI-заключением: `source_kind` (law/law_chunk/knowledge_chunk/case/letter), `source_id`, `lead_id`, `review_id`, `document_id`, `article`, `reason`, `verification_status`, `created_at`.
2. `legal_source_gap_requests` — пропуски: `query_text`, `missing_source_type`, `guessed_title`, `guessed_article`, `guessed_document_number`, `context`, `priority`, `status` (`new/in_progress/resolved/dismissed`), `request_count`, `last_requested_at`, `created_at`, `updated_at`.
3. `legal_source_verification_logs` — очередь и история проверок: `source_kind`, `source_id`, `requested_by`, `status` (`pending/running/verified/outdated/failed`), `result_summary`, `external_url`, `requested_at`, `completed_at`.
4. View `v_legal_sources_catalog` — объединяет `legal_laws`, `legal_knowledge_chunks` источники + статус актуальности из `legal_regulatory_monitored_sources` + счётчик chunks и usages.

Все таблицы: RLS ON, `GRANT` для `authenticated` и `service_role`, политики через `is_admin_or_superadmin(auth.uid())` (полный доступ только админам/суперадминам).

## Раздел «База права» в CRM

Новый файл `src/routes/_authenticated/workspace.legal-knowledge.tsx` + пункт в навигации workspace. Внутри 4 вкладки:

1. **Каталог источников** — таблица из `v_legal_sources_catalog`: тип, название, номер, дата принятия/редакции, источник, URL, статус актуальности, дата последней проверки, кол-во чанков, кол-во использований. Кнопка «Проверить актуальность» → insert в `legal_source_verification_logs` со `status=pending` + toast «Проверка поставлена в очередь».
2. **Статистика** — топ статей/источников по `legal_source_usage_events`; топ отсутствующих по `legal_source_gap_requests`; разбивка по типам дел.
3. **Что подгрузить** — список `legal_source_gap_requests` с приоритетом, кол-вом запросов, контекстом; действия: «Отметить решённым», «Сменить приоритет».
4. **Журнал проверок** — `legal_source_verification_logs` с фильтром по статусу.

UI — те же shadcn-компоненты (Card/Table/Tabs/Badge), стиль как существующий workspace.

## Strict sources в выводе AI-заключений

Изменения только на UI-слое чтения `legal_document_reviews` (Edge Functions не трогаем). В компоненте просмотра заключения (вкладка «Нормы права»):
- Делим `legal_basis` на 3 блока: «Подтверждено локальной базой», «Требует внешней проверки», «Не найдено в базе» — на основании `verification_status` элемента и наличия `source_id` в наших таблицах.
- Для каждого элемента проверяем через server fn `verifyLegalSources` (новый, в `src/lib/legal-knowledge.functions.ts`): для law/case/letter проверяет наличие в локальной базе по article/case_number/document_number и возвращает `verification_status`.
- Элементы без `case_number` / `source_url` для судебной практики или без `document_number` / `document_date` для писем — автоматически в блок «Требует внешней проверки», независимо от того, что вернул AI.
- При первом просмотре, неизвестные источники логируются как `legal_source_gap_requests` (insert или increment `request_count`).

Это не меняет данные в `legal_document_reviews` и не трогает edge functions — только overlay классификации на стороне приложения.

## Server functions (`src/lib/legal-knowledge.functions.ts`)

Все защищены `requireSupabaseAuth` + проверка `is_admin_or_superadmin`:
- `listSourcesCatalog({ filter })` — select из view.
- `getSourceStats()` — агрегаты usage + gaps.
- `listGapRequests({ status })`, `updateGapRequest({ id, status, priority })`.
- `requestSourceVerification({ source_kind, source_id })` — insert в logs.
- `logSourceUsage({...})`, `logSourceGap({...})` — вызываются из UI-просмотра заключения.
- `verifySourcesForReview({ review_id })` — классифицирует `legal_basis` по локальной базе.

## Архитектура файлов

```
supabase/migrations/<ts>_legal_knowledge_governance.sql
src/lib/legal-knowledge.functions.ts
src/routes/_authenticated/workspace.legal-knowledge.tsx
src/components/legal-knowledge/catalog-table.tsx
src/components/legal-knowledge/gap-requests-list.tsx
src/components/legal-knowledge/usage-stats.tsx
src/components/legal-knowledge/verification-logs.tsx
src/components/legal-knowledge/sources-classifier.tsx  // используется в просмотре review
```

В существующем компоненте просмотра `legal_document_reviews` (вкладка «Нормы права») — заменяем плоский список на `<SourcesClassifier review={...} />`, без изменения данных и логики Edge Functions.

## Этапы реализации

1. Миграция БД (3 таблицы + view + RLS + GRANTs).
2. Server functions в `src/lib/legal-knowledge.functions.ts`.
3. Маршрут `workspace.legal-knowledge.tsx` + ссылка в навигации workspace.
4. Компонент `SourcesClassifier` и встройка в существующий просмотр заключения.
5. Smoke-test: открыть страницу, проверить кнопку «Проверить актуальность», убедиться что существующий AI-анализ работает без изменений.

## Что НЕ меняем

- Edge Functions `analyze-legal-query`, `legal-document-review-orchestrator`, `analyze-lead-document`, OCR.
- Таблицы `lead_documents`, `legal_document_reviews`, `legal_laws`, `legal_law_chunks`, `legal_knowledge_chunks`.
- Существующие вкладки и кнопки CRM.

Strict-sources режим внутри edge functions (флаг `strict_sources`) — задел на следующий этап; сейчас strict-классификация реализуется на UI-слое поверх неизменного вывода AI.
