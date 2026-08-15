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

1. Create a disposable Supabase branch from a dedicated migration-repair branch.
2. Replace the broken chain only in that repair branch with one reviewed baseline migration plus audited non-personal reference seeds.
3. Run a clean-database replay and compare the same object-count checklist.
4. Verify T0-B/T0-C registry rows and intake schemas in the disposable branch.
5. Review grants separately. Do not import the quarantined catalog grants wholesale.
6. Review the five RLS-without-policy tables and the five broadly executable `SECURITY DEFINER` functions before approval.
7. Only after all checks pass, prepare a production migration-history reconciliation procedure. Do not run it without explicit production approval and a rollback plan.

## Explicit exclusions

- No production SQL or migration-history repair.
- No merge to `main`.
- No broad grant replication.
- No client, document, answer, or session data.
- No UI changes.

