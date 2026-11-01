-- Read/check only, except the existing status RPC may quarantine a changed
-- source. No model IO or consumer result publication in a DB transaction.
create function public.kati_check_ocr_consumer_sources(p_actor_id uuid,p_session_id uuid,p_expected jsonb)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s'
as $function$
declare
  e jsonb; d public.documents%rowtype; j public.document_ocr_jobs%rowtype;
  v_expected_ids jsonb; v_actual_ids jsonb; v_status jsonb; v_managed boolean; v_text text; v_representation text;
begin
  if p_actor_id is null or p_session_id is null or not public.is_admin_or_superadmin(p_actor_id)
    or jsonb_typeof(p_expected) is distinct from 'array' then
    return jsonb_build_object('allowed',false);
  end if;
  if exists(select 1 from jsonb_array_elements(p_expected) x where jsonb_typeof(x) is distinct from 'object'
    or coalesce(x->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    or (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_expected) x) then
    return jsonb_build_object('allowed',false);
  end if;
  -- Serialize with queue admission, never with network IO. Match all document
  -- ids (including legacy members) so a client-selected subset cannot pass.
  perform pg_catalog.pg_advisory_xact_lock(1748702047,5);
  select coalesce(jsonb_agg(x->>'id' order by x->>'id'),'[]'::jsonb) into v_expected_ids from jsonb_array_elements(p_expected) x;
  select coalesce(jsonb_agg(id::text order by id::text),'[]'::jsonb) into v_actual_ids
    from public.documents where metadata->>'intake_session_id'=p_session_id::text;
  if v_expected_ids is distinct from v_actual_ids then return jsonb_build_object('allowed',false); end if;
  for e in select value from jsonb_array_elements(p_expected) order by value->>'id' loop
    -- Same job -> document/session -> Storage lock order as the OCR writer.
    select * into j from public.document_ocr_jobs where document_id=(e->>'id')::uuid for update;
    select * into d from public.documents where id=(e->>'id')::uuid for share;
    if not coalesce(public.kati_ocr_document_access(p_actor_id,p_session_id,d.id),false) then
      return jsonb_build_object('allowed',false);
    end if;
    if d.metadata->>'redaction_status'='accepted' and jsonb_typeof(d.metadata->'redacted_text')='string' then
      v_text:=d.metadata->>'redacted_text';v_representation:='accepted_redaction_v1';
    else v_text:=coalesce(d.ocr_text,'');v_representation:='ocr_text_v1'; end if;
    if v_representation is distinct from e->>'representation_version'
      or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_text,'UTF8')),'hex') is distinct from e->>'representation_sha256'
      or coalesce(d.metadata->'extraction_status','null'::jsonb) is distinct from e->'extraction_status'
      or coalesce(d.metadata->'page_index_progress','null'::jsonb) is distinct from e->'page_index_progress' then
      return jsonb_build_object('allowed',false);
    end if;
    v_managed:=d.metadata->>'ocr_execution_owner'='server' or d.metadata ? 'ocr_source_fingerprint';
    if coalesce((e->>'managed')::boolean,false) is distinct from coalesce(v_managed,false)
      or (coalesce(v_managed,false) and d.metadata->'ocr_source_fingerprint' is distinct from e->'source') then
      return jsonb_build_object('allowed',false);
    end if;
    if v_managed then
      -- A valid new edition cannot replace the already consumed edition, even
      -- when the OCR text has exactly the same length/content.
      if jsonb_typeof(e->'source'->'generation') is distinct from 'object'
        or (j.id is not null and j.checkpoint->'source_fingerprint' is distinct from e->'source') then
        return jsonb_build_object('allowed',false);
      end if;
      v_status:=public.kati_control_document_ocr('status',p_actor_id,p_session_id,d.id);
      if v_status->'allowed' is distinct from 'true'::jsonb or v_status->>'state' is distinct from 'completed' then
        return jsonb_build_object('allowed',false);
      end if;
    end if;
  end loop;
  return jsonb_build_object('allowed',true);
end;
$function$;
revoke all on function public.kati_check_ocr_consumer_sources(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kati_check_ocr_consumer_sources(uuid,uuid,jsonb) to service_role;
