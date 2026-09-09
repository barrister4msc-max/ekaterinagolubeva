-- Defence-in-depth hardening for the private Law7 retrieval mirror.
-- The mirror is not a Data API surface.  Only service_role may access it;
-- public/private grants are reasserted here so RLS is not the sole boundary.

revoke all on schema law7_mirror from public, anon, authenticated;
revoke all on all tables in schema law7_mirror from public, anon, authenticated;
grant usage on schema law7_mirror to service_role;
grant select, insert, update, delete on all tables in schema law7_mirror to service_role;

alter table law7_mirror.codes enable row level security;
alter table law7_mirror.article_versions enable row level security;
alter table law7_mirror.amendments enable row level security;
alter table law7_mirror.sync_state enable row level security;
alter table law7_mirror.temporal_verifications enable row level security;

drop policy if exists law7_mirror_service_role_all on law7_mirror.codes;
drop policy if exists law7_mirror_service_role_all on law7_mirror.article_versions;
drop policy if exists law7_mirror_service_role_all on law7_mirror.amendments;
drop policy if exists law7_mirror_service_role_all on law7_mirror.sync_state;
drop policy if exists law7_mirror_service_role_all on law7_mirror.temporal_verifications;

create policy law7_mirror_service_role_all
  on law7_mirror.codes for all to service_role
  using (true) with check (true);
create policy law7_mirror_service_role_all
  on law7_mirror.article_versions for all to service_role
  using (true) with check (true);
create policy law7_mirror_service_role_all
  on law7_mirror.amendments for all to service_role
  using (true) with check (true);
create policy law7_mirror_service_role_all
  on law7_mirror.sync_state for all to service_role
  using (true) with check (true);
create policy law7_mirror_service_role_all
  on law7_mirror.temporal_verifications for all to service_role
  using (true) with check (true);
