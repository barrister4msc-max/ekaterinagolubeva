-- ============================================================
-- Step 10.3 SAFE BATCH v2 (LAWS fix): enrich metadata.locator only
-- Table: public.legal_knowledge_chunks
-- Strategy: locator = COALESCE(locator,'{}') || jsonb_strip_nulls(patch)
-- Touches ONLY metadata.locator.* — never replaces metadata or locator wholesale.
-- ============================================================

-- 1) LAWS: locator.normalized_article from metadata.article
--    Selector fixed: rely on metadata.source_kind = 'law' (not source_type).
WITH src AS (
  SELECT
    id,
    NULLIF(regexp_replace(COALESCE(metadata->>'article',''), '[^0-9\.]', '', 'g'), '') AS normalized_article
  FROM public.legal_knowledge_chunks
  WHERE metadata->>'source_kind' = 'law'
)
UPDATE public.legal_knowledge_chunks c
SET metadata = jsonb_set(
  c.metadata,
  '{locator}',
  COALESCE(c.metadata->'locator', '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object('normalized_article', src.normalized_article))
)
FROM src
WHERE c.id = src.id
  AND src.normalized_article IS NOT NULL;

-- 2) COURT PRACTICE: court, act_type, act_number, act_date (date only from title in dd.mm.yyyy form)
WITH src AS (
  SELECT
    id,
    title,
    CASE
      WHEN title ~* 'Конституционн[а-я]* Суд'                     THEN 'КС РФ'
      WHEN title ~* 'Верховн[а-я]* Суд'                            THEN 'ВС РФ'
      WHEN title ~* 'Высш[а-я]* Арбитражн[а-я]* Суд'               THEN 'ВАС РФ'
      WHEN title ~* 'Арбитражн[а-я]* суд[а-я]* (Московского|Волго-Вятского|Восточно-Сибирского|Дальневосточного|Западно-Сибирского|Поволжского|Северо-Западного|Северо-Кавказского|Уральского|Центрального) округа'
                                                                   THEN 'АС округа'
      WHEN title ~* 'Кассационн[а-я]* (суд|апелляционн)'           THEN 'Кассационный суд'
      WHEN title ~* 'Апелляционн[а-я]* суд'                        THEN 'Апелляционный суд'
      WHEN title ~* 'Арбитражн[а-я]* суд'                          THEN 'Арбитражный суд'
      ELSE NULL
    END AS court,
    CASE
      WHEN title ~* 'Постановлени[а-я]* Пленума'   THEN 'Постановление Пленума'
      WHEN title ~* 'Обзор'                         THEN 'Обзор практики'
      WHEN title ~* 'Информационн[а-я]* письм'      THEN 'Информационное письмо'
      WHEN title ~* 'Постановлени'                  THEN 'Постановление'
      WHEN title ~* 'Определени'                    THEN 'Определение'
      WHEN title ~* 'Решени'                        THEN 'Решение'
      ELSE NULL
    END AS act_type,
    (regexp_match(title, '(?:№|N|N°)\s*([A-ZА-Я0-9\-\/]+)'))[1] AS act_number,
    CASE
      WHEN (regexp_match(title, '(\d{2})\.(\d{2})\.(\d{4})')) IS NOT NULL THEN
        ((regexp_match(title, '(\d{2})\.(\d{2})\.(\d{4})'))[3]
         || '-' || (regexp_match(title, '(\d{2})\.(\d{2})\.(\d{4})'))[2]
         || '-' || (regexp_match(title, '(\d{2})\.(\d{2})\.(\d{4})'))[1])
      ELSE NULL
    END AS act_date
  FROM public.legal_knowledge_chunks
  WHERE source_type = 'court_practice'
)
UPDATE public.legal_knowledge_chunks c
SET metadata = jsonb_set(
  c.metadata,
  '{locator}',
  COALESCE(c.metadata->'locator', '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
         'court',      src.court,
         'act_type',   src.act_type,
         'act_number', src.act_number,
         'act_date',   src.act_date
       ))
)
FROM src
WHERE c.id = src.id
  AND (src.court IS NOT NULL
    OR src.act_type IS NOT NULL
    OR src.act_number IS NOT NULL
    OR src.act_date IS NOT NULL);

-- 3) FNS LETTERS: letter_number, letter_date (only from title)
WITH src AS (
  SELECT
    id,
    title,
    (regexp_match(title, '([A-ZА-Я]{2,3}-[0-9]+-[0-9]+/[0-9]+@?)'))[1] AS letter_number,
    CASE
      WHEN (regexp_match(title, '(\d{2})\.(\d{2})\.(\d{4})')) IS NOT NULL THEN
        ((regexp_match(title, '(\d{2})\.(\d{2})\.(\d{4})'))[3]
         || '-' || (regexp_match(title, '(\d{2})\.(\d{2})\.(\d{4})'))[2]
         || '-' || (regexp_match(title, '(\d{2})\.(\d{2})\.(\d{4})'))[1])
      ELSE NULL
    END AS letter_date
  FROM public.legal_knowledge_chunks
  WHERE source_type = 'fns_letter'
)
UPDATE public.legal_knowledge_chunks c
SET metadata = jsonb_set(
  c.metadata,
  '{locator}',
  COALESCE(c.metadata->'locator', '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
         'letter_number', src.letter_number,
         'letter_date',   src.letter_date
       ))
)
FROM src
WHERE c.id = src.id
  AND (src.letter_number IS NOT NULL OR src.letter_date IS NOT NULL);
