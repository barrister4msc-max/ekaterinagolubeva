-- Remove anonymous INSERT policies that allowed forging consents/documents
-- and anon uploads to lead folders based only on recency of the parent lead.
-- All legitimate writes happen server-side via the service-role client
-- inside the finalizeLeadFn server function, so no client-side anon insert
-- is required. Admins retain full access via existing "admins manage ..." policies.

DROP POLICY IF EXISTS "Anyone can submit a lead consent" ON public.lead_consents;
DROP POLICY IF EXISTS "Anyone can attach a lead document" ON public.lead_documents;
DROP POLICY IF EXISTS "Anon can upload to recent lead folder" ON storage.objects;