
-- Admin-only RLS policies for communication-attachments bucket
DROP POLICY IF EXISTS "Admins can read communication-attachments" ON storage.objects;
CREATE POLICY "Admins can read communication-attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can upload communication-attachments" ON storage.objects;
CREATE POLICY "Admins can upload communication-attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update communication-attachments" ON storage.objects;
CREATE POLICY "Admins can update communication-attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete communication-attachments" ON storage.objects;
CREATE POLICY "Admins can delete communication-attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

-- Tighten anon upload policy on lead-documents: add size + mime restrictions
DROP POLICY IF EXISTS "Anon can upload to recent lead folder" ON storage.objects;
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
  AND COALESCE((metadata->>'size')::bigint, 0) <= 26214400
  AND COALESCE(metadata->>'mimetype', '') IN (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/rtf',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  )
);
