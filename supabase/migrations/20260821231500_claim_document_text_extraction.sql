-- Serialise OCR work per document. The Edge Function uses the service role,
-- while browser users never receive EXECUTE on this helper.
create or replace function public.claim_document_text_extraction(
  p_document_id uuid,
  p_lease_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
  v_status text;
  v_lease_until timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  select *
    into v_document
    from public.documents
   where id = p_document_id
   for update;

  if not found then
    return jsonb_build_object('claimed', false, 'status', 'not_found', 'text_length', 0);
  end if;

  v_status := coalesce(v_document.metadata ->> 'extraction_status', 'pending');

  begin
    v_lease_until := nullif(v_document.metadata ->> 'extraction_lease_until', '')::timestamptz;
  exception when others then
    -- A malformed legacy value must not permanently block extraction.
    v_lease_until := null;
  end;

  if v_status = 'completed' and length(trim(coalesce(v_document.ocr_text, ''))) > 0 then
    return jsonb_build_object(
      'claimed', false,
      'status', 'completed',
      'text_length', length(trim(v_document.ocr_text))
    );
  end if;

  if v_status = 'processing' and v_lease_until is not null and v_lease_until > v_now then
    return jsonb_build_object(
      'claimed', false,
      'status', 'processing',
      'text_length', length(trim(coalesce(v_document.ocr_text, ''))),
      'lease_until', v_lease_until
    );
  end if;

  update public.documents
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
       'extraction_status', 'processing',
       'extraction_started_at', v_now,
       'extraction_lease_until', v_now + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 180), 600))),
       'extraction_error', null
     )
   where id = p_document_id;

  return jsonb_build_object(
    'claimed', true,
    'status', 'processing',
    'text_length', 0
  );
end;
$$;

revoke all on function public.claim_document_text_extraction(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_document_text_extraction(uuid, integer) to service_role;

