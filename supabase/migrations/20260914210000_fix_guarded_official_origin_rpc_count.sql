-- Correct the return-value accounting in the guarded observation writer.
-- Each update still must affect exactly one registry head; the function now
-- accumulates that count separately from PostgreSQL's per-statement row_count.
create or replace function public.kati_persist_guarded_user_source_official_origin(
  p_results jsonb
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  expected_group_ids constant text[] := array[
    'd6b6bfb9-6a2a-52eb-9f59-5a9260db0a0c',
    '16887b7d-3714-52bd-8138-491a10a22043',
    '5a12d4f2-9b84-545e-be36-c1b63138a73f',
    '8377b26c-aaff-5300-a769-838148e43cf3',
    'ef0d1258-a1b2-5c30-9adf-ca1ed52c8031'
  ];
  seen_group_ids text[] := array[]::text[];
  item record;
  registry_rows integer;
  row_count_value integer;
  updated_count integer := 0;
begin
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) <> 5 then
    raise exception 'guarded official-origin RPC requires exactly 5 results';
  end if;

  for item in
    select *
    from jsonb_to_recordset(p_results) as result(
      source_group_id text,
      canonical_document_key text,
      official_url text,
      http_status integer,
      result text,
      official_origin_verified boolean,
      document_identity_verified boolean,
      content_verified boolean,
      temporal_verified boolean,
      substantive_use_allowed boolean
    )
  loop
    if item.source_group_id is null
       or not (item.source_group_id = any(expected_group_ids))
       or item.source_group_id = any(seen_group_ids) then
      raise exception 'invalid or duplicate guarded source group in RPC payload';
    end if;

    if item.canonical_document_key is null
       or item.official_url is null
       or item.result not in ('official_url_unresolved', 'official_origin_identity_verified_content_pending')
       or item.content_verified is distinct from false
       or item.temporal_verified is distinct from false
       or item.substantive_use_allowed is distinct from false then
      raise exception 'guarded official-origin payload is not fail-closed';
    end if;

    select count(*)
    into registry_rows
    from public.legal_source_registry registry
    where registry.metadata->>'canonical_identity_scope' = 'guarded_user_supplied_v1'
      and registry.metadata->>'source_group_id' = item.source_group_id
      and registry.metadata->>'canonical_document_key' = item.canonical_document_key
      and registry.is_active = true;

    if registry_rows <> 1 then
      raise exception 'expected one active registry head for guarded source %, got %',
        item.source_group_id, registry_rows;
    end if;

    seen_group_ids := array_append(seen_group_ids, item.source_group_id);
  end loop;

  if not (expected_group_ids <@ seen_group_ids and seen_group_ids <@ expected_group_ids) then
    raise exception 'guarded official-origin RPC payload does not cover the exact five groups';
  end if;

  for item in
    select *
    from jsonb_to_recordset(p_results) as result(
      source_group_id text,
      canonical_document_key text,
      official_url text,
      http_status integer,
      result text,
      official_origin_verified boolean,
      document_identity_verified boolean,
      content_verified boolean,
      temporal_verified boolean,
      substantive_use_allowed boolean
    )
  loop
    update public.legal_source_registry registry
    set
      is_official = (item.official_origin_verified is true and item.document_identity_verified is true),
      current_status = 'unknown',
      verification_status = item.result,
      last_checked_at = now(),
      metadata = registry.metadata || jsonb_build_object(
        'official_verification_observation', jsonb_build_object(
          'verifier', 'guarded_official_origin_verifier_v1',
          'checked_at', now(),
          'official_url', item.official_url,
          'http_status', item.http_status,
          'result', item.result,
          'content_comparison', 'not_performed',
          'temporal_applicability', 'not_verified'
        ),
        'official_origin_verified', (item.official_origin_verified is true),
        'document_identity_verified', (item.document_identity_verified is true),
        'content_verified', false,
        'temporal_verified', false,
        'substantive_use_allowed', false,
        'freshness_status', 'verification_unavailable'
      )
    where registry.metadata->>'canonical_identity_scope' = 'guarded_user_supplied_v1'
      and registry.metadata->>'source_group_id' = item.source_group_id
      and registry.metadata->>'canonical_document_key' = item.canonical_document_key
      and registry.is_active = true;

    get diagnostics row_count_value = row_count;
    if row_count_value <> 1 then
      raise exception 'guarded official-origin RPC updated % rows for source %',
        row_count_value, item.source_group_id;
    end if;
    updated_count := updated_count + 1;
  end loop;

  return updated_count;
end;
$function$;

revoke all on function public.kati_persist_guarded_user_source_official_origin(jsonb) from public;
grant execute on function public.kati_persist_guarded_user_source_official_origin(jsonb)
  to kati_internal_kb_writer;

comment on function public.kati_persist_guarded_user_source_official_origin(jsonb) is
  'Narrow fail-closed writer for exactly five guarded official-origin observations. Does not update chunks, embeddings, substantive-use flags, or legal_law_chunks.';