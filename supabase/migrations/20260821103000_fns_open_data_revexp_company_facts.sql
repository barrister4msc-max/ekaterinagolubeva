-- KATI LAWYER — FNS Open Data REVEXP factual evidence store.
-- Private factual corpus only. Not legal authority. No real FNS rows are seeded.

create table if not exists fns_open_data.company_financial_statements (
  inn text not null,
  organization_name text not null,
  income_amount numeric(20,2) not null,
  expense_amount numeric(20,2) not null,
  document_id text not null,
  document_date date,
  reporting_date date not null,
  dataset_id text not null,
  source_url text not null,
  source_sha256 text not null,
  imported_at timestamptz not null default now(),
  primary key (dataset_id, reporting_date, document_id),
  constraint fns_revexp_inn_format check (inn ~ '^[0-9]{10}$'),
  constraint fns_revexp_org_name_nonempty check (length(btrim(organization_name)) > 0),
  constraint fns_revexp_document_id_nonempty check (length(btrim(document_id)) > 0),
  constraint fns_revexp_dataset_id check (dataset_id = '7707329152-revexp'),
  constraint fns_revexp_source_url_official check (
    source_url ~ '^https://(www\.nalog\.gov\.ru|nalog\.gov\.ru|data\.nalog\.ru|file\.nalog\.ru)/'
  ),
  constraint fns_revexp_source_sha256 check (source_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists fns_revexp_lookup_idx
  on fns_open_data.company_financial_statements (inn, reporting_date desc);

revoke all on fns_open_data.company_financial_statements from public, anon, authenticated;
grant select, insert, update, delete on fns_open_data.company_financial_statements to service_role;

alter table fns_open_data.sync_state
  drop constraint if exists fns_sync_dataset_id;
alter table fns_open_data.sync_state
  add constraint fns_sync_dataset_id
  check (dataset_id in ('7707329152-snr', '7707329152-debtam', '7707329152-revexp'));

create or replace function public.fns_open_data_revexp_is_available()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from fns_open_data.sync_state s
    where s.dataset_id = '7707329152-revexp'
      and s.status = 'completed'
      and s.records_count > 0
  );
$$;

-- Text-returning money boundary prevents PostgreSQL numeric from being coerced
-- through JSON/JS floating-point representation.
create or replace function public.fns_open_data_get_financial_statement_text(
  p_inn text,
  p_as_of_date date default null
)
returns table (
  inn text,
  organization_name text,
  income_amount text,
  expense_amount text,
  document_id text,
  document_date date,
  reporting_date date,
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
    select max(s.reporting_date) as reporting_date
    from fns_open_data.company_financial_statements s
    where s.inn = pg_catalog.btrim(p_inn)
      and pg_catalog.btrim(p_inn) ~ '^[0-9]{10}$'
      and (p_as_of_date is null or s.reporting_date <= p_as_of_date)
  )
  select
    s.inn,
    s.organization_name,
    s.income_amount::text,
    s.expense_amount::text,
    s.document_id,
    s.document_date,
    s.reporting_date,
    s.dataset_id,
    s.source_url,
    s.source_sha256
  from fns_open_data.company_financial_statements s
  join latest l on l.reporting_date = s.reporting_date
  where s.inn = pg_catalog.btrim(p_inn)
  order by s.document_id;
$$;

revoke all on function public.fns_open_data_revexp_is_available() from public, anon, authenticated;
revoke all on function public.fns_open_data_get_financial_statement_text(text, date) from public, anon, authenticated;
grant execute on function public.fns_open_data_revexp_is_available() to service_role;
grant execute on function public.fns_open_data_get_financial_statement_text(text, date) to service_role;

comment on table fns_open_data.company_financial_statements is
  'FNS Open Data 7707329152-revexp annual accounting-statement income/expense rows. factual_only=true, legal_authority=false, substantive_use_allowed=false. Amounts are not tax revenue, taxable income, turnover, cash flow, or current financial position.';
