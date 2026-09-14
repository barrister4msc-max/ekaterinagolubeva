-- Read-only bounded projection for deterministic legacy content comparison.
create or replace function public.kati_legacy_legal_source_content_rows()
returns table (
  source_group_id text,
  chunk_id text,
  title text,
  source_type text,
  document_number text,
  document_date text,
  official_url text,
  content text,
  content_hash text
)
language sql stable security definer
set search_path = pg_catalog, public
as $function$
  select
    knowledge.metadata->>'source_group_id',
    knowledge.id::text,
    knowledge.title,
    knowledge.source_type,
    coalesce(knowledge.metadata->>'document_number', knowledge.metadata->>'letter_number'),
    coalesce(knowledge.metadata->>'document_date', knowledge.metadata->>'publication_date', knowledge.metadata->>'letter_date'),
    coalesce(knowledge.metadata->>'official_url', knowledge.metadata->>'source_url'),
    knowledge.content,
    knowledge.content_hash
  from public.legal_knowledge_chunks knowledge
  where knowledge.is_active = true
    and knowledge.metadata->>'source_group_id' = any (array[
      '8beec505-4dc5-423a-ac01-f40bea9406af',
      '306872b7-20b3-470f-9c71-55ef6ad4af4e',
      '7f3d94f2-46e9-4cfe-8aad-54db9b361701',
      '28f048be-03c0-42c5-ad18-c1541cbfbc70',
      '95ad0b44-3e3b-4409-b771-958dfecce61d',
      '71c59803-4f1c-4d92-b8f6-44f44999fefa',
      'b3bddf3a-7d00-4732-84f7-e285fcc2a606',
      'aa6fb831-c368-4b1d-bd51-0ece1686f37e'
    ])
  order by knowledge.metadata->>'source_group_id', knowledge.id;
$function$;
revoke all on function public.kati_legacy_legal_source_content_rows() from public;
grant execute on function public.kati_legacy_legal_source_content_rows()
  to kati_internal_kb_writer;
comment on function public.kati_legacy_legal_source_content_rows() is
  'Read-only bounded legacy source projection for content comparison; never returns unrelated knowledge chunks.';