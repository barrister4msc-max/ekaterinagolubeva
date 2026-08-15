
DROP POLICY IF EXISTS "Authenticated users can read legal revision decisions" ON public.legal_document_revision_decisions;
DROP POLICY IF EXISTS "Authenticated users can insert legal revision decisions" ON public.legal_document_revision_decisions;
DROP POLICY IF EXISTS "Authenticated users can update legal revision decisions" ON public.legal_document_revision_decisions;

CREATE POLICY "Admins can read legal revision decisions"
  ON public.legal_document_revision_decisions
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can insert legal revision decisions"
  ON public.legal_document_revision_decisions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update legal revision decisions"
  ON public.legal_document_revision_decisions
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()))
  WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can delete legal revision decisions"
  ON public.legal_document_revision_decisions
  FOR DELETE
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));
