# Test environment retirement and schema reconciliation

Production remains `wiylzbdbjokignwvizxt`. The published application and Lovable
project `0172752e-9cee-4e4a-ad5c-82ad0cbd7785` use that Production project.
Repository, deployed Edge Functions, Production RPC definitions and checked
URL/metadata columns contain no references to the retired previews or Q0.

The retired Supabase previews were `cgetcaqrxzheykwcqwzm` (PR #157),
`zbfukvzdsgjovgrlyiad` (PR #158), and `uprzchrouemzajvcojag` (PR #40).
Their GitHub branches and immutable commit heads remain available.
The separate Q0 project `buugujfmkujzmdhsrlwu` was also deleted after the final
dependency review and backup hash verification. A repeat inventory on 2026-10-29
returns only healthy Production and its default `main` branch.

Before retirement, table data, definitions, RLS/ACL snapshots, relevant deployed
functions and the Q0 PDF were saved. Typed table-data restoration and every row
checksum were checked in local PostgreSQL; the Law7 snapshot contains eight
codes and 2,866 article versions. The test corpus remains unverified and must
not be imported into Production merely to remove a preview.

The comparison found pre-existing Production drift: the replacement baseline
was recorded as applied, but `document_intake_canonical_shadow_runs` and
`document_intake_canonical_consumer_observations` were absent before reconciliation. Both already
exist in the baseline and in all saved test environments, where they are empty.
The reconciliation migration restores those two existing contracts with RLS
and service-role-only access. It neither enables canonical feature flags nor
changes Analyzer/Generator results or imports test data.

GitHub automatic branching is disabled to prevent recurring idle Preview
costs. Production deployment from `main` remains enabled. Future integration
tests should provision one explicit, temporary non-production environment.
`LAW7_POC_MIRROR_DATABASE_URL` is a non-production-only workflow input: never
repoint it to Production as a replacement for a deleted test database.

Validation: `supabase/tests/canonical-shadow-reconciliation.sql` checks the
actual database's RLS, role privileges, foreign keys and contract constraints.
Replay and data-constraint checks run against local isolated PostgreSQL;
Production verification uses only catalog queries and row counts.

PR #205 is merged; migration `20261028163542_reconcile_canonical_shadow_tables`
was applied and its read-only assertions passed remotely. Production data was
preserved. This does not constitute an authenticated AI generation E2E.

The backup `KATI_Supabase_Test_Environments_Backup_2026-10-28.zip` has SHA256
`9a58852637367e60b8b429cad83435bbd4bb59706664467d6fe48961c5b0ba29`.
It preserves test rows, schema/RPC/function snapshots and the Q0 PDF, with typed
row restoration checked; it excludes credentials and is not a complete Supabase
service restore. The Law7 test data is not an active user source: Production
still has zero Law7 codes/article versions and reports availability false.

Current execution order: [Master execution state](../execution/MASTER_EXECUTION_STATE.md).
