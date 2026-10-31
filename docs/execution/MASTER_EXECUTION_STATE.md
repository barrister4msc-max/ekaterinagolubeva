# KATI LAWYER — execution state

Проверено 29.10.2026. Это действующая очередь исполнения для `.lovable/plan.md` и HANDOFF.
Target: [Master v5.6.2 от 03.10.2026](https://chatgpt.com/library?file_id=libfile_588acdf14fc08191afaa9919cf1dbdd9&account_id=personal), execution annex E00–E16.
Master определяет целевое поведение; Git, CI, remote schema и runtime подтверждают факты. Ни design, ни merged PR сами по себе не доказывают runtime acceptance.

## Проверенная база

- `main` перед shared-wave change: `79ed884208b11e990551319e21ef7b0060e14fd4`, E02 #206, E03 #207, E05 ADR #208 и OCR privacy #209 merged. Runtime deploy #209 отдельно не проверен.
- [E03 PR Quality Gate](https://github.com/barrister4msc-max/ekaterinagolubeva/actions/runs/40885673610): Linux quality gate + Workflow validation success; 1008 tests, typecheck/build passed. #207 устранил top-level `runner.temp`; все 17 workflow проходят actionlint 1.7.12. Исторический [invalid Law7 run](https://github.com/barrister4msc-max/ekaterinagolubeva/actions/runs/40728412656) относится к прежней базе. Law7 остаётся dispatch-only; export/import не запускались. [Main post-merge CI](https://github.com/barrister4msc-max/ekaterinagolubeva/actions/runs/40885898058): обе jobs success; проверено отдельно от PR.
- PR #202 merged (`033ba12a013eb5a5d7213ee133b46c9c067dba15`); PR #203 открыт на `a73509cde73cd425f99b084b6875776209b2190a`. Клиентское продолжение #203 не является server worker.
- Production `wiylzbdbjokignwvizxt`: healthy; 78 migrations; последняя `20261028163542_reconcile_canonical_shadow_tables`. E01 #204 deployed/source-verified; #205 applied/catalog-verified. Full authenticated inference E2E не выполнялся.
- Три Supabase Preview и отдельный Q0 удалены после backup и dependency audit; повторный inventory содержит только Production/main. Автоматическое создание Preview выключено, Production deploy из `main` включён. GitHub branches/PR #40/#157/#158 сохранены.
- До/после удаления проверены сайт, Auth settings и public site settings (HTTP 200), 32 deployed function bundles, рабочий frontend/backend reference и сохранность данных. Это ограниченный smoke, не E07.
- Backup: [retirement record](../database/2026-10-28-test-environment-retirement.md). Не создавать платные idle environments повторно; временный Preview нужен только для конкретной приёмки с последующим cleanup.

## Источники: наличие адаптера не равно доступности и юридическому допуску

| Контур | Проверенный факт | Что ещё не доказано |
| --- | --- | --- |
| Internal KB / existing repository path | Analyzer использует `buildResearchPlan` / `runAllRepositories` | Полнота, актуальность и substantive admission всего корпуса |
| Law7 | RPC/consumer есть; remote 29.10: 0 codes, 0 article_versions, available=false | Пользовательский retrieval; test backup 8 codes / 2866 versions не активирован и не verified |
| BRAS/KAD official | `manual_import_only` по transport policy | Автоматический официальный transport |
| ФНС / Минфин / ВС | В capability registry есть blocked/degraded маршруты; это descriptive registry | Работа всех live transports и качество coverage |
| ResearchSourcePlan | Pure builder и tests существуют, runtime consumer отсутствует | E09 shadow wiring/parity, затем E10R rollout |

Удаление тестовых БД не убрало действующий production source: подключений к ним в проверенных runtime/config/data references не было. Оно также не завершает source integration. Нельзя копировать непроверенные Law7 данные в Production или перенаправлять PoC secrets на Production ради экономии.

## Единая очередь

| Этап | Статус и следующий gate |
| --- | --- |
| E00 Truth | Snapshot обновлён для этой базы; повторять перед изменениями |
| E01 Privacy | #204 merged/deployed; canary/regression, 1008 tests на проверенной базе |
| E02 Documentation | #206 merged; historical планы сохранены, обновлять при каждом HANDOFF |
| E03 CI | #207 merged; path fix и workflow validation прошли; без import/secrets/data/settings |
| E04 Bounded OCR wave | #202 merged; 15 planner/admission/lease tests прошли; deployed v111 содержит одну wave; E06 runtime acceptance ещё не выполнен |
| E05 Server-owned OCR | [ADR-001](../architecture/ADR-001-server-owned-ocr-continuation.md) выбран; runtime не реализован. OCR diagnostics #209 merged; shared wave выделен и локально проверен (1016 tests); следующий gate — ledger reservations/claim-next, затем default-off dispatcher |
| E06 Large-PDF Preview | После E04/E05; representative 601+ PDF, closed-tab recovery, exact count/order/hash, no loss/duplication |
| E07 Production vertical E2E | После E06; отдельный synthetic authenticated run и явное разрешение Production actions |
| E08 Q0 baseline | Не закрыт: capture + независимая lawyer annotation; сохранённый fixture/PDF не доказывает качество |
| E09 ResearchSourcePlan | Fail-closed shadow, executable=false; parity без изменения calls/ranking/model input |
| E10 Verified source pack | Один flagship scenario, independent content/temporal/substantive admission |
| E10K Tax KB | После E10; сначала dry-run canonical identities/duplicates/coverage, без UPDATE/DELETE |
| E10L Law7 | После E10K dry-run: export-only → временный PoC → отдельно разрешённый Production import; retrieval_only до verification bridge |
| E10R Hybrid research | R0–R6 по Master; один Source Registry/SourceUse, consumers только после parity и acceptance |
| E11 Canonical Matter Facts | После sources; ADR/contract → schema → shadow parity → отдельный consumer switch |
| E12 Argumentation | Обязательный typed Fact/Evidence/Norm/Analysis/Conclusion contract; один FIRST FAILURE на PR |
| E13 DocumentPlan/ActionPlan | Pure builders → persistence → UI; exact run/snapshot lineage, unknown deadlines остаются unknown |
| E14 Template consumers | Facts/analysis/plan/immutable SourceUse snapshot; Reviewer проверяет тот же lineage |
| E15 Humanization | Только после E14 runtime acceptance; invariant tests, shadow, legal diff, lawyer opt-in |
| E16 Release | Одна release matrix/SHA с миграциями, function/frontend versions и runtime evidence; затем cleanup |

E03 также закрывает workflow-syntax часть L1 из E10L, но не разрешает ранний export/import. Generator model shadow, benchmark и provider switch не являются следующим шагом этой очереди.

## Статусы и stop-rules

`implemented` — код есть; `tested` — конкретные проверки прошли; `merged` — код в main; `migration-applied` — подтверждено remote history/catalog; `edge-deployed` — проверена версия/исходник функции; `frontend-published` — проверен артефакт на рабочем URL; `runtime-verified` — выполнен соответствующий сценарий с evidence. Не подменять один статус другим.

Один этап / FIRST FAILURE — один reviewable change. E02 не меняет code/workflow/schema/product behavior; E03 не запускает источники. Не менять model/provider/prompt и не выполнять paid shadow до privacy/ingestion/Q0 gates. Не использовать raw OCR/model/legal text в diagnostics. Не повышать источник до verified по домену, названию адаптера или факту импорта. Не создавать второй Legal Core, job ledger или source registry без доказанного ADR.

Перед remote scheduler/secret setup, платным Preview, live provider calls и Production import/switch/E2E требуется конкретное разрешение на соответствующее действие; текущее продолжение работ не доказывает source readiness. Settings GitHub branch protection здесь не изменяются.

Read-only GitHub snapshot: branch endpoint сообщает `protected=false`, enforcement `off`, contexts/checks пусты; rulesets endpoint возвращает `[]`. Детальный protection endpoint недоступен интеграции (403), поэтому его настройки не реконструированы. CI зелёный не означает, что required checks принудительно защищают main.

## HANDOFF каждого следующего этапа

Указать base/head SHA и PR, FIRST FAILURE, минимальный diff, tests evidence, отдельные implemented/tested/merged/applied/deployed/published/runtime статусы, что не выполнялось, остаточный риск и следующий gate. Старые roadmap, audit records и сохранённый [P0-C plan](../history/2026-08-p0c-generator-shadow-plan.md) объясняют происхождение решений, но не управляют очередью.

## HANDOFF E02/E03 → E05 design

E02 #206 и E03 #207 merged; workflow-only diff E03 не меняет product/data. E04 source/deploy contract подтверждён отдельно от настоящего большого PDF. ADR-001 выбирает один Cron/Edge dispatcher и существующий ledger; scheduler, secrets, migration и worker пока не настроены. Новый FIRST FAILURE для следующего code PR: OCR raw provider error body/debug и arbitrary exception diagnostics в `extract-document-text`; нужен metadata-only canary fix перед увеличением автономных вызовов. Это не отменяет подтверждённый узкий E01 Analyzer fix, но запрещает общий claim «весь OCR privacy gate закрыт».

## OCR privacy prerequisite после ADR

Raw provider error body заменён кодом, HTTP status и размером; arbitrary exceptions/DB messages заменены фиксированными кодами, file name/storage path и provider response keys исключены из diagnostics. MIME/finish reason проходят allowlist. Success OCR content, model/prompt, TIFF unsupported handling, bounded retries/page plan и auth boundary сохранены. Actual handler canary с fake SDK/DB/provider проверяет logs, response debug, persisted error/checkpoint, provider/parse exceptions и success text preservation; та же canary проверка падает на прежнем source. Local full suite: 1009 passed, 0 failed. Merge, deployed source и live acceptance остаются отдельными фактами; исторические журналы/metadata этим source change не очищались. Следующий этап E05 — shared bounded-wave processor с parity tests; scheduler и worker ещё не включены.


## HANDOFF E05 — shared bounded wave

Base: `79ed884208b11e990551319e21ef7b0060e14fd4`. FIRST FAILURE: bounded PDF wave находилась внутри HTTP handler и не могла использоваться dispatcher без второго HTTP claim или дублирования OCR. `pdf-ocr-wave.ts` теперь содержит тот же bounded processor с явными PDF/provider dependencies; legacy authorized endpoint вызывает его после прежнего claim и перед прежним fenced persist. Один deadline 105 s, 6 страниц/unit, максимум 3 units/wave, те же retry/status/text semantics. Модель, prompt, доступ и persistence не менялись.

Локально: 1016 tests passed; differential parity с frozen #209 wave на 1/18/54/601 страницах для success/partial/exhaustion. Дополнительно проверены out-of-order completion, retry только failed unit, byte subarray boundaries, deadline, no mutation/no provider on PDF failure. Offline 601-page adapter scenario — не E06 на настоящем PDF. Полный shared-module strict TypeScript, project typecheck/build — отдельные checks.

Implemented/tested; ещё не merged/deployed/runtime-verified. Этот PR не добавляет scheduler, claim-next, attempt reservations, fingerprint guard или автономное продолжение. Caller по-прежнему владеет authorization/lease/persistence. Следующий FIRST FAILURE: текущие attempts сохраняются только в конце wave и могут теряться при crash после provider call; нужна отдельная ledger migration с SQL role/concurrency/recovery tests до worker enablement. Новые платные окружения и live AI не запускались.


## HANDOFF E05 — dormant unit reservations (stacked after #210)

Prerequisite: shared wave [PR #210](https://github.com/barrister4msc-max/ekaterinagolubeva/pull/210), head `044dad096c80dbc7dbedc1da50dc72aaa6a0a848`, tree `7d147e4a8a01c5f7b6bb35a74a0430f2593f9a16`. PR #210 Quality Gate [40898177492](https://github.com/barrister4msc-max/ekaterinagolubeva/actions/runs/40898177492) success, both Linux and workflow validation; Draft, no merge/deploy. Local parent `97e0925` has exactly that tested remote tree.

FIRST FAILURE: attempts were incremented only at end-of-wave persistence; a crash after provider IO could reset retry budget. Additive migration introduces service-only `kati_reserve_document_ocr_unit` / `kati_settle_document_ocr_unit` over the existing ledger, no new queue/table. Reservation increments the canonical page unit counter before external IO and records an unresolved attempt. Same-unit re-reservation under the same lease is denied, including after a lost RPC reply; a fresh lease consumes the next attempt, capped at three. Settlement is fenced by job/document/current lease/reservation, preserves other units, does not increment twice and does not publish document state. Wall-clock lease is checked after taking the row lock. Legacy metadata can seed the first checkpoint; malformed or changed page plans fail closed. Errors use fixed codes.

These RPCs use SECURITY INVOKER, empty search_path and service_role-only EXECUTE; no wider grants or changes to old claim/persist functions. Pinned development-only PGlite 0.3.14 runs executable migration/role/recovery/Unicode/text-preservation assertions in the full test suite. This is single-session PostgreSQL evidence, NOT multi-session concurrency, remote migration or provider acceptance. Existing document state and active ledger rows are unchanged by applying this migration locally.

Validation: 1017 tests passed, 0 failed; project TypeScript and production build passed. SQL regression rerun after final validation guard passed. Implemented/tested locally only. This additive contract is DORMANT: no call from the extractor/worker, no production migration, scheduler, secret or live provider call. Legacy persistence can still overwrite a whole checkpoint; the RPCs MUST NOT be enabled alongside legacy final persistence until reservation-aware fencing/persist and shared-processor hooks are reviewed together. Therefore this PR does not claim the current production crash gap is fixed.

Next FIRST FAILURE: wire reserve-before-provider and settle-after-unit into the shared wave, merging final persistence from authoritative server state, with crash/expired-lease tests. Then claim-next/global cap/backoff/fingerprint and multi-session concurrency acceptance, default-off dispatcher/UI ownership, E06. No automatic merge/deploy of #210 or this stacked change.


## Deployment check and HANDOFF E05 — reservation runtime (29.10.2026)

`main` verified at `b657fa31600ec019e2b4d315d5e9a42b0d5dd82e` (#210 merged). Production extractor ACTIVE v113, verify_jwt=false as before with handler authorization; all five deployed files exactly match #210. Production has no reserve/settle RPCs and latest migration remains `20261028163542`; #211 remains open. The existing job ledger has 4 completed / 1 needs_manual_review / 1 queued; no jobs were processed by this check. Advisors still report separate existing platform/function-grant warnings; this is not a clean whole-project security audit ([function-grant advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)). New changes were not deployed.

FIRST FAILURE: #211 RPCs had no caller and legacy final persistence could overwrite reserved units. New default-off `KATI_OCR_UNIT_RESERVATIONS_ENABLED` path claims the reserved_v1 protocol, reserves before provider IO, settles each unit, and finishes solely from row-locked DB checkpoint. Finish accepts actual PDF page count, never caller checkpoint/text/counters; page-count mismatch is terminal rather than completing the wrong plan. Legacy completed unit metadata can seed the reserved claim, preserving compatibility. Legacy claim/persist are fenced off once a job is promoted to reserved_v1; disabling the flag returns explicit `ocr_reservations_required`, leaving the checkpoint intact. No new job ledger or Legal Core.

New migration is forward-only, not applied remotely; new RPCs are SECURITY INVOKER with empty search_path and service-only EXECUTE. The shared wave keeps its legacy no-hooks behavior and frozen differential parity. Executable offline integration uses the actual HTTP handler + shared processor + all SQL migrations in disposable PostgreSQL, with fake SDK/Storage/auth/provider. Checks cover reserve-before-provider, unauthorized/missing-RPC zero calls, partial/retry ordering, interrupted final persistence, per-unit recovery, stale finish rejection, legacy overwrite denial, flag rollback, corrupt-PDF budget and diagnostics canary. Single-session PostgreSQL does not prove multi-session concurrency or real-PDF E06 acceptance.

Prerequisite #211 (head `9f2fb78bf022768e463c88aa46ffd6d22c751ad7`, tree `5c3f0e9e52c47b05369a74b5aa2cb5f1275ecedc`). This branch is a stacked reviewable change, not rollout authorization. Default-off flag, no scheduler, no live provider requests, no new paid environment, no Production migration/secret/AI change.

Next gates remain source fingerprint/global cap/claim-next/backoff/kill switch, multi-session concurrency and default-off dispatcher/UI ownership. Same-page-count Storage replacement is not detected by page-count validation: fingerprint admission is required before remote activation. Do not enable this flag or deploy/apply migrations as part of local implementation. E05 autonomous continuation and E06 are not closed.

Local validation for this change: 1018 tests passed, 0 failed; project TypeScript, strict shared-module TypeScript and production build passed. Enabled-mode assertions include three-attempt exhaustion, complete legacy checkpoint seeding with zero provider calls, and corrupt-PDF recovery becoming terminal after three invocations. Final full-suite rerun covers the pre-provider deadline fence. #211 retargeted to main after #210 merged; its Quality Gate has not yet appeared, so do not infer remote CI success from local tests.


## HANDOFF E05 — source fingerprint (31.10.2026)

PR #211 and #212 are still open/unmerged. This stacked change is based on #212 head `b13071b50516e6ae6d967f0f2878b63b1dbe3671`, tree `5931b386b67b02c417dfb79046cf4744e393701d` (local equivalent `6f16868`). No source activation or remote database writes.

FIRST FAILURE: page-count checking cannot distinguish a same-size/same-page-count replacement, and an existing durable job could be bypassed through a newly usable PDF text layer. Enabled-mode extractor now checks whether durable work exists, calculates SHA-256 over the actual downloaded bytes, and binds/checks `{version,bucket,storage_path,sha256,byte_length}` under the current fenced job lease before using cached OCR/provider IO. Completed jobs also validate their source before returning completed. Fresh PDFs with a usable text layer retain the existing direct extraction path when no durable job exists. Default-off behavior is unchanged.

`kati_guard_reserved_ocr_source` is SECURITY INVOKER, empty search_path, service-only EXECUTE. It locks the existing job then document, matching the established lock order. Reserve/settle/finalize recheck the pinned document pointer under the lease; a source mismatch atomically moves the job/document admission to needs_manual_review, clears the lease, and preserves checkpoint, OCR text and other metadata. No new registry/queue. Invalid or stale calls do not authorize provider IO.

A first hash cannot prove an old checkpoint/text came from these bytes. Unbound prior work now stops with `ocr_source_unbound_checkpoint`, preserving it for explicit review instead of adopting/resetting it automatically. This supersedes #212's unverified legacy-cache auto-adoption in the new reserved mode only; legacy default-off behavior remains unchanged. No bulk migration/reset is included.

Executable integration covers actual handler + shared wave + PostgreSQL migrations with fake transport: same-length/hash replacement with the same page count, already-completed job validation, pointer replacement before reservation and before final publication, old text/checkpoint preservation, unbound legacy work, role isolation, retry/corrupt-file recovery and privacy canary. A known SHA-256 vector validates the byte digest. This is single-session offline evidence, not multi-session or E06 acceptance.

Limit: same-path external Storage overwrite DURING a single downloaded-buffer invocation is detected on the next download; pinning proves the bytes processed, not that Storage can never be overwritten externally. Existing normal TUS upload uses unique paths and x-upsert=false. Enforced object-generation/Storage immutability still needs review before activation. Source contents/paths/hashes are not added to logs or client diagnostics.

Next FIRST FAILURE: global claim-next/cap/backoff/kill-switch contract and multi-session concurrency tests, then default-off dispatcher/UI ownership and E06. Do not enable KATI_OCR_UNIT_RESERVATIONS_ENABLED or apply migrations/deploy as part of this local source admission change.

Validation: 1019 tests passed, 0 failed; project TypeScript, strict fingerprint-module TypeScript and production build passed. Final SQL guard regression rerun passed after adding a second wall-clock lease check following the document-row lock. Changelog reviewed 31.10.2026: TLS CBC deprecation announced for 10.11+ does not change the Storage/RPC signatures used here; no platform configuration was changed.


## HANDOFF E05 — dispatch claims/cap/backoff (31.10.2026)

Prerequisite #213 head `dfa33efc891908ddfed369041c024cd2f90485c2`, tree `7479df3cf40fc3f10a1014f0306d62a16206e1c5` (local `c406abc`). #211/#212/#213 remain open/unmerged. No Production or external provider action.

FIRST FAILURE: concurrent document-specific callers and a future dispatcher had no common global lease cap or due/backoff gate. Additive fields in the existing document_ocr_jobs ledger: dispatch_enabled default false, next_attempt_at, consecutive_no_progress, last_progress_pages. All claim entry points take the same short transaction advisory lock; the cap is one valid active document lease across legacy and reserved paths. claim-next selects only opted-in reserved_v1 jobs, deterministically by due/created/id with FOR UPDATE SKIP LOCKED. No network IO in the transaction and no second queue.

Reserved claims respect due time and the per-job server switch. Expired-lease recovery preserves unit attempts/checkpoint, records actual progress or a stalled recovery, uses bounded 15/30/.../300-second backoff, and becomes needs_manual_review after three no-progress recoveries. Finalization resets stalls on indexed-page progress and otherwise applies the same bounded delay/terminal gate. No sleeps or client-controlled counters. Source admission and stale lease fencing remain prerequisites.

Turning dispatch_enabled off blocks reserved claims/new unit reservations; already accepted settlements/finalization remain allowed. Legacy unpromoted interactive extraction keeps its previous semantics except the common active-lease cap; this field is NOT a promise to cancel all legacy interactive calls or already accepted provider IO. New jobs default off until an explicitly authorized enqueue/rollout. Scheduler/worker remain unimplemented.

Tests: actual handler/shared wave/PostgreSQL integration updated for explicit test opt-in and test-controlled due time; no remote flags. A dedicated OCR dispatch SQL workflow uses ephemeral PostgreSQL 17.6 and pg 8.23.1 (dev-only/pinned) for 20 actual connections: mixed legacy/reserved/claim-next race, SKIP LOCKED, deterministic ordering, advisory wait, expired lease/backoff, stale settlement, no-progress terminal, stop/new-call gate and accepted result completion. This workflow runs on relevant PRs including stacked PRs. Local native PostgreSQL startup is unavailable because this sandbox denies uid/group changes; local PGlite evidence is single-session only, so concurrency acceptance must come from that CI job, not inference.

No remote migration, merge, deploy, secret, scheduler, live AI or paid Supabase environment. Next FIRST FAILURE after queue acceptance: default-off dispatcher that uses an already claimed lease/shared processor without claiming it again; authorized enqueue/status/UI ownership and E06 still follow. Source/object immutability and remote runtime acceptance are not waived.

Local checks: 1019 tests passed, TypeScript/build/actionlint passed. Native multi-session PostgreSQL check is pending the dedicated GitHub workflow; do not label concurrency runtime-verified until that run completes successfully.

Concurrency acceptance completed: [OCR dispatch SQL run 41209012007](https://github.com/barrister4msc-max/ekaterinagolubeva/actions/runs/41209012007), job 124559879251, head `8435128f64584417ea896fc1ddbeb20aada2a88c`, PostgreSQL `17.6 (Debian 17.6-2.pgdg13+1)`. GREEN with 20 native concurrent connections: global_cap, skip_locked, ordering, backoff, expired_recovery, terminal_no_progress, stale_fence, kill_switch, role_isolation all passed. Implemented/tested in Draft [PR #214](https://github.com/barrister4msc-max/ekaterinagolubeva/pull/214); not merged/applied/deployed/Production-runtime-verified. The preceding pending entry describes pre-CI state only. No dispatcher was installed or run.
