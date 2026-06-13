
ALTER VIEW public.v_legal_sources_catalog SET (security_invoker = true);

DROP POLICY IF EXISTS "Anon can upload to existing lead folder" ON storage.objects;

CREATE POLICY "Anon can upload to recent lead folder"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'lead-documents'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id::text = (storage.foldername(objects.name))[1]
      AND l.created_at > now() - interval '24 hours'
  )
);
