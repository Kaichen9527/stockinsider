-- Acquisition work is bounded and fair across issuers; financial field gaps
-- are retained on the durable period job, not erased by a successful download.
BEGIN;
ALTER TABLE public.candidate_financial_acquisition_jobs_v4
  ADD COLUMN IF NOT EXISTS required_fact_keys jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK(jsonb_typeof(required_fact_keys)='array');
ALTER TABLE public.candidate_financial_acquisition_cursors_v4
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_candidate_financial_acquisition_jobs_v4(
  p_stock_ids uuid[],p_endpoint_key text,p_limit integer,p_owner text,
  p_claimed_at timestamptz,p_lease_expires_at timestamptz
) RETURNS TABLE(job_id uuid,stock_id uuid,period_end date,cursor_key text,attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
#variable_conflict use_column
BEGIN
  IF p_endpoint_key NOT IN ('mops_inline','tpex_general_income','tpex_broker_income','tpex_general_balance','tpex_broker_balance','issuer_ir_document')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 240
    OR char_length(COALESCE(p_owner,'')) NOT BETWEEN 1 AND 200
    OR p_claimed_at IS NULL OR p_lease_expires_at IS NULL OR p_lease_expires_at<=p_claimed_at
  THEN RAISE EXCEPTION 'invalid_candidate_financial_claim'; END IF;
  RETURN QUERY WITH ranked AS (
    SELECT candidate.job_id,
      row_number() OVER(PARTITION BY candidate.stock_id ORDER BY candidate.attempts,candidate.period_end DESC,candidate.created_at,candidate.job_id) AS issuer_rank
    FROM public.candidate_financial_acquisition_jobs_v4 candidate
    WHERE candidate.stock_id=ANY(p_stock_ids) AND candidate.endpoint_key=p_endpoint_key
      AND ((candidate.status='queued' AND (candidate.next_attempt_at IS NULL OR candidate.next_attempt_at<=p_claimed_at))
        OR (candidate.status='running' AND candidate.lease_expires_at<p_claimed_at))
      -- Accepted documents awaiting their parser are not downloaded again.
      AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_receipts_v6 receipt
        WHERE receipt.acquisition_job_id=candidate.job_id AND receipt.parser_status IN ('queued','running'))
  ), selected AS (
    SELECT candidate.job_id FROM public.candidate_financial_acquisition_jobs_v4 candidate
    JOIN ranked ON ranked.job_id=candidate.job_id
    -- Repeat on the locked alias: a concurrent committed claim may have
    -- changed this row since the ranking snapshot was read.
    WHERE candidate.stock_id=ANY(p_stock_ids) AND candidate.endpoint_key=p_endpoint_key
      AND ((candidate.status='queued' AND (candidate.next_attempt_at IS NULL OR candidate.next_attempt_at<=p_claimed_at))
        OR (candidate.status='running' AND candidate.lease_expires_at<p_claimed_at))
      AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_receipts_v6 receipt
        WHERE receipt.acquisition_job_id=candidate.job_id AND receipt.parser_status IN ('queued','running'))
    ORDER BY ranked.issuer_rank,candidate.attempts,candidate.period_end DESC,candidate.created_at,candidate.job_id
    FOR UPDATE OF candidate SKIP LOCKED LIMIT p_limit
  ), claimed_jobs AS (UPDATE public.candidate_financial_acquisition_jobs_v4 claimed
    SET status='running',lease_owner=p_owner,lease_expires_at=p_lease_expires_at,
      next_attempt_at=NULL,updated_at=p_claimed_at
    FROM selected WHERE claimed.job_id=selected.job_id
      AND ((claimed.status='queued' AND (claimed.next_attempt_at IS NULL OR claimed.next_attempt_at<=p_claimed_at))
        OR (claimed.status='running' AND claimed.lease_expires_at<p_claimed_at))
    RETURNING claimed.job_id,claimed.stock_id,claimed.period_end,claimed.cursor_key,claimed.attempts
  ), touched AS (
    INSERT INTO public.candidate_financial_acquisition_cursors_v4(stock_id,endpoint_key,cursor_value,last_attempted_at,updated_at)
      SELECT DISTINCT claimed_jobs.stock_id,p_endpoint_key,'{}'::jsonb,p_claimed_at,p_claimed_at FROM claimed_jobs
      ON CONFLICT(stock_id,endpoint_key)
      DO UPDATE SET last_attempted_at=GREATEST(public.candidate_financial_acquisition_cursors_v4.last_attempted_at,EXCLUDED.last_attempted_at),
        updated_at=GREATEST(public.candidate_financial_acquisition_cursors_v4.updated_at,EXCLUDED.updated_at)
      RETURNING 1
  ) SELECT claimed_jobs.job_id,claimed_jobs.stock_id,claimed_jobs.period_end,claimed_jobs.cursor_key,claimed_jobs.attempts FROM claimed_jobs;
END; $function$;
REVOKE ALL ON FUNCTION public.claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)
  TO service_role;
COMMIT;
