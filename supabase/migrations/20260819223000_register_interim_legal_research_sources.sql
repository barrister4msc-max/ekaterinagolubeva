-- KATI LAWYER interim legal research source pack.
-- Registration/routing metadata only. This migration does NOT create hidden
-- scrapers or undocumented backend integrations and does NOT grant authority
-- to retrieval-only/secondary sources.

with source_pack(external_id, title, source_type, url, authority_level, jurisdiction, practice_area, is_external, is_active, metadata) as (
  values
    (
      'law7',
      'Law7 TAX CORE',
      'legal_research_provider',
      null,
      'retrieval_intermediary',
      'RU',
      'tax',
      false,
      true,
      jsonb_build_object(
        'integration_mode', 'local',
        'automatic_search', true,
        'provider_source_class', 'retrieval_intermediary',
        'retrieval_method', 'supabase_law7_mirror',
        'official_origin_verified', false,
        'primary_source_verified', false,
        'substantive_use_allowed', false,
        'notes', 'Local Law7 mirror for retrieval only until canonical/official verification.'
      )
    ),
    (
      'data_nalog',
      'ФНС — data.nalog.ru',
      'official_research_source',
      'https://data.nalog.ru/',
      'official',
      'RU',
      'tax',
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'user_session',
        'automatic_search', false,
        'official_source', true,
        'documented_machine_interface_verified', false,
        'substantive_use_allowed', false
      )
    ),
    (
      'bfo_nalog',
      'ФНС — Ресурс БФО',
      'official_research_source',
      'https://bo.nalog.gov.ru/',
      'official',
      'RU',
      'tax',
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'partner_api',
        'automatic_search', false,
        'official_source', true,
        'api_host', 'https://api-bo.nalog.gov.ru',
        'requires_subscription', true,
        'substantive_use_allowed', false
      )
    ),
    (
      'minfin',
      'Минфин России',
      'official_research_source',
      'https://minfin.gov.ru/',
      'official',
      'RU',
      'tax',
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'user_session',
        'automatic_search', false,
        'official_source', true,
        'documented_machine_interface_verified', false,
        'substantive_use_allowed', false
      )
    ),
    (
      'klerk',
      'Клерк',
      'secondary_research_source',
      'https://www.klerk.ru/',
      'secondary',
      'RU',
      'tax',
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'manual_import',
        'automatic_search', false,
        'official_source', false,
        'provider_source_class', 'secondary_analysis',
        'discovery_only', true,
        'substantive_use_allowed', false
      )
    ),
    (
      'sudact',
      'СудАкт',
      'secondary_research_source',
      'https://sudact.ru/',
      'secondary',
      'RU',
      null,
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'manual_import',
        'automatic_search', false,
        'official_source', false,
        'provider_source_class', 'secondary_document_copy',
        'discovery_only', true,
        'substantive_use_allowed', false
      )
    ),
    (
      'kad',
      'Картотека арбитражных дел',
      'official_research_source',
      'https://kad.arbitr.ru/',
      'official',
      'RU',
      null,
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'user_session',
        'automatic_search', false,
        'official_source', true,
        'documented_machine_interface_verified', false,
        'substantive_use_allowed', false
      )
    ),
    (
      'vsrf',
      'Верховный Суд РФ',
      'official_research_source',
      'https://www.vsrf.ru/',
      'supreme_court',
      'RU',
      null,
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'user_session',
        'automatic_search', false,
        'official_source', true,
        'documented_machine_interface_verified', false,
        'substantive_use_allowed', false
      )
    )
), updated as (
  update public.legal_research_sources t
  set
    title = s.title,
    source_type = s.source_type,
    url = s.url,
    authority_level = s.authority_level,
    jurisdiction = s.jurisdiction,
    practice_area = s.practice_area,
    is_external = s.is_external,
    is_active = s.is_active,
    metadata = coalesce(t.metadata, '{}'::jsonb) || s.metadata,
    updated_at = now()
  from source_pack s
  where t.external_id = s.external_id
  returning t.external_id
)
insert into public.legal_research_sources (
  title,
  source_type,
  url,
  external_id,
  authority_level,
  jurisdiction,
  practice_area,
  is_external,
  is_active,
  metadata
)
select
  s.title,
  s.source_type,
  s.url,
  s.external_id,
  s.authority_level,
  s.jurisdiction,
  s.practice_area,
  s.is_external,
  s.is_active,
  s.metadata
from source_pack s
where not exists (
  select 1
  from public.legal_research_sources existing
  where existing.external_id = s.external_id
);
