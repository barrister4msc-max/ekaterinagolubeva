-- KATI LAWYER P0-A source-family catalogue.
-- Registration/capability metadata only. This migration deliberately does NOT
-- activate undocumented transports, does NOT create a second source registry,
-- and does NOT grant substantive authority to retrieval/process/data sources.

-- Enrich already-registered FNS/BFO capabilities without changing canonical
-- document storage semantics.
update public.legal_research_sources
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'source_family', 'factual_official_data',
      'capabilities', jsonb_build_array('official_open_data_catalog', 'targeted_dataset_import'),
      'public_access_free', true,
      'automatic_search', false,
      'substantive_use_allowed', false
    ),
    updated_at = now()
where external_id = 'data_nalog';

update public.legal_research_sources
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'source_family', 'factual_official_data',
      'public_lookup_free', true,
      'public_lookup_integration_mode', 'user_session',
      'bulk_api_integration_mode', 'partner_api',
      'bulk_api_requires_subscription', true,
      'automatic_search', false,
      'substantive_use_allowed', false
    ),
    updated_at = now()
where external_id = 'bfo_nalog';

with source_pack(external_id, title, source_type, url, authority_level, jurisdiction, practice_area, is_external, is_active, metadata) as (
  values
    (
      'russian_law_mcp',
      'Russian Law MCP — local retrieval corpus',
      'legal_research_provider',
      'https://github.com/shodenis/Russian-Law-MCP',
      'secondary',
      'RU',
      null,
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'local',
        'automatic_search', false,
        'activation_requires_local_corpus', true,
        'provider_source_class', 'retrieval_intermediary',
        'source_family', 'normative_retrieval',
        'upstream_sources', jsonb_build_array('RusLawOD', 'pravo.gov.ru'),
        'code_license', 'Apache-2.0',
        'official_origin_verified', false,
        'primary_source_verified', false,
        'substantive_use_allowed', false,
        'notes', 'Use as self-hosted broad federal-law retrieval only. Upstream itself requires official verification before professional reliance.'
      )
    ),
    (
      'ruslawod',
      'RusLawOD — Russian Law Open Data',
      'legal_research_dataset',
      'https://github.com/irlcode/RusLawOD',
      'secondary',
      'RU',
      null,
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'manual_import',
        'automatic_search', false,
        'provider_source_class', 'retrieval_intermediary',
        'source_family', 'normative_retrieval',
        'coverage', '1991-2025',
        'contains_consolidated_current_versions', false,
        'official_publication_source', false,
        'official_origin_verified', false,
        'substantive_use_allowed', false,
        'notes', 'Broad/history retrieval corpus. Initial texts and metadata require canonical/official verification.'
      )
    ),
    (
      'duma_api',
      'Государственная Дума — API законодательного процесса',
      'official_research_source',
      'http://api.duma.gov.ru/',
      'official',
      'RU',
      null,
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'direct_api',
        'automatic_search', false,
        'activation_requires_preview_connectivity_test', true,
        'requires_token', true,
        'documented_machine_interface_verified', true,
        'official_source', true,
        'provider_source_class', 'primary_official_data',
        'source_family', 'legislative_process',
        'capabilities', jsonb_build_array('bills', 'legislative_stages', 'deputies', 'sessions', 'votes'),
        'substantive_use_allowed', false,
        'notes', 'Official legislative-process metadata/freshness signal. Never substitute for the officially published current text of a law.'
      )
    ),
    (
      'fns_egrul',
      'ФНС — ЕГРЮЛ/ЕГРИП',
      'official_research_source',
      'https://egrul.nalog.ru/',
      'official',
      'RU',
      null,
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'user_session',
        'automatic_search', false,
        'official_source', true,
        'source_family', 'factual_official_data',
        'public_lookup_free', true,
        'substantive_use_allowed', false,
        'notes', 'Official company identity/factual evidence source. Keep separate from legal authority.'
      )
    ),
    (
      'fns_letters',
      'ФНС — письма и официальные разъяснения',
      'official_research_source',
      'https://www.nalog.gov.ru/',
      'official',
      'RU',
      'tax',
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'manual_import',
        'automatic_search', false,
        'official_source', true,
        'source_family', 'official_explanation',
        'provider_source_class', 'primary_official',
        'substantive_use_allowed', false,
        'notes', 'Official explanation family. Imported records still require identity/content/actuality verification.'
      )
    ),
    (
      'fns_appeal_decisions',
      'ФНС — решения по жалобам',
      'official_research_source',
      'https://www.nalog.gov.ru/',
      'official',
      'RU',
      'tax',
      true,
      true,
      jsonb_build_object(
        'integration_mode', 'manual_import',
        'automatic_search', false,
        'official_source', true,
        'source_family', 'official_explanation',
        'provider_source_class', 'primary_official',
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
  title, source_type, url, external_id, authority_level, jurisdiction,
  practice_area, is_external, is_active, metadata
)
select
  s.title, s.source_type, s.url, s.external_id, s.authority_level,
  s.jurisdiction, s.practice_area, s.is_external, s.is_active, s.metadata
from source_pack s
where not exists (
  select 1 from public.legal_research_sources e where e.external_id = s.external_id
);
