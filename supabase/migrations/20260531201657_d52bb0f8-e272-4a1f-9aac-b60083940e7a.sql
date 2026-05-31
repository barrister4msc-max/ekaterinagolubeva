-- Add dossier context columns to lead_documents so documents are strictly bound
-- to the lead / client / matter / conversation they belong to.
ALTER TABLE public.lead_documents
  ADD COLUMN IF NOT EXISTS crm_lead_id uuid,
  ADD COLUMN IF NOT EXISTS crm_client_id uuid,
  ADD COLUMN IF NOT EXISTS legal_matter_id uuid,
  ADD COLUMN IF NOT EXISTS conversation_id uuid;

CREATE INDEX IF NOT EXISTS idx_lead_documents_crm_lead_id   ON public.lead_documents(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_crm_client_id ON public.lead_documents(crm_client_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_legal_matter_id ON public.lead_documents(legal_matter_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_conversation_id ON public.lead_documents(conversation_id);

-- Backfill crm_lead_id from leads.source_crm_lead_id where possible.
UPDATE public.lead_documents ld
SET crm_lead_id = l.source_crm_lead_id
FROM public.leads l
WHERE ld.lead_id = l.id
  AND ld.crm_lead_id IS NULL
  AND l.source_crm_lead_id IS NOT NULL;

-- Backfill crm_client_id from crm_leads when we know the crm_lead_id.
UPDATE public.lead_documents ld
SET crm_client_id = cl.client_id
FROM public.crm_leads cl
WHERE ld.crm_lead_id = cl.id
  AND ld.crm_client_id IS NULL
  AND cl.client_id IS NOT NULL;