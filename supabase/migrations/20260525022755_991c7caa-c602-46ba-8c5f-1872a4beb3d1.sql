-- Lead consents journal table for 152-ФЗ compliance
CREATE TABLE public.lead_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  consent_text text NOT NULL,
  consent_version text NOT NULL DEFAULT '2026-05',
  privacy_policy_version text NOT NULL DEFAULT '2026-05',
  consent_source text NOT NULL,
  consent_given boolean NOT NULL DEFAULT true,
  ai_processing_consent boolean NOT NULL DEFAULT false,
  legal_disclaimer_accepted boolean NOT NULL DEFAULT false,
  ip_address text,
  user_agent text,
  page_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_consents_lead_id ON public.lead_consents(lead_id);

ALTER TABLE public.lead_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage lead_consents"
ON public.lead_consents
FOR ALL
TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));