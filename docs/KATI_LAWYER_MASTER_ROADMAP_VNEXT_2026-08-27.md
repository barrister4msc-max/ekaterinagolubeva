# KATI LAWYER — Master Roadmap vNext

Дата сверки: 27 августа 2026 года  
Репозиторий: `barrister4msc-max/ekaterinagolubeva`  
Production: `https://legalpracticelife.ru`

## Архитектурная база

Legal Analysis Core не перепроектируется. Сохраняются OCR, multi-document intake, AI-fill, provenance, Fact → Evidence → Conclusion, Evidence Matrix, Source Sufficiency, temporal checks, Argument Map, Reasoning Engine, Challenge, `validateConclusions`, `generation_conclusions`, `blocked_conclusions`, `working_strategy`, Generator, Reviewer, Canonical Relations и Template Registry.

Меняется только model transport и orchestration. Источник истины остаётся в существующих run/answer/legal-analysis контрактах.

## Фактическое состояние AI

Подтверждено по `main`:

- fact-extraction использует Gemini 2.5 Flash;
- Legal Research использует fallback внутри Gemini;
- document-intake-ai-fill работает через Gemini и не имеет межпровайдерного OpenAI fallback;
- generate-legal-document-v2 напрямую вызывает Gemini 2.5 Flash Lite;
- OpenAI adapter и `OPENAI_API_KEY` в коде отсутствуют;
- source quotes, confidence, protected fields, provenance и конкретный `run_id` обязательны.

Неподтверждённое не считается реализованным: shadow, benchmark, production switch, фактическая стоимость и доступность конкретной модели подтверждаются измерением.

## Целевой стек

| Контур | Стратегия |
|---|---|
| PDF, сканы, изображения, layout | Gemini Flash; Gemini 3.7 только после проверки доступности и benchmark |
| Classification / metadata | benchmark GPT-5.6 Luna против текущего Gemini |
| Простой AI-fill | Luna только в shadow/benchmark |
| Сложный factual/legal AI-fill | текущий Gemini primary до field-level benchmark |
| Legal Research | текущий Gemini production, Terra shadow |
| Generator | текущий Gemini production, Terra shadow и первый кандидат на switch |
| Reviewer / Challenge | независимый Gemini-контур |
| High-risk escalation | GPT-5.6 Sol + обязательная проверка юриста |

Модели не записывают ответы в форму независимо. Router выбирает primary/fallback, затем deterministic merge.

## P0 — Model Router и observability

1. Канонический `ModelRunResult` для Gemini и OpenAI.
2. Policy по task type: allowed models, primary/fallback/escalation, timeout, max attempts, cost cap и human review.
3. Единые метрики: provider, model, task type, attempt, latency, tokens, estimated cost, status, JSON validity, validation errors, fallback.
4. Source document ids и source quotes сохраняются как ссылки/provenance; полный OCR в telemetry не дублируется.
5. Router не меняет Legal Analysis Core и не пишет shadow-ответы в пользовательскую форму.
6. OpenAI key используется только в Supabase Edge Functions.

В PR Router v1 дополнительно обязательно:
- `attempt_history` с телеметрией каждой последовательной попытки;
- `total_estimated_cost_usd` по всему запуску, включая fallback;
- cumulative cost cap, а не только лимит одной попытки;
- явный `fallback_mode`: `none` запускает только primary, `optional` не блокирует baseline Gemini при недоступном OpenAI, `required` блокирует маршрут до AI-вызова при отсутствии допустимого reserve;
- явная доступность провайдеров перед запуском; без подтверждённого provider adapter вызов не выполняется;
- timeout отменяет попытку через `AbortSignal`; non-retryable ошибки не запускают fallback.

До подключения consumers остаётся честный статус: это контракт и orchestration foundation; фактических OpenAI-вызовов и production model switch нет.

Router v1 не реализует shadow execution и не содержит live Gemini/OpenAI adapters. Shadow benchmark и provider adapters — отдельный P1 PR. До benchmark production primary остаётся Gemini.

## P1 — controlled benchmark

Shadow-ответ не изменяет production.

Сравниваются field accuracy, omission rate, JSON validity, quote fidelity, source linkage, provenance completeness, unsupported conclusions, working strategy compliance, document completeness, reviewer findings, latency, retries и cost.

Минимум: 30–50 representative обезличенных кейсов с раздельными simple/complex/high-risk группами.

## P1 — production candidates

1. Generator: Terra shadow → controlled switch только при подтверждённом выигрыше.
2. Classification/simple extraction: Luna только если качество не хуже порога.
3. Complex AI-fill не переводить полностью без field-level benchmark.
4. Legal Research Terra оставлять shadow до отдельной проверки.

## P2/P3 — Gemini Enterprise compatibility

Gemini Enterprise for Legal не является заменой KATI. Подготовить KATI API/MCP server с permission checks, matter-level access, ethical walls, audit log и безопасными операциями поиска, Evidence, research и document status.

Внешний агент не получает прямой доступ к Supabase. Фактическое подключение зависит от preview-доступа, коммерческих условий, регионов хранения и технического контракта Google.

## Экономические правила

- не запускать две модели в production без причины;
- shadow включать выборочно и с budget cap;
- Terra/Sol запускать только по policy;
- считать tokens, retries, fallback и cache отдельно;
- старые Gemini fallback не удалять до доказанного теста новых;
- оценивать cost-per-correct-result, а не только цену токена.

## Stop rules

Не менять Legal Analysis Core, не создавать второй source/evidence/provenance registry, не записывать shadow в форму, не передавать ключ во frontend, не отправлять original OCR без privacy gate и audit, не считать модель production-ready без benchmark и не утверждать live E2E без проверки.

## Definition of Done Router v1

Provider-neutral canonical contract, готовый для Gemini/OpenAI adapters; явные ModelSpec и provider availability; ограниченные retry/fallback, AbortSignal, fail-closed JSON/status validation, единые метрики, история всех попыток, cumulative cost cap, cached token accounting, тесты ошибок/JSON/policy/abort/cost cap, сохранённые run_id/provenance/source references, отсутствие изменения consumers и зелёные regression/typecheck.
