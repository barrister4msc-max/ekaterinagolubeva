-- Correct the bounded read RPC to compute its content hash from the actual source text.
-- Restrict execution explicitly to the internal verification role.
create or replace function public.kati_legacy_legal_source_content_rows(p_group_ids text[])
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
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(array_length(p_group_ids, 1), 0) = 0
     or array_length(p_group_ids, 1) > 32 then
    raise exception 'requires 1 to 32 manifest source groups';
  end if;

  return query
  select
    k.metadata->>'source_group_id',
    k.id::text,
    k.title,
    k.source_type,
    coalesce(k.metadata->>'document_number', k.metadata->>'letter_number'),
    coalesce(k.metadata->>'document_date', k.metadata->>'publication_date', k.metadata->>'letter_date'),
    coalesce(k.metadata->>'official_url', k.metadata->>'source_url'),
    k.content,
    encode(extensions.digest(k.content, 'sha256'), 'hex')
  from public.legal_knowledge_chunks k
  where k.is_active
    and k.metadata->>'source_group_id' = any(p_group_ids)
    and k.source_type in ('law_full_text', 'court_practice', 'fns_letter', 'minfin_letter', 'manual_source')
    and coalesce(k.metadata->>'legal_source_registry_id', k.metadata->>'source_registry_id') is null
  order by k.metadata->>'source_group_id', k.id;
end;
$$;

revoke all on function public.kati_legacy_legal_source_content_rows(text[]) from public, anon, authenticated, service_role;
grant execute on function public.kati_legacy_legal_source_content_rows(text[]) to kati_internal_kb_writer;

comment on function public.kati_legacy_legal_source_content_rows(text[]) is
  'Bounded read-only manifest projection for legacy content comparison; SHA-256 is calculated in database and execution is internal-role-only.';
