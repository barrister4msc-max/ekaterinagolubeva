-- E05 scheduling state stays in the existing ledger. No scheduler, enqueue,
-- secrets, or remote enablement. The reserved protocol is opted in per job;
-- all pre-existing jobs and future inserts start disabled.
alter table public.document_ocr_jobs
  add column dispatch_enabled boolean not null default false,
  add column next_attempt_at timestamptz not null default now(),
  add column consecutive_no_progress integer not null default 0 check (consecutive_no_progress>=0),
  add column last_progress_pages integer not null default 0 check (last_progress_pages>=0);
create index document_ocr_jobs_due_idx on public.document_ocr_jobs(next_attempt_at,created_at,id)
  where dispatch_enabled and status in ('queued','running');

-- Called under the same transaction advisory lock and job row lock as claims.
-- A crashed invocation consumes a no-progress recovery too; it cannot loop
-- forever before PDF planning or before end-of-wave persistence.
create function public.kati_recover_expired_ocr_job(p_job_id uuid)
returns void language plpgsql security invoker set search_path=''
as $function$
declare
  v_job public.document_ocr_jobs%rowtype;
  v_pages integer;
  v_stalls integer;
  v_now timestamptz;
begin
  select * into v_job from public.document_ocr_jobs where id=p_job_id for update;
  v_now:=clock_timestamp();
  if not found or v_job.status<>'running' or v_job.lease_expires_at>v_now then return; end if;
  select coalesce(sum((u->>'end')::integer-(u->>'start')::integer),0)::integer into v_pages
    from jsonb_array_elements(case when jsonb_typeof(v_job.checkpoint->'page_index'->'units')='array'
      then v_job.checkpoint->'page_index'->'units' else '[]'::jsonb end) u
    where u->>'status'='completed' and coalesce(u->>'start','')~'^[0-9]{1,9}$'
      and coalesce(u->>'end','')~'^[0-9]{1,9}$';
  v_stalls:=case when v_pages>v_job.last_progress_pages then 0 else v_job.consecutive_no_progress+1 end;
  update public.document_ocr_jobs set
    status=case when v_stalls>=3 then 'needs_manual_review' else 'queued' end,
    lease_token=null,lease_expires_at=null,consecutive_no_progress=v_stalls,
    last_progress_pages=greatest(v_job.last_progress_pages,v_pages),
    next_attempt_at=v_now+make_interval(secs=>case when v_stalls=0 then 0 else least(300,15*(2^(least(v_stalls-1,5))))::integer end),
    last_error_code=case when v_stalls>=3 then 'ocr_recovery_no_progress' else last_error_code end,
    needs_manual_review_at=case when v_stalls>=3 then v_now else needs_manual_review_at end,
    updated_at=v_now where id=p_job_id;
  if v_stalls>=3 then
    update public.documents set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'extraction_status','needs_manual_review','extraction_error','ocr_recovery_no_progress',
      'ocr_job',jsonb_build_object('version','13L-2B','status','needs_manual_review','invocation_count',v_job.invocation_count)),
      analysis_status='needs_review',review_status='needs_review',updated_at=v_now where id=v_job.document_id;
  end if;
end;
$function$;
revoke all on function public.kati_recover_expired_ocr_job(uuid) from public,anon,authenticated;
grant execute on function public.kati_recover_expired_ocr_job(uuid) to service_role;


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
  perform pg_catalog.pg_advisory_xact_lock(1748702047,5);
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

  if v_job.status = 'running' and v_job.lease_expires_at > clock_timestamp() then
    return query select v_job.id, false, v_job.status, null::uuid,
      v_job.lease_expires_at, v_job.checkpoint, v_job.invocation_count;
    return;
  end if;

  if exists(select 1 from public.document_ocr_jobs j
    where j.status='running' and j.lease_expires_at>clock_timestamp()) then
    return query select v_job.id,false,v_job.status,null::uuid,
      v_job.lease_expires_at,v_job.checkpoint,v_job.invocation_count;
    return;
  end if;

  v_token := gen_random_uuid();
  update public.document_ocr_jobs as job
  set
    status = 'running',
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

