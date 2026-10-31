-- E05 source admission. Existing checkpoint/text are never reset or adopted
-- under a new source identity. No activation, scheduler, or Storage policy change.
create function public.kati_guard_reserved_ocr_source(
  p_document_id uuid, p_job_id uuid, p_lease_token uuid,
  p_source jsonb, p_bind boolean
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  v_job public.document_ocr_jobs%rowtype;
  v_path text;
  v_text text;
  v_pin jsonb;
  v_error text;
  v_time timestamptz;
  v_completed_check boolean;
begin
  select * into v_job from public.document_ocr_jobs
    where id=p_job_id and document_id=p_document_id for update;
  v_time := clock_timestamp();
  v_completed_check := v_job.status='completed' and p_lease_token is null
    and p_bind is true and p_source is not null;
  if not found or v_job.checkpoint->>'ocr_protocol' is distinct from 'reserved_v1'
    or (not coalesce(v_completed_check,false) and
      (v_job.status<>'running' or v_job.lease_token is distinct from p_lease_token
       or v_job.lease_expires_at<=v_time)) then
    return jsonb_build_object('allowed',false,'code','lease_lost');
  end if;
  select storage_path,ocr_text into v_path,v_text from public.documents
    where id=p_document_id for update;
  v_time := clock_timestamp();
  if not v_completed_check and v_job.lease_expires_at<=v_time then
    return jsonb_build_object('allowed',false,'code','lease_lost');
  end if;
  v_pin := v_job.checkpoint->'source_fingerprint';
  if p_bind is true then
    if jsonb_typeof(p_source) is distinct from 'object'
      or p_source->'version' is distinct from '1'::jsonb
      or coalesce(p_source->>'sha256','') !~ '^[0-9a-f]{64}$'
      or coalesce(p_source->>'byte_length','') !~ '^[0-9]{1,16}$'
      or coalesce(p_source->>'bucket','') not in ('lead-documents','communication-attachments','hero')
      or coalesce(p_source->>'storage_path','')='' then
      return jsonb_build_object('allowed',false,'code','invalid_source_fingerprint');
    end if;
    if p_source->>'storage_path' is distinct from v_path then
      v_error := 'ocr_source_mismatch';
    elsif v_pin is not null and v_pin is distinct from p_source then
      v_error := 'ocr_source_mismatch';
    elsif v_pin is null then
      -- A first hash cannot prove the origin of previously produced OCR text.
      -- Fresh zero-attempt plans can be bound; existing work needs explicit review.
      if v_completed_check or length(coalesce(v_text,''))>0
        or exists(select 1 from jsonb_array_elements(
          case when jsonb_typeof(v_job.checkpoint->'page_index'->'units')='array'
            then v_job.checkpoint->'page_index'->'units' else '[]'::jsonb end) u
          where coalesce(u->>'attempts','0')<>'0' or u->>'status'='completed'
            or length(coalesce(u->>'text',''))>0 or coalesce(u->>'text_length','0')<>'0') then
        v_error := 'ocr_source_unbound_checkpoint';
      else
        update public.document_ocr_jobs set checkpoint=jsonb_set(checkpoint,'{source_fingerprint}',p_source),
          updated_at=v_time where id=p_job_id;
        return jsonb_build_object('allowed',true);
      end if;
    end if;
  elsif p_bind is false then
    if v_pin is null then v_error := 'ocr_source_unbound_checkpoint';
    elsif v_pin->>'storage_path' is distinct from v_path then v_error := 'ocr_source_mismatch';
    end if;
  else
    return jsonb_build_object('allowed',false,'code','invalid_source_fingerprint');
  end if;
  if v_error is not null then
    update public.document_ocr_jobs set status='needs_manual_review',lease_token=null,lease_expires_at=null,
      last_error_code=v_error,needs_manual_review_at=v_time,updated_at=v_time where id=p_job_id;
    update public.documents set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'extraction_status','needs_manual_review','extraction_error',v_error,
      'ocr_job',jsonb_build_object('version','13L-2B','status','needs_manual_review','invocation_count',v_job.invocation_count)),
      analysis_status='needs_review',review_status='needs_review',updated_at=v_time where id=p_document_id;
    return jsonb_build_object('allowed',false,'code',v_error);
  end if;
  return jsonb_build_object('allowed',true);
end;
$function$;
revoke all on function public.kati_guard_reserved_ocr_source(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.kati_guard_reserved_ocr_source(uuid,uuid,uuid,jsonb,boolean) to service_role;


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

create or replace function public.kati_settle_document_ocr_unit(
  p_document_id uuid, p_job_id uuid, p_lease_token uuid,
  p_unit_start integer, p_reservation_id uuid, p_text text,
  p_error_code text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_job public.document_ocr_jobs%rowtype;
  v_reservation jsonb;
  v_index jsonb;
  v_unit jsonb;
  v_slot integer;
  v_time timestamptz;
  v_text text := btrim(coalesce(p_text,''));
  v_error text;
  v_text_length integer;
begin
  select * into v_job from public.document_ocr_jobs
    where id = p_job_id and document_id = p_document_id for update;
  v_time := clock_timestamp();
  if not found or v_job.status <> 'running'
     or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_expires_at <= v_time
     or p_unit_start is null or p_unit_start < 0 or p_unit_start % 6 <> 0
     or p_reservation_id is null then return false; end if;
  if not (public.kati_guard_reserved_ocr_source(p_document_id,p_job_id,p_lease_token,null,false)->>'allowed')::boolean then return false; end if;
  v_reservation := v_job.checkpoint->'ocr_unit_reservations'->(p_unit_start::text);
  if v_reservation is null
     or v_reservation->>'reservation_id' is distinct from p_reservation_id::text
     or v_reservation->>'lease_token' is distinct from p_lease_token::text
     or v_reservation->'settled' is distinct from 'false'::jsonb then return false; end if;
  v_slot := p_unit_start/6;
  v_index := v_job.checkpoint->'page_index';
  v_unit := v_index->'units'->v_slot;
  if v_unit is null or v_unit->'start' is distinct from to_jsonb(p_unit_start) then return false; end if;
  if v_text <> '' and p_error_code is null then
    -- Match JavaScript string.length used by the existing page-index contract,
    -- including supplementary Unicode characters (two UTF-16 code units).
    select coalesce(sum(case when ascii(c) > 65535 then 2 else 1 end),0)::integer
      into v_text_length from regexp_split_to_table(v_text,'') c;
    v_unit := v_unit || jsonb_build_object('status','completed','text',v_text,
      'text_length',v_text_length,'error',null);
  else
    -- Never persist raw provider/exception text as an error.
    v_error := case when p_error_code in ('provider_timeout','provider_http_error','ocr_empty')
      then p_error_code else 'ocr_unit_failed' end;
    v_unit := (v_unit - 'text') || jsonb_build_object('status','failed',
      'text_length',0,'error',v_error);
  end if;
  v_index := jsonb_set(v_index,array['units',v_slot::text],v_unit) ||
    jsonb_build_object('updated_at',v_time);
  update public.document_ocr_jobs set checkpoint = jsonb_set(
    jsonb_set(v_job.checkpoint,'{page_index}',v_index),
    array['ocr_unit_reservations',p_unit_start::text,'settled'],'true'::jsonb),
    updated_at = v_time where id = p_job_id;
  return true;
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
