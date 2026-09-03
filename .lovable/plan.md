# Master control point after P0-C — состояние и следующий шаг

## Факты (read-only, проверено в текущем дереве)

Ветка/HEAD:
- Текущая ветка: `edit/edt-dc096b4b-7fc6-4ecd-8bbb-756e738bbe5e`
- HEAD: `9624407` «Implemented resumable PDF indexing» (P0-C 600-page indexing)
- Рабочее дерево чистое (`git status --porcelain` пуст) — P0-C зафиксирован, ничего не висит.

Router-контур (`supabase/functions/_shared/ai/`):
- `model-types.ts` (147), `model-policy.ts` (126), `model-registry.ts` (146), `provider-registry.ts` (46) — контракт, policy на 7 task types, eligibility, level-1 health check.
- `model-router.ts` (382) — единственный экспорт `runModelTask`.
- `provider-adapters.ts` (272) — реальные Gemini/OpenAI adapters + level-2 `checkModelAvailability`.
- `model-shadow-harness.ts` (364) — `runShadowHarness`, comparison-only, budget reservation, safe-only телеметрия.
- `supabase-shadow-store.ts` (39) — RPC-мост к `reserve_model_shadow_budget` / `record_model_shadow_telemetry`.
- Миграции стора существуют: `20260828210000_p1b1_private_model_shadow_store.sql`, `20260828223000_p1b1_shadow_store_retry_safe.sql`.
- Тесты: `model-router-v1` (251), `model-shadow-harness` (307), `provider-model-capability` (251), `supabase-shadow-store` (84).

Ключевой факт — **потребителей нет**: `rg "_shared/ai/" .` даёт совпадения только в четырёх тестовых файлах. Ни одна Edge Function не импортирует Router или harness. Продакшн-вызовы Gemini идут напрямую в `generate-legal-document-v2/index.ts`, `review-generated-legal-document/index.ts`, `analyze-document-legal-position/*`, `document-intake-ai-fill/index.ts`, `extract-document-text`, `extract-external-research-text`.

Вывод по статусу: Router v1 и P1-B.1 (private shadow store) закрыты как контракт и инфраструктура. P1 benchmark по роадмапу (`docs/KATI_LAWYER_MASTER_ROADMAP_VNEXT_2026-08-27.md`) не начат: нет ни одного места, где shadow реально запускается рядом с production-вызовом.

## Единственный следующий незакрытый Master-substep

**P1-B.2 — первое подключение shadow-контура к одному consumer: Generator (`generate-legal-document-v2`).**

Роадмап называет Generator первым кандидатом на switch, поэтому именно его shadow-данные нужны раньше остальных. Это единственный шаг, который переводит Router из «контракта» в «измеряемый», не меняя production-результат.

## Наименьший безопасный диф

1. Новый файл `supabase/functions/generate-legal-document-v2/shadow-hook.ts`: тонкая обёртка, которая берёт уже принятый production-результат Gemini и вызывает `runShadowHarness` с `task_type: "generation"`, candidate `gpt-5.6-terra`, стором из `createSupabaseShadowStore`.
2. Точечная вставка в `generate-legal-document-v2/index.ts` — один вызов после того, как production-ответ уже сформирован и сохранён; результат hook игнорируется, ошибки проглатываются.
3. Конфиг shadow читается из env внутри хендлера: по умолчанию `enabled: false`, `sample_rate` 0 — без явно выставленных секретов и cap-ов контур не запускается (fail-closed уже реализован в harness).
4. Тест `supabase/tests/p1b2-generator-shadow.test.ts`: (a) при выключенном флаге production-путь не меняется и harness не вызывается; (b) при включённом флаге production-ответ байт-в-байт тот же; (c) отсутствие cap → skip `cost_unknown`; (d) исключение внутри shadow не ломает генерацию.

Границы: не трогать сам текст промпта, template-profiles, Reviewer, Legal Core, схемы/RLS, роуты и UI. Ноль изменений в возвращаемом клиенту документе.

## Правильна ли текущая ветка

Да. Дерево чистое, P0-C уже в истории этой ветки, отдельного router-бранча в проекте нет — P1-B.2 логично класть сюда же, следующим изолированным коммитом.

## Блокеры, которые надо признать честно

- `OPENAI_API_KEY` в проекте не подтверждён — без него shadow даст только skip-телеметрию (`provider_not_configured`). Это ожидаемое поведение, а не баг, но benchmark-цифр не будет до появления ключа.
- Проверить, что RPC `reserve_model_shadow_budget` / `record_model_shadow_telemetry` действительно применены на удалённой БД, нельзя — доступ к remote Supabase в этой задаче запрещён. Миграции в репозитории есть; факт применения непроверяем.
- Реальные латентность/стоимость/качество по-прежнему неизмеримы, пока shadow не включён с ключом и cap-ами; никакой production switch на этом шаге не заявляется.
