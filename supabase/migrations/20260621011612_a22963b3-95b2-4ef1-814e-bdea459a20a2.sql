
-- Harden views: use security_invoker so RLS of underlying tables applies to caller
ALTER VIEW public.v_practice_batches_dashboard SET (security_invoker = true);
ALTER VIEW public.v_practice_batch_legal_analysis_stats SET (security_invoker = true);
ALTER VIEW public.v_practice_analysis_sources SET (security_invoker = true);
ALTER VIEW public.v_generated_document_sources SET (security_invoker = true);

-- Enable RLS + admin-only policies on internal tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'generated_document_sources',
    'legal_research_sources',
    'legal_source_registry',
    'practice_batches',
    'practice_document_legal_analysis',
    'practice_legal_analysis_sources'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %I" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Admins manage %I" ON public.%I FOR ALL TO authenticated USING (public.is_admin_or_superadmin(auth.uid())) WITH CHECK (public.is_admin_or_superadmin(auth.uid()))',
      t, t
    );
  END LOOP;
END $$;
