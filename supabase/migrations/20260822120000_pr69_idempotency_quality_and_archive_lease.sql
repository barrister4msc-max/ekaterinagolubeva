-- Supabase Git preview trigger: no schema or runtime change.
-- PR69 follow-up: idempotency for AI-fill and OCR serialization for archive items.
create or replace function public.claim_document_intake_ai_fill(
  p_session_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.document_intake_sessions%rowtype;
  v_entries jsonb;
  v_entry jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_request_id is null or length(trim(p_request_id)) < 8 or length(p_request_id) > 128 then
    return jsonb_build_object('status', 'invalid_request_id');
  end if;

  select * into v_session
    from public.document_intake_sessions
   where id = p_session_id
   for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_entries := coalesce(v_session.metadata -> 'ai_fill_idempotency', '{}'::jsonb);
  v_entry := v_entries -> p_request_id;

  if jsonb_typeof(v_entry) = 'object' then
    if v_entry ->> 'status' = 'completed' then
      return jsonb_build_object('status', 'completed', 'result', v_entry -> 'result');
    end if;
    if v_entry ->> 'status' = 'processing'
       and coalesce((v_entry ->> 'started_at')::timestamptz, v_now) > v_now - interval '15 minutes' then
      return jsonb_build_object('status', 'processing');
    end if;
  end if;

  update public.document_intake_sessions
     set metadata = jsonb_set(
       coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'ai_fill_idempotency', coalesce(metadata -> 'ai_fill_idempotency', '{}'::jsonb)
       ),
       array['ai_fill_idempotency', p_request_id],
       jsonb_build_object('status', 'processing', 'started_at', v_now),
       true
     ),
     updated_at = v_now
   where id = p_session_id;

  return jsonb_build_object('status', 'claimed');
end;
$$;

create or replace function public.complete_document_intake_ai_fill(
  p_session_id uuid,
  p_request_id text,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.document_intake_sessions
     set metadata = jsonb_set(
       coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'ai_fill_idempotency', coalesce(metadata -> 'ai_fill_idempotency', '{}'::jsonb)
       ),
       array['ai_fill_idempotency', p_request_id],
       jsonb_build_object(
         'status', 'completed',
         'completed_at', clock_timestamp(),
         'result', p_result
       ),
       true
     ),
     updated_at = clock_timestamp()
   where id = p_session_id
     and metadata -> 'ai_fill_idempotency' -> p_request_id ->> 'status' = 'processing';
  return found;
end;
$$;

create or replace function public.release_document_intake_ai_fill(
  p_session_id uuid,
  p_request_id text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.document_intake_sessions
     set metadata = jsonb_set(
       coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'ai_fill_idempotency', coalesce(metadata -> 'ai_fill_idempotency', '{}'::jsonb)
       ),
       array['ai_fill_idempotency', p_request_id],
       jsonb_build_object(
         'status', 'failed',
         'failed_at', clock_timestamp(),
         'error', left(coalesce(p_error, 'ai_fill_failed'), 500)
       ),
       true
     ),
     updated_at = clock_timestamp()
   where id = p_session_id
     and metadata -> 'ai_fill_idempotency' -> p_request_id ->> 'status' = 'processing';
  return found;
end;
$$;

create or replace function public.claim_archive_item_text_extraction(
  p_item_id uuid,
  p_lease_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.lawyer_archive_items%rowtype;
  v_status text;
  v_lease_until timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_item
    from public.lawyer_archive_items
   where id = p_item_id
   for update;
  if not found then
    return jsonb_build_object('claimed', false, 'status', 'not_found');
  end if;

  v_status := coalesce(v_item.metadata ->> 'text_extraction_status', 'pending');
  begin
    v_lease_until := nullif(v_item.metadata ->> 'text_extraction_lease_until', '')::timestamptz;
  exception when others then
    v_lease_until := null;
  end;

  if v_status = 'completed' and length(trim(coalesce(v_item.content, ''))) > 0 then
    return jsonb_build_object('claimed', false, 'status', 'completed', 'text_length', length(trim(v_item.content)));
  end if;

  if v_status = 'processing' and v_lease_until is not null and v_lease_until > v_now then
    return jsonb_build_object('claimed', false, 'status', 'processing');
  end if;

  update public.lawyer_archive_items
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
       'text_extraction_status', 'processing',
       'text_extraction_started_at', v_now,
       'text_extraction_lease_until', v_now + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 180), 600))),
       'ocr_error', null
     )
   where id = p_item_id;

  return jsonb_build_object('claimed', true, 'status', 'processing');
end;
$$;

revoke all on function public.claim_document_intake_ai_fill(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_document_intake_ai_fill(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.release_document_intake_ai_fill(uuid, text, text) from public, anon, authenticated;
grant execute on function public.release_document_intake_ai_fill(uuid, text, text) to service_role;
revoke all on function public.claim_archive_item_text_extraction(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_document_intake_ai_fill(uuid, text) to service_role;
grant execute on function public.complete_document_intake_ai_fill(uuid, text, jsonb) to service_role;
grant execute on function public.claim_archive_item_text_extraction(uuid, integer) to service_role;