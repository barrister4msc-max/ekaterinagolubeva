# ADR-001 — server-owned OCR continuation

Дата: 29.10.2026. Статус: выбранное архитектурное решение для E05, ещё не runtime implementation.
Проверенная база: `79eaf895a6d5f1c82d91ee5250f9035396197952` после E02 #206 и E03 #207.
Цель: большой PDF заканчивает обработку без открытой вкладки. Не менять OCR model/prompt, Legal Core или AI-fill semantics.

## Наблюдаемые факты

- `public.document_ocr_jobs` уже единственный durable ledger: один unique `document_id`, checkpoint, bounded lease, status, invocation count. Таблица/RPC service-role-only; это не автономный исполнитель.
- `kati_claim_document_ocr_job` сериализует claim по документу и выдаёт token; `kati_persist_document_ocr_checkpoint` атомарно сохраняет checkpoint и document state, отвергая stale/expired token.
- `page-index-plan.ts`: 6 страниц на unit, 3 concurrent units, одна wave на invocation, 3 попытки на failed unit. Тест: 600 страниц → 100 units → 34 invocations при успехе. Targeted planner/admission/lease tests: 15 passed, 0 failed.
- Production `extract-document-text` v111 содержит этот bounded-wave contract. Это source verification, не приёмка реального 601+ PDF.
- `intake-form.tsx` запускает extraction из React effect/retry. Открытый #203 расширяет клиентское continuation; закрытая вкладка по-прежнему не исполняет очередь.
- На проверенной базе до OCR privacy fix обнаружен отдельный blocker: `extractWithGeminiFallback` читает raw error body провайдера в `errorText`, пишет его в console и `debug.error`; archive mode может сохранять/возвращать debug. Arbitrary exception messages также попадают в OCR failure paths. Не увеличивать автономные вызовы до metadata-only canary fix. E01 #204 устранил конкретный Analyzer leak, но не доказывает безопасность этого OCR пути.

## Решение: один scheduler, один bounded worker, существующий ledger

Выбран control plane: Supabase Cron (`pg_cron` + `pg_net`) периодически будит одну Edge Function `dispatch-document-ocr`. Она обрабатывает максимум один документ / одну wave за invocation. Между тиками истина остаётся в `document_ocr_jobs`; потерянный HTTP wake-up восстанавливается следующим тиком. Не добавлять вторую jobs/queue table и не делать self-invocation бесконечным циклом.

UI выполняет authorized enqueue/status/retry decision. Периодический dispatcher обеспечивает liveness независимо от браузера. Длительный OCR не выполняется в транзакции Postgres или в браузере. Ручной вход и worker используют один shared bounded-wave processor и общий claim/persist contract; worker не должен повторно claim уже выданный token через HTTP вызов старого endpoint.

Предлагаемая начальная политика: scheduler раз в минуту, один active document глобально, до трёх OCR requests внутри его wave. Это deployment policy для дальнейшей проверки лимитов/latency/cost, а не уже включённое расписание. Пока очередь пуста, нет OCR/provider calls. Cron wake-up имеет собственный небольшой расход, поэтому включение/платный Preview требуют отдельного конкретного согласования.

## Ledger и fencing

1. Enqueue после завершённого upload проверяет существующий admin/matter/session access и immutable document/source fingerprint. Request с произвольным чужим `document_id` не допускается. Повторный enqueue не сбрасывает completed checkpoint или ручное решение.
2. Добавить service-only claim-next RPC над той же таблицей: deterministic ordering, `FOR UPDATE SKIP LOCKED`, только queued/due или expired running. Под коротким transaction-scoped dispatch lock проверить глобальный active-lease cap и атомарно выдать fenced token. Lock не держать во время сети. Обычный legacy claim тоже должен соблюдать общий cap до включения смешанного режима.
3. Поля due/backoff, consecutive no-progress и source fingerprint добавлять к этому ledger только отдельной migration после catalog inspection. Active lease остаётся единственным основанием записи. Запрещены чтение OCR checkpoint без authorization и выдача lease tokens клиенту.
4. Перед каждым provider attempt атомарно записывать attempt reservation/checkpoint в той же строке с token check. Иначе crash между provider call и итоговым persist позволяет бесконечно сбрасывать число попыток. Восстановление unresolved reservation после lease expiry расходует уже зарезервированную попытку; completed units не повторяются.
5. One wave: загрузить тот же storage object, проверить fingerprint, выполнить только выбранные incomplete units. Перед/после внешней работы проверить kill switch/lease. Mismatch → fail closed/manual review, без перезаписи старого результата и смешивания редакций файла.
6. Fenced persist сохраняет page-order assembly, progress и document state одной транзакцией. Partial → queued с next due; complete только при полном required corpus; exhausted unit/permanent missing object/повторяющийся no-progress → terminal `needs_manual_review`. Не оставлять failed download или crash в бесконечном retry.

