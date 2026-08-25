-- Controlled migration replay probe.
-- This file intentionally performs no schema or data change.
-- It exists only to trigger the configured Git-driven deployment so the
-- existing Production migration-history mismatch can be observed safely.
select 1;
