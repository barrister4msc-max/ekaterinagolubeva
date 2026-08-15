
DROP POLICY IF EXISTS "Anyone can submit a lead consent" ON public.lead_consents;
CREATE POLICY "Anyone can submit a lead consent"
ON public.lead_consents
FOR INSERT
TO anon, authenticated
WITH CHECK (
  lead_id IS NOT NULL
  AND length(consent_type) BETWEEN 1 AND 100
  AND length(consent_text) BETWEEN 1 AND 5000
  AND length(consent_source) BETWEEN 1 AND 100
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_consents.lead_id
      AND l.created_at > now() - interval '24 hours'
  )
);

DROP POLICY IF EXISTS "Anyone can attach a lead document" ON public.lead_documents;
CREATE POLICY "Anyone can attach a lead document"
ON public.lead_documents
FOR INSERT
TO anon, authenticated
WITH CHECK (
  lead_id IS NOT NULL
  AND file_url IS NOT NULL
  AND length(file_url) BETWEEN 1 AND 2048
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_documents.lead_id
      AND l.created_at > now() - interval '24 hours'
  )
);
