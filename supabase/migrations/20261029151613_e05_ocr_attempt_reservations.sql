-- E05 prerequisite only: dormant, service-only attempt reservation primitives.
-- Existing extractor/claim/persist behavior is deliberately not switched here.
-- Rollout requires caller wiring AND reservation-aware final persistence before
-- using these RPCs alongside any legacy caller. No scheduler is installed.

create function public.kati_reserve_document_ocr_unit(
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

create function public.kati_settle_document_ocr_unit(
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

revoke all on function public.kati_reserve_document_ocr_unit(uuid,uuid,uuid,integer,integer,integer)
  from public, anon, authenticated;
revoke all on function public.kati_settle_document_ocr_unit(uuid,uuid,uuid,integer,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.kati_reserve_document_ocr_unit(uuid,uuid,uuid,integer,integer,integer)
  to service_role;
grant execute on function public.kati_settle_document_ocr_unit(uuid,uuid,uuid,integer,uuid,text,text)
  to service_role;
