-- Reconcile pre-existing Production schema drift: both tables are already in
-- the replacement baseline and in Preview, but missing in Production despite
-- that baseline being recorded as applied. Preserve the original contracts.
-- Additive and replay-safe: no data import, consumer switch, feature flag,
-- prompt, model, scheduler or existing application-table mutation.

create table if not exists public.document_intake_canonical_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null
    references public.document_intake_ai_runs(id)
    on delete cascade,
  analysis_version integer not null check (analysis_version > 0),
  status text not null check (status in ('succeeded', 'projection_failed')),
  schema_version smallint not null check (schema_version > 0),
  claim_count integer,
  relation_count integer,
  unique_relation_count integer,
  skipped_count integer,
  duration_ms integer,
  relations jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  constraint document_intake_canonical_shadow_runs_analysis_run_unique
    unique (analysis_run_id),
  constraint document_intake_canonical_shadow_runs_nonnegative_counts
    check (
      (claim_count is null or claim_count >= 0)
      and (relation_count is null or relation_count >= 0)
      and (unique_relation_count is null or unique_relation_count >= 0)
      and (skipped_count is null or skipped_count >= 0)
      and (duration_ms is null or duration_ms >= 0)
    ),
  constraint document_intake_canonical_shadow_runs_result_shape
    check (
      (
        status = 'succeeded'
        and claim_count is not null
        and relation_count is not null
        and unique_relation_count is not null
        and skipped_count is not null
        and duration_ms is not null
        and relations is not null
        and jsonb_typeof(relations) = 'array'
        and error_code is null
        and relation_count <= claim_count
        and unique_relation_count <= relation_count
      )
      or
      (
        status = 'projection_failed'
        and claim_count is null
        and relation_count is null
        and unique_relation_count is null
        and skipped_count is null
        and duration_ms is null
        and relations is null
        and error_code = 'projection_failed'
      )
    )
);

create index if not exists document_intake_canonical_shadow_runs_created_at_idx
  on public.document_intake_canonical_shadow_runs (created_at desc);
create index if not exists document_intake_canonical_shadow_runs_status_created_at_idx
  on public.document_intake_canonical_shadow_runs (status, created_at desc);
create index if not exists document_intake_canonical_shadow_runs_analysis_version_idx
  on public.document_intake_canonical_shadow_runs (analysis_version);

alter table public.document_intake_canonical_shadow_runs enable row level security;

revoke all on table public.document_intake_canonical_shadow_runs from public, anon, authenticated;
grant select, insert, update, delete
  on table public.document_intake_canonical_shadow_runs to service_role;

create table if not exists public.document_intake_canonical_consumer_observations (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid null references public.document_intake_ai_runs(id) on delete cascade,
  analysis_version integer null check (analysis_version is null or analysis_version > 0),
  schema_version smallint null check (schema_version is null or schema_version > 0),
  observer_version smallint not null check (observer_version > 0),
  outcome text not null check (outcome in ('match', 'mismatch', 'fallback')),
  fallback_reason text null,
  mismatch_reasons jsonb not null default '[]'::jsonb,
  claim_count integer null, relation_count integer null, unique_relation_count integer null,
  legacy_claim_count integer null, legacy_relation_count integer null, legacy_unique_relation_count integer null,
  ordered_equality boolean null, duplicate_equality boolean null, coverage_equality boolean null,
  identity_equality boolean null, per_conclusion_equality boolean null, reverse_index_equality boolean null,
  observed_at timestamptz not null default now(),
  constraint canonical_consumer_observations_nonnegative_counts check (
    (claim_count is null or claim_count >= 0) and (relation_count is null or relation_count >= 0)
    and (unique_relation_count is null or unique_relation_count >= 0)
    and (legacy_claim_count is null or legacy_claim_count >= 0)
    and (legacy_relation_count is null or legacy_relation_count >= 0)
    and (legacy_unique_relation_count is null or legacy_unique_relation_count >= 0)),
  constraint canonical_consumer_observations_mismatch_reasons_array check (jsonb_typeof(mismatch_reasons) = 'array'),
  constraint canonical_consumer_observations_outcome_shape check (
    (outcome = 'fallback' and fallback_reason is not null and jsonb_array_length(mismatch_reasons) = 0
      and ordered_equality is null and duplicate_equality is null and coverage_equality is null
      and identity_equality is null and per_conclusion_equality is null and reverse_index_equality is null)
    or (outcome = 'match' and fallback_reason is null and jsonb_array_length(mismatch_reasons) = 0
      and ordered_equality is true and duplicate_equality is true and coverage_equality is true
      and identity_equality is true and per_conclusion_equality is true and reverse_index_equality is true)
    or (outcome = 'mismatch' and fallback_reason is null and jsonb_array_length(mismatch_reasons) > 0
      and ordered_equality is not null and duplicate_equality is not null and coverage_equality is not null
      and identity_equality is not null and per_conclusion_equality is not null and reverse_index_equality is not null))
);
create index if not exists canonical_consumer_observations_observed_at_idx on public.document_intake_canonical_consumer_observations (observed_at desc);
create index if not exists canonical_consumer_observations_outcome_observed_at_idx on public.document_intake_canonical_consumer_observations (outcome, observed_at desc);
create index if not exists canonical_consumer_observations_fallback_reason_idx on public.document_intake_canonical_consumer_observations (fallback_reason) where fallback_reason is not null;
create index if not exists canonical_consumer_observations_versions_idx on public.document_intake_canonical_consumer_observations (analysis_version, schema_version, observer_version);
create index if not exists canonical_consumer_observations_analysis_run_idx on public.document_intake_canonical_consumer_observations (analysis_run_id) where analysis_run_id is not null;
alter table public.document_intake_canonical_consumer_observations enable row level security;
revoke all on table public.document_intake_canonical_consumer_observations from public, anon, authenticated;
grant select, insert, delete on table public.document_intake_canonical_consumer_observations to service_role;
