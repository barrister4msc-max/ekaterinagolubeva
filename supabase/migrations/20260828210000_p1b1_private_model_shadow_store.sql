-- P1-B.1: private durable storage for shadow-only budget reservations and telemetry.
create schema if not exists private;

create table if not exists private.model_shadow_budget_reservations (
  shadow_run_id text primary key,
  budget_day date not null,
  budget_scope text not null check (char_length(budget_scope) between 1 and 128),
  reserved_cost_usd numeric(12,6) not null check (reserved_cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists model_shadow_budget_reservations_day_scope_idx
  on private.model_shadow_budget_reservations (budget_day, budget_scope);

create table if not exists private.model_shadow_telemetry (
  shadow_run_id text primary key references private.model_shadow_budget_reservations(shadow_run_id),
  operation_run_id text not null,
  task_type text not null,
  provider text not null check (provider in ('gemini', 'openai')),
  model text not null,
  latency_ms integer not null check (latency_ms >= 0),
  input_tokens integer,
  output_tokens integer,
  cached_input_tokens integer,
  cost_known boolean not null,
  estimated_cost_usd numeric(12,6),
  raw_status text not null,
  json_valid boolean not null,
  schema_valid boolean,
  semantic_valid boolean,
  source_ref_fidelity text not null check (source_ref_fidelity in ('not_evaluated', 'pass', 'fail')),
  reviewer_finding_codes text[] not null default '{}',
  reviewer_findings_count integer not null check (reviewer_findings_count between 0 and 20),
  candidate_identity_verified boolean,
  created_at timestamptz not null default now(),
  check ((cost_known and estimated_cost_usd is not null) or (not cost_known and estimated_cost_usd is null))
);

alter table private.model_shadow_budget_reservations enable row level security;
alter table private.model_shadow_telemetry enable row level security;

create or replace function public.reserve_model_shadow_budget(
  p_shadow_run_id text,
  p_budget_day date,
  p_budget_scope text,
  p_reserved_cost_usd numeric,
  p_daily_cap_usd numeric,
  p_per_run_cap_usd numeric
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_total numeric;
begin
  if p_reserved_cost_usd < 0 or p_reserved_cost_usd > p_per_run_cap_usd then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_budget_day::text || ':' || p_budget_scope, 0));
  select coalesce(sum(reserved_cost_usd), 0) into v_total
  from private.model_shadow_budget_reservations
  where budget_day = p_budget_day and budget_scope = p_budget_scope;
  if v_total + p_reserved_cost_usd > p_daily_cap_usd then return false; end if;
  insert into private.model_shadow_budget_reservations (shadow_run_id, budget_day, budget_scope, reserved_cost_usd)
  values (p_shadow_run_id, p_budget_day, p_budget_scope, p_reserved_cost_usd);
  return true;
end;
$$;

create or replace function public.record_model_shadow_telemetry(
  p_shadow_run_id text,
  p_telemetry jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  insert into private.model_shadow_telemetry (
    shadow_run_id, operation_run_id, task_type, provider, model, latency_ms,
    input_tokens, output_tokens, cached_input_tokens, cost_known, estimated_cost_usd,
    raw_status, json_valid, schema_valid, semantic_valid, source_ref_fidelity,
    reviewer_finding_codes, reviewer_findings_count, candidate_identity_verified
  ) values (
    p_shadow_run_id, p_telemetry->>'operation_run_id', p_telemetry->>'task_type',
    p_telemetry->>'provider', p_telemetry->>'model', (p_telemetry->>'latency_ms')::integer,
    nullif(p_telemetry->>'input_tokens','')::integer, nullif(p_telemetry->>'output_tokens','')::integer,
    nullif(p_telemetry->>'cached_input_tokens','')::integer, (p_telemetry->>'cost_known')::boolean,
    nullif(p_telemetry->>'estimated_cost_usd','')::numeric, p_telemetry->>'raw_status',
    (p_telemetry->>'json_valid')::boolean, nullif(p_telemetry->>'schema_valid','')::boolean,
    nullif(p_telemetry->>'semantic_valid','')::boolean, p_telemetry->>'source_ref_fidelity',
    coalesce(array(select jsonb_array_elements_text(p_telemetry->'reviewer_finding_codes')), '{}'),
    (p_telemetry->>'reviewer_findings_count')::integer,
    nullif(p_telemetry->>'candidate_identity_verified','')::boolean
  );
end;
$$;

revoke all on schema private from public;
revoke all on all tables in schema private from public;
revoke all on function public.reserve_model_shadow_budget(text,date,text,numeric,numeric,numeric) from public, anon, authenticated;
revoke all on function public.record_model_shadow_telemetry(text,jsonb) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function public.reserve_model_shadow_budget(text,date,text,numeric,numeric,numeric) to service_role;
grant execute on function public.record_model_shadow_telemetry(text,jsonb) to service_role;
