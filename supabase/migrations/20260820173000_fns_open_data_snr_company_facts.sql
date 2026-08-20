-- KATI LAWYER — FNS Open Data SNR factual evidence store.
-- Private factual corpus only. This is not legal authority and does not replace
-- public.legal_source_registry or the existing legal research source pipeline.
-- No real FNS data is seeded by this migration.

create schema if not exists fns_open_data;

revoke all on schema fns_open_data from public, anon, authenticated;
grant usage on schema fns_open_data to service_role;

create table if not exists fns_open_data.company_tax_regimes (
  inn text not null,
  organization_name text not null,
  regimes text[] not null default '{}',
  document_id text,
  document_date date,
  data_as_of date not null,
  dataset_id text not null,
  source_url text not null,
  source_sha256 text not null,
  imported_at timestamptz not null default now(),
  primary key (inn, data_as_of, dataset_id),
  constraint fns_snr_inn_format check (inn ~ '^[0-9]{10}$'),
  constraint fns_snr_org_name_nonempty check (length(btrim(organization_name)) > 0),
  constraint fns_snr_dataset_id check (dataset_id = '7707329152-snr'),
  constraint fns_snr_source_url_https check (source_url like 'https://%'),
  constraint fns_snr_source_sha256 check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint fns_snr_regimes_allowed check (
    regimes <@ array['eshn','usn','ausn','srp']::text[]
  )
);

create table if not exists fns_open_data.sync_state (
  dataset_id text primary key,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  source_url text not null,
  source_sha256 text not null,
  data_as_of date,
  published_at date,
  records_count bigint not null default 0 check (records_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint fns_sync_dataset_id check (dataset_id = '7707329152-snr'),
  constraint fns_sync_source_url_https check (source_url like 'https://%'),
  constraint fns_sync_source_sha256 check (source_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists fns_snr_lookup_idx
  on fns_open_data.company_tax_regimes (inn, data_as_of desc);

revoke all on all tables in schema fns_open_data from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema fns_open_data to service_role;

create or replace function public.fns_open_data_snr_is_available()
returns boolean
language sql
stable
security definer
set search_path = public, fns_open_data
as $$
  select exists (
    select 1
    from fns_open_data.sync_state s
    where s.dataset_id = '7707329152-snr'
      and s.status = 'completed'
      and s.records_count > 0
  );
$$;

create or replace function public.fns_open_data_get_tax_regime(
  p_inn text,
  p_as_of_date date default null
)
returns table (
  inn text,
  organization_name text,
  regimes text[],
  document_id text,
  document_date date,
  data_as_of date,
  dataset_id text,
  source_url text,
  source_sha256 text
)
language sql
stable
security definer
set search_path = public, fns_open_data
as $$
  select
    r.inn,
    r.organization_name,
    r.regimes,
    r.document_id,
    r.document_date,
    r.data_as_of,
    r.dataset_id,
    r.source_url,
    r.source_sha256
  from fns_open_data.company_tax_regimes r
  where r.inn = btrim(p_inn)
    and btrim(p_inn) ~ '^[0-9]{10}$'
    and (p_as_of_date is null or r.data_as_of <= p_as_of_date)
  order by r.data_as_of desc
  limit 1;
$$;

revoke all on function public.fns_open_data_snr_is_available() from public, anon, authenticated;
revoke all on function public.fns_open_data_get_tax_regime(text, date) from public, anon, authenticated;

grant execute on function public.fns_open_data_snr_is_available() to service_role;
grant execute on function public.fns_open_data_get_tax_regime(text, date) to service_role;

comment on schema fns_open_data is
  'Private factual mirror for documented FNS Open Data datasets. Factual evidence only; never legal authority.';

comment on table fns_open_data.company_tax_regimes is
  'FNS Open Data 7707329152-snr records keyed by legal-entity INN and data_as_of. factual_only=true, legal_authority=false, substantive_use_allowed=false by application contract.';
