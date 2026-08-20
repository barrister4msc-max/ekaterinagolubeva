-- KATI LAWYER — exact-text DEBTAM factual RPC for runtime evidence.
-- Additive to P0-A9. Monetary values are returned as text so PostgREST/JS cannot
-- silently round numeric(20,2) values before factual evidence is constructed.

create or replace function public.fns_open_data_get_tax_debts_text(
  p_inn text,
  p_as_of_date date default null
)
returns table (
  inn text,
  organization_name text,
  tax_name text,
  tax_debt_amount text,
  penalty_amount text,
  fine_amount text,
  total_debt_amount text,
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
    d.tax_debt_amount::text,
    d.penalty_amount::text,
    d.fine_amount::text,
    d.total_debt_amount::text,
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

revoke all on function public.fns_open_data_get_tax_debts_text(text, date) from public, anon, authenticated;
grant execute on function public.fns_open_data_get_tax_debts_text(text, date) to service_role;

comment on function public.fns_open_data_get_tax_debts_text(text, date) is
  'Service-role-only DEBTAM factual lookup. Returns latest eligible point-in-time observation with exact monetary values serialized as text; not legal authority and not a current-balance assertion.';