Существующий RPC сохраняет только итог invocation; для checkpoint после каждого unit потребуется его отдельное расширение с сохранением running lease. Это ещё не реализовано. Stale worker не может обновить документ; внешний provider мог уже принять запрос до crash/lease expiry. Exactly-once billing не обещается: нужны bounded attempt reservations, idempotency key там, где provider его поддерживает, и метрики потенциально повторённой попытки.

## Authorization и kill switch

Scheduler обращается только к фиксированному URL текущего окружения с отдельным dispatcher token из Vault, без `document_id`, storage paths или содержимого документа в wake-up payload. Worker сначала проверяет token и default-off server switch, затем использует service_role внутри Edge для private RPC. Publishable key не является достаточной авторизацией worker.

Не хранить service-role secret в cron SQL/source/frontend. Не передавать клиенту dispatcher token или lease token; не логировать request headers. Секрет scheduler не расширяет права обычного extractor. Включать scheduler только после проверки фактической function auth configuration.

Kill switch по умолчанию off; при off запретить новые provider calls и claims, дать безопасно завершить уже принятый checkpoint. Отключение scheduler не удаляет ledger/checkpoints. Прежняя UI continuation может быть rollback только с теми же fencing/admission/retry gates и без конкурирующего автономного owner. Existing accepted AI-fill/manual answers не перезаписываются.

## Проверка до rollout

| Сценарий | Обязательное доказательство |
| --- | --- |
| Закрыть вкладку после первой wave | Fake scheduler/worker завершает весь corpus; UI calls больше нет |
| Два конкурентных dispatcher | Один active document при cap=1; по документу один valid token |
| Crash до/после provider / после checkpoint | Durable attempt cap; восстановление lease; completed pages без повторов/потерь |
| Stale token / object replacement | Все stale writes rejected; source mismatch не склеивает разные файлы |
| Timeout / 429 / empty unit / missing object | Bounded retries/backoff, permanent/исчерпанные случаи terminal, no-progress не бесконечен |
| Kill switch / invalid caller / чужой документ | Ноль provider calls и unauthorized reads/writes |
| Partial corpus / ручное исключение | AI-fill не допускается до 100% required либо явного actor/time/reason exclusion |
| Privacy canary | OCR/provider/exception text отсутствует в logs, debug, error metadata и diagnostics responses |

Сначала executable local integration tests с fake provider/clock и реальной локальной PostgreSQL: planner-only или source substring test не доказывает durable recovery. Затем E06 в одном явно временном Preview с representative PDF и cleanup. Live OCR/remote scheduler/Production E2E здесь не запускались; SourceUse, model/provider и prompt не меняются.

## Порядок реализации

OCR metadata-only diagnostics/canary реализован отдельным prerequisite change; successful OCR/model/prompt не меняются, ошибки получают safe codes. Local canary/full suite подтверждают source change, но не remote runtime acceptance. Следующий PR — shared wave processor с parity tests; ledger claim-next/attempt reservation migration с SQL concurrency/role tests; default-off dispatcher и authorized enqueue/status; UI передаёт ownership orchestration серверу. Каждый FIRST FAILURE — отдельный diff и HANDOFF. Remote enablement после reviewable implementation, не во время этого ADR.

Не требуется merge #203 для доказательства server ownership; его статус и полезные клиентские regression tests оценить отдельно, не закрывать PR автоматически. Новую платную test branch сейчас не создавать.

## Проверенные внешние контракты

- [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions): Cron + pg_net и Vault для credentials.
- [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net): async HTTP запускается после commit; request/response tables unlogged и не являются durable OCR ledger. API beta — actual signatures перепроверить при реализации.
- [Supabase changelog](https://supabase.com/changelog): просмотрен 29.10.2026; перед remote activation повторить проверку релевантных breaking changes и Edge resource limits. Документация платформы не означает, что cron/extensions/secrets уже настроены в проекте.
