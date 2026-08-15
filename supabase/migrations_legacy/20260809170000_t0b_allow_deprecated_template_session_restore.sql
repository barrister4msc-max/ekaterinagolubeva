-- Allow an authenticated user to read an inactive template only when the
-- user's existing RLS access to document_intake_sessions exposes a saved
-- session that uses that template code. The active catalog policy remains
-- unchanged, and getTemplates() still filters to is_active = true.

CREATE POLICY "Authenticated can view templates used by accessible intake sessions"
  ON public.legal_document_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.document_intake_sessions AS intake_session
      WHERE intake_session.template_code = legal_document_templates.code
    )
  );
