# ADR-002 — fence server-owned OCR to the Storage object generation

Status: proposed/implemented in a stacked Draft; no remote activation. 31.10.2026.

Prerequisite: Draft #216, head `61a1d92be60be5777d8269917348cdf95ec51aeb`, tree `e4a1e0c4a8056fc61c0d34d248ced9ca5e598cdf` (local `328b587`). ADR-001's one dispatcher/one ledger/one bounded wave remains unchanged.

## Failure and decision

A unique upload path plus `upsert=false` is a client convention. It does not prevent deletion/recreation or a privileged same-path overwrite. A hash over a downloaded buffer identifies the bytes processed, but the old protocol cannot notice a same-path change after download and before settlement/final publication. Repeating a cached download can also bind stale bytes to a newer catalog entry.

For new authorized enqueue, pin both the existing SHA-256 byte identity and `{generation:{object_id,version}}` obtained by a service-only read of the current private Storage object. Download from the origin with Supabase's documented unique `cacheNonce`, preserve auth/abort handling, and atomically recheck/lock that catalog identity before accepting the enqueue or native-text publication. The existing OCR ledger/checkpoint and document metadata retain the pin; no queue/table, file copy, model or prompt is added.

`kati_read_ocr_storage_generation` is SECURITY INVOKER, empty search_path, service-only EXECUTE, with a five-second lock timeout. It reads `storage.buckets` and `storage.objects`, accepts only known private source buckets (`lead-documents`, `communication-attachments`), requires a current non-archived/non-delete-marker object and a nonempty version, and holds row-share locks until the short caller transaction commits. No DML, triggers, policies or schema modifications are added to managed Storage tables. Public `hero` remains on its existing legacy/image route; it cannot supply a new private server OCR source.

| Boundary | Required check |
| --- | --- |
| Enqueue/native-text save | Read generation before fresh download; compare and lock again in the authorized enqueue transaction |
| Before worker document/Storage read | Existing scope guard also verifies the pinned current generation |
| Reserve / settle / final publication | Existing private source guard rechecks and locks the generation, using job → document/session → bucket/object lock order |
| After a catalog lock wait | Recheck wall-clock lease expiry before allowing a provider reservation or publication |
| Status of completed OCR/native text | Revalidate the source generation; a changed/missing/public source removes completion admission |

A missing, replaced, recreated, archived, delete-marked or newly public source becomes `needs_manual_review`; stale bytes never gain a new pin automatically. Prior accepted text/checkpoint, attempts and manual metadata remain. A valid old generation cannot be silently rebound merely because a re-upload happens to have identical bytes. An old scoped job without generation stops before Storage/provider IO. Unscoped legacy reserved work retains the previous hash-only contract and is not promoted/enabled by this migration.

The generation lock is held only during short SQL admission/persistence transactions, never during downloading or inference. If publication wins the row lock, an object change waits until publication commits; the next status/admission read must reject the changed source. If the object change wins, waiting publication sees the changed generation and fails. RLS is not a claimed defense against a service-key overwrite; the catalog fence detects that API change too.

## Evidence and limits

Production inspection was read-only: relevant bucket visibility/policies, object-column/index definitions, service-role lock privileges and version coverage. On 31.10.2026, both private source buckets had 2623 objects in total, all with a nonempty version; `hero` was public. Current-object/unique indexes and archived/delete-marker fields were present. No source text/bytes, paths, user names or secrets were fetched for this review.

Executable control/worker/SQL tests double external auth/Storage/provider IO. They cover same bytes with a new version, same path/version with a new object id, missing/archived/delete-marked/public sources, download-to-enqueue races, pre-worker replacement with zero reads/model calls, mid-provider and pre-publication changes, preserved prior text/checkpoints, direct-text and completed-job status invalidation, unversioned scoped jobs, role boundaries and private responses. A transport test proves fresh request URLs/auth/signal/cache settings without changing RPC/provider traffic. Native PostgreSQL CI additionally uses real concurrent sessions and observed row-lock waits for both writer/publication orderings and lease expiry during a catalog wait. Local PGlite alone is not concurrency evidence.

This is generation fencing, not S3 Object Lock or a recovery/versioning service. It cannot protect against a database owner directly rewriting catalog identities or an operator mutating the backing object outside Storage API version handling. No such writer exists in the inspected app paths; operational access remains a trust boundary. Supabase's deployed Storage runtime must still demonstrate the expected upload/overwrite/delete/version/cache behavior in temporary Preview before enabling flags.

**Next activation gate:** downstream AI-fill/Legal Analysis/Generator admission must validate the pinned source generation at the point of consumption, even if no UI status poll has run after a replacement. Existing full-corpus OCR-text SHA checks do not prove that the original Storage object is unchanged. That focused consumer admission change and representative-PDF/browser/scheduler E06 remain outstanding; this producer/persistence fence alone is not rollout approval.

## Verified platform references

Checked 31.10.2026:

- [Storage schema: metadata is read-only; object mutations use API](https://supabase.com/docs/guides/storage/schema/design).
- [Storage access control: upsert privileges and service-key RLS bypass](https://supabase.com/docs/guides/storage/security/access-control).
- [Smart CDN: invalidation delay and cacheNonce bypass](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
- [S3 compatibility: versioning/Object Lock is not a promised bucket capability](https://supabase.com/docs/guides/storage/s3/compatibility).
- Pinned upstream Storage source `9d15cdc93c0b1afc37708914f5e45f865b231d48`: [uploader](https://github.com/supabase/storage/blob/9d15cdc93c0b1afc37708914f5e45f865b231d48/src/storage/uploader.ts) allocates a new version before upload and publishes it transactionally; [GET object](https://github.com/supabase/storage/blob/9d15cdc93c0b1afc37708914f5e45f865b231d48/src/http/routes/object/getObject.ts) resolves the catalog version for the backend download. These sources are not proof of the deployed project's Storage build.
- [Changelog](https://supabase.com/changelog.md): reviewed the HTTP TLS CBC deprecation (10.11.2026 earliest) and PostgreSQL 15.19/17.11 compatibility notes. This source change does not change TLS clients, database engine, extensions or custom operators. Native CI remains the explicit pinned PostgreSQL 17.6 baseline; a managed-engine upgrade is separate.
