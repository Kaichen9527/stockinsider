-- Close historical acquisition work that predates the issuer's first official
-- listing authority. This is not a provider failure and must not be retried or
-- counted as missing evidence. The database revalidates the boundary instead
-- of trusting an application-supplied listing date.

BEGIN;

CREATE OR REPLACE FUNCTION public.terminalize_candidate_financial_prelisting_job_v7(
  p_job_id uuid,
  p_owner text,
  p_collected_at timestamptz
) RETURNS TABLE(status text, terminal_reason public.financial_acquisition_terminal_reason_v4)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.candidate_financial_acquisition_jobs_v4%ROWTYPE;
  v_listed_on date;
BEGIN
  IF p_job_id IS NULL OR char_length(COALESCE(p_owner,'')) NOT BETWEEN 1 AND 200
    OR p_collected_at IS NULL OR p_collected_at > clock_timestamp()
  THEN RAISE EXCEPTION 'invalid_candidate_financial_prelisting_completion'; END IF;

  SELECT job.* INTO v_job
  FROM public.candidate_financial_acquisition_jobs_v4 AS job
  WHERE job.job_id = p_job_id
    AND job.status = 'running'
    AND job.lease_owner = p_owner
  FOR UPDATE;
  IF NOT FOUND OR v_job.lease_expires_at < clock_timestamp()
  THEN RAISE EXCEPTION 'candidate_financial_job_lease_lost'; END IF;

  SELECT MIN(instrument.valid_from::date) INTO v_listed_on
  FROM public.stock_instruments_v3 AS instrument
  WHERE instrument.stock_id = v_job.stock_id
    AND instrument.instrument_type = 'common_stock'
    AND instrument.listing_status = 'active'
    AND instrument.recorded_at <= p_collected_at
    AND instrument.source_timestamp <= p_collected_at
    AND instrument.valid_from <= p_collected_at;

  IF v_listed_on IS NULL OR v_job.period_end IS NULL OR v_job.period_end >= v_listed_on
  THEN RAISE EXCEPTION 'candidate_financial_period_not_before_listing'; END IF;

  UPDATE public.candidate_financial_acquisition_jobs_v4 AS job SET
    status = 'terminal',
    attempts = LEAST(job.attempts + 1, 20),
    lease_owner = NULL,
    lease_expires_at = NULL,
    terminal_reason = 'unsupported_issuer'::public.financial_acquisition_terminal_reason_v4,
    terminal_detail = format('period_before_official_listing:%s', v_listed_on),
    collected_at = p_collected_at,
    next_attempt_at = NULL,
    updated_at = p_collected_at
  WHERE job.job_id = p_job_id;

  RETURN QUERY SELECT 'terminal'::text,
    'unsupported_issuer'::public.financial_acquisition_terminal_reason_v4;
END
$function$;

REVOKE ALL ON FUNCTION public.terminalize_candidate_financial_prelisting_job_v7(uuid,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminalize_candidate_financial_prelisting_job_v7(uuid,text,timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.terminalize_candidate_financial_prelisting_job_v7(uuid,text,timestamptz)
  IS 'Service-role-only lease-bound terminalization for periods before official listing authority.';

COMMIT;
