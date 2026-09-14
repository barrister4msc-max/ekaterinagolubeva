-- Correct the read-only audit RPC implementation without changing its access surface.
-- SQL language avoids PL/pgSQL output-variable name collisions.

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
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with source_rows as (
    select
      'legal_law_chunks'::text as source_table,
      law.id::text as row_id,
      law.title as source_title,
      'law_snapshot'::text as source_type_value,
      law.metadata as source_metadata,
      coalesce(law.metadata->>'source_namespace', '<missing>') as source_namespace_value,
      coalesce(law.metadata->>'legal_source_registry_id', law.metadata->>'source_registry_id') as registry_id_value,
      coalesce(law.metadata->>'document_number', law.metadata->>'letter_number') as document_number_value,
      coalesce(law.metadata->>'document_date', law.metadata->>'publication_date', law.metadata->>'letter_date') as document_date_value,
      coalesce(law.metadata->>'official_url', law.metadata->>'source_url') as source_url_value
    from public.legal_law_chunks law
    where law.is_active = true and p_scope in ('all', 'laws')

    union all

    select
      'legal_knowledge_chunks'::text,
      knowledge.id::text,
      knowledge.title,
      coalesce(knowledge.source_type, 'unknown'),
      knowledge.metadata,
      coalesce(knowledge.metadata->>'source_namespace', '<missing>'),
      coalesce(knowledge.metadata->>'legal_source_registry_id', knowledge.metadata->>'source_registry_id'),
      coalesce(knowledge.metadata->>'document_number', knowledge.metadata->>'letter_number'),
      coalesce(knowledge.metadata->>'document_date', knowledge.metadata->>'publication_date', knowledge.metadata->>'letter_date'),
      coalesce(knowledge.metadata->>'official_url', knowledge.metadata->>'source_url')
    from public.legal_knowledge_chunks knowledge
    where knowledge.is_active = true and p_scope in ('all', 'knowledge')
  ),
  grouped as (
    select
      source_table,
      case
        when source_table = 'legal_law_chunks' then source_namespace_value
        else coalesce(source_metadata->>'source_group_id', 'ungrouped:' || row_id)
      end as source_group_key,
      count(*)::integer as chunk_count,
      (array_agg(source_title order by coalesce((source_metadata->>'is_source_head')::boolean, false) desc, row_id))[1] as title,
      (array_agg(source_type_value order by coalesce((source_metadata->>'is_source_head')::boolean, false) desc, row_id))[1] as source_type,
      (array_agg(source_namespace_value order by coalesce((source_metadata->>'is_source_head')::boolean, false) desc, row_id))[1] as source_namespace,
      (array_agg(registry_id_value order by coalesce((source_metadata->>'is_source_head')::boolean, false) desc, row_id))[1] as registry_id,
      (array_agg(document_number_value order by coalesce((source_metadata->>'is_source_head')::boolean, false) desc, row_id))[1] as document_number,
      (array_agg(document_date_value order by coalesce((source_metadata->>'is_source_head')::boolean, false) desc, row_id))[1] as document_date,
      (array_agg(source_url_value order by coalesce((source_metadata->>'is_source_head')::boolean, false) desc, row_id))[1] as source_url
    from source_rows
    group by source_table,
      case
        when source_table = 'legal_law_chunks' then source_namespace_value
        else coalesce(source_metadata->>'source_group_id', 'ungrouped:' || row_id)
      end
  )
  select
    grouped.source_table,
    grouped.source_group_key,
    grouped.chunk_count,
    grouped.title,
    grouped.source_type,
    grouped.source_namespace,
    grouped.registry_id,
    grouped.document_number,
    grouped.document_date,
    grouped.source_url,
    coalesce(candidates.candidate_count, 0)::integer as registry_candidate_count,
    coalesce(candidates.candidate_ids, array[]::text[]) as registry_candidate_ids
  from grouped
  left join lateral (
    select
      count(*)::integer as candidate_count,
      array_agg(registry.id::text order by registry.id) as candidate_ids
    from public.legal_source_registry registry
    where grouped.registry_id is null
      and (
        (
          nullif(grouped.document_number, '') is not null
          and nullif(grouped.document_date, '') is not null
          and regexp_replace(
                regexp_replace(lower(regexp_replace(grouped.document_number, '[^[:alnum:]@/-]', '', 'g')), '^n([0-9])', E'\\1'),
                E'\\s+', '', 'g'
              ) =
              regexp_replace(
                regexp_replace(lower(regexp_replace(coalesce(registry.document_number, ''), '[^[:alnum:]@/-]', '', 'g')), '^n([0-9])', E'\\1'),
                E'\\s+', '', 'g'
              )
          and registry.publication_date::text = grouped.document_date
        )
        or (
          nullif(grouped.title, '') is not null
          and nullif(grouped.document_date, '') is not null
          and lower(trim(registry.title)) = lower(trim(grouped.title))
          and registry.publication_date::text = grouped.document_date
        )
      )
  ) candidates on true
  order by grouped.source_table, grouped.chunk_count desc, grouped.title;
$function$;

revoke all on function public.kati_legal_source_verification_audit_rows(text) from public;
grant execute on function public.kati_legal_source_verification_audit_rows(text)
  to kati_internal_kb_writer, supabase_read_only_user;
