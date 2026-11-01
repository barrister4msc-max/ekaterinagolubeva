# E06 Preview SQL checkpoint — 01.11.2026

E06 remains **open**. The managed PostgreSQL schema and negative-access checks passed; candidate Edge deployment was rejected by automatic approval review. No candidate Edge runtime, authenticated user flow, Storage mutation/cache behavior, closed-tab scheduler or PDF/model scenario was accepted.

## Candidate and lifetime

- Draft [#219](https://github.com/barrister4msc-max/ekaterinagolubeva/pull/219), code commit `e43dfd1d077dba86a7e731d504eb993e7e5f5fa1`, tree `06ab5405e44e0ac7c1445574bb04e7c4eb3c80ef`.
- Existing [CI 41327213723](https://github.com/barrister4msc-max/ekaterinagolubeva/actions/runs/41327213723): six actual Deno entrypoints and PostgreSQL concurrency/39 targeted tests green; local full suite 1033 passed. Those results belong to the code candidate, before this documentation update.
- One temporary branch `e06-ocr-20261101-temporary`, ref `ojdwkplmdxbzywhpfkdb`, branch id `07c31e8d-cba3-4830-b4b3-097d8657f701`, created at 16:48:50 UTC through Supabase's cost-confirmation flow.
- Deleted after evidence capture. Inventory at 17:00:01 UTC contains only the default Production branch. No idle Preview was retained pending deployment permission; this is deletion evidence, not a final invoice.
- No Production migration, function deployment, configuration, data write or Git merge was performed.

Machine-readable catalog, probe results, source hashes, advisor counts and deletion evidence: [E06_20261101_PREVIEW_SQL.json](evidence/E06_20261101_PREVIEW_SQL.json).

## Fresh-environment bootstrap findings

The platform's automatic historical replay stopped after five legacy migrations, before creating documents/intake/OCR tables. This reproduces the [previously documented legacy failure](../database/KATI_LAWYER_migration_activation_verification_20260815.md). Auth users and Storage objects were both zero.

Only that disposable public schema was reset and the repository replacement baseline applied. Its SHA-256 exactly matched the prior verified baseline: `119474aec2489f0b83c2071eedc80b1b2cbbe69c2469a29aaf1677a28e356e47`.

Subsequent dependency replay exposed two additional prerequisites:

1. Historical grants assume `kati_internal_kb_writer` exists. Created that role in the Preview with NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT and NOBYPASSRLS; no password or membership.
2. `20260914160000_guarded_user_supplied_canonical_identity` requires five existing Production source groups / 171 chunks. The empty Preview contains none. Its schema index was retained; its Production-only data repair was omitted after asserting the knowledge-chunk table empty. The original migration was not marked applied, and no Production source data was copied.

Failed dependency batches rolled back. The successful dependency receipt is `e06_empty_preview_schema_dependencies`; all eight unchanged E05 migration sources were then applied together in order under `e06_e05_ocr_candidate_chain`. Individual source hashes and the data-repair exception are preserved in the evidence file. This manual schema reconstruction does **not** establish a green automatic migration pipeline or full Production-data parity. Original applied migration files/history in Production were untouched.

## Managed PostgreSQL results

| Gate | Observed result |
| --- | --- |
| E05 migration chain | All eight sources applied in order |
| Existing OCR ledger | RLS enabled, no new ledger |
| OCR RPC ACLs | 14 functions: anon/authenticated EXECUTE false, service_role true |
| Actual denied RPC executions | Seven representative private RPCs × two roles = 14 expected permission denials |
| Empty claim | service_role claim-next returned null |
| Invalid scope/control/consumer | Denied |
| Public bucket / missing private object | Generation lookup returned null |
| Storage catalog | Current id/version/archive/delete-marker fields exist; source buckets private |
| Final test data | Zero Auth users, documents, OCR jobs and Storage objects |

The first ad-hoc scope assertion incorrectly expected null from a boolean helper; it was corrected to require false and the full probe passed. This was a probe expectation error, not a source fix.

Security advisors reported 15 fail-closed RLS-without-policy notices, vector in public, and four authenticated SECURITY DEFINER helpers inherited from the baseline. These are not a clean-advisor claim. [RLS explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [extension remediation](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [RPC remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Performance findings are recorded without unrelated schema changes: 52 unindexed foreign keys, 127 RLS initplan notices, 247 unused indexes in the empty environment, 26 multiple-policy findings, nine duplicate indexes and one Auth connection-allocation notice. Remediation links are in the evidence.

## Deployment stop and next gate

The first candidate deployment, extract-document-text with the repository's existing `verify_jwt=false` setting, was rejected before execution. Automatic review stated that the user-authored Draft-only/no-deploy restriction had not clearly been overridden for immediately publishing an Edge endpoint with gateway JWT verification disabled. No alternate deployment path or relaxed authentication was attempted. Successful candidate deployments: zero.

The six-function dependency packages are prepared from the exact candidate tree. Gateway JWT verification is disabled in the established configuration because ordinary user JWTs are validated inside the handlers, while dispatch uses its dedicated token. Approval must cover these deployment semantics explicitly; retain all in-handler checks.

A function-list response requested for the Preview returned parent-linked metadata. It was excluded as evidence of the Preview's deployed candidate. Before a later deployment, independently verify the destination and actual hosted version/source; do not treat parent inventory or a 404 for a not-yet-existing dispatcher as runtime acceptance.

No provider credentials, backend flags or scheduler were configured by this run. No temporary Auth actors or synthetic objects were created, and no live inference was invoked. Any later paid Preview, temporary Auth actors, Storage mutation tests, secret/flag/scheduler setup and provider calls must follow their concrete authorized scope. Do not reopen completed packets with provider access until AI-fill is authorized. Resume the [acceptance runbook](E06_OCR_PREVIEW_ACCEPTANCE.md) after explicit Preview-only deployment approval.
