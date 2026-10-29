-- E05: reservation-aware caller protocol. No scheduler or activation here.
-- Old clients cannot claim or persist a job already owned by reserved_v1.
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

  if v_job.checkpoint->>'ocr_protocol' = 'reserved_v1' then
    return query select v_job.id, false, v_job.status, null::uuid,
      v_job.lease_expires_at, v_job.checkpoint, v_job.invocation_count;
    return;
  end if;

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

create function public.kati_claim_reserved_document_ocr_job(
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
security invoker
set search_path = ''
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

  if v_job.status = 'running' and v_job.lease_expires_at > clock_timestamp() then
    return query select v_job.id, false, v_job.status, null::uuid,
      v_job.lease_expires_at, v_job.checkpoint, v_job.invocation_count;
    return;
  end if;

  v_token := pg_catalog.gen_random_uuid();
  update public.document_ocr_jobs as job
  set
    status = 'running',
    checkpoint = job.checkpoint || '{"ocr_protocol":"reserved_v1"}'::jsonb ||
      case when not (job.checkpoint ? 'page_index') and
        jsonb_typeof((select d.metadata->'page_index' from public.documents d where d.id=p_document_id))='object'
      then jsonb_build_object('page_index',(select d.metadata->'page_index' from public.documents d where d.id=p_document_id))
      else '{}'::jsonb end,
    lease_token = v_token,
    lease_expires_at = clock_timestamp() + make_interval(secs => v_lease_seconds),
    invocation_count = job.invocation_count + 1,
    updated_at = now()
  where job.id = v_job.id
  returning job.* into v_job;

  return query select v_job.id, true, v_job.status, v_job.lease_token,
    v_job.lease_expires_at, v_job.checkpoint, v_job.invocation_count;
end;
$function$;

create or replace function public.kati_persist_document_ocr_checkpoint(
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
    or v_job.checkpoint->>'ocr_protocol' = 'reserved_v1'
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

revoke all on function public.kati_claim_reserved_document_ocr_job(uuid,integer) from public,anon,authenticated;
grant execute on function public.kati_claim_reserved_document_ocr_job(uuid,integer) to service_role;

-- Finish solely from the row-locked server checkpoint. No caller-supplied page
-- counters/text/metadata can erase a committed reservation or a settled unit.
create function public.kati_finish_reserved_document_ocr_wave(
  p_document_id uuid, p_job_id uuid, p_lease_token uuid, p_page_count integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_job public.document_ocr_jobs%rowtype;
  v_time timestamptz;
  v_index jsonb;
  v_units jsonb;
  v_total integer := 0;
  v_completed integer := 0;
  v_failed integer := 0;
  v_pending integer := 0;
  v_pages integer := 0;
  v_indexed integer := 0;
  v_percent integer := 0;
  v_complete boolean := false;
  v_exhausted boolean := false;
  v_text text;
  v_status text;
  v_job_status text;
  v_method text;
  v_error text;
  v_analysis text;
  v_review text;
  v_progress jsonb := null;
  v_metadata jsonb;
  v_length integer;
  v_mismatch boolean := false;
begin
  select * into v_job from public.document_ocr_jobs
    where id=p_job_id and document_id=p_document_id for update;
  v_time := clock_timestamp();
  if not found or v_job.status <> 'running'
    or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at <= v_time
    or v_job.checkpoint->>'ocr_protocol' is distinct from 'reserved_v1' then
    return jsonb_build_object('persisted',false);
  end if;
  v_index := v_job.checkpoint->'page_index';
  -- The caller supplies only the page count read from this downloaded PDF,
  -- never a replacement checkpoint. Same-count object identity is a later gate.
  v_mismatch := v_index is not null and p_page_count is not null and
    v_index->'page_count' is distinct from to_jsonb(p_page_count);
  if p_page_count is null or v_mismatch then v_index := null; end if;
  if v_index is not null then
    if jsonb_typeof(v_index->'units') is distinct from 'array' then
      return jsonb_build_object('persisted',false);
    end if;
    v_units := v_index->'units';
    v_total := jsonb_array_length(v_units);
    v_pages := (v_index->>'page_count')::integer;
    select count(*) filter (where u->>'status'='completed'),
      count(*) filter (where u->>'status'='failed'),
      count(*) filter (where u->>'status'='pending'),
      coalesce(sum((u->>'end')::integer-(u->>'start')::integer) filter (where u->>'status'='completed'),0),
      coalesce(bool_or(u->>'status'<>'completed' and (u->>'attempts')::integer>=3),false),
      string_agg(u->>'text', E'\n\n' order by (u->>'start')::integer)
        filter (where u->>'status'='completed' and u->>'text' is not null)
    into v_completed,v_failed,v_pending,v_indexed,v_exhausted,v_text
    from jsonb_array_elements(v_units) u;
    v_complete := v_total>0 and v_completed=v_total;
    v_percent := case when v_complete then 100 when v_total=0 then 0
      else least(99,(v_completed*100)/v_total) end;
    v_progress := jsonb_build_object('totalUnits',v_total,'completedUnits',v_completed,
      'failedUnits',v_failed,'pendingUnits',v_pending,'totalPages',v_pages,
      'indexedPages',v_indexed,'percent',v_percent,'complete',v_complete,
      'degraded',not v_complete and v_completed>0);
  else
    -- Corrupt PDF / no page plan also has a bounded recovery budget.
    v_exhausted := v_mismatch or v_job.invocation_count>=3;
  end if;
  -- Legacy completed units may predate per-unit text caching. Preserve the
  -- existing text fallback, matching the old processor; never overwrite with ''.
  if coalesce(v_text,'')='' then
    select btrim(coalesce(ocr_text,'')) into v_text from public.documents where id=p_document_id;
  end if;
  v_status := case when v_exhausted then 'needs_manual_review'
    when v_complete then 'completed' when v_index is not null then 'partial_pages' else 'ocr_required' end;
  v_job_status := case when v_status='completed' then 'completed'
    when v_status='needs_manual_review' then 'needs_manual_review' else 'queued' end;
  v_method := case when v_index is null then 'pdf_ocr_required' else 'gemini_fallback' end;
  v_error := case when v_mismatch then 'pdf_ocr_source_mismatch' when v_exhausted then 'pdf_ocr_retry_exhausted'
    when not v_complete and coalesce(v_text,'')='' then 'pdf_ocr_partial_pages' else null end;
  v_analysis := case when v_status='completed' and coalesce(v_text,'')<>'' then 'pending' else 'needs_review' end;
  v_review := case when v_analysis='pending' then 'not_started'
    when v_status='ocr_required' then 'ocr_required' else 'needs_review' end;
  select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0)::integer
    into v_length from regexp_split_to_table(coalesce(v_text,''),'') c;
  v_metadata := jsonb_build_object('extraction_status',v_status,'extraction_method',v_method,
    'extracted_at',v_time,'text_length',v_length,'extraction_error',v_error,
    'ocr_job',jsonb_build_object('version','13L-2B','status',v_job_status,'invocation_count',v_job.invocation_count));
  if v_index is not null then
    v_metadata := v_metadata || jsonb_build_object('page_index',v_index,'page_index_progress',v_progress);
  end if;
  update public.documents set metadata=coalesce(metadata,'{}'::jsonb)||v_metadata,
    ocr_text=case when v_status in ('completed','partial_pages') and v_length>0 then v_text else ocr_text end,
    analysis_status=v_analysis, review_status=v_review, updated_at=v_time where id=p_document_id;
  update public.document_ocr_jobs set status=v_job_status,lease_token=null,lease_expires_at=null,
    last_error_code=v_error,updated_at=v_time,
    completed_at=case when v_job_status='completed' then v_time else completed_at end,
    needs_manual_review_at=case when v_job_status='needs_manual_review' then v_time else needs_manual_review_at end
    where id=p_job_id;
  return jsonb_build_object('persisted',true,'result',jsonb_build_object('ok',true,
    'extraction_status',v_status,'extraction_method',v_method,'text_length',v_length,
    'continuation_required',v_job_status='queued','ocr_job_status',v_job_status,
    'page_index_progress',v_progress,'analysis_status',v_analysis,'review_status',v_review));
end;
$function$;
revoke all on function public.kati_finish_reserved_document_ocr_wave(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.kati_finish_reserved_document_ocr_wave(uuid,uuid,uuid,integer) to service_role;
