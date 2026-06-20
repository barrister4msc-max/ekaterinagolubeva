UPDATE public.lawyer_archive_items
SET metadata = (metadata - 'ocr_error' - 'text_extraction_error')
  || jsonb_build_object('text_extraction_status', 'ocr_required', 'requires_ocr', true)
WHERE metadata->>'text_extraction_status' = 'ocr_failed'
  AND (
    metadata->>'ocr_error' ILIKE '%GEMINI_API_KEY%'
    OR metadata->>'text_extraction_error' ILIKE '%GEMINI_API_KEY%'
  );