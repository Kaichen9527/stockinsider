BEGIN;

-- The function returns columns named `status` and `terminal_reason`.  In the
-- original V6 body those PL/pgSQL output variables collided with identically
-- named acquisition-job columns, so the first provider failure raised
-- `column reference "status" is ambiguous` instead of releasing the lease.
CREATE OR REPLACE FUNCTION public.fail_candidate_financial_acquisition_job_v6(
  p_job_id uuid,
  p_owner text,
  p_error text,
  p_collected_at timestamptz,
  p_mops_failed boolean,
  p_finmind_failed boolean
) RETURNS TABLE(status text,terminal_reason public.financial_acquisition_terminal_reason_v4)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
#variable_conflict use_column
DECLARE
  v_job public.candidate_financial_acquisition_jobs_v4%ROWTYPE;
  v_reason public.financial_acquisition_terminal_reason_v4;
  v_mops_failures integer;
  v_finmind_failures integer;
  v_terminal boolean;
BEGIN
  IF char_length(COALESCE(p_error,'')) NOT BETWEEN 1 AND 500
    OR p_collected_at IS NULL
    OR p_collected_at>clock_timestamp()
  THEN RAISE EXCEPTION 'invalid_candidate_financial_failure'; END IF;

  SELECT job.* INTO v_job
  FROM public.candidate_financial_acquisition_jobs_v4 AS job
  WHERE job.job_id=p_job_id
    AND job.status='running'
    AND job.lease_owner=p_owner
  FOR UPDATE;
  IF NOT FOUND OR v_job.lease_expires_at<clock_timestamp()
  THEN RAISE EXCEPTION 'candidate_financial_job_lease_lost'; END IF;

  v_reason:=CASE
    WHEN p_error~*'write_failed|completion_failed' THEN 'write_failed'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'timeout' THEN 'timeout'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'security|captcha|forbidden|waf' THEN 'security_blocked'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'html' THEN 'html_rejected'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'schema|empty' THEN 'schema_unrecognized'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'404|not_found' THEN 'http_not_found'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'429|rate' THEN 'http_rate_limited'::public.financial_acquisition_terminal_reason_v4
    WHEN p_error~*'5[0-9]{2}|server' THEN 'http_server_error'::public.financial_acquisition_terminal_reason_v4
    ELSE 'network_error'::public.financial_acquisition_terminal_reason_v4
  END;
  v_mops_failures:=CASE WHEN p_mops_failed
    THEN LEAST(v_job.mops_consecutive_failures+1,5)
    ELSE v_job.mops_consecutive_failures END;
  v_finmind_failures:=CASE WHEN p_finmind_failed
    THEN LEAST(v_job.finmind_consecutive_failures+1,5)
    ELSE v_job.finmind_consecutive_failures END;
  v_terminal:=v_mops_failures>=5 OR v_finmind_failures>=5;

  UPDATE public.candidate_financial_acquisition_jobs_v4 AS job SET
    status=CASE WHEN v_terminal THEN 'terminal' ELSE 'queued' END,
    attempts=LEAST(job.attempts+1,20),
    consecutive_failures=v_mops_failures,
    mops_attempts=LEAST(job.mops_attempts+CASE WHEN p_mops_failed THEN 1 ELSE 0 END,20),
    mops_consecutive_failures=v_mops_failures,
    finmind_attempts=LEAST(job.finmind_attempts+CASE WHEN p_finmind_failed THEN 1 ELSE 0 END,20),
    finmind_consecutive_failures=v_finmind_failures,
    lease_owner=NULL,
    lease_expires_at=NULL,
    terminal_reason=CASE WHEN v_terminal THEN v_reason ELSE NULL END,
    terminal_detail=p_error,
    collected_at=CASE WHEN v_terminal THEN p_collected_at ELSE job.collected_at END,
    next_attempt_at=CASE WHEN v_terminal THEN NULL ELSE p_collected_at + make_interval(
      hours => (2 ^ GREATEST(v_mops_failures,v_finmind_failures,1))::integer
    ) END,
    updated_at=p_collected_at
  WHERE job.job_id=p_job_id;

  RETURN QUERY SELECT
    CASE WHEN v_terminal THEN 'terminal' ELSE 'queued' END::text,
    v_reason;
END $function$;

REVOKE ALL ON FUNCTION public.fail_candidate_financial_acquisition_job_v6(uuid,text,text,timestamptz,boolean,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_candidate_financial_acquisition_job_v6(uuid,text,text,timestamptz,boolean,boolean)
  TO service_role;

COMMIT;
