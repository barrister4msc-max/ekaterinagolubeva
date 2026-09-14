-- Read-only, least-privilege projection for the legal-source verification audit.
-- This function never updates chunks, registry records, verification flags, or embeddings.

create or replace function public.kati_legal_source_verification_audit_rows(
  p_scope text default 'all'
)
returns table (
  source_table text,
  source_group_key text,
  chunk_count integer,
  title text,
  source_type text,
  source_namespace text,
  registry_id text,
  document_number text,
  document_date text,
  source_url text,
  registry_candidate_count integer,
  registry_candidate_ids text[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_scope not in ('all', 'laws', 'knowledge') then
    raise exception 'Unsupported legal-source audit scope: %', p_scope;
  end if;

  return query
  with source_rows as (
    select
      'legal_law_chunks'::text as source_table,
      id::text as id,
      title,
      'law_snapshot'::text as source_type,
      metadata,
      coalesce(metadata->>'source_namespace', '<missing>') as source_namespace,
      coalesce(metadata->>'legal_source_registry_id', metadata->>'source_registry_id') as registry_id,
      coalesce(metadata->>'document_number', metadata->>'letter_number') as document_number,
      coalesce(metadata->>'document_date', metadata->>'publication_date', metadata->>'letter_date') as document_date,
      coalesce(metadata->>'official_url', metadata->>'source_url') as source_url
    from public.legal_law_chunks
    where is_active = true
      and p_scope in ('all', 'laws')
    union all
    select
      'legal_knowledge_chunks'::text,
      id::text,
      title,
      coalesce(source_type, 'unknown'),
      metadata,
      coalesce(metadata->>'source_namespace', '<missing>'),
      coalesce(metadata->>'legal_source_registry_id', metadata->>'source_registry_id'),
      coalesce(metadata->>'document_number', metadata->>'letter_number'),
      coalesce(metadata->>'document_date', metadata->>'publication_date', metadata->>'letter_date'),
      coalesce(metadata->>'official_url', metadata->>'source_url')
    from public.legal_knowledge_chunks
    where is_active = true
      and p_scope in ('all', 'knowledge')
  ),
  grouped as (
    select
      source_table,
      case
        when source_table = 'legal_law_chunks' then source_namespace
        else coalesce(metadata->>'source_group_id', 'ungrouped:' || id)
      end as source_group_key,
      count(*)::integer as chunk_count,
      (array_agg(title order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as title,
      (array_agg(source_type order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as source_type,
      (array_agg(source_namespace order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as source_namespace,
      (array_agg(registry_id order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as registry_id,
      (array_agg(document_number order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as document_number,
      (array_agg(document_date order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as document_date,
      (array_agg(source_url order by coalesce((metadata->>'is_source_head')::boolean, false) desc, id))[1] as source_url
    from source_rows
    group by source_table,
      case
        when source_table = 'legal_law_chunks' then source_namespace
        else coalesce(metadata->>'source_group_id', 'ungrouped:' || id)
      end
  )
  select
    g.source_table,
    g.source_group_key,
    g.chunk_count,
    g.title,
    g.source_type,
    g.source_namespace,
    g.registry_id,
    g.document_number,
    g.document_date,
    g.source_url,
    coalesce(c.candidate_count, 0)::integer,
    coalesce(c.candidate_ids, array[]::text[])
  from grouped g
  left join lateral (
    select
      count(*)::integer as candidate_count,
      array_agg(r.id::text order by r.id) as candidate_ids
    from public.legal_source_registry r
    where g.registry_id is null
      and (
        (
          nullif(g.document_number, '') is not null
          and nullif(g.document_date, '') is not null
          and regexp_replace(
                regexp_replace(lower(regexp_replace(g.document_number, '[^[:alnum:]@/-]', '', 'g')), '^n([0-9])', '\\1'),
                '\\s+', '', 'g'
              ) =
              regexp_replace(
                regexp_replace(lower(regexp_replace(coalesce(r.document_number, ''), '[^[:alnum:]@/-]', '', 'g')), '^n([0-9])', '\\1'),
                '\\s+', '', 'g'
              )
          and r.publication_date::text = g.document_date
        )
        or (
          nullif(g.title, '') is not null
          and nullif(g.document_date, '') is not null
          and lower(trim(r.title)) = lower(trim(g.title))
          and r.publication_date::text = g.document_date
        )
      )
  ) c on true
  order by g.source_table, g.chunk_count desc, g.title;
end;
$function$;

revoke all on function public.kati_legal_source_verification_audit_rows(text) from public;
grant execute on function public.kati_legal_source_verification_audit_rows(text)
  to kati_internal_kb_writer, supabase_read_only_user;

comment on function public.kati_legal_source_verification_audit_rows(text) is
  'Read-only, limited projection for legal source identity/registry audit. Does not expose registry content or mutate any records.';
