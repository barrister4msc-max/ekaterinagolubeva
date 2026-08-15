-- Fix mutable search_path on trigger function
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Drop overly permissive "WITH CHECK (true)" insert policies; stricter
-- "Anyone can submit a lead" already validates payload on leads.
drop policy if exists "public can insert leads" on public.leads;

-- Replace lead_documents permissive insert with a validated one
drop policy if exists "public can insert lead documents" on public.lead_documents;
create policy "Anyone can attach a lead document"
on public.lead_documents
for insert
to anon, authenticated
with check (
  lead_id is not null
  and file_url is not null
  and length(file_url) between 1 and 2048
  and exists (select 1 from public.leads l where l.id = lead_id)
);