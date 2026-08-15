create table public.document_intake_canonical_shadow_runs (
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

create index document_intake_canonical_shadow_runs_created_at_idx
  on public.document_intake_canonical_shadow_runs (created_at desc);
create index document_intake_canonical_shadow_runs_status_created_at_idx
  on public.document_intake_canonical_shadow_runs (status, created_at desc);
create index document_intake_canonical_shadow_runs_analysis_version_idx
  on public.document_intake_canonical_shadow_runs (analysis_version);

alter table public.document_intake_canonical_shadow_runs enable row level security;

revoke all on table public.document_intake_canonical_shadow_runs from anon, authenticated;
grant select, insert, update, delete
  on table public.document_intake_canonical_shadow_runs to service_role;
