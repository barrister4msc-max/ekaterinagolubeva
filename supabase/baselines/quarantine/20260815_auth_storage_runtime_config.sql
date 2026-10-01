-- KATI LAWYER auth/storage runtime configuration snapshot
-- Extracted read-only from production and replay-tested only on disposable Preview.
-- QUARANTINE: do not apply to production or move into supabase/migrations yet.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('communication-attachments', 'communication-attachments', false, null, null),
  ('hero', 'hero', true, null, null),
  ('lead-documents', 'lead-documents', false, null, null)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can delete communication-attachments" ON storage.objects;
CREATE POLICY "Admins can delete communication-attachments" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read communication-attachments" ON storage.objects;
CREATE POLICY "Admins can read communication-attachments" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update communication-attachments" ON storage.objects;
CREATE POLICY "Admins can update communication-attachments" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can upload communication-attachments" ON storage.objects;
CREATE POLICY "Admins can upload communication-attachments" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete hero images" ON storage.objects;
CREATE POLICY "Admins can delete hero images" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can list hero images" ON storage.objects;
CREATE POLICY "Admins can list hero images" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update hero images" ON storage.objects;
CREATE POLICY "Admins can update hero images" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can upload hero images" ON storage.objects;
CREATE POLICY "Admins can upload hero images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete lead documents" ON storage.objects;
CREATE POLICY "Admins delete lead documents" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'lead-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins read lead documents" ON storage.objects;
CREATE POLICY "Admins read lead documents" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'lead-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins upload lead documents" ON storage.objects;
CREATE POLICY "Admins upload lead documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'lead-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "admins can view lead documents files" ON storage.objects;
CREATE POLICY "admins can view lead documents files" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'lead-documents' AND public.is_admin_or_superadmin(auth.uid()));
