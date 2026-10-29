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
