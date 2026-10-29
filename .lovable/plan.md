# KATI LAWYER — текущая очередь исполнения

Единственный действующий control plane: [MASTER_EXECUTION_STATE](../docs/execution/MASTER_EXECUTION_STATE.md).
Target: Master v5.6.2 от 03.10.2026; фактический статус подтверждают GitHub и runtime.

Проверенная база: `eea79a53d96a93c269eef39740c3c6448e43db74`, 29.10.2026.
E01 privacy (#204) и reconciliation (#205) merged/deployed; три Preview и Q0 удалены после проверенного backup. Production продолжает использовать `wiylzbdbjokignwvizxt`.

E02 #206 и E03 #207 merged: активная документация согласована, Law7 workflow исправлен, проверка всех 17 workflows и Quality Gate зелёные на PR #207. E04 перепроверен: 600 страниц → 34 bounded invocations, deployed extractor v111 содержит одну wave. Для E05 в #208 выбран [ADR-001](../docs/architecture/ADR-001-server-owned-ocr-continuation.md): один server dispatcher, существующий job ledger, default-off. OCR safe diagnostics/canary реализован отдельным изменением после ADR; 1009 local tests прошли. Следующий code PR — shared processor с parity tests, затем ledger/worker. Факт merge/deploy проверять отдельно от локальных tests. PR #203 остаётся открытым и содержит клиентское продолжение, которое не закрывает E05.

Generator model shadow и смена provider/model не входят в эту очередь. До ingestion acceptance и Q0 baseline переход к ним заблокирован. Law7 пока empty/unavailable; BRAS/KAD manual-only. Удаление Preview не доказывает доступность всех источников.

Старый P0-C/Generator-shadow план сохранён как [historical](../docs/history/2026-08-p0c-generator-shadow-plan.md); его «следующий шаг» superseded.
