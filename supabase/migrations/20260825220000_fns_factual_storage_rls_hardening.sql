-- KATI LAWYER — FNS factual storage RLS hardening.
-- Deny by default for exposed roles; service_role remains the only storage role.
-- No permissive anon/authenticated policy is created.

do $$
declare
  relation_name text[];
  relation_schema text;
  relation_table text;
  factual_relations constant text[][] := array[
    array['fns_open_data', 'sync_state'],
    array['fns_open_data', 'company_tax_regimes'],
    array['fns_open_data', 'company_tax_debts'],
    array['fns_open_data', 'company_financial_statements'],
    array['fns_open_data', 'company_average_headcount'],
    array['fns_open_data', 'company_tax_offences']
  ];
begin
  foreach relation_name slice 1 in array factual_relations loop
    relation_schema := relation_name[1];
    relation_table := relation_name[2];

    if to_regclass(format('%I.%I', relation_schema, relation_table)) is null then
      raise exception 'Expected FNS factual relation is missing: %.%', relation_schema, relation_table;
    end if;

    execute format(
      'alter table %I.%I enable row level security',
      relation_schema,
      relation_table
    );
    execute format(
      'revoke all on table %I.%I from public, anon, authenticated',
      relation_schema,
      relation_table
    );
    execute format(
      'grant select, insert, update, delete on table %I.%I to service_role',
      relation_schema,
      relation_table
    );
  end loop;
end
$$;

comment on table fns_open_data.sync_state is
  'Internal FNS dataset sync state. RLS enabled; public, anon and authenticated denied; service_role only.';
