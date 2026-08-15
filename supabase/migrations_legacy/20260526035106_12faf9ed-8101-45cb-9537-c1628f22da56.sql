
-- 1. Restrict lead-documents bucket reads to admins only
DROP POLICY IF EXISTS "authenticated can view lead documents files" ON storage.objects;

CREATE POLICY "admins can view lead documents files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lead-documents'
  AND public.is_admin_or_superadmin(auth.uid())
);

-- 2. Fix anon upload policy self-join bug (l.name -> name)
DROP POLICY IF EXISTS "Anon can upload to existing lead folder" ON storage.objects;

CREATE POLICY "Anon can upload to existing lead folder"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'lead-documents'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE (l.id)::text = (storage.foldername(name))[1]
  )
);

-- 3. Allow anon/authenticated to insert lead_consents tied to an existing lead
CREATE POLICY "Anyone can submit a lead consent"
ON public.lead_consents
FOR INSERT
TO anon, authenticated
WITH CHECK (
  lead_id IS NOT NULL
  AND length(consent_type) BETWEEN 1 AND 100
  AND length(consent_text) BETWEEN 1 AND 5000
  AND length(consent_source) BETWEEN 1 AND 100
  AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_consents.lead_id)
);
