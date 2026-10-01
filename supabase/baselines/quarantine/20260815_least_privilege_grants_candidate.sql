-- KATI LAWYER: least-privilege grants candidate
-- Date: 2026-08-15
--
-- QUARANTINE ONLY. This file is not an active Supabase migration.
-- It must be replayed and application-tested on a disposable branch before it
-- can be considered for supabase/migrations. Do not run on production directly.

begin;

-- Remove implicit Data API access. RLS alone is not a replacement for object
-- privileges: both layers must permit an operation.
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- These administrative ALL policies were created TO PUBLIC. That makes anon
-- evaluate their admin-check functions even when a separate public SELECT/INSERT
-- policy exists. Restrict the administrative policies to authenticated instead
-- of exposing SECURITY DEFINER role checks to anon.
alter policy "Admins can manage document_intake_ai_runs"
  on public.document_intake_ai_runs to authenticated;
alter policy "Admins can manage document_intake_answers"
  on public.document_intake_answers to authenticated;
alter policy "Admins can manage document_intake_sessions"
  on public.document_intake_sessions to authenticated;
alter policy "Admins can manage reviews"
  on public.external_reviews to authenticated;
alter policy "Admins can manage seo pages"
  on public.seo_pages to authenticated;
alter policy "Anyone can submit a lead"
  on public.leads to authenticated;

-- service_role is used by trusted Edge Functions and backend jobs. It does not
-- need schema-changing privileges such as REFERENCES, TRIGGER, or TRUNCATE.
do $grant_service_role$
declare
  item record;
begin
  for item in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      item.relname
    );
  end loop;

  for item in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('grant select on table public.%I to service_role', item.relname);
  end loop;
end
$grant_service_role$;

grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Browser-accessible anonymous surface. These four operations are the only
-- ones supported by explicit public/anon RLS policies and current application
-- behavior.
grant insert on table public.property_search_requests to anon;
grant select on table public.external_reviews to anon;
grant select on table public.seo_pages to anon;
grant select on table public.site_settings to anon;

-- Grant authenticated table operations only when an authenticated or PUBLIC
-- RLS policy exists for that command. Remaining PUBLIC policies are intentional
-- public reads; this grants the object-level prerequisite only.
do $grant_authenticated_from_policies$
declare
  item record;
begin
  for item in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and ('authenticated' = any(roles) or 'public' = any(roles))
      and cmd in ('ALL', 'SELECT')
  loop
    execute format('grant select on table public.%I to authenticated', item.tablename);
  end loop;

  for item in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and ('authenticated' = any(roles) or 'public' = any(roles))
      and cmd in ('ALL', 'INSERT')
  loop
    execute format('grant insert on table public.%I to authenticated', item.tablename);
  end loop;

  for item in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and ('authenticated' = any(roles) or 'public' = any(roles))
      and cmd in ('ALL', 'UPDATE')
  loop
    execute format('grant select, update on table public.%I to authenticated', item.tablename);
  end loop;

  for item in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and ('authenticated' = any(roles) or 'public' = any(roles))
      and cmd in ('ALL', 'DELETE')
  loop
    execute format('grant delete on table public.%I to authenticated', item.tablename);
  end loop;
end
$grant_authenticated_from_policies$;

-- All eight views are security_invoker=true and are authenticated workspace
-- surfaces. The underlying tables remain protected by their own grants + RLS.
do $grant_authenticated_views$
declare
  item record;
begin
  for item in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
  loop
    execute format('grant select on table public.%I to authenticated', item.relname);
  end loop;
end
$grant_authenticated_views$;

-- v_legal_sources_catalog references this RLS-enabled table. SELECT is needed
-- for the security-invoker view to execute, while the absence of an RLS policy
-- still denies direct rows from this source.
grant select on table public.legal_knowledge_chunks to authenticated;

grant usage on sequence public.leads_lead_number_seq to authenticated;

-- RPC surface used by the authenticated application and its RLS policies.
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_admin_or_superadmin(uuid) to authenticated;
grant execute on function public.archive_document_intake_session(uuid) to authenticated;
grant execute on function public.restore_document_intake_session(uuid) to authenticated;

-- match_legal_* is called by analyze-document-legal-position with the service
-- role key. Trigger helpers are not browser RPC endpoints. They therefore keep
-- service_role/postgres execution only.

-- Prevent newly created objects owned by postgres from silently reintroducing
-- broad Data API access. Future migrations must grant intended access explicitly.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

commit;

-- Post-replay checks (read-only result sets):
select grantee, privilege_type, count(*) as object_count
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee, privilege_type
order by grantee, privilege_type;

select p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_args,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
       has_function_privilege('public', p.oid, 'EXECUTE') as public_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and pg_get_userbyid(p.proowner) <> 'supabase_admin'
order by p.proname, identity_args;
