# E06 — temporary Preview acceptance for server-owned OCR

Prepared 01.11.2026. This is a reviewable runbook, not authorization or evidence of a deployed runtime. No remote Supabase environment, migration, secret, scheduler or inference was created/run while preparing it.

## Candidate and scope

Use one reviewed candidate containing the stacked E05 changes through `feat/e05-ocr-consumer-admission`. Record the exact commit/tree before any remote action. Production remains excluded. At most one explicitly temporary Preview, with an agreed lifetime/spend ceiling and cleanup owner. Do not recreate the three removed Preview environments or Q0.

Required forward-only migrations, in order:

| Migration | Purpose |
| --- | --- |
| `20261029151613_e05_ocr_attempt_reservations.sql` | Durable unit reservation/settlement |
| `20261029190337_e05_reserved_ocr_runtime.sql` | Fenced authoritative finalization |
| `20261031134647_e05_ocr_source_fingerprint.sql` | Downloaded-byte SHA-256 |
| `20261031135820_e05_ocr_dispatch_claims.sql` | Shared claim cap/claim-next/recovery |
| `20261031141704_e05_ocr_dispatch_release.sql` | Bounded pre-plan failure release |
| `20261031144205_e05_ocr_enqueue_status.sql` | Actor/session enqueue and UI ownership |
| `20261031151327_e05_ocr_storage_generation.sql` | Current Storage object generation fence |
| `20261031154501_e05_ocr_consumer_admission.sql` | Per-attempt consumer source/representation admission |

Review/build these functions from the same candidate: extract-document-text, dispatch-document-ocr, document-ocr-control, document-intake-ai-fill, analyze-document-legal-position, generate-legal-document-v2. Confirm the existing reviewer endpoint/runtime before testing automatic review. Do not change models/prompts/provider selection as part of this acceptance.

## Preflight before enabling anything

1. Confirm Preview target/ref/domain, candidate tree, schema/function definitions/ACLs, private source buckets and current-object catalog fields/indexes. Run platform advisors against that target. No direct Storage DML or managed-schema alterations.
2. Run complete local/CI tests and project typecheck/build. Complete an actual Edge/Deno compile check separately: project TypeScript covers the frontend and strict checks for this change cover the new shared admission modules. A broad backend check previously exposed pre-existing ChallengeResult.execution_status omission and official-verification-resolver nullable-observation errors; do not mislabel that check green or waive its preflight review.
3. Verify actual user JWT/admin/session ownership, private RPC EXECUTE denial for anon/authenticated, wrong session/document rejection, CORS and dedicated dispatcher token rejection modes. Tokens stay in approved secret storage; never put real values in source, logs, request bodies or this report. A full second-user test requires an explicitly approved temporary Auth actor; the existing sole-user fixture is not evidence of a live multi-user test.
4. With inference disabled, use only approved synthetic Storage objects to prove real API upload/overwrite/delete/recreate behavior, catalog id/version changes, current/archived/delete-marker handling and origin cache bypass. A public bucket or missing version must not enter the new mode. No privileged catalog rewrite is an accepted mutation path.
5. Configure the existing backend switches and `VITE_KATI_SERVER_OCR_ENABLED` only on the approved Preview, initially off. A valid separate dispatcher token/provider configuration is required before enqueue. Do not enable Production or a second orchestration owner.

## Bounded runtime scenarios

Agree on the specific files, inference types and maximum attempts/cost before live calls. Start with a native-text PDF and small scan, then one representative large PDF. At six pages/unit, 601 pages produces 101 units/34 waves; each unit has at most three reserved attempts. This is a request-count bound, not a money estimate; use current provider pricing for an agreed budget. Do not begin the large-file run without that limit.

- Native text: same parser/quality gates, completed with zero OCR-model calls and no OCR job; generation checked before native-text publication and downstream consumption.
- Scan/large PDF: all uploads staged, one authorized enqueue, close the tab. The separately approved Cron/Vault/pg_net wakeup uses only a fixed dispatcher URL and empty body; no document id or file contents. Prove server-only completion, ordered assembly and no repeated completed units. Installing/enabling this scheduler is an explicit operational action; this runbook installs none.
- Recovery: interrupted final write, expired lease, missing/transient/corrupt object, 429/503/provider exhaustion, per-job stop and global flags off. Preserve accepted units, attempts and manual fields. 99% maximum until authoritative OCR finalization.
- Replacement: same path/size/page count, new generation with identical bytes, delete/recreate, mid-download/mid-model/pre-finalization replacement. Source changes stop for review without erasing previous text/checkpoints.
- Consumers: without any UI status refresh, the replaced source blocks AI-fill, facts/embedding/synthesis/challenge, generator and retries. Missing private RPC fails closed. Original/accepted-redacted text changes and late packet members invalidate the captured representation. A prior analysis snapshot cannot be reused for a new or removed source set.
- Privacy: synthetic canaries in document/provider/error bodies are absent from diagnostics. Record safe counts/status/hash evidence, not content, source paths, identities or tokens.

Reopening a completed packet may automatically start AI-fill. Approve that inference and its cost before reopening; an OCR-only authorization does not silently authorize AI-fill/analysis/generation/review. Exercise each stage under the agreed scope.

## Evidence, rollback and cleanup

Record candidate/tree, target, migration/function versions, flag/scheduler state, allowed file ids, unit/wave/attempt counts, completion/denial/recovery evidence and approved provider spend. A green offline/SQL CI run does not substitute for this report.

For rollback, disable Cron and the backend switches first; preserve ledger/checkpoints and block new claims/provider attempts. Server-owned UI continues status-only on frontend flag rollback. Do not roll back by resuming competing browser OCR. Existing consumer writes are separate operations with checks at their boundaries; this change does not add a transaction around all multi-table result writes or promise cancellation of already accepted external IO. Retain audit/run identity and review any partially persisted failed run rather than erasing prior/manual data.

After acceptance or failure, remove only recorded synthetic objects/cases/actors via supported APIs, remove temporary schedule/credentials as authorized, back up required evidence and delete the one temporary Preview. Confirm its deletion/cost stop. No Production cleanup or real-case deletion is implied.
