-- Privilege-only, forward-only hardening for the guarded official-origin writer.
--
-- The function body, registry semantics, RLS policies, and all other functions
-- are intentionally outside this migration's scope.  Explicit revocation from
-- API roles is required because a previous PUBLIC-only revoke does not remove
-- grants already made directly to those roles.
revoke all on function public.kati_persist_guarded_user_source_official_origin(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.kati_persist_guarded_user_source_official_origin(jsonb)
  to kati_internal_kb_writer;
