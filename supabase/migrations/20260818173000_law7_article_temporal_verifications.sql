-- PR38: replace the broad dataset-level historical unlock with an exact
-- article/version/text/interval verification contract.
--
-- Law7 remains retrieval_intermediary. This table does not make Law7 official;
-- it only records that a specific mirror text/version was independently checked
-- against an official legal source for a bounded effective interval.

create table if not exists law7_mirror.temporal_verifications (
  code_id text not null,
  article_number text not null,
  version_date date not null,
  verified_text_hash text not null check (length(trim(verified_text_hash)) > 0),
  effective_from date not null,
  effective_to date,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  official_provider text not null check (official_provider in ('pravo', 'kremlin')),
  official_document_number text not null check (length(trim(official_document_number)) > 0),
  official_document_date date not null,
  official_publication_url text not null check (official_publication_url ~ '^https://'),
  verification_method text not null check (verification_method in ('official_document', 'official_consolidated_text')),
  verification_notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (code_id, article_number, version_date, verified_text_hash, effective_from),
  foreign key (code_id, article_number, version_date)
    references law7_mirror.article_versions(code_id, article_number, version_date)
    on delete cascade,
  check (effective_to is null or effective_to >= effective_from),
  check ((status = 'verified' and verified_at is not null) or status <> 'verified')
);

create index if not exists law7_mirror_temporal_verification_lookup_idx
  on law7_mirror.temporal_verifications (
    code_id,
    article_number,
    status,
    effective_from,
    effective_to
  );

revoke all on law7_mirror.temporal_verifications from public, anon, authenticated;
grant select, insert, update, delete on law7_mirror.temporal_verifications to service_role;

-- Current lookup (no date) remains retrieval-only and available exactly as in
-- PR37. Date-specific lookup requires an exact verified mirror text hash and an
-- independently verified effective interval covering the requested date.
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
  with candidate as (
    select v.*
    from law7_mirror.article_versions v
    where v.code_id = p_code_id
      and v.article_number = p_article_number
      and (p_as_of_date is null or v.version_date <= p_as_of_date)
    order by
      case when p_as_of_date is null and v.is_current then 0 else 1 end,
      v.version_date desc
    limit 1
  )
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
  from candidate v
  where p_as_of_date is null
     or exists (
       select 1
       from law7_mirror.temporal_verifications tv
       where tv.code_id = v.code_id
         and tv.article_number = v.article_number
         and tv.version_date = v.version_date
         and tv.status = 'verified'
         and tv.verified_text_hash = v.text_hash
         and tv.effective_from <= p_as_of_date
         and (tv.effective_to is null or p_as_of_date <= tv.effective_to)
     );
$$;

-- Amendment history is now exact-version fail-closed. A global sync_state flag
-- cannot unlock another article/version. Only rows whose mirror text hash has an
-- explicit verified official-source record can be returned.
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
      from law7_mirror.temporal_verifications tv
      where tv.code_id = v.code_id
        and tv.article_number = v.article_number
        and tv.version_date = v.version_date
        and tv.status = 'verified'
        and tv.verified_text_hash = v.text_hash
    )
  order by v.version_date desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.law7_mirror_get_article_version(text, text, date) from public, anon, authenticated;
revoke all on function public.law7_mirror_trace_amendment_history(text, text, integer) from public, anon, authenticated;
grant execute on function public.law7_mirror_get_article_version(text, text, date) to service_role;
grant execute on function public.law7_mirror_trace_amendment_history(text, text, integer) to service_role;

comment on table law7_mirror.temporal_verifications is
  'Per Law7 mirror article/version/text-hash official temporal verification. Does not confer official-source authority; only unlocks bounded historical retrieval after independent verification.';
comment on function public.law7_mirror_get_article_version(text, text, date) is
  'Current lookup remains retrieval-only. Date-specific lookup requires exact per-version text-hash verification and a verified effective interval covering the requested date.';
comment on function public.law7_mirror_trace_amendment_history(text, text, integer) is
  'Returns only exact Law7 article versions whose text hash has an explicit verified official-source temporal verification record.';