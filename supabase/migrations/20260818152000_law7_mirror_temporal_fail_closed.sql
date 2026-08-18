-- PR37 real-data finding: the published Law7 backup can contain current-looking
-- article text with an unreliable historical version_date and no amendment
-- chain. General retrieval may remain available, but date-specific version
-- lookup and amendment-history retrieval must fail closed unless historical
-- coverage has been explicitly verified.

create or replace function public.law7_mirror_get_article_version(
  p_code_id text,
  p_article_number text,
  p_as_of_date date default null
)
returns table (
  code_id text,
  article_number text,
  version_date date,
  article_title text,
  article_text text,
  amendment_eo_number text,
  amendment_date date,
  is_current boolean,
  is_repealed boolean,
  repealed_date date,
  text_hash text
)
language sql
stable
security definer
set search_path = public, law7_mirror
as $$
  select
    v.code_id,
    v.article_number,
    v.version_date,
    v.article_title,
    v.article_text,
    v.amendment_eo_number,
    v.amendment_date,
    v.is_current,
    v.is_repealed,
    v.repealed_date,
    v.text_hash
  from law7_mirror.article_versions v
  where v.code_id = p_code_id
    and v.article_number = p_article_number
    and (
      p_as_of_date is null
      or exists (
        select 1
        from law7_mirror.sync_state s
        where s.status = 'completed'
          and s.metadata ->> 'historical_coverage' = 'verified'
      )
    )
    and (p_as_of_date is null or v.version_date <= p_as_of_date)
  order by
    case when p_as_of_date is null and v.is_current then 0 else 1 end,
    v.version_date desc
  limit 1;
$$;

create or replace function public.law7_mirror_trace_amendment_history(
  p_code_id text,
  p_article_number text,
  p_limit integer default 20
)
returns table (
  code_id text,
  article_number text,
  version_date date,
  amendment_eo_number text,
  amendment_date date,
  is_repealed boolean,
  repealed_date date,
  text_hash text
)
language sql
stable
security definer
set search_path = public, law7_mirror
as $$
  select
    v.code_id,
    v.article_number,
    v.version_date,
    v.amendment_eo_number,
    v.amendment_date,
    v.is_repealed,
    v.repealed_date,
    v.text_hash
  from law7_mirror.article_versions v
  where v.code_id = p_code_id
    and v.article_number = p_article_number
    and exists (
      select 1
      from law7_mirror.sync_state s
      where s.status = 'completed'
        and s.metadata ->> 'historical_coverage' = 'verified'
    )
  order by v.version_date desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.law7_mirror_get_article_version(text, text, date) from public, anon, authenticated;
revoke all on function public.law7_mirror_trace_amendment_history(text, text, integer) from public, anon, authenticated;
grant execute on function public.law7_mirror_get_article_version(text, text, date) to service_role;
grant execute on function public.law7_mirror_trace_amendment_history(text, text, integer) to service_role;

comment on function public.law7_mirror_get_article_version(text, text, date) is
  'Current lookup is allowed without a date. Historical/as-of lookup fails closed unless law7_mirror.sync_state metadata historical_coverage=verified.';
comment on function public.law7_mirror_trace_amendment_history(text, text, integer) is
  'Amendment history fails closed unless law7_mirror.sync_state metadata historical_coverage=verified.';