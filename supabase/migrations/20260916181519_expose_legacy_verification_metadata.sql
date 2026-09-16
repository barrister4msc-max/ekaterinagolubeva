-- Expose legacy verification metadata only to the already-restricted internal
-- reader so its hash-only queue can label conflicting historical claims.
-- No legal-source rows or verification fields are written by this migration.
drop function if exists public.kati_legacy_legal_source_content_rows(text[]);

create or replace function public.kati_legacy_legal_source_content_rows(p_group_ids text[])
returns table (
  source_group_id text,
  chunk_id text,
  chunk_index integer,
  chunks_total integer,
  title text,
  source_type text,
  document_number text,
  document_date text,
  official_url text,
  content text,
  content_hash text,
  verification_status text,
  official_status text,
  official_origin_verified boolean,
  content_verified boolean,
  temporal_verified boolean,
  substantive_use_allowed boolean
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
    case when k.metadata->>'chunk_index' ~ '^[0-9]+$' then (k.metadata->>'chunk_index')::integer end,
    case when k.metadata->>'chunks_total' ~ '^[0-9]+$' then (k.metadata->>'chunks_total')::integer end,
    k.title,
    k.source_type,
    coalesce(k.metadata->>'document_number', k.metadata->>'letter_number'),
    coalesce(k.metadata->>'document_date', k.metadata->>'publication_date', k.metadata->>'letter_date'),
    coalesce(k.metadata->>'official_url', k.metadata->>'source_url'),
    k.content,
    encode(extensions.digest(k.content, 'sha256'), 'hex'),
    k.metadata->>'verification_status',
    k.metadata->>'official_status',
    case when lower(coalesce(k.metadata->>'official_origin_verified', '')) in ('true', 'false')
      then (k.metadata->>'official_origin_verified')::boolean end,
    case when lower(coalesce(k.metadata->>'content_verified', '')) in ('true', 'false')
      then (k.metadata->>'content_verified')::boolean end,
    case when lower(coalesce(k.metadata->>'temporal_verified', '')) in ('true', 'false')
      then (k.metadata->>'temporal_verified')::boolean end,
    case when lower(coalesce(k.metadata->>'substantive_use_allowed', '')) in ('true', 'false')
      then (k.metadata->>'substantive_use_allowed')::boolean end
  from public.legal_knowledge_chunks k
  where k.is_active
    and k.metadata->>'source_group_id' = any(p_group_ids)
    and k.source_type in ('law_full_text', 'court_practice', 'fns_letter', 'minfin_letter', 'manual_source')
    and coalesce(k.metadata->>'legal_source_registry_id', k.metadata->>'source_registry_id') is null
  order by
    k.metadata->>'source_group_id',
    case when k.metadata->>'chunk_index' ~ '^[0-9]+$' then (k.metadata->>'chunk_index')::integer end nulls last,
    k.id;
end;
$$;

revoke all on function public.kati_legacy_legal_source_content_rows(text[]) from public, anon, authenticated, service_role;
grant execute on function public.kati_legacy_legal_source_content_rows(text[]) to kati_internal_kb_writer;

comment on function public.kati_legacy_legal_source_content_rows(text[]) is
  'Bounded internal-only read projection for legacy content comparison; exposes structural and legacy verification metadata, calculates SHA-256 in database, and never writes legal-source verification fields.';
