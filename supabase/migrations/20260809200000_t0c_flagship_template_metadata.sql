-- T0-C: mark the five approved flagship templates in the canonical registry.
--
-- This migration is registry-only. It intentionally does not change UI code,
-- template consumers, or the legacy public.document_templates table.

DO $guard$
DECLARE
  matched_count integer;
BEGIN
  WITH expected(code, flagship_rank) AS (
    VALUES
      ('response_to_tax_request', 1),
      ('tax_explanations', 2),
      ('tax_vat_explanations', 3),
      ('tax_strategy_memo', 4),
      ('tax_court_position', 5)
  )
  SELECT count(template.code)
  INTO matched_count
  FROM expected
  LEFT JOIN public.legal_document_templates AS template
    ON template.code = expected.code;

  IF matched_count <> 5 THEN
    RAISE EXCEPTION
      'T0-C aborted: expected all five exact flagship template codes, found %',
      matched_count;
  END IF;
END;
$guard$;

WITH flagship(code, title, flagship_rank) AS (
  VALUES
    ('response_to_tax_request', 'Ответ на требование налогового органа', 1),
    ('tax_explanations', 'Пояснения в налоговый орган', 2),
    ('tax_vat_explanations', 'Пояснения по НДС', 3),
    ('tax_strategy_memo', 'Меморандум по налоговой стратегии', 4),
    ('tax_court_position', 'Позиция в суд', 5)
)
UPDATE public.legal_document_templates AS template
SET
  title = flagship.title,
  sort_order = flagship.flagship_rank,
  metadata = COALESCE(template.metadata, '{}'::jsonb) || jsonb_build_object(
    'flagship', true,
    'flagship_rank', flagship.flagship_rank
  )
FROM flagship
WHERE template.code = flagship.code;
