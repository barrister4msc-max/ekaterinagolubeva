
ALTER TABLE public.legal_reasoning_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage legal_reasoning_analyses"
ON public.legal_reasoning_analyses
FOR ALL
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage practice_import_queue"
ON public.practice_import_queue
FOR ALL
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));
