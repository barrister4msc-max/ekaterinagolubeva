
-- Enums
CREATE TYPE public.lead_urgency AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.lead_status AS ENUM ('new', 'in_progress', 'waiting', 'closed');

-- Leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  contact TEXT,
  original_text TEXT NOT NULL,
  category TEXT,
  qa JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_summary TEXT,
  urgency public.lead_urgency,
  risks TEXT[] NOT NULL DEFAULT '{}',
  next_step TEXT,
  documents_checklist TEXT[] NOT NULL DEFAULT '{}',
  status public.lead_status NOT NULL DEFAULT 'new',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can insert a lead via the public form
CREATE POLICY "Anyone can submit a lead"
ON public.leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can read leads
CREATE POLICY "Admins can view leads"
ON public.leads
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Only admins can update leads
CREATE POLICY "Admins can update leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Only admins can delete leads
CREATE POLICY "Admins can delete leads"
ON public.leads
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at trigger
CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX idx_leads_status ON public.leads (status);
CREATE INDEX idx_leads_category ON public.leads (category);
