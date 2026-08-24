-- KATI LAWYER — FNS Open Data TAXOFFENCE factual evidence store.
-- Private factual corpus only. Not legal authority. No real FNS rows are seeded.

create table if not exists fns_open_data.company_tax_offences (
  inn text not null,
  organization_name text not null,
  fine_amount numeric(20,2) not null,
  document_id text not null,
  document_date date not null,
  data_as_of date not null,
  format_version text not null,
  dataset_id text not null,
  source_url text not null,
  source_sha256 text not null,
  imported_at timestamptz not null default now(),
  primary key (dataset_id, data_as_of, document_id),
  constraint fns_taxoffence_inn_format check (inn ~ '^[0-9]{10}$'),
  constraint fns_taxoffence_org_name_nonempty check (length(btrim(organization_name)) > 0),
  constraint fns_taxoffence_fine_nonnegative check (fine_amount >= 0),
  constraint fns_taxoffence_document_id_nonempty check (length(btrim(document_id)) > 0),
  constraint fns_taxoffence_dataset_id check (dataset_id = '7707329152-taxoffence'),
  constraint fns_taxoffence_format_version check (format_version = '4.01'),
  constraint fns_taxoffence_source_url_official check (
    source_url ~ '^https://(www\.nalog\.gov\.ru|nalog\.gov\.ru|data\.nalog\.ru|file\.nalog\.ru)/'
  ),
  constraint fns_taxoffence_source_sha256 check (source_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists fns_taxoffence_lookup_idx
  on fns_open_data.company_tax_offences (inn, data_as_of desc);

revoke all on fns_open_data.company_tax_offences from public, anon, authenticated;
grant select, insert, update, delete on fns_open_data.company_tax_offences to service_role;

alter table fns_open_data.sync_state
  drop constraint if exists fns_sync_dataset_id;
alter table fns_open_data.sync_state
  add constraint fns_sync_dataset_id
  check (dataset_id in (
    '7707329152-snr',
    '7707329152-debtam',
    '7707329152-revexp',
    '7707329152-sshr2019',
    '7707329152-taxoffence'
  ));

create or replace function public.fns_open_data_taxoffence_is_available()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from fns_open_data.sync_state s
    where s.dataset_id = '7707329152-taxoffence'
      and s.status = 'completed'
      and s.records_count > 0
  );
$$;

create or replace function public.fns_open_data_get_tax_offences(
  p_inn text,
  p_as_of_date date default null
)
returns table (
  inn text,
  organization_name text,
  fine_amount text,
  document_id text,
  document_date date,
  data_as_of date,
  format_version text,
  dataset_id text,
  source_url text,
  source_sha256 text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with latest as (
    select max(t.data_as_of) as data_as_of
    from fns_open_data.company_tax_offences t
    where t.inn = pg_catalog.btrim(p_inn)
      and pg_catalog.btrim(p_inn) ~ '^[0-9]{10}$'
      and (p_as_of_date is null or t.data_as_of <= p_as_of_date)
  )
  select
    t.inn,
    t.organization_name,
    t.fine_amount::text,
    t.document_id,
    t.document_date,
    t.data_as_of,
    t.format_version,
    t.dataset_id,
    t.source_url,
    t.source_sha256
  from fns_open_data.company_tax_offences t
  join latest l on l.data_as_of = t.data_as_of
  where t.inn = pg_catalog.btrim(p_inn)
  order by t.document_id;
$$;

revoke all on function public.fns_open_data_taxoffence_is_available() from public, anon, authenticated;
revoke all on function public.fns_open_data_get_tax_offences(text, date) from public, anon, authenticated;
grant execute on function public.fns_open_data_taxoffence_is_available() to service_role;
grant execute on function public.fns_open_data_get_tax_offences(text, date) to service_role;

comment on table fns_open_data.company_tax_offences is
  'FNS Open Data 7707329152-taxoffence factual rows. factual_only=true, legal_authority=false, substantive_use_allowed=false. A published fine record is not an automatic legal conclusion or finding of current liability.';
