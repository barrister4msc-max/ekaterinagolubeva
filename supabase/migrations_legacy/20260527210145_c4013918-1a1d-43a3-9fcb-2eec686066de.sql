
-- Grants for property tables
GRANT INSERT ON public.property_search_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_search_requests TO authenticated;
GRANT ALL ON public.property_search_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_matches TO authenticated;
GRANT ALL ON public.property_matches TO service_role;

-- Enable RLS
ALTER TABLE public.property_search_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_matches ENABLE ROW LEVEL SECURITY;

-- Public insert for search requests (with basic length checks)
CREATE POLICY "Anyone can submit property search request"
ON public.property_search_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(client_name) BETWEEN 1 AND 200
  AND length(phone) BETWEEN 1 AND 50
  AND length(property_type) BETWEEN 1 AND 100
  AND status = 'new'
);

-- Admins manage all
CREATE POLICY "Admins manage property_search_requests"
ON public.property_search_requests
FOR ALL TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage properties"
ON public.properties
FOR ALL TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage property_matches"
ON public.property_matches
FOR ALL TO authenticated
USING (public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

-- Unique constraint on source_url to prevent duplicates (when present)
CREATE UNIQUE INDEX IF NOT EXISTS properties_source_url_unique
ON public.properties (source_url)
WHERE source_url IS NOT NULL;
