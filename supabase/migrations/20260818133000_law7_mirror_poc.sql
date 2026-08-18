-- Law7 Mirror PoC for KATI LAWYER.
-- Private technical corpus only. It does NOT replace public.legal_source_registry.
-- No production data is seeded by this migration.

create schema if not exists law7_mirror;

revoke all on schema law7_mirror from public, anon, authenticated;
grant usage on schema law7_mirror to service_role;

create table if not exists law7_mirror.codes (
  code text primary key,
  name text not null,
  short_name text,
  description text,
  original_eo_number text,
  original_date date,
  official_url text,
  source_commit text,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now()
);

create table if not exists law7_mirror.article_versions (
  code_id text not null references law7_mirror.codes(code) on delete cascade,
  article_number text not null,
  version_date date not null,
  article_text text not null,
  article_title text,
  amendment_eo_number text,
  amendment_date date,
  is_current boolean not null default false,
  is_repealed boolean not null default false,
  repealed_date date,
  text_hash text,
  source_commit text,
  imported_at timestamptz not null default now(),
  primary key (code_id, article_number, version_date)
);

create table if not exists law7_mirror.amendments (
  code_id text not null references law7_mirror.codes(code) on delete cascade,
  amendment_eo_number text not null,
  amendment_date date,
  amendment_type text,
  articles_affected text[] not null default '{}',
  articles_added text[] not null default '{}',
  articles_modified text[] not null default '{}',
  articles_repealed text[] not null default '{}',
  source_commit text,
  imported_at timestamptz not null default now(),
  primary key (code_id, amendment_eo_number)
);

create table if not exists law7_mirror.sync_state (
  dataset_key text primary key,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  source_repository text not null default 'mikhashev/law7',
  source_commit text,
  codes_count integer not null default 0,
  article_versions_count integer not null default 0,
  amendments_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists law7_mirror_article_lookup_idx
  on law7_mirror.article_versions (code_id, article_number, version_date desc);
create index if not exists law7_mirror_article_current_idx
  on law7_mirror.article_versions (code_id, article_number)
  where is_current = true;
create index if not exists law7_mirror_article_text_fts_idx
  on law7_mirror.article_versions
  using gin (to_tsvector('russian', article_text));
create index if not exists law7_mirror_amendment_lookup_idx
  on law7_mirror.amendments (code_id, amendment_date desc);

create or replace view law7_mirror.articles as
select distinct on (code_id, article_number)
  code_id,
  article_number,
  article_title,
  article_text,
  version_date,
  amendment_eo_number,
  amendment_date,
  is_repealed,
  repealed_date,
  text_hash,
  source_commit,
  imported_at
from law7_mirror.article_versions
order by code_id, article_number, is_current desc, version_date desc;

revoke all on all tables in schema law7_mirror from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema law7_mirror to service_role;

-- Fail-closed availability probe. Mirror is available only after a completed
-- sync with at least one article version.
create or replace function public.law7_mirror_is_available()
returns boolean
language sql
security definer
set search_path = public, law7_mirror
as $$
  select exists (
    select 1
    from law7_mirror.sync_state s
    where s.status = 'completed'
      and s.article_versions_count > 0
  );
$$;

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
  order by v.version_date desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.law7_mirror_query_laws(
  p_query text,
  p_max_results integer default 10
)
returns table (
  code_id text,
  article_number text,
  version_date date,
  article_title text,
  article_text text,
  rank real
)
language sql
stable
security definer
set search_path = public, law7_mirror
as $$
  with q as (
    select websearch_to_tsquery('russian', nullif(trim(p_query), '')) as query
  )
  select
    a.code_id,
    a.article_number,
    a.version_date,
    a.article_title,
    a.article_text,
    ts_rank_cd(to_tsvector('russian', a.article_text), q.query)::real as rank
  from law7_mirror.articles a
  cross join q
  where q.query is not null
    and to_tsvector('russian', a.article_text) @@ q.query
  order by rank desc, a.code_id, a.article_number
  limit least(greatest(coalesce(p_max_results, 10), 1), 30);
$$;

revoke all on function public.law7_mirror_is_available() from public, anon, authenticated;
revoke all on function public.law7_mirror_get_article_version(text, text, date) from public, anon, authenticated;
revoke all on function public.law7_mirror_trace_amendment_history(text, text, integer) from public, anon, authenticated;
revoke all on function public.law7_mirror_query_laws(text, integer) from public, anon, authenticated;

grant execute on function public.law7_mirror_is_available() to service_role;
grant execute on function public.law7_mirror_get_article_version(text, text, date) to service_role;
grant execute on function public.law7_mirror_trace_amendment_history(text, text, integer) to service_role;
grant execute on function public.law7_mirror_query_laws(text, integer) to service_role;

comment on schema law7_mirror is
  'Private research mirror/cache for Law7-compatible consolidated-code data. Canonical KATI identity remains public.legal_source_registry.';
