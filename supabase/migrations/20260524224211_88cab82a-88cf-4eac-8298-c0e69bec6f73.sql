
-- 1) Enable RLS on exposed tables and add admin-only policies
ALTER TABLE public.ai_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage ai_drafts"
  ON public.ai_drafts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','super_admin')));

CREATE POLICY "admins manage conversations"
  ON public.conversations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','super_admin')));

CREATE POLICY "admins manage conversation_messages"
  ON public.conversation_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','super_admin')));

CREATE POLICY "admins manage webhook_events"
  ON public.webhook_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','super_admin')));

-- 2) Fix is_admin_or_superadmin to actually include super_admin
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','super_admin')
  );
$$;

-- 3) Remove overly permissive SELECT on lead_documents (admin ALL policy already covers admin SELECT)
DROP POLICY IF EXISTS "authenticated can view lead documents" ON public.lead_documents;

-- 4) Remove overly permissive SELECT on leads
DROP POLICY IF EXISTS "authenticated can view leads" ON public.leads;

-- 5) Remove unvalidated lead INSERT (validated "Anyone can submit a lead" policy remains)
DROP POLICY IF EXISTS "public can create leads" ON public.leads;

-- 6) Tighten storage upload policy on lead-documents (require a lead UUID in path)
DROP POLICY IF EXISTS "public can upload lead documents" ON storage.objects;

CREATE POLICY "Anon can upload to existing lead folder"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'lead-documents'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id::text = (storage.foldername(name))[1]
    )
  );
