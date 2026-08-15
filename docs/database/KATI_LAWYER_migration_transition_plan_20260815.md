# KATI LAWYER — schema baseline transition plan

Date: 2026-08-15

## Current state

- Production project `wiylzbdbjokignwvizxt` was inspected read-only and was not changed.
- Preview project `ifitmxpnovghhfspqbkc` has a catalog-equivalent `public` schema core after direct Preview-only SQL reconstruction.
- Preview verification counts: 95 tables, 270 constraints, 344 indexes, 10 user functions, 33 triggers, 8 views, 133 policies, 3 enums, and 1 sequence.
- T0-B and T0-C were applied and verified only in Preview.
- Supabase still reports `MIGRATIONS_FAILED` because the Git migration history was not repaired by those direct SQL operations.

## Repository safety decision

The verified snapshot must not be added as the newest file in `supabase/migrations`:

1. Earlier migrations fail before a newest baseline can execute.
2. Moving the full current-state baseline before existing migrations would cause duplicate-object failures.
3. Replacing migration history requires a separate clean-database replay and a controlled production migration-history reconciliation.

Therefore this package stores the snapshot under `supabase/baselines/quarantine/`. Files in that directory are evidence and repair inputs, not deployable migrations.

## Required gates before migration activation

1. Completed: create disposable branch `schema-baseline-replay-20260815`.
2. Completed: replay the `public` baseline and verify object counts.
3. Completed: identify and replay the missing `auth.users` trigger, three storage buckets, and twelve storage policies.
4. Completed: restore repository-owned reference seeds and verify 197 registry rows / 194 active rows after T0-B.
5. Completed: verify five flagship intake schemas and T0-C ordering.
6. Pending: build a replacement Git migration directory with the verified order and archive the old chain outside `supabase/migrations`.
7. Pending: create a new Git-driven Preview from that branch and require platform status `MIGRATIONS_APPLIED`.
8. Pending: review grants separately. Do not import the quarantined catalog grants wholesale.
9. Pending: review the five RLS-without-policy tables and the five broadly executable `SECURITY DEFINER` functions before approval.
10. Only after all checks pass, prepare a production migration-history reconciliation procedure. Do not run it without explicit production approval and a rollback plan.

## Verified replacement order

1. Production-derived `public` schema baseline.
2. Repository-owned non-personal reference seeds.
3. Five approved flagship intake schemas.
4. `auth.users` trigger and production-equivalent storage configuration.
5. Canonical shadow-runs migration.
6. Canonical consumer-observations migration.
7. T0-B registry synchronization.
8. Deprecated-template session restore.
9. T0-C flagship metadata.

This order was verified through tracked migration-runs on the disposable branch.
It is not yet activated in the Git migration directory.

## Explicit exclusions

- No production SQL or migration-history repair.
- No merge to `main`.
- No broad grant replication.
- No client, document, answer, or session data.
- No UI changes.
