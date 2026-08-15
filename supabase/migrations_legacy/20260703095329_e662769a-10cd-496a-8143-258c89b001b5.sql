DROP POLICY IF EXISTS "Anyone can submit a lead" ON public.leads;

CREATE POLICY "Anyone can submit a lead"
ON public.leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(name) BETWEEN 1 AND 200
  AND length(phone) BETWEEN 1 AND 50
  AND (contact IS NULL OR length(contact) <= 200)
  AND length(original_text) BETWEEN 1 AND 5000
  AND admin_notes IS NULL
  AND status = 'new'::lead_status
  AND source_crm_lead_id IS NULL
  AND assigned_to IS NULL
  AND ai_summary IS NULL
  AND category IS NULL
  AND qa IS NULL
  AND urgency IS NULL
  AND risks IS NULL
  AND next_step IS NULL
  AND documents_checklist IS NULL
  AND estimated_budget IS NULL
  AND next_followup_at IS NULL
  AND closed_at IS NULL
  AND last_contact_at IS NULL
  AND archived_at IS NULL
  AND lead_number IS NULL
  AND pipeline_stage = 'new'
  AND priority = 'normal'
);