-- PR39: Source Freshness & Change Signal Contract.
-- Reuse the existing canonical source registry, verification audit, usage events,
-- and regulatory monitoring persistence. Do not create a second registry or
-- freshness lifecycle.

alter table public.legal_regulatory_monitored_sources
  add column if not exists source_registry_id uuid;

alter table public.legal_regulatory_update_logs
  add column if not exists source_registry_id uuid;

alter table public.legal_regulatory_update_alerts
  add column if not exists source_registry_id uuid,
  add column if not exists signal_type text,
  add column if not exists research_issue_id text,
  add column if not exists research_issue_text text,
  add column if not exists signal_metadata jsonb not null default '{}'::jsonb;

alter table public.legal_source_verification_logs
  add column if not exists recheck_outcome text,
  add column if not exists result_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'legal_regulatory_monitored_sources_source_registry_id_fkey'
      and conrelid = 'public.legal_regulatory_monitored_sources'::regclass
  ) then
    alter table public.legal_regulatory_monitored_sources
      add constraint legal_regulatory_monitored_sources_source_registry_id_fkey
      foreign key (source_registry_id)
      references public.legal_source_registry(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'legal_regulatory_update_logs_source_registry_id_fkey'
      and conrelid = 'public.legal_regulatory_update_logs'::regclass
  ) then
    alter table public.legal_regulatory_update_logs
      add constraint legal_regulatory_update_logs_source_registry_id_fkey
      foreign key (source_registry_id)
      references public.legal_source_registry(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'legal_regulatory_update_alerts_source_registry_id_fkey'
      and conrelid = 'public.legal_regulatory_update_alerts'::regclass
  ) then
    alter table public.legal_regulatory_update_alerts
      add constraint legal_regulatory_update_alerts_source_registry_id_fkey
      foreign key (source_registry_id)
      references public.legal_source_registry(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'legal_source_verification_logs_recheck_outcome_check'
      and conrelid = 'public.legal_source_verification_logs'::regclass
  ) then
    alter table public.legal_source_verification_logs
      add constraint legal_source_verification_logs_recheck_outcome_check
      check (
        recheck_outcome is null
        or recheck_outcome in ('UNCHANGED', 'SOURCE_CHANGED', 'STATUS_CHANGED', 'UNAVAILABLE')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'legal_regulatory_update_alerts_signal_type_check'
      and conrelid = 'public.legal_regulatory_update_alerts'::regclass
  ) then
    alter table public.legal_regulatory_update_alerts
      add constraint legal_regulatory_update_alerts_signal_type_check
      check (
        signal_type is null
        or signal_type in ('SOURCE_CHANGED', 'STATUS_CHANGED', 'POSITION_UPDATE_AVAILABLE')
      );
  end if;
end $$;

-- Preserve existing monitoring rows as legacy snapshots and attach canonical
-- identity only when an unambiguous official URL match exists.
update public.legal_regulatory_monitored_sources monitored
set source_registry_id = registry.id
from public.legal_source_registry registry
where monitored.source_registry_id is null
  and monitored.source_url is not null
  and registry.official_url = monitored.source_url
  and registry.is_active = true
  and not exists (
    select 1
    from public.legal_source_registry another
    where another.id <> registry.id
      and another.is_active = true
      and another.official_url = monitored.source_url
  );

-- Technical recheck logs and alerts inherit canonical identity from their
-- monitored-source parent when available. Historical rows remain intact.
update public.legal_regulatory_update_logs logs
set source_registry_id = monitored.source_registry_id
from public.legal_regulatory_monitored_sources monitored
where logs.source_registry_id is null
  and logs.monitored_source_id = monitored.id
  and monitored.source_registry_id is not null;

update public.legal_regulatory_update_alerts alerts
set source_registry_id = monitored.source_registry_id
from public.legal_regulatory_monitored_sources monitored
where alerts.source_registry_id is null
  and alerts.monitored_source_id = monitored.id
  and monitored.source_registry_id is not null;

create index if not exists legal_regulatory_monitored_sources_registry_idx
  on public.legal_regulatory_monitored_sources(source_registry_id)
  where source_registry_id is not null;

create index if not exists legal_regulatory_update_logs_registry_idx
  on public.legal_regulatory_update_logs(source_registry_id, created_at desc)
  where source_registry_id is not null;

create index if not exists legal_regulatory_update_alerts_registry_signal_idx
  on public.legal_regulatory_update_alerts(source_registry_id, signal_type, created_at desc)
  where source_registry_id is not null;

create index if not exists legal_regulatory_update_alerts_issue_signal_idx
  on public.legal_regulatory_update_alerts(research_issue_id, signal_type, created_at desc)
  where research_issue_id is not null;

comment on column public.legal_regulatory_monitored_sources.source_registry_id is
  'Canonical identity bridge to legal_source_registry. Legacy monitoring fields remain display/snapshot metadata and are not a second source registry.';

comment on column public.legal_source_verification_logs.recheck_outcome is
  'Outcome of a completed source recheck: UNCHANGED, SOURCE_CHANGED, STATUS_CHANGED, or UNAVAILABLE. Separate from verification workflow status and from operational FreshnessState.';

comment on column public.legal_regulatory_update_alerts.signal_type is
  'Typed change signal: SOURCE_CHANGED or STATUS_CHANGED for the source itself; POSITION_UPDATE_AVAILABLE for newer official material on the same research issue.';

comment on column public.legal_regulatory_update_alerts.research_issue_id is
  'Existing Analyzer research-issue identity when the signal is issue-level. This does not create a parallel research-issue registry.';
