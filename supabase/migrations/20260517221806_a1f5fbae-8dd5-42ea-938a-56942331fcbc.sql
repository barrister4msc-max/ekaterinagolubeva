
DROP POLICY "Anyone can submit a lead" ON public.leads;

CREATE POLICY "Anyone can submit a lead"
ON public.leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(name) BETWEEN 1 AND 200
  AND length(phone) BETWEEN 1 AND 50
  AND (contact IS NULL OR length(contact) <= 200)
  AND length(original_text) BETWEEN 1 AND 5000
  AND (admin_notes IS NULL)
  AND status = 'new'
);
