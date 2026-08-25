-- Production migration-history compatibility marker.
-- This version is already applied in Production and is intentionally a no-op
-- in the active migration directory. The actual legacy SQL remains excluded
-- from replay; the replacement baseline owns the fresh-schema path.
select 1;
