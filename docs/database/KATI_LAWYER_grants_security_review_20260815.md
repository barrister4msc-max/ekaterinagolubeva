# KATI LAWYER — security review of database grants

Date: 2026-08-15  
Production project: `wiylzbdbjokignwvizxt`  
Scope: read-only production inspection and code analysis

## Decision

Production grants must not be copied into the repaired migration chain as-is.
The quarantined least-privilege candidate is ready for disposable-branch replay,
but is not approved for production or activation under `supabase/migrations`.

## Findings

- Production currently exposes hundreds of table/view privileges to `anon` and
  `authenticated`, including schema-changing privileges unnecessary for normal
  application traffic (`REFERENCES`, `TRIGGER`, and `TRUNCATE`).
- RLS is enabled on the application tables, but object grants and RLS are two
  separate gates. Broad object grants should not be retained merely because RLS
  exists.
- Five RLS-enabled tables have no policies and remain fail-closed:
  `court_case_import_queue`, `legal_knowledge_chunks`,
  `legal_knowledge_import_queue`, `real_estate_negotiations`, and
  `real_estate_offers`.
- All eight public views have `security_invoker=true`.
- Five administrative `ALL` policies were assigned to `PUBLIC`. This made
  anonymous reads evaluate an admin-check function and fail after removing broad
  function execution. The candidate changes only those policy roles to
  `authenticated`; it does not weaken their predicates.
- `v_legal_sources_catalog` depends partly on `legal_knowledge_chunks`. The
  candidate grants authenticated `SELECT` on that table solely so the view can
  execute; RLS without a policy still prevents rows from that source.

## Intended anonymous surface

| Relation | Privilege | Reason |
|---|---|---|
| `property_search_requests` | `INSERT` | Public property-search form |
| `external_reviews` | `SELECT` | Published reviews |
| `seo_pages` | `SELECT` | Published SEO pages |
| `site_settings` | `SELECT` | Public site settings |

No anonymous `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, or `TRIGGER` grant is
required by current policies or code.

The administrative policies narrowed from `PUBLIC` to `authenticated` are:

- `Admins can manage document_intake_ai_runs`;
- `Admins can manage document_intake_answers`;
- `Admins can manage document_intake_sessions`;
- `Admins can manage reviews`;
- `Admins can manage seo pages`.

The legacy policy `Anyone can submit a lead` is also narrowed to
`authenticated`. Its check requires `lead_number IS NULL`, while the column
default assigns a sequence value before RLS validation, so a normal anonymous
insert is rejected. Current lead intake and Telegram webhook code use the
server-side `supabaseAdmin` client; no browser code inserts into `leads`.

## Authenticated access

Authenticated table DML is derived from the effective `authenticated`/`PUBLIC`
RLS command set rather than copied from production ACLs. `UPDATE` also receives
`SELECT`, which PostgREST needs for ordinary filtered updates and returned rows.
All eight security-invoker views receive authenticated `SELECT`.

## Function/RPC decision

| Function | Authenticated | Anonymous | Service role | Reason |
|---|---:|---:|---:|---|
| `has_role(uuid, app_role)` | execute | no | execute | Used by RLS policies |
| `is_admin_or_superadmin(uuid)` | execute | no | execute | Used by RLS and authenticated UI |
| `archive_document_intake_session(uuid)` | execute | no | execute | Authenticated admin UI RPC; function checks admin |
| `restore_document_intake_session(uuid)` | execute | no | execute | Authenticated admin UI RPC; function checks admin |
| `match_legal_knowledge(...)` | no | no | execute | Called by Edge Function with service-role client |
| `match_legal_law_chunks(...)` | no | no | execute | Backend-only candidate |
| `match_legal_laws(...)` | no | no | execute | Backend-only candidate |
| `handle_new_user()` | no | no | execute | Trigger helper, not browser RPC |
| `set_updated_at()` | no | no | execute | Trigger helper, not browser RPC |
| `update_updated_at_column()` | no | no | execute | Trigger helper, not browser RPC |

The code inspection confirmed that `analyze-document-legal-position` creates its
Supabase client with `SUPABASE_SERVICE_ROLE_KEY` before calling
`match_legal_knowledge`.

## Default privileges

The candidate also changes `postgres` default privileges in `public` so newly
created tables, sequences, and functions do not silently regain anonymous or
authenticated access. Future migrations must add their intended grants
explicitly. `service_role` receives data-plane privileges, not schema-changing
table privileges.

## Disposable replay result

Disposable branch: `least-privilege-replay-20260815`
(`stfvcjjvtbllligfayut`). Recorded cost: `$0.01344/hour`.

The branch reproduced the old Git-chain status `MIGRATIONS_FAILED`, then the
verified replacement order was replayed through tracked migration runs. The
consolidated grants candidate applied successfully twice (initial state plus an
idempotency replay).

Verified candidate state:

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
| Flagship templates | 5 |

ACL/runtime checks passed:

- anon has exactly four table privileges: one `INSERT` and three `SELECT`;
- anon has no sequence privilege and no public-function execution;
- authenticated execution is limited to the four reviewed RPC helpers;
- service role can execute all three vector-match functions;
- all eight security-invoker views execute as `authenticated`;
- public reads execute as `anon`;
- direct anon property-search insertion succeeds inside a rolled-back probe;
- final consolidated SQL reapplies without error.

Security Advisors no longer report anonymous execution of SECURITY DEFINER
functions. They report four intentional authenticated SECURITY DEFINER RPCs,
seven fail-closed RLS tables without policies (the five baseline tables plus two
Canonical Relations tables), and the pre-existing `vector` extension in
`public`.

## Remaining gate

1. Add the verified candidate and this evidence to the existing Draft PR without
   activating `supabase/migrations`.
2. Delete the disposable branch immediately after evidence is captured.
3. Before migration activation, run authenticated end-to-end admin smoke tests
   with a real Preview user session.

Status is **CODE READY / SECURITY REPLAY PASSED / AUTHENTICATED E2E PENDING**.
It is not **MIGRATION APPLIED**, **PR MERGED**, **EDGE DEPLOYED**, or
**PRODUCTION VERIFIED**.
