-- Step 10.1: enrich legal_knowledge_chunks.metadata (jsonb-only, reversible)
-- No DDL, no content/embedding changes, no RAG function changes.

-- 1) official_url := metadata.source_url (only when missing)
UPDATE public.legal_knowledge_chunks
SET metadata = metadata || jsonb_build_object('official_url', metadata->>'source_url')
WHERE (metadata ? 'source_url')
  AND COALESCE(NULLIF(metadata->>'source_url',''), '') <> ''
  AND COALESCE(NULLIF(metadata->>'official_url',''), '') = '';

-- 2) source_kind := map(source_type)
UPDATE public.legal_knowledge_chunks
SET metadata = metadata || jsonb_build_object(
  'source_kind',
  CASE source_type
    WHEN 'law_full_text' THEN 'law'
    WHEN 'law_full_text_placeholder' THEN 'law'
    WHEN 'court_practice' THEN 'court_practice'
    WHEN 'fns_letter' THEN 'fns_letter'
    WHEN 'ekaterina_practice' THEN 'ekaterina_practice'
    WHEN 'manual' THEN 'manual'
    ELSE source_type
  END
)
WHERE source_type IS NOT NULL
  AND COALESCE(NULLIF(metadata->>'source_kind',''), '') = '';

-- 3) text_hash := md5(content)
UPDATE public.legal_knowledge_chunks
SET metadata = metadata || jsonb_build_object('text_hash', md5(content))
WHERE content IS NOT NULL
  AND COALESCE(NULLIF(metadata->>'text_hash',''), '') = '';

-- 4) citation_id for law chunks
--    law://<code_name>/article_<article>/chunk_<chunk_index>
--    fallback when code_name missing: use category/source_type/title slug
UPDATE public.legal_knowledge_chunks
SET metadata = metadata || jsonb_build_object(
  'citation_id',
  'law://' ||
  COALESCE(
    NULLIF(lower(regexp_replace(metadata->>'code_name', '[^a-zA-Z0-9а-яА-Я]+', '_', 'g')), ''),
    NULLIF(lower(regexp_replace(category, '[^a-zA-Z0-9а-яА-Я]+', '_', 'g')), ''),
    NULLIF(lower(regexp_replace(source_type, '[^a-zA-Z0-9а-яА-Я]+', '_', 'g')), ''),
    NULLIF(lower(regexp_replace(COALESCE(title, metadata->>'title', ''), '[^a-zA-Z0-9а-яА-Я]+', '_', 'g')), ''),
    'unknown'
  ) ||
  '/article_' || COALESCE(NULLIF(metadata->>'article',''), 'unknown') ||
  '/chunk_'   || COALESCE(NULLIF(metadata->>'chunk_index',''), '0')
)
WHERE source_type IN ('law_full_text','law_full_text_placeholder')
  AND COALESCE(NULLIF(metadata->>'citation_id',''), '') = '';

-- 5) archive_item_id for ekaterina_practice via fuzzy join with lawyer_archive_items
WITH matched AS (
  SELECT lkc.id AS chunk_id, lai.id AS archive_id
  FROM public.legal_knowledge_chunks lkc
  JOIN public.lawyer_archive_items lai
    ON lai.is_active = true
   AND (
     lai.title = lkc.metadata->>'archive_name'
     OR lai.title = lkc.metadata->>'original_file_name'
     OR lai.title = lkc.title
   )
  WHERE lkc.source_type = 'ekaterina_practice'
    AND COALESCE(NULLIF(lkc.metadata->>'archive_item_id',''), '') = ''
)
UPDATE public.legal_knowledge_chunks lkc
SET metadata = lkc.metadata || jsonb_build_object('archive_item_id', m.archive_id::text)
FROM matched m
WHERE lkc.id = m.chunk_id;