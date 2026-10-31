create function public.kati_ocr_document_access(p_actor_id uuid,p_session_id uuid,p_document_id uuid)
returns boolean language plpgsql security invoker set search_path=''
as $function$
declare d public.documents%rowtype; s public.document_intake_sessions%rowtype;
begin
  if p_actor_id is null or not public.is_admin_or_superadmin(p_actor_id) then return false; end if;
  select * into d from public.documents where id=p_document_id for share;
  select * into s from public.document_intake_sessions where id=p_session_id for share;
  return d.id is not null and s.id is not null and not d.is_archived and s.archived_at is null
    and d.metadata->>'intake_session_id'=p_session_id::text
    and (d.uploaded_by is null or d.uploaded_by=p_actor_id)
    and (s.created_by is null or s.created_by=p_actor_id)
    and (d.matter_id is null or s.matter_id is null or d.matter_id=s.matter_id)
    and (d.client_id is null or s.client_id is null or d.client_id=s.client_id);
end;
$function$;
revoke all on function public.kati_ocr_document_access(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kati_ocr_document_access(uuid,uuid,uuid) to service_role;

-- Actor/session/document checks are repeated inside the transaction to close
-- the gap between Edge authorization/download and queue mutation. Private RPC.
create function public.kati_control_document_ocr(
  p_action text,p_actor_id uuid,p_session_id uuid,p_document_id uuid,
  p_source jsonb default null,p_direct_text text default null
)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare
  v_doc public.documents%rowtype;
  v_session public.document_intake_sessions%rowtype;
  v_job public.document_ocr_jobs%rowtype;
  v_state text;
  v_units jsonb;
  v_total integer:=0;
  v_done integer:=0;
  v_failed integer:=0;
  v_pages integer:=0;
  v_indexed integer:=0;
  v_length integer;
begin
  if p_action not in ('enqueue','status') or p_action is null or p_actor_id is null
    or not public.is_admin_or_superadmin(p_actor_id) then
    return jsonb_build_object('allowed',false,'code','forbidden');
  end if;
  if p_action='enqueue' then perform pg_catalog.pg_advisory_xact_lock(1748702047,5); end if;
  select * into v_job from public.document_ocr_jobs where document_id=p_document_id for update;
  -- Same job -> document lock order as source admission/settlement/finalization.
  select * into v_doc from public.documents where id=p_document_id for share;
  select * into v_session from public.document_intake_sessions where id=p_session_id for share;
  if v_doc.id is null or v_session.id is null or v_doc.is_archived or v_session.archived_at is not null
    or v_doc.metadata->>'intake_session_id' is distinct from p_session_id::text
    or (v_doc.uploaded_by is not null and v_doc.uploaded_by<>p_actor_id)
    or (v_session.created_by is not null and v_session.created_by<>p_actor_id)
    or (v_doc.matter_id is not null and v_session.matter_id is not null and v_doc.matter_id<>v_session.matter_id)
    or (v_doc.client_id is not null and v_session.client_id is not null and v_doc.client_id<>v_session.client_id) then
    return jsonb_build_object('allowed',false,'code','forbidden');
  end if;
  if p_action='enqueue' then
    if (v_doc.mime_type<>'application/pdf' or v_doc.mime_type is null) and lower(coalesce(v_doc.file_name,'')) not like '%.pdf' then
      return jsonb_build_object('allowed',false,'code','not_pdf');
    end if;
    if jsonb_typeof(p_source) is distinct from 'object' or p_source->'version' is distinct from '1'::jsonb
      or coalesce(p_source->>'sha256','') !~ '^[0-9a-f]{64}$'
      or coalesce(p_source->>'byte_length','') !~ '^[0-9]{1,16}$'
      or coalesce(p_source->>'bucket','') not in ('lead-documents','communication-attachments','hero')
      or p_source->>'storage_path' is distinct from v_doc.storage_path then
      return jsonb_build_object('allowed',false,'code','source_changed');
    end if;
    if v_job.id is not null then
      -- Re-enqueue never resets a lease, terminal state, stop flag or counters.
      if v_job.checkpoint->>'ocr_protocol' is distinct from 'reserved_v1'
        or v_job.checkpoint->'intake_scope' is null then
        return jsonb_build_object('allowed',false,'code','legacy_requires_review');
      end if;
      if v_job.checkpoint->'source_fingerprint' is distinct from p_source then
        update public.document_ocr_jobs set status='needs_manual_review',lease_token=null,lease_expires_at=null,
          last_error_code='ocr_source_mismatch',needs_manual_review_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_job.id;
        update public.documents set metadata=metadata||jsonb_build_object('extraction_status','needs_manual_review','extraction_error','ocr_source_mismatch',
          'ocr_job',jsonb_build_object('version','13L-2B','status','needs_manual_review','invocation_count',v_job.invocation_count)),
          analysis_status='needs_review',review_status='needs_review',updated_at=clock_timestamp() where id=p_document_id;
        return jsonb_build_object('allowed',false,'code','source_changed');
      end if;
    else
      if v_doc.metadata->'ocr_source_fingerprint'=p_source and v_doc.metadata->>'extraction_status'='completed' and length(coalesce(v_doc.ocr_text,''))>0 then
        return jsonb_build_object('allowed',true,'document_id',p_document_id,'state','completed','extraction_status','completed','text_length',coalesce((v_doc.metadata->>'text_length')::integer,length(v_doc.ocr_text)),'progress',null);
      end if;
      if length(coalesce(v_doc.ocr_text,''))>0 or v_doc.metadata ? 'page_index' then
        return jsonb_build_object('allowed',false,'code','legacy_requires_review');
      end if;
      if p_direct_text is not null and length(p_direct_text)>0 then
        select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0)::integer into v_length from regexp_split_to_table(p_direct_text,'') c;
        update public.documents set ocr_text=p_direct_text,metadata=metadata||jsonb_build_object(
          'extraction_status','completed','extraction_method','pdf_text','extraction_error',null,'text_length',v_length,
          'extracted_at',clock_timestamp(),'ocr_source_fingerprint',p_source),analysis_status='pending',review_status='not_started',updated_at=clock_timestamp()
          where id=p_document_id;
        return jsonb_build_object('allowed',true,'document_id',p_document_id,'state','completed','extraction_status','completed','text_length',v_length,'progress',null);
      end if;
      insert into public.document_ocr_jobs(document_id,dispatch_enabled,checkpoint)
        values(p_document_id,true,jsonb_build_object('ocr_protocol','reserved_v1','source_fingerprint',p_source,
          'intake_scope',jsonb_build_object('session_id',p_session_id,'actor_id',p_actor_id))) returning * into v_job;
      update public.documents set metadata=metadata||jsonb_build_object('ocr_execution_owner','server',
        'extraction_status','pending','extraction_error',null,'ocr_job',jsonb_build_object('version','13L-2B','status','queued')),
        analysis_status='needs_review',review_status='needs_review',updated_at=clock_timestamp() where id=p_document_id;
      v_doc.metadata:=v_doc.metadata||jsonb_build_object('extraction_status','pending');
    end if;
  end if;
  if v_job.id is null and v_doc.metadata->>'extraction_status'='completed'
    and v_doc.metadata ? 'ocr_source_fingerprint' and length(coalesce(v_doc.ocr_text,''))>0 then
    return jsonb_build_object('allowed',true,'document_id',p_document_id,'state','completed','extraction_status','completed',
      'text_length',coalesce((v_doc.metadata->>'text_length')::integer,length(v_doc.ocr_text)),'progress',null);
  end if;
  v_state:=case when v_job.id is null then 'not_queued'
    when v_job.status in ('queued','running') and not v_job.dispatch_enabled then 'paused' else v_job.status end;
  v_units:=case when jsonb_typeof(v_job.checkpoint->'page_index'->'units')='array'
    then v_job.checkpoint->'page_index'->'units' else '[]'::jsonb end;
  select count(*),count(*) filter(where u->>'status'='completed'),count(*) filter(where u->>'status'='failed'),
    coalesce(sum((u->>'end')::integer-(u->>'start')::integer) filter(where u->>'status'='completed'),0)
    into v_total,v_done,v_failed,v_indexed from jsonb_array_elements(v_units) u;
  v_pages:=coalesce((v_job.checkpoint->'page_index'->>'page_count')::integer,0);
  return jsonb_build_object('allowed',true,'document_id',p_document_id,'state',v_state,
    'extraction_status',case when v_job.status='needs_manual_review' then 'needs_manual_review'
      when v_job.status='completed' then 'completed' when v_job.id is not null then 'pending' else 'pending' end,
    'text_length',case when v_job.status='completed' then coalesce((v_doc.metadata->>'text_length')::integer,length(v_doc.ocr_text),0) else 0 end,
    'progress',case when v_total=0 then null else jsonb_build_object('totalUnits',v_total,'completedUnits',v_done,
      'failedUnits',v_failed,'pendingUnits',v_total-v_done-v_failed,'totalPages',v_pages,'indexedPages',v_indexed,
      'percent',case when v_job.status='completed' and v_done=v_total then 100 else least(99,(100*v_done)/v_total) end,
      'complete',v_job.status='completed' and v_done=v_total) end);
end;
$function$;
revoke all on function public.kati_control_document_ocr(text,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.kati_control_document_ocr(text,uuid,uuid,uuid,jsonb,text) to service_role;


create or replace function public.kati_guard_reserved_ocr_source(
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
  if v_job.checkpoint->'intake_scope' is not null then
    if not coalesce(public.kati_ocr_document_access(
      (v_job.checkpoint->'intake_scope'->>'actor_id')::uuid,
      (v_job.checkpoint->'intake_scope'->>'session_id')::uuid,p_document_id),false) then
      update public.document_ocr_jobs set status='needs_manual_review',lease_token=null,lease_expires_at=null,
        last_error_code='ocr_scope_changed',needs_manual_review_at=v_time,updated_at=v_time where id=p_job_id;
      update public.documents set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('extraction_status','needs_manual_review','extraction_error','ocr_scope_changed',
        'ocr_job',jsonb_build_object('version','13L-2B','status','needs_manual_review','invocation_count',v_job.invocation_count)),
        analysis_status='needs_review',review_status='needs_review',updated_at=v_time where id=p_document_id;
      return jsonb_build_object('allowed',false,'code','ocr_scope_changed');
    end if;
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
