-- Guarded canonical identity mapping for the five user-supplied judicial documents.
-- This is an identity bridge only. It intentionally does not verify official
-- origin, binary content, temporal applicability, freshness, or substantive use.

create unique index if not exists legal_source_registry_guarded_user_identity_key
  on public.legal_source_registry ((metadata->>'canonical_document_key'))
  where metadata->>'canonical_identity_scope' = 'guarded_user_supplied_v1';

do $$
declare
  expected_group_count constant integer := 5;
  expected_chunk_count constant integer := 171;
  actual_group_count integer;
  actual_chunk_count integer;
  registry_head_count integer;
  linked_chunk_count integer;
begin
  select
    count(distinct chunks.metadata->>'source_group_id'),
    count(*)
  into actual_group_count, actual_chunk_count
  from public.legal_knowledge_chunks chunks
  where chunks.is_active = true
    and chunks.metadata->>'source_group_id' in (
      'd6b6bfb9-6a2a-52eb-9f59-5a9260db0a0c',
      '16887b7d-3714-52bd-8138-491a10a22043',
      '5a12d4f2-9b84-545e-be36-c1b63138a73f',
      '8377b26c-aaff-5300-a769-838148e43cf3',
      'ef0d1258-a1b2-5c30-9adf-ca1ed52c8031'
    )
    and chunks.metadata->>'source_class' = 'user_supplied_retrieval_snapshot';

  if actual_group_count <> expected_group_count or actual_chunk_count <> expected_chunk_count then
    raise exception
      'guarded user-source identity preflight mismatch: expected % groups / % chunks, got % / %',
      expected_group_count, expected_chunk_count, actual_group_count, actual_chunk_count;
  end if;

  with expected (
    source_group_id,
    canonical_document_key,
    title,
    authority_name,
    document_number,
    publication_date,
    official_url_candidate
  ) as (
    values
      (
        'd6b6bfb9-6a2a-52eb-9f59-5a9260db0a0c',
        'ru:court_practice:document:53:2006-10-12',
        'Постановление Пленума ВАС РФ от 12.10.2006 № 53 «Об оценке арбитражными судами обоснованности получения налогоплательщиком налоговой выгоды»',
        'Высший Арбитражный Суд Российской Федерации',
        '53',
        date '2006-10-12',
        'https://vsrf.ru/documents/arbitration/18938/'
      ),
      (
        '16887b7d-3714-52bd-8138-491a10a22043',
        'ru:court_practice:document:57:2013-07-30',
        'Постановление Пленума ВАС РФ от 30.07.2013 № 57 «О некоторых вопросах, возникающих при применении арбитражными судами части первой Налогового кодекса Российской Федерации»',
        'Высший Арбитражный Суд Российской Федерации',
        '57',
        date '2013-07-30',
        'https://www.vsrf.ru/documents/arbitration/17922/'
      ),
      (
        '5a12d4f2-9b84-545e-be36-c1b63138a73f',
        'ru:court_practice:review:vsrf:2015-10-21:chapter-23-tax-code',
        'Обзор практики рассмотрения судами дел, связанных с применением главы 23 Налогового кодекса Российской Федерации',
        'Верховный Суд Российской Федерации',
        null,
        date '2015-10-21',
        'https://vsrf.ru/documents/all/15154/'
      ),
      (
        '8377b26c-aaff-5300-a769-838148e43cf3',
        'ru:court_practice:document:48:2019-11-26',
        'Постановление Пленума Верховного Суда РФ от 26.11.2019 № 48 «О практике применения судами законодательства об ответственности за налоговые преступления»',
        'Верховный Суд Российской Федерации',
        '48',
        date '2019-11-26',
        'https://www.vsrf.ru/documents/own/28483/'
      ),
      (
        'ef0d1258-a1b2-5c30-9adf-ca1ed52c8031',
        'ru:court_practice:review:vsrf:2023-12-13:tax-benefit',
        'Обзор практики применения арбитражными судами положений законодательства о налогах и сборах, связанных с оценкой обоснованности налоговой выгоды',
        'Верховный Суд Российской Федерации',
        null,
        date '2023-12-13',
        'https://www.vsrf.ru/documents/all/33229/'
      )
  )
  insert into public.legal_source_registry (
    title,
    source_type,
    authority_name,
    authority_level,
    jurisdiction,
    practice_area,
    citation,
    document_number,
    publication_date,
    is_external,
    is_official,
    is_active,
    current_status,
    verification_status,
    metadata
  )
  select
    expected.title,
    'court_practice',
    expected.authority_name,
    'supporting',
    'RU',
    'tax',
    expected.title,
    expected.document_number,
    expected.publication_date,
    true,
    false,
    true,
    'unknown',
    'needs_check',
    jsonb_build_object(
      'canonical_identity_scope', 'guarded_user_supplied_v1',
      'canonical_document_key', expected.canonical_document_key,
      'source_group_id', expected.source_group_id,
      'is_source_head', true,
      'identity_mapping_status', 'linked_pending_verification',
      'official_url_candidate', expected.official_url_candidate,
      'official_origin_verified', false,
      'content_verified', false,
      'temporal_verified', false,
      'substantive_use_allowed', false,
      'freshness_status', 'verification_unavailable'
    )
  from expected
  on conflict ((metadata->>'canonical_document_key'))
    where metadata->>'canonical_identity_scope' = 'guarded_user_supplied_v1'
  do nothing;

  select count(*)
  into registry_head_count
  from public.legal_source_registry registry
  where registry.metadata->>'canonical_identity_scope' = 'guarded_user_supplied_v1'
    and registry.metadata->>'source_group_id' in (
      'd6b6bfb9-6a2a-52eb-9f59-5a9260db0a0c',
      '16887b7d-3714-52bd-8138-491a10a22043',
      '5a12d4f2-9b84-545e-be36-c1b63138a73f',
      '8377b26c-aaff-5300-a769-838148e43cf3',
      'ef0d1258-a1b2-5c30-9adf-ca1ed52c8031'
    );

  if registry_head_count <> expected_group_count then
    raise exception
      'guarded user-source identity registry mismatch: expected % heads, got %',
      expected_group_count, registry_head_count;
  end if;

  with mapping as (
    select
      registry.id,
      registry.metadata->>'source_group_id' as source_group_id,
      registry.metadata->>'canonical_document_key' as canonical_document_key
    from public.legal_source_registry registry
    where registry.metadata->>'canonical_identity_scope' = 'guarded_user_supplied_v1'
      and registry.metadata->>'source_group_id' in (
        'd6b6bfb9-6a2a-52eb-9f59-5a9260db0a0c',
        '16887b7d-3714-52bd-8138-491a10a22043',
        '5a12d4f2-9b84-545e-be36-c1b63138a73f',
        '8377b26c-aaff-5300-a769-838148e43cf3',
        'ef0d1258-a1b2-5c30-9adf-ca1ed52c8031'
      )
  ), linked as (
    update public.legal_knowledge_chunks chunks
    set metadata = chunks.metadata || jsonb_build_object(
      'legal_source_registry_id', mapping.id::text,
      'canonical_document_key', mapping.canonical_document_key,
      'registry_match_method', 'guarded_source_group_identity',
      'registry_mapping_status', 'identity_linked_pending_verification'
    )
    from mapping
    where chunks.is_active = true
      and chunks.metadata->>'source_group_id' = mapping.source_group_id
      and chunks.metadata->>'source_class' = 'user_supplied_retrieval_snapshot'
    returning chunks.id
  )
  select count(*) into linked_chunk_count from linked;

  if linked_chunk_count <> expected_chunk_count then
    raise exception
      'guarded user-source identity link mismatch: expected % chunks, got %',
      expected_chunk_count, linked_chunk_count;
  end if;
end;
$$;
