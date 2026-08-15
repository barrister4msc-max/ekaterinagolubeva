# KATI LAWYER — replacement migration activation verification

Date: 2026-08-15

## Scope

This package converts the quarantined, production-equivalent schema evidence
into one active replacement baseline for fresh Supabase Preview databases.

It does not reconcile production migration history, merge to `main`, deploy
Edge Functions, or copy client, document, answer, session, auth-user, or storage
object data.

## Repository layout

- Active migration:
  `supabase/migrations/20260815083345_kati_lawyer_replacement_baseline.sql`
- Preserved historical chain:
  `supabase/migrations_legacy/`
- Historical files preserved: 41

The old SQL files are archived byte-for-byte under `migrations_legacy`; they
are removed only from the active replay directory because the old sequence
fails on a fresh database after its fifth migration.

## Single-file replay

Disposable project: `njlbwxvmjzkusaebuvvz`

The old chain first reproduced `MIGRATIONS_FAILED`. After resetting only the
disposable `public` schema, the replacement baseline applied successfully as
one tracked migration.

SHA-256 of the verified SQL:
`119474aec2489f0b83c2071eedc80b1b2cbbe69c2469a29aaf1677a28e356e47`

## Catalog invariants

| Check | Result |
|---|---:|
| Tables | 97 |
| Constraints | 287 |
| Indexes | 355 |
| User functions | 10 |
| Public triggers | 33 |
| Views | 8 |
| Public RLS policies | 134 |
| Legacy templates | 23 |
| Registry templates | 197 |
| Active registry templates | 194 |
| Active flagship intake schemas | 5 |

All 197 template codes exactly match production:

- production-only missing from candidate: 0;
- candidate-only codes: 0;
- duplicate codes: 0;
- deprecated `tax_complaint`, `tax_refund_application`, and `tax_strategy`
  are inactive with the approved replacement codes;
- flagship ranks and sort order are exactly 1–5.

The five intake schemas retain the verified contracts:

| Code | Steps | Fields | Required |
|---|---:|---:|---:|
| `response_to_tax_request` | 7 | 27 | 7 |
| `tax_explanations` | 7 | 21 | 7 |
| `tax_vat_explanations` | 7 | 27 | 6 |
| `tax_strategy_memo` | 7 | 22 | 9 |
| `tax_court_position` | 7 | 27 | 10 |

## Security/runtime verification

- anon grants are exactly:
  - `INSERT` on `property_search_requests`;
  - `SELECT` on `external_reviews`, `seo_pages`, and `site_settings`.
- anon has no public-function execution.
- authenticated function execution is limited to:
  `has_role`, `is_admin_or_superadmin`,
  `archive_document_intake_session`, and
  `restore_document_intake_session`.
- all three vector-match functions execute as `service_role`.
- all eight `security_invoker` views execute as `authenticated`.
- public reads execute as anon.
- the public property-search insert passed inside a rolled-back probe.

Security Advisors report only the reviewed residual findings:

- seven fail-closed RLS tables without policies;
- `vector` remains in `public`;
- four intentional authenticated SECURITY DEFINER RPC helpers.

## Status

- Replacement SQL: VERIFIED by single-file disposable replay.
- Git activation: CODE READY.
- Git-driven Preview: PENDING.
- Authenticated E2E: PENDING.
- PR merge: NOT PERFORMED.
- Production migration/history change: NOT PERFORMED.
- Edge deployment: NOT PERFORMED.
