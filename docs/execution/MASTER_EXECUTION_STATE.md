# KATI LAWYER — execution state

Проверено 29.10.2026. Это действующая очередь исполнения для `.lovable/plan.md` и HANDOFF.
Target: [Master v5.6.2 от 03.10.2026](https://chatgpt.com/library?file_id=libfile_588acdf14fc08191afaa9919cf1dbdd9&account_id=personal), execution annex E00–E16.
Master определяет целевое поведение; Git, CI, remote schema и runtime подтверждают факты. Ни design, ни merged PR сами по себе не доказывают runtime acceptance.

## Проверенная база

- `main`: `fea10d4bb5682b2f6ff861f9cbc357cb296a3130`, PR #205 merged.
- [Quality Gate main](https://github.com/barrister4msc-max/ekaterinagolubeva/actions/runs/40728414717): success. Отдельный [Law7 workflow](https://github.com/barrister4msc-max/ekaterinagolubeva/actions/runs/40728412656): failure до jobs из-за недопустимого top-level `runner.temp`. Это FIRST FAILURE E03; общий CI пока нельзя называть полностью зелёным.
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
| E02 Documentation | Этот documentation-only этап; сохранять исторические решения, обновлять при каждом HANDOFF |
| E03 CI | Следующий code change: только path/expression fix Law7 + validation всех workflows; без import/secrets/data |
| E04 Bounded OCR wave | #202 уже merged; перепроверить against current main и отделить tests/deploy от runtime acceptance |
| E05 Server-owned OCR | Не закрыт: сначала ADR одного dispatcher и существующего job ledger; fenced lease, recovery, idempotency, retry/kill switch |
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
