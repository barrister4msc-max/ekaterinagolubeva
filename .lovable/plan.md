# KATI LAWYER — текущая очередь исполнения

Единственный действующий control plane: [MASTER_EXECUTION_STATE](../docs/execution/MASTER_EXECUTION_STATE.md).
Target: Master v5.6.2 от 03.10.2026; фактический статус подтверждают GitHub и runtime.

Проверенная база: `79ed884208b11e990551319e21ef7b0060e14fd4`, 29.10.2026.
E01 privacy (#204) и reconciliation (#205) merged/deployed; три Preview и Q0 удалены после проверенного backup. Production продолжает использовать `wiylzbdbjokignwvizxt`.

E02 #206 и E03 #207 merged: активная документация согласована, Law7 workflow исправлен, проверка всех 17 workflows и Quality Gate зелёные на PR #207. E04 перепроверен: 600 страниц → 34 bounded invocations, deployed extractor v111 содержит одну wave. Для E05 в #208 выбран [ADR-001](../docs/architecture/ADR-001-server-owned-ocr-continuation.md): один server dispatcher, существующий job ledger, default-off. OCR safe diagnostics #209 merged. Shared wave processor выделен и прошёл offline parity/regression tests (1016 total); merge/deploy этого изменения ещё не выполнены. Следующий code PR — ledger attempt reservations/claim-next с SQL concurrency/role tests, затем default-off worker. Факт merge/deploy проверять отдельно от локальных tests. PR #203 остаётся открытым и содержит клиентское продолжение, которое не закрывает E05.

Generator model shadow и смена provider/model не входят в эту очередь. До ingestion acceptance и Q0 baseline переход к ним заблокирован. Law7 пока empty/unavailable; BRAS/KAD manual-only. Удаление Preview не доказывает доступность всех источников.

Старый P0-C/Generator-shadow план сохранён как [historical](../docs/history/2026-08-p0c-generator-shadow-plan.md); его «следующий шаг» superseded.

E05 continuation: #210 remains Draft, GitHub Quality Gate passed. Next stacked change prepares dormant service-only unit reservation/settlement RPCs and executable local PostgreSQL tests. No runtime wiring or remote migration; legacy final persistence must become reservation-aware before any rollout. Current Production retry/crash behavior is not changed by this preparation.

29.10 deployment check: #210 merged, extractor v113 all files match. #211 still open and its RPCs absent in Production. The next stacked runtime change wires per-unit reservation/settlement and authoritative final persistence behind KATI_OCR_UNIT_RESERVATIONS_ENABLED (default off), fences legacy overwrites and preserves checkpoints on rollback. Do not activate before fingerprint/claim-next/concurrency/dispatcher prerequisites and E06 acceptance.

31.10 source admission: stacked after #212, actual downloaded-byte SHA-256 and Storage identity guard protect reserved OCR resumes and completed-job reads; unbound legacy work stops for review without reset. Default-off path unchanged. No remote migration/rollout. Next gate: claim-next/global cap/backoff/kill switch, concurrency, dispatcher/E06; external Storage immutability is still an activation prerequisite.

31.10 dispatch claims: stacked after #213, one transaction lock/cap for all claims; opted-in reserved jobs gain deterministic claim-next, due/backoff/no-progress recovery and a per-job stop gate. Defaults off; no scheduler/deploy. Real multi-session acceptance is a dedicated PostgreSQL 17 CI job; local PGlite is not concurrency evidence. Next: leased dispatcher/enqueue/UI ownership, then E06.

E05 #214: native PostgreSQL 17.6 concurrency CI run 41209012007 passed (20 connections, cap/skip-lock/order/backoff/recovery/stale/stop/role checks). Remains Draft; no merge/migration/deploy. Next reviewable gate is the leased dispatcher using the same processor, without a second claim.

31.10 leased dispatcher: new dispatch-document-ocr shares the existing leased PDF processor/provider with the interactive reserved path, uses a dedicated token and two default-off flags, claims once and executes one bounded wave. Offline closed-tab scenario finishes 601 pages across 34 waves. 1020 local tests/typecheck/build passed; current native CI gate pending. No scheduler/secret/deploy enabled. Next: authorized enqueue/status + UI ownership, then explicit Preview/E06 acceptance.

#215 dispatcher acceptance: GitHub run 41210540727 GREEN (PostgreSQL 17.6/20 sessions + pre-plan release + closed-tab dispatcher/privacy scenarios). Draft only; no deployed scheduler. Next: enqueue/status and UI ownership.

31.10 authorized enqueue/status + UI ownership: stacked after Draft #215 (`240befec`). New default-off document-ocr-control authenticates the real user, checks admin/session/document scope before Storage and again transactionally, preserves text-layer extraction without model IO, and enqueues scans in the existing pinned ledger. Server-owned UI polls status only, including on flag rollback; duplicate enqueue cannot reset a lease, progress, terminal state or stop flag. Worker rechecks actor/session scope before Storage/reserve/settle/finalization. Offline closed-tab/final-write-loss/access-revocation and helper routing tests pass (1023 total); native 20-session enqueue/roles/concurrency acceptance is pending this PR's CI. No merge/migration/deploy/flags/cron/live AI. Next: Storage immutability and separately authorized temporary Preview/E06 runtime acceptance.

#216 enqueue/status acceptance: native PostgreSQL 17.6/20-session run 41213262693 GREEN, including concurrent enqueue idempotency and scope recheck; six targeted runtime/privacy/routing tests passed. Code tree `25b40bb7bae7676f0defece8295575aca05ed000`. Draft remains unmerged/unapplied/undeployed. Storage immutability and temporary Preview/E06 runtime acceptance remain next.

31.10 Storage generation fence: stacked after #216 (`61a1d92b`). New server sources pin Storage object id/current version with SHA-256; origin downloads bypass stale cache, and private SQL rechecks/locks generation at enqueue/reserve/settle/finalization/status. Replacement stops for review without losing prior work. Read-only Production catalog review only; 1025 local tests/typechecks/build passed. Native PostgreSQL row-lock/lease-after-wait acceptance pending. [ADR-002](../docs/architecture/ADR-002-ocr-storage-generation.md) documents the contract. Next before E06: downstream AI-fill/Analysis/Generator source-generation admission. No remote rollout/configuration or paid Preview.

#217 Storage generation acceptance: native PostgreSQL 17.6/20-session run 41215064422 GREEN, including both object-writer/publication lock orders and expired lease after catalog wait; nine targeted tests passed. Code tree `0791f29b09d0d8a5f6e80a5eb5ebcfc35f09139d`. Draft only; no remote migration/deploy/enablement. Next: pinned-generation admission at downstream model consumption, then temporary Preview/E06.
