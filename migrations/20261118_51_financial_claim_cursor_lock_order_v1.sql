BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DO $guard$
DECLARE
  source_hash text := (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure('public.claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)'));
BEGIN
  IF source_hash IS NULL OR source_hash NOT IN ('b5121d364e7523879e6eda8570a430943616165953e75743b714dec34892e8ec', '32e3b3203d57a4c9c7bcf46d9f614aebd15411f3ba03737389c6e488ec3f0bce') THEN
    RAISE EXCEPTION 'financial_claim_cursor_predecessor_mismatch';
  END IF;
END
$guard$;

-- Workers can claim different jobs for the same issuer. Visit shared cursor
-- keys in one order while retaining the fair, SKIP LOCKED job selection.
CREATE OR REPLACE FUNCTION public.claim_candidate_financial_acquisition_jobs_v4(
  p_stock_ids uuid[],p_endpoint_key text,p_limit integer,p_owner text,
  p_claimed_at timestamptz,p_lease_expires_at timestamptz
) RETURNS TABLE(job_id uuid,stock_id uuid,period_end date,cursor_key text,attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
#variable_conflict use_column
BEGIN
  IF p_endpoint_key NOT IN ('mops_inline','tpex_general_income','tpex_broker_income','tpex_general_balance','tpex_broker_balance','issuer_ir_document')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 240 OR char_length(COALESCE(p_owner,'')) NOT BETWEEN 1 AND 200
    OR p_claimed_at IS NULL OR p_lease_expires_at IS NULL OR p_lease_expires_at<=p_claimed_at
  THEN RAISE EXCEPTION 'invalid_candidate_financial_claim'; END IF;
  RETURN QUERY WITH ranked AS (
    SELECT candidate.job_id,row_number() OVER(PARTITION BY candidate.stock_id
      ORDER BY candidate.attempts,candidate.period_end DESC,candidate.created_at,candidate.job_id) AS issuer_rank
    FROM public.candidate_financial_acquisition_jobs_v4 candidate
    WHERE candidate.stock_id=ANY(p_stock_ids) AND candidate.endpoint_key=p_endpoint_key
      AND ((candidate.status='queued' AND (candidate.next_attempt_at IS NULL OR candidate.next_attempt_at<=p_claimed_at))
        OR (candidate.status='running' AND candidate.lease_expires_at<p_claimed_at))
      AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_receipts_v6 receipt
        WHERE receipt.acquisition_job_id=candidate.job_id AND receipt.parser_status IN ('queued','running'))
      AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_job_links_v9 link
        JOIN public.candidate_financial_document_receipts_v6 receipt ON receipt.receipt_id=link.receipt_id
        WHERE link.job_id=candidate.job_id AND (receipt.parser_status IN ('queued','running') OR receipt.financial_validation_status='pending'))
  ), selected AS (
    SELECT candidate.job_id FROM public.candidate_financial_acquisition_jobs_v4 candidate JOIN ranked ON ranked.job_id=candidate.job_id
    WHERE candidate.stock_id=ANY(p_stock_ids) AND candidate.endpoint_key=p_endpoint_key
      AND ((candidate.status='queued' AND (candidate.next_attempt_at IS NULL OR candidate.next_attempt_at<=p_claimed_at))
        OR (candidate.status='running' AND candidate.lease_expires_at<p_claimed_at))
      AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_receipts_v6 receipt
        WHERE receipt.acquisition_job_id=candidate.job_id AND receipt.parser_status IN ('queued','running'))
      AND NOT EXISTS(SELECT 1 FROM public.candidate_financial_document_job_links_v9 link
        JOIN public.candidate_financial_document_receipts_v6 receipt ON receipt.receipt_id=link.receipt_id
        WHERE link.job_id=candidate.job_id AND (receipt.parser_status IN ('queued','running') OR receipt.financial_validation_status='pending'))
    ORDER BY ranked.issuer_rank,candidate.attempts,candidate.period_end DESC,candidate.created_at,candidate.job_id
    FOR UPDATE OF candidate SKIP LOCKED LIMIT p_limit
  ), claimed_jobs AS (UPDATE public.candidate_financial_acquisition_jobs_v4 claimed
    SET status='running',lease_owner=p_owner,lease_expires_at=p_lease_expires_at,next_attempt_at=NULL,updated_at=p_claimed_at
    FROM selected WHERE claimed.job_id=selected.job_id
      AND ((claimed.status='queued' AND (claimed.next_attempt_at IS NULL OR claimed.next_attempt_at<=p_claimed_at))
        OR (claimed.status='running' AND claimed.lease_expires_at<p_claimed_at))
    RETURNING claimed.job_id,claimed.stock_id,claimed.period_end,claimed.cursor_key,claimed.attempts
  ), touched AS (
    INSERT INTO public.candidate_financial_acquisition_cursors_v4(stock_id,endpoint_key,cursor_value,last_attempted_at,updated_at)
      SELECT DISTINCT claimed_jobs.stock_id,p_endpoint_key,'{}'::jsonb,p_claimed_at,p_claimed_at FROM claimed_jobs
      ORDER BY claimed_jobs.stock_id
      ON CONFLICT(stock_id,endpoint_key) DO UPDATE SET
        last_attempted_at=GREATEST(public.candidate_financial_acquisition_cursors_v4.last_attempted_at,EXCLUDED.last_attempted_at),
        updated_at=GREATEST(public.candidate_financial_acquisition_cursors_v4.updated_at,EXCLUDED.updated_at) RETURNING 1
  ) SELECT claimed_jobs.job_id,claimed_jobs.stock_id,claimed_jobs.period_end,claimed_jobs.cursor_key,claimed_jobs.attempts FROM claimed_jobs;
END; $function$;

DO $guard$
BEGIN
  IF (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure('public.claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)')) IS DISTINCT FROM '32e3b3203d57a4c9c7bcf46d9f614aebd15411f3ba03737389c6e488ec3f0bce' THEN
    RAISE EXCEPTION 'financial_claim_cursor_successor_mismatch';
  END IF;
END
$guard$;

COMMIT;
