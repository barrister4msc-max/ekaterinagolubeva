-- Keep the fifth flagship title explicit for tax-court work.
-- Registry-only reference-data update; no production deployment is implied.

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.legal_document_templates
    WHERE code = 'tax_court_position'
      AND metadata ->> 'flagship' = 'true'
      AND metadata ->> 'flagship_rank' = '5'
  ) THEN
    RAISE EXCEPTION
      'Flagship title update aborted: tax_court_position rank 5 is missing';
  END IF;
END;
$guard$;

UPDATE public.legal_document_templates
SET title = 'Позиция для суда по налоговым спорам'
WHERE code = 'tax_court_position'
  AND metadata ->> 'flagship' = 'true'
  AND metadata ->> 'flagship_rank' = '5';
