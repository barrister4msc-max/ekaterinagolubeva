UPDATE public.legal_knowledge_chunks
SET metadata = jsonb_set(
  metadata,
  '{locator}',
  COALESCE(metadata->'locator', '{}'::jsonb)
    || jsonb_build_object('court', 'ВАС РФ'),
  true
)
WHERE metadata->>'source_kind' = 'court_practice'
  AND title ILIKE '%ВАС РФ%'
  AND COALESCE(metadata->'locator'->>'court', '') = '';