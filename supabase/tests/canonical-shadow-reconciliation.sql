-- Read-only database assertions. Run after the reconciliation migration.
do $test$
declare
  table_name text;
  table_oid regclass;
begin
  foreach table_name in array array[
    'document_intake_canonical_shadow_runs',
    'document_intake_canonical_consumer_observations'
  ] loop
    table_oid := to_regclass('public.' || table_name);
    if table_oid is null then
      raise exception 'missing canonical shadow table: %', table_name;
    end if;
    if not (select relrowsecurity from pg_class where oid = table_oid) then
      raise exception 'RLS disabled: %', table_name;
    end if;
    if has_table_privilege('anon', table_oid, 'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', table_oid, 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'client role can access shadow data: %', table_name;
    end if;
    if not has_table_privilege('service_role', table_oid, 'SELECT')
      or not has_table_privilege('service_role', table_oid, 'INSERT')
      or not has_table_privilege('service_role', table_oid, 'DELETE') then
      raise exception 'service role cannot persist shadow observations: %', table_name;
    end if;
    if not exists (
      select 1 from pg_constraint
      where conrelid = table_oid and contype = 'f'
        and confrelid = 'public.document_intake_ai_runs'::regclass
        and confdeltype = 'c'
    ) then
      raise exception 'missing analysis-run cascade: %', table_name;
    end if;
  end loop;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_intake_canonical_shadow_runs'::regclass
      and conname = 'document_intake_canonical_shadow_runs_analysis_run_unique'
      and contype = 'u'
  ) then
    raise exception 'duplicate shadow runs are not prevented';
  end if;
  foreach table_name in array array[
    'document_intake_canonical_shadow_runs_nonnegative_counts',
    'document_intake_canonical_shadow_runs_result_shape',
    'canonical_consumer_observations_nonnegative_counts',
    'canonical_consumer_observations_mismatch_reasons_array',
    'canonical_consumer_observations_outcome_shape'
  ] loop
    if not exists (select 1 from pg_constraint where conname = table_name and contype = 'c') then
      raise exception 'missing canonical contract constraint: %', table_name;
    end if;
  end loop;
end;
$test$;