create or replace function public.kati_claim_reserved_document_ocr_job(
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
  perform pg_catalog.pg_advisory_xact_lock(1748702047,5);
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

  if not v_job.dispatch_enabled then
    return query select v_job.id,false,v_job.status,null::uuid,
      v_job.lease_expires_at,v_job.checkpoint,v_job.invocation_count;
    return;
  end if;
  if exists(select 1 from public.document_ocr_jobs j
    where j.status='running' and j.lease_expires_at>clock_timestamp()) then
    return query select v_job.id,false,v_job.status,null::uuid,
      v_job.lease_expires_at,v_job.checkpoint,v_job.invocation_count;
    return;
  end if;

  if v_job.status='running' then
    perform public.kati_recover_expired_ocr_job(v_job.id);
    select * into v_job from public.document_ocr_jobs where id=v_job.id;
  end if;
  if v_job.status='needs_manual_review' or v_job.next_attempt_at>clock_timestamp() then
    return query select v_job.id,false,v_job.status,null::uuid,
      v_job.lease_expires_at,v_job.checkpoint,v_job.invocation_count;
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

create function public.kati_claim_next_reserved_ocr_job(p_lease_seconds integer default 120)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare
  v_document_id uuid;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(1748702047,5);
  if exists(select 1 from public.document_ocr_jobs j
    where j.status='running' and j.lease_expires_at>clock_timestamp()) then return null; end if;
  select j.document_id into v_document_id from public.document_ocr_jobs j
    where j.dispatch_enabled and j.checkpoint->>'ocr_protocol'='reserved_v1'
      and j.next_attempt_at<=clock_timestamp()
      and (j.status='queued' or (j.status='running' and j.lease_expires_at<=clock_timestamp()))
    order by j.next_attempt_at,j.created_at,j.id limit 1 for update skip locked;
  if not found then return null; end if;
  select to_jsonb(c)||jsonb_build_object('document_id',v_document_id) into v_result
    from public.kati_claim_reserved_document_ocr_job(v_document_id,p_lease_seconds) c where c.acquired;
  return v_result;
end;
$function$;
revoke all on function public.kati_claim_next_reserved_ocr_job(integer) from public,anon,authenticated;
grant execute on function public.kati_claim_next_reserved_ocr_job(integer) to service_role;


create or replace function public.kati_reserve_document_ocr_unit(
  p_document_id uuid, p_job_id uuid, p_lease_token uuid,
  p_page_count integer, p_unit_start integer, p_unit_end integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_job public.document_ocr_jobs%rowtype;
  v_index jsonb;
  v_units jsonb;
  v_unit jsonb;
  v_reservations jsonb;
  v_slot integer;
  v_attempt integer;
  v_id uuid;
  v_time timestamptz;
  v_expected integer;
  v_n integer;
begin
  -- Lock first; clock_timestamp AFTER acquisition fences a caller that waited
  -- beyond lease expiry. now() would use transaction-start time instead.
  select * into v_job from public.document_ocr_jobs
    where id = p_job_id and document_id = p_document_id for update;
  v_time := clock_timestamp();
  if not found or v_job.status <> 'running'
     or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_expires_at <= v_time then
    return jsonb_build_object('allowed', false, 'code', 'lease_lost');
  end if;
  if not v_job.dispatch_enabled then
    return jsonb_build_object('allowed',false,'code','ocr_dispatch_disabled');
  end if;
  if not (public.kati_guard_reserved_ocr_source(p_document_id,p_job_id,p_lease_token,null,false)->>'allowed')::boolean then
    return jsonb_build_object('allowed',false,'code','ocr_source_rejected');
  end if;
  if jsonb_typeof(v_job.checkpoint) is distinct from 'object' then
    return jsonb_build_object('allowed',false,'code','checkpoint_mismatch');
  end if;
  if p_page_count is null or p_page_count < 1
     or p_unit_start is null or p_unit_start < 0
     or p_unit_end is null or p_unit_end > p_page_count
     or p_unit_start % 6 <> 0
     or p_unit_end <> least(p_unit_start + 6, p_page_count)
     or p_unit_end <= p_unit_start then
    return jsonb_build_object('allowed', false, 'code', 'invalid_page_window');
  end if;

  v_index := v_job.checkpoint->'page_index';
  if v_index is null then
    -- Legacy unit results are server-owned document metadata, never caller JSON.
    select metadata->'page_index' into v_index from public.documents where id = p_document_id;
  end if;
  if v_index is null then
    select jsonb_agg(jsonb_build_object('start', s, 'end', least(s+6,p_page_count),
      'status','pending','text_length',0,'attempts',0) order by s)
      into v_units from generate_series(0, p_page_count-1, 6) s;
    v_index := jsonb_build_object('page_count',p_page_count,'unit_size',6,'units',v_units);
  end if;
  -- A changed/malformed checkpoint is not silently discarded or zeroed.
  if jsonb_typeof(v_index) is distinct from 'object'
     or v_index->'page_count' is distinct from to_jsonb(p_page_count)
     or v_index->'unit_size' is distinct from '6'::jsonb
     or jsonb_typeof(v_index->'units') is distinct from 'array' then
    return jsonb_build_object('allowed',false,'code','checkpoint_mismatch');
  end if;
  v_units := v_index->'units';
  if jsonb_array_length(v_units) <> ((p_page_count-1)/6)+1 then
    return jsonb_build_object('allowed',false,'code','checkpoint_mismatch');
  end if;
  for v_n in 0..jsonb_array_length(v_units)-1 loop
    v_unit := v_units->v_n;
    v_expected := v_n * 6;
    if v_unit->'start' is distinct from to_jsonb(v_expected)
       or v_unit->'end' is distinct from to_jsonb(least(v_expected+6,p_page_count))
       or coalesce(v_unit->>'attempts','') !~ '^[0-9]{1,9}$'
       or coalesce(v_unit->>'status','') not in ('pending','failed','completed') then
      return jsonb_build_object('allowed',false,'code','checkpoint_mismatch');
    end if;
  end loop;
  v_slot := p_unit_start / 6;
  v_unit := v_units->v_slot;
  if v_unit->>'status' = 'completed' then
    return jsonb_build_object('allowed',false,'code','unit_completed');
  end if;
  v_reservations := coalesce(v_job.checkpoint->'ocr_unit_reservations','{}'::jsonb);
  if jsonb_typeof(v_reservations) is distinct from 'object' then
    return jsonb_build_object('allowed',false,'code','checkpoint_mismatch');
  end if;
  -- At most one provider attempt per unit per lease, including a lost RPC reply.
  -- A repeated reservation is NOT a second authorization to call the provider.
  if v_reservations->(p_unit_start::text)->>'lease_token' = p_lease_token::text then
    return jsonb_build_object('allowed',false,'code','unit_already_reserved');
  end if;
  v_attempt := (v_unit->>'attempts')::integer;
  if v_attempt >= 3 then
    return jsonb_build_object('allowed',false,'code','unit_attempts_exhausted');
  end if;
  v_attempt := v_attempt + 1;
  v_id := gen_random_uuid();
  -- An interrupted attempt already counts as failed/unresolved on recovery.
  -- Its counter survives without any provider result or final-wave persistence.
  v_unit := (v_unit - 'text') || jsonb_build_object('attempts',v_attempt,
    'status','failed','text_length',0,'error','ocr_attempt_unresolved');
  v_index := jsonb_set(v_index,'{units}',jsonb_set(v_units,array[v_slot::text],v_unit));
  v_index := v_index || jsonb_build_object('updated_at',v_time);
  v_reservations := v_reservations || jsonb_build_object(p_unit_start::text,
    jsonb_build_object('reservation_id',v_id,'lease_token',p_lease_token,'settled',false));
  update public.document_ocr_jobs set checkpoint = v_job.checkpoint ||
    jsonb_build_object('page_index',v_index,'ocr_unit_reservations',v_reservations),
    updated_at = v_time where id = p_job_id;
  return jsonb_build_object('allowed',true,'reservation_id',v_id,'attempt',v_attempt);
end;
$function$;

create or replace function public.kati_finish_reserved_document_ocr_wave(
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
  v_stalls integer;
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
  if not (public.kati_guard_reserved_ocr_source(p_document_id,p_job_id,p_lease_token,null,false)->>'allowed')::boolean then
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
  v_stalls:=case when v_indexed>v_job.last_progress_pages then 0 else v_job.consecutive_no_progress+1 end;
  v_exhausted:=v_exhausted or v_stalls>=3;
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
  v_error := case when v_mismatch then 'pdf_ocr_source_mismatch' when v_stalls>=3 then 'ocr_no_progress' when v_exhausted then 'pdf_ocr_retry_exhausted'
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
    consecutive_no_progress=v_stalls,last_progress_pages=greatest(v_job.last_progress_pages,v_indexed),
    next_attempt_at=v_time+make_interval(secs=>case when v_stalls=0 then 0 else least(300,15*(2^(least(v_stalls-1,5))))::integer end),
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
