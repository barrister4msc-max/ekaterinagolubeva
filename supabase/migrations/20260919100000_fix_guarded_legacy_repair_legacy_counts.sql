-- Correct the immutable guarded-repair precondition to the actual legacy
-- inventory: one active FNS row and five active VAS №53 rows.  This does not
-- write source data; it only replaces the private RPC definition.

create or replace function private.kati_apply_guarded_legacy_legal_source_repair(
  p_sources jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_item jsonb;
  v_key text;
  v_group_id uuid;
  v_legacy_group_id uuid;
  v_object_name text;
  v_size bigint;
  v_storage_sha text;
  v_chunks jsonb;
  v_expected_chunks integer;
  v_expected_legacy_rows integer;
  v_expected_group_id uuid;
  v_expected_legacy_group_id uuid;
  v_expected_size bigint;
  v_expected_storage_sha text;
  v_expected_hashes text[];
  v_chunk_index integer;
  v_content text;
  v_metadata jsonb;
  v_title text;
  v_source_type text;
  v_active_legacy integer;
  v_deactivated integer;
  v_legacy_eligible boolean;
  v_inserted integer := 0;
  v_seen text[] := array[]::text[];
begin
  if jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) <> 2 then
    raise exception 'guarded legacy repair requires exactly two sources';
  end if;

  for v_item in select value from jsonb_array_elements(p_sources)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or (v_item - 'canonical_document_key' - 'source_group_id' - 'legacy_source_group_id'
                  - 'storage_object_name' - 'storage_size_bytes' - 'storage_sha256' - 'chunks') <> '{}'::jsonb then
      raise exception 'guarded legacy repair payload has an unexpected field';
    end if;

    v_key := v_item->>'canonical_document_key';
    if v_key is null or v_key = any(v_seen) then
      raise exception 'guarded legacy repair identity is missing or duplicated';
    end if;
    v_seen := array_append(v_seen, v_key);

    begin
      v_group_id := (v_item->>'source_group_id')::uuid;
      v_legacy_group_id := (v_item->>'legacy_source_group_id')::uuid;
      v_size := (v_item->>'storage_size_bytes')::bigint;
    exception when invalid_text_representation then
      raise exception 'guarded legacy repair has invalid identifier or size';
    end;
    v_object_name := v_item->>'storage_object_name';
    v_storage_sha := lower(v_item->>'storage_sha256');
    v_chunks := v_item->'chunks';

    if v_object_name is null or v_object_name !~ '^[A-Za-z0-9._-]+$'
       or v_storage_sha is null or v_storage_sha !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(v_chunks) is distinct from 'array' then
      raise exception 'guarded legacy repair has invalid Storage evidence';
    end if;

    case v_key
      when 'ru:fns:letter:BV-4-7/3060@:2021-03-10' then
        v_expected_group_id := '37c2c727-cc47-5e65-b60a-e43e344f89d4'::uuid;
        v_expected_legacy_group_id := '7f3d94f2-46e9-4cfe-8aad-54db9b361701'::uuid;
        v_expected_legacy_rows := 1;
        v_expected_chunks := 39;
        v_expected_size := 182784;
        v_expected_storage_sha := 'e3b8dfafcef6ff12e1d9c9a61235d33e8146861f1f5009621f08bd72bb211509';
        v_expected_hashes := array[
          '2d8edf9c887221d9b6bdccb7b72f338c17ef02130520325f948c02ccbd69bd22','c4228e617663c8bc5c3e1cce01c2c66ddbf8d0084f2db9661fddaf4e6b7c6960','0d234cf73484240c536537225d7e61aa4f8554eea0470058b6bc32894143bdfd','4837c6acd162d9da5c2a41998c8017d8b5345826d1b66c9a63e71304ebd2cb87','791ab1ab164231f9ce7d6c5dca20080e5d0b2406ca890619535e4d600efef6d2','c1498fbdfd1a58574a832da81333fa6dfcec19078979332f0010956869c18848','96e2bcb448f5d8d4c41fe4f24563179d3d85e76d01a62b93ebbfa09bf0372ffd','80528e5ce4294217bf9ab8b3a6082942a3b7ddfa5c1591bc4b0ce830147d1239','22499e64caf028a01e7933c1c417333793e7be96b9b1419795b611d1dffba640','52a93649a1ceb0a76eec4706281d5ba39df6fda4403938150e858bafe1ad8a00','c94dd3312e285014c49e4c226f6810d91f3034976757c3be6294c56bf5479176','be3d8d9e3c0c238b2063c6e74531b702264e25349d9625105e85f5dde7878f71','35b856a4d147aed73d84496d03c0744764c326dd79a0df9ba322ba8f0b29f02c','7e93156d629437f1a499fda14bf129940454b72664424f2da4d4b0128901fee9','5a1c79159e1315c149c210766a9ed5b5d57eb0c18cea267f619b95f506c0ae8c','0893ff72894718092a2675f818618d4c9dffe225f26497819232880c22720813','f81c0792b8db477c0cecd4e2148f353367d46702cfd70e6c9ef0b02a2370ec3c','3b0b7d095b2bbbfb77353adf831e33630c2a2c97a8fa770fed64411a5db638b5','bbac3f79a02ca197b78ab9cd5ef00df078ece72af0d0c66d164d35147d990da7','dd9986cade82ce8a6485602cb7869e64a67a0cabdb06712ea23e652a46c945e0','88630a83514dc4315718e84ed198fc538e18726f400e591c54e1166f90fb53ae','18cfb69126ee85cf1b3d8b4a2090a7eac3a1d8558e46292b4b63d91fcbbe1f3c','0d8cd15ec77eda13183bc23965c054276c20e5810d8968beb1b6ff19db7cea9d','1df2f43ed7cf0ec6504644402216dd046ebadbf4fa6d989a31b610f76306adab','af062e91cd15ad6427d9dab4ca4d18bb3c0e4738ad0f05f90b3048d510cadc3c','dbfb9984c0810934ee709522c7bc742159cb6762726398437fe313ab03ab8acb','73506b2de14d047d3d81424b33ec1792018c582d75a507595dcc8d0746b33627','8de534cf357dfbacb3612a5b05238625a3be2ad903bdcc305bc5ae4384e11a91','4c5494fdbe5ebffe588ad87e4db352e3524f18fc73907d79152f9ec7849a744b','b1948fdc260c1a259f1b2f821e98cdd80a929558d9f8bdb92cfcc3f1c584185e','c798cbbb746462db245ad003bf959efdca007b74a335ab970855b12dfa4cc186','4ecd63712ee9dd695756fbddb0f79152c5395ffff7c747b4e5cc614e965083dc','a7b295e5a2982a960ac904e6c7fba73f3490aa9c692ab3762e6ec8e5c1f8d55b','f4c6de73a1f124bb5a2a81696b97114c7e80f1e2024d5ecda2228b130794ecb6','c8978f6a654366ef327205cdf396b436706cebcca8e2a7eff0d5ed9d65b24313','9a0b3f3ed519468f10366d5154b862d34970a2cbeeefc71b4e5d7ed763eba194','7950cd9baec51aa2a60cd8dd5a79a977129fdb9408ac5f65ca44b4410f9d22e0','01912bff4b5c21aa7ff28b59d6921e94075c7e95482be8561c681f3fb2af0166','a3acaf97d9ed3221a9b2183cf23aa67d31b325370533629b254f17f218c2cd6b'
        ];
        v_title := 'Письмо ФНС России от 10.03.2021 № БВ-4-7/3060@';
        v_source_type := 'fns_letter';
        v_metadata := jsonb_build_object(
          'source_group_id', v_group_id::text, 'supersedes_source_group_id', v_legacy_group_id::text,
          'canonical_document_key', v_key, 'source_type', v_source_type,
          'source_class', 'user_supplied_retrieval_snapshot', 'title', v_title,
          'authority', 'ФНС России', 'document_type', 'fns_letter', 'document_number', 'БВ-4-7/3060@',
          'document_date', '2021-03-10', 'source_url', 'https://www.nalog.gov.ru/rn77/about_fts/about_nalog/10687108/',
          'official_source_domain', 'nalog.gov.ru', 'official_origin_observed', true,
          'official_metadata_verified', true, 'document_identity_verified', false,
          'storage_bucket', 'communication-attachments', 'storage_object_name', v_object_name,
          'original_file_name', 'fns3060_100321.doc', 'normalized_file_name', 'fns3060_100321.doc',
          'file_mime', 'application/msword', 'storage_size_bytes', v_size,
          'original_sha256', v_expected_storage_sha, 'normalized_sha256', v_expected_storage_sha,
          'storage_sha256', v_expected_storage_sha, 'text_sha256', 'a252c0ae1ca4c7ea31dcc128d6e7a4ae1eb00c6d3f45f104af9662ca355c716e',
          'pages_total', 26, 'extraction_method', 'word_text', 'ocr_required', false,
          'ocr_status', 'completed', 'extraction_status', 'completed', 'metadata_status', 'official_metadata_verified',
          'verification_status', 'metadata_officially_verified_content_pending', 'official_origin_verified', false,
          'content_verified', false, 'temporal_verified', false, 'substantive_use_allowed', false,
          'use_in_generation', false, 'trust_level', 'high', 'ingest_mode', 'guarded_legacy_repair_v1',
          'embedding_status', 'pending', 'chunks_total', v_expected_chunks
        );
      when 'ru:court_practice:plenum_vas:53:2006-10-12' then
        v_expected_group_id := '5428965e-92cd-52a9-a12b-0680e85adf95'::uuid;
        v_expected_legacy_group_id := '95ad0b44-3e3b-4409-b771-958dfecce61d'::uuid;
        v_expected_legacy_rows := 5;
        v_expected_chunks := 6;
        v_expected_size := 2105783;
        v_expected_storage_sha := 'f2c579f808bb05149211d60e9e3a85667b090542715db07ffdc5ac12a072c752';
        v_expected_hashes := array[
          'c5f4aceddd79fabbccf335a90abc3f640e334e2fb431104b9a8ccc2a6a140459','ce3b616bfd1e0acf1df0d7f0a05c410ada0bc54ea3014bd47cd75e44b385aba3','3d203b4c81e08ddd77475bf035c4bef452c470134a0e62adc88f6b6bb00d22da','3844690a5e968a83dfdad9477fb90418d706074f1c851c0e698bcb97b990719e','2003402b2d6dd0af429f2e08572273f4e2ced247034e33ca67391dc9d3cd9ce8','f82195e6b7bc536307a449738184190f9eb859cffe57c44db1930dd77943a0d5'
        ];
        v_title := 'Постановление Пленума ВАС РФ от 12.10.2006 № 53';
        v_source_type := 'court_practice';
        v_metadata := jsonb_build_object(
          'source_group_id', v_group_id::text, 'supersedes_source_group_id', v_legacy_group_id::text,
          'canonical_document_key', v_key, 'source_type', v_source_type,
          'source_class', 'user_supplied_retrieval_snapshot', 'title', v_title,
          'authority', 'Высший Арбитражный Суд Российской Федерации', 'document_type', 'plenum_resolution',
          'document_number', '53', 'document_date', '2006-10-12', 'historical_VAS', true,
          'source_url', 'https://vsrf.ru/documents/arbitration/18938/', 'official_source_domain', 'vsrf.ru',
          'official_origin_observed', true, 'official_metadata_verified', true, 'document_identity_verified', false,
          'storage_bucket', 'communication-attachments', 'storage_object_name', v_object_name,
          'original_file_name', 'KATI_VAS_53_2006-10-12.pdf', 'normalized_file_name', 'KATI_VAS_53_2006-10-12.pdf',
          'file_mime', 'application/pdf', 'storage_size_bytes', v_size,
          'original_sha256', '217e04b39380ee92b9199e30c0bd2621ca580589513eed745d6d592ded710f84',
          'normalized_sha256', v_expected_storage_sha, 'storage_sha256', v_expected_storage_sha,
          'text_sha256', '480b74ff3bb7ea2aee5b5b7547af266e4e96216fbdc724019d2247ae1938ac59',
          'pages_total', 6, 'extraction_method', 'ocr', 'ocr_required', true, 'ocr_status', 'completed',
          'extraction_status', 'completed', 'metadata_status', 'official_metadata_verified',
          'verification_status', 'metadata_officially_verified_content_pending', 'official_origin_verified', false,
          'content_verified', false, 'temporal_verified', false, 'substantive_use_allowed', false,
          'use_in_generation', false, 'trust_level', 'high', 'ingest_mode', 'guarded_legacy_repair_v1',
          'embedding_status', 'pending', 'chunks_total', v_expected_chunks
        );
      else
        raise exception 'guarded legacy repair identity is outside scope';
    end case;

    if v_group_id is distinct from v_expected_group_id
       or v_legacy_group_id is distinct from v_expected_legacy_group_id
       or v_size is distinct from v_expected_size
       or v_storage_sha is distinct from v_expected_storage_sha
       or jsonb_array_length(v_chunks) is distinct from v_expected_chunks then
      raise exception 'guarded legacy repair evidence does not match approved identity %', v_key;
    end if;

    for v_chunk_index in 0..(v_expected_chunks - 1)
    loop
      if jsonb_typeof(v_chunks->v_chunk_index) is distinct from 'object'
         or (v_chunks->v_chunk_index - 'content') <> '{}'::jsonb then
        raise exception 'guarded legacy repair chunk payload is malformed';
      end if;
      v_content := v_chunks->v_chunk_index->>'content';
      if v_content is null
         or encode(extensions.digest(v_content, 'sha256'), 'hex') <> v_expected_hashes[v_chunk_index + 1] then
        raise exception 'guarded legacy repair chunk digest mismatch at %', v_chunk_index;
      end if;
    end loop;

    if exists (
      select 1 from public.legal_knowledge_chunks
      where metadata->>'source_group_id' = v_group_id::text
    ) then
      raise exception 'guarded legacy repair replacement group already exists';
    end if;

    select count(*), bool_and(
      coalesce(metadata->>'ingest_mode', '') = 'manual_text'
      and coalesce(metadata->>'content_verified', 'false') = 'false'
      and coalesce(metadata->>'temporal_verified', 'false') = 'false'
      and coalesce(metadata->>'substantive_use_allowed', 'false') = 'false'
      and coalesce(metadata->>'use_in_generation', 'false') = 'false'
    ) into v_active_legacy, v_legacy_eligible
    from public.legal_knowledge_chunks
    where is_active is true and metadata->>'source_group_id' = v_legacy_group_id::text;

    if v_active_legacy <> v_expected_legacy_rows or v_legacy_eligible is not true then
      raise exception 'guarded legacy repair source is not an eligible fail-closed legacy group';
    end if;

    update public.legal_knowledge_chunks
    set is_active = false,
        metadata = metadata || jsonb_build_object(
          'superseded_by_source_group_id', v_group_id::text,
          'supersession_reason', 'guarded_complete_snapshot_repair'
        )
    where is_active is true and metadata->>'source_group_id' = v_legacy_group_id::text;
    get diagnostics v_deactivated = row_count;
    if v_deactivated <> v_expected_legacy_rows then
      raise exception 'guarded legacy repair deactivated an unexpected row count';
    end if;

    for v_chunk_index in 0..(v_expected_chunks - 1)
    loop
      v_content := v_chunks->v_chunk_index->>'content';
      insert into public.legal_knowledge_chunks (id, category, title, content, metadata, is_active, source_type)
      values (
        gen_random_uuid(),
        'tax', v_title, v_content,
        v_metadata || jsonb_build_object('chunk_index', v_chunk_index, 'is_source_head', v_chunk_index = 0),
        true, v_source_type
      );
      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  if not (
    array['ru:fns:letter:BV-4-7/3060@:2021-03-10', 'ru:court_practice:plenum_vas:53:2006-10-12'] <@ v_seen
    and v_seen <@ array['ru:fns:letter:BV-4-7/3060@:2021-03-10', 'ru:court_practice:plenum_vas:53:2006-10-12']
  ) then
    raise exception 'guarded legacy repair does not cover the exact approved sources';
  end if;

  return jsonb_build_object(
    'source_groups', 2, 'chunks_inserted', v_inserted, 'legacy_groups_deactivated', 2,
    'fail_closed', true, 'legal_law_chunks_touched', false, 'legal_source_registry_touched', false
  );
end;
$function$;

