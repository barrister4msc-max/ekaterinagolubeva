-- Stage 13L-2B corrective migration: the RETURNS TABLE output parameter
-- `invocation_count` shadows an unqualified column in PL/pgSQL. Qualify the
-- target table alias so a durable job can obtain its lease at runtime.

create or replace function public.kati_claim_document_ocr_job(
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
  update public.document_ocr_jobs as job
  set
    status = 'running',
    lease_token = v_token,
    lease_expires_at = now() + make_interval(secs => v_lease_seconds),
    invocation_count = job.invocation_count + 1,
    updated_at = now()
  where job.id = v_job.id
  returning job.* into v_job;

  return query select v_job.id, true, v_job.status, v_job.lease_token,
    v_job.lease_expires_at, v_job.checkpoint, v_job.invocation_count;
end;
$function$;
