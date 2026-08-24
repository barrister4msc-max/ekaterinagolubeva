-- KATI LAWYER — FNS Open Data DEBTAM factual evidence store.
-- Private factual corpus only. Not legal authority. No real FNS rows are seeded.

create table if not exists fns_open_data.company_tax_debts (
  inn text not null,
  organization_name text not null,
  tax_name text not null,
  tax_debt_amount numeric(20,2) not null,
  penalty_amount numeric(20,2) not null,
  fine_amount numeric(20,2) not null,
  total_debt_amount numeric(20,2) not null,
  document_id text not null,
  document_date date,
  data_as_of date not null,
  debt_row_ordinal integer not null,
  dataset_id text not null,
  source_url text not null,
  source_sha256 text not null,
  imported_at timestamptz not null default now(),
  primary key (dataset_id, data_as_of, document_id, debt_row_ordinal),
  constraint fns_debtam_inn_format check (inn ~ '^[0-9]{10}$'),
  constraint fns_debtam_org_name_nonempty check (length(btrim(organization_name)) > 0),
  constraint fns_debtam_tax_name_nonempty check (length(btrim(tax_name)) > 0),
  constraint fns_debtam_row_ordinal_positive check (debt_row_ordinal > 0),
  constraint fns_debtam_dataset_id check (dataset_id = '7707329152-debtam'),
  constraint fns_debtam_amounts_nonnegative check (
    tax_debt_amount >= 0 and penalty_amount >= 0 and fine_amount >= 0 and total_debt_amount >= 0
  ),
  constraint fns_debtam_source_url_official check (
    source_url ~ '^https://(www\.nalog\.gov\.ru|nalog\.gov\.ru|data\.nalog\.ru|file\.nalog\.ru)/'
  ),
  constraint fns_debtam_source_sha256 check (source_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists fns_debtam_lookup_idx
  on fns_open_data.company_tax_debts (inn, data_as_of desc, debt_row_ordinal);

revoke all on fns_open_data.company_tax_debts from public, anon, authenticated;
grant select, insert, update, delete on fns_open_data.company_tax_debts to service_role;

-- Expand the pre-existing private sync ledger to the second verified factual dataset.
alter table fns_open_data.sync_state
  drop constraint if exists fns_sync_dataset_id;
alter table fns_open_data.sync_state
  add constraint fns_sync_dataset_id
  check (dataset_id in ('7707329152-snr', '7707329152-debtam'));

create or replace function public.fns_open_data_debtam_is_available()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from fns_open_data.sync_state s
    where s.dataset_id = '7707329152-debtam'
      and s.status = 'completed'
      and s.records_count > 0
  );
$$;

create or replace function public.fns_open_data_get_tax_debts(
  p_inn text,
  p_as_of_date date default null
)
returns table (
  inn text,
  organization_name text,
  tax_name text,
  tax_debt_amount numeric,
  penalty_amount numeric,
  fine_amount numeric,
  total_debt_amount numeric,
  document_id text,
  document_date date,
  data_as_of date,
  debt_row_ordinal integer,
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
    select max(d.data_as_of) as data_as_of
    from fns_open_data.company_tax_debts d
    where d.inn = pg_catalog.btrim(p_inn)
      and pg_catalog.btrim(p_inn) ~ '^[0-9]{10}$'
      and (p_as_of_date is null or d.data_as_of <= p_as_of_date)
  )
  select
    d.inn,
    d.organization_name,
    d.tax_name,
    d.tax_debt_amount,
    d.penalty_amount,
    d.fine_amount,
    d.total_debt_amount,
    d.document_id,
    d.document_date,
    d.data_as_of,
    d.debt_row_ordinal,
    d.dataset_id,
    d.source_url,
    d.source_sha256
  from fns_open_data.company_tax_debts d
  join latest l on l.data_as_of = d.data_as_of
  where d.inn = pg_catalog.btrim(p_inn)
  order by d.debt_row_ordinal, d.tax_name;
$$;

revoke all on function public.fns_open_data_debtam_is_available() from public, anon, authenticated;
revoke all on function public.fns_open_data_get_tax_debts(text, date) from public, anon, authenticated;
grant execute on function public.fns_open_data_debtam_is_available() to service_role;
grant execute on function public.fns_open_data_get_tax_debts(text, date) to service_role;

comment on table fns_open_data.company_tax_debts is
  'FNS Open Data 7707329152-debtam point-in-time debt rows. factual_only=true, legal_authority=false, substantive_use_allowed=false. Multiple debt rows per legal entity are preserved exactly.';
