# Test environment retirement and schema reconciliation

Production remains `wiylzbdbjokignwvizxt`. The published application and Lovable
project `0172752e-9cee-4e4a-ad5c-82ad0cbd7785` use that Production project.
Repository, deployed Edge Functions, Production RPC definitions and checked
URL/metadata columns contain no references to the retired previews or Q0.

The retired Supabase previews were `cgetcaqrxzheykwcqwzm` (PR #157),
`zbfukvzdsgjovgrlyiad` (PR #158), and `uprzchrouemzajvcojag` (PR #40).
Their GitHub branches and immutable commit heads remain available.
The separate Q0 project `buugujfmkujzmdhsrlwu` is retained pending the final
dependency review and deletion decision.

Before retirement, table data, definitions, RLS/ACL snapshots, relevant deployed
functions and the Q0 PDF were saved. Typed table-data restoration and every row
checksum were checked in local PostgreSQL; the Law7 snapshot contains eight
codes and 2,866 article versions. The test corpus remains unverified and must
not be imported into Production merely to remove a preview.

The comparison found pre-existing Production drift: the replacement baseline
is recorded as applied, but `document_intake_canonical_shadow_runs` and
`document_intake_canonical_consumer_observations` are absent. Both already
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
