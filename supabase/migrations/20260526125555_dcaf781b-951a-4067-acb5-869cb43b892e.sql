
-- Fix 1: Broken anon storage upload policy for lead-documents
DROP POLICY IF EXISTS "Anon can upload to existing lead folder" ON storage.objects;

CREATE POLICY "Anon can upload to existing lead folder"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'lead-documents'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id::text = (storage.foldername(storage.objects.name))[1]
  )
);

-- Fix 2: Prevent admins from escalating to super_admin; only super_admins manage super_admin roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Admins can manage non-super_admin roles only
CREATE POLICY "Admins manage non-superadmin roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
);

-- Super admins can manage all roles including super_admin
CREATE POLICY "Super admins manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
