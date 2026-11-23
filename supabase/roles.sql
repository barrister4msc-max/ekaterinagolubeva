-- Cluster-level prerequisite for guarded internal KB functions.
-- The role has no login, membership, bypass-RLS, or object privileges here.
-- Grants remain in their reviewed, service-scoped migrations.
do $$
begin
  if not exists (
    select 1 from pg_roles where rolname = 'kati_internal_kb_writer'
  ) then
    create role kati_internal_kb_writer
      nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end
$$;
