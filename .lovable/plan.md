# KATI LAWYER — текущая очередь исполнения

Единственный действующий control plane: [MASTER_EXECUTION_STATE](../docs/execution/MASTER_EXECUTION_STATE.md).
Target: Master v5.6.2 от 03.10.2026; фактический статус подтверждают GitHub и runtime.

Проверенная база: `fea10d4bb5682b2f6ff861f9cbc357cb296a3130`, 29.10.2026.
E01 privacy (#204) и reconciliation (#205) merged/deployed; три Preview и Q0 удалены после проверенного backup. Production продолжает использовать `wiylzbdbjokignwvizxt`.

Текущий этап E02: documentation alignment. Следующий — E03: исправить invalid Law7 workflow и добавить проверку всех workflow. Затем перепроверить уже merged E04 и перейти к ADR для E05 server-owned OCR. PR #203 остаётся открытым и содержит клиентское продолжение, которое не закрывает E05.

Generator model shadow и смена provider/model не входят в эту очередь. До ingestion acceptance и Q0 baseline переход к ним заблокирован. Law7 пока empty/unavailable; BRAS/KAD manual-only. Удаление Preview не доказывает доступность всех источников.

Старый P0-C/Generator-shadow план сохранён как [historical](../docs/history/2026-08-p0c-generator-shadow-plan.md); его «следующий шаг» superseded.
