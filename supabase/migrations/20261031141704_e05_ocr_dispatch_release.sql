-- Fenced failures before a PDF page plan/source can be established. The same
-- ledger/counters are used; no scheduler, retry loop or provider call in SQL.
create function public.kati_release_reserved_ocr_job(
  p_document_id uuid,p_job_id uuid,p_lease_token uuid,p_reason text
)
returns boolean language plpgsql security invoker set search_path=''
as $function$
declare
  v_job public.document_ocr_jobs%rowtype;
  v_now timestamptz;
  v_stalls integer;
  v_terminal boolean;
begin
  if p_reason not in ('ocr_download_unavailable','ocr_document_unavailable','ocr_processing_failed','ocr_source_missing','ocr_not_pdf')
    or p_reason is null then return false; end if;
  select * into v_job from public.document_ocr_jobs where id=p_job_id and document_id=p_document_id for update;
  v_now:=clock_timestamp();
  if not found or v_job.status<>'running' or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at<=v_now or v_job.checkpoint->>'ocr_protocol' is distinct from 'reserved_v1' then return false; end if;
  perform id from public.documents where id=p_document_id for update;
  v_now:=clock_timestamp();
  if not found or v_job.lease_expires_at<=v_now then return false; end if;
  v_stalls:=v_job.consecutive_no_progress+1;
  v_terminal:=p_reason in ('ocr_source_missing','ocr_not_pdf') or v_stalls>=3;
  update public.document_ocr_jobs set status=case when v_terminal then 'needs_manual_review' else 'queued' end,
    lease_token=null,lease_expires_at=null,consecutive_no_progress=v_stalls,
    next_attempt_at=v_now+make_interval(secs=>least(300,15*(2^(least(v_stalls-1,5))))::integer),
    last_error_code=p_reason,needs_manual_review_at=case when v_terminal then v_now else needs_manual_review_at end,
    updated_at=v_now where id=p_job_id;
  update public.documents set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'extraction_status',case when v_terminal then 'needs_manual_review' else 'ocr_required' end,
    'extraction_error',p_reason,'ocr_job',jsonb_build_object('version','13L-2B',
      'status',case when v_terminal then 'needs_manual_review' else 'queued' end,'invocation_count',v_job.invocation_count)),
    analysis_status='needs_review',review_status='needs_review',updated_at=v_now where id=p_document_id;
  return true;
end;
$function$;
revoke all on function public.kati_release_reserved_ocr_job(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.kati_release_reserved_ocr_job(uuid,uuid,uuid,text) to service_role;
