-- Stage 13L-2B: durable, server-owned coordination for page-aware PDF OCR.
--
-- This is deliberately a narrow orchestration layer. It does not alter OCR,
-- AI-fill, or Legal Core semantics. The page-index checkpoint remains the
-- canonical representation of completed/failed page windows; this table adds
-- a fenced lease so concurrent browser requests cannot process one document
-- twice, and a terminal state after the bounded per-unit retry budget.

create table public.document_ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'needs_manual_review')),
  checkpoint jsonb not null default '{}'::jsonb,
  lease_token uuid,
  lease_expires_at timestamptz,
  invocation_count integer not null default 0 check (invocation_count >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  needs_manual_review_at timestamptz,
  constraint document_ocr_jobs_lease_shape_check check (
    (status = 'running' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'running' and lease_token is null and lease_expires_at is null)
  )
);

create index document_ocr_jobs_recovery_idx
  on public.document_ocr_jobs (status, lease_expires_at)
  where status in ('queued', 'running');

alter table public.document_ocr_jobs enable row level security;

-- Atomically obtain a short, fenced lease. A caller that loses the lease must
-- not write its stale checkpoint back to documents.
create function public.kati_claim_document_ocr_job(
  p_document_id uuid,
  p_lease_seconds integer default 120
)
returns table (
  job_id uuid,
  acquired boolean,
  job_status text,
  lease_token uuid,
  lease_expires_at timestamptz,
  checkpoint jsonb,
  invocation_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_job public.document_ocr_jobs%rowtype;
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 300));
  v_token uuid;
begin
  insert into public.document_ocr_jobs (document_id)
  values (p_document_id)
  on conflict (document_id) do nothing;

  select * into v_job
  from public.document_ocr_jobs
  where document_id = p_document_id
  for update;

  if v_job.status in ('completed', 'needs_manual_review') then
    return query select v_job.id, false, v_job.status, null::uuid,
      v_job.lease_expires_at, v_job.checkpoint, v_job.invocation_count;
    return;
  end if;

  if v_job.status = 'running' and v_job.lease_expires_at > now() then
    return query select v_job.id, false, v_job.status, null::uuid,
      v_job.lease_expires_at, v_job.checkpoint, v_job.invocation_count;
    return;
  end if;

  v_token := gen_random_uuid();
  update public.document_ocr_jobs
  set
    status = 'running',
    lease_token = v_token,
    lease_expires_at = now() + make_interval(secs => v_lease_seconds),
    invocation_count = invocation_count + 1,
    updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return query select v_job.id, true, v_job.status, v_job.lease_token,
    v_job.lease_expires_at, v_job.checkpoint, v_job.invocation_count;
end;
$function$;

-- Fenced persistence: job checkpoint and visible document state change in the
-- same transaction, only for the current lease holder. No stale invocation can
-- overwrite a newer invocation after its lease expires.
create function public.kati_persist_document_ocr_checkpoint(
  p_document_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_job_status text,
  p_checkpoint jsonb,
  p_metadata_patch jsonb,
  p_ocr_text text,
  p_analysis_status text,
  p_review_status text,
  p_last_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_job public.document_ocr_jobs%rowtype;
begin
  if p_job_status not in ('queued', 'completed', 'needs_manual_review') then
    raise exception 'invalid durable OCR terminal status';
  end if;

  select * into v_job
  from public.document_ocr_jobs
  where id = p_job_id and document_id = p_document_id
  for update;

  if not found
    or v_job.status <> 'running'
    or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at <= now() then
    return false;
  end if;

  update public.documents
  set
    ocr_text = case when p_ocr_text is null then ocr_text else p_ocr_text end,
    analysis_status = p_analysis_status,
    review_status = p_review_status,
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata_patch, '{}'::jsonb),
    updated_at = now()
  where id = p_document_id;

  update public.document_ocr_jobs
  set
    status = p_job_status,
    checkpoint = coalesce(p_checkpoint, '{}'::jsonb),
    lease_token = null,
    lease_expires_at = null,
    last_error_code = p_last_error_code,
    updated_at = now(),
    completed_at = case when p_job_status = 'completed' then now() else completed_at end,
    needs_manual_review_at = case when p_job_status = 'needs_manual_review' then now() else needs_manual_review_at end
  where id = p_job_id;

  return true;
end;
$function$;

revoke all on table public.document_ocr_jobs from public, anon, authenticated;
revoke all on function public.kati_claim_document_ocr_job(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.kati_persist_document_ocr_checkpoint(uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, text)
  from public, anon, authenticated;

grant select, insert, update, delete on table public.document_ocr_jobs to service_role;
grant execute on function public.kati_claim_document_ocr_job(uuid, integer) to service_role;
grant execute on function public.kati_persist_document_ocr_checkpoint(uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, text) to service_role;
