-- Candidate financial fallback v5: preserve the immutable MOPS request job,
-- but attribute any validated FinMind mirror facts to FinMind's fixed API
-- origin. This is additive provenance hardening; no prior fact is rewritten.

BEGIN;

ALTER TABLE public.candidate_financial_acquisition_jobs_v4
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;
ALTER TABLE public.candidate_financial_acquisition_jobs_v4
  DROP CONSTRAINT IF EXISTS candidate_financial_acquisition_jobs_v4_consecutive_failures_check;
ALTER TABLE public.candidate_financial_acquisition_jobs_v4
  ADD CONSTRAINT candidate_financial_acquisition_jobs_v4_consecutive_failures_check
  CHECK(consecutive_failures BETWEEN 0 AND 5);

CREATE OR REPLACE FUNCTION public.complete_candidate_financial_acquisition_job_v4(
  p_job_id uuid,
  p_owner text,
  p_caller_principal uuid,
  p_facts jsonb,
  p_source_sha256 text,
  p_response_bytes integer,
  p_collected_at timestamptz
)
RETURNS TABLE(written_facts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.candidate_financial_acquisition_jobs_v4%ROWTYPE;
  v_fact jsonb;
  v_fact_id uuid;
  v_written integer := 0;
  v_provider text;
  v_batch_provider text;
  v_actual_source_url text;
BEGIN
  IF p_facts IS NULL OR jsonb_typeof(p_facts) <> 'array' THEN
    RAISE EXCEPTION 'invalid_candidate_financial_completion';
  END IF;
  IF jsonb_array_length(p_facts) < 1
    OR COALESCE(p_source_sha256,'') !~ '^[0-9a-f]{64}$'
    OR p_response_bytes IS NULL
    OR p_response_bytes < 0 OR p_response_bytes > 67108864
    OR p_collected_at IS NULL OR p_collected_at > clock_timestamp() THEN
    RAISE EXCEPTION 'invalid_candidate_financial_completion';
  END IF;
  SELECT * INTO v_job
  FROM public.candidate_financial_acquisition_jobs_v4
  WHERE job_id = p_job_id AND status = 'running' AND lease_owner = p_owner
  FOR UPDATE;
  IF NOT FOUND OR v_job.lease_expires_at < clock_timestamp() THEN
    RAISE EXCEPTION 'candidate_financial_job_lease_lost';
  END IF;

  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts)
  LOOP
    v_provider := v_fact #>> '{input,provider}';
    v_batch_provider := COALESCE(v_batch_provider,v_provider);
    v_actual_source_url := CASE
      WHEN v_provider = 'finmind' THEN 'https://api.finmindtrade.com/api/v4/data'
      ELSE v_job.source_url
    END;
    IF v_provider IS DISTINCT FROM v_batch_provider
      OR v_provider NOT IN ('mops','twse','tpex','finmind')
      OR (v_fact #>> '{input,stock_id}')::uuid IS DISTINCT FROM v_job.stock_id
      OR (v_fact #>> '{input,period_end}')::date IS DISTINCT FROM v_job.period_end
      OR (v_fact #>> '{input,collected_at}')::timestamptz IS DISTINCT FROM p_collected_at
      OR (v_provider = 'finmind' AND COALESCE(v_fact #>> '{input,source_ref}','') !~ '^finmind:')
      OR (v_provider = 'mops' AND COALESCE(v_fact #>> '{input,source_ref}','') !~ '^(twse|tpex)-mops-inline:')
      OR (v_provider IN ('twse','tpex') AND COALESCE(v_fact #>> '{input,source_ref}','') !~ '^(twse|tpex)-openapi:')
      OR v_actual_source_url !~ '^https://' THEN
      RAISE EXCEPTION 'candidate_financial_provenance_invalid';
    END IF;
    SELECT appended.fact_id INTO v_fact_id
    FROM public.append_financial_fact_v3(
      jsonb_populate_record(NULL::public.financial_fact_input_v3, v_fact->'input'),
      p_caller_principal
    ) appended
    LIMIT 1;
    IF v_fact_id IS NULL THEN RAISE EXCEPTION 'candidate_financial_fact_append_empty'; END IF;
    INSERT INTO public.candidate_financial_fact_provenance_v4(
      fact_id,acquisition_job_id,source_url,source_sha256,locator,extracted_at
    ) VALUES(
      v_fact_id,p_job_id,v_actual_source_url,p_source_sha256,
      COALESCE(v_fact->'locator','{}'::jsonb),p_collected_at
    ) ON CONFLICT DO NOTHING;
    v_written := v_written + 1;
  END LOOP;

  UPDATE public.candidate_financial_acquisition_jobs_v4
  SET status='terminal',attempts=LEAST(attempts+1,20),consecutive_failures=0,lease_owner=NULL,lease_expires_at=NULL,
      terminal_reason='complete',terminal_detail=NULL,response_sha256=p_source_sha256,
      response_bytes=p_response_bytes,collected_at=p_collected_at,next_attempt_at=NULL,
      updated_at=p_collected_at
  WHERE job_id=p_job_id;

  INSERT INTO public.candidate_financial_acquisition_cursors_v4(
    stock_id,endpoint_key,cursor_value,last_successful_period_end,last_terminal_reason,
    last_collected_at,updated_at
  ) VALUES(
    v_job.stock_id,v_job.endpoint_key,
    jsonb_build_object(
      'cursor_key',v_job.cursor_key,'job_id',p_job_id,
      'source_sha256',p_source_sha256,
      'provider',v_batch_provider
    ),
    v_job.period_end,'complete',p_collected_at,p_collected_at
  ) ON CONFLICT(stock_id,endpoint_key) DO UPDATE SET
    cursor_value=EXCLUDED.cursor_value,
    last_successful_period_end=GREATEST(public.candidate_financial_acquisition_cursors_v4.last_successful_period_end,EXCLUDED.last_successful_period_end),
    last_terminal_reason=EXCLUDED.last_terminal_reason,
    last_collected_at=EXCLUDED.last_collected_at,
    updated_at=EXCLUDED.updated_at;

  RETURN QUERY SELECT v_written;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_candidate_financial_acquisition_job_v4(uuid,text,uuid,jsonb,text,integer,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_candidate_financial_acquisition_job_v4(uuid,text,uuid,jsonb,text,integer,timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_candidate_financial_fallback_v5(
  p_job_id uuid,
  p_owner text,
  p_caller_principal uuid,
  p_facts jsonb,
  p_source_sha256 text,
  p_response_bytes integer,
  p_collected_at timestamptz,
  p_primary_reason public.financial_acquisition_terminal_reason_v4,
  p_primary_error text,
  p_next_attempt_at timestamptz
)
RETURNS TABLE(written_facts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.candidate_financial_acquisition_jobs_v4%ROWTYPE;
  v_fact jsonb;
  v_fact_id uuid;
  v_written integer := 0;
BEGIN
  IF p_facts IS NULL OR jsonb_typeof(p_facts) <> 'array' THEN
    RAISE EXCEPTION 'invalid_candidate_financial_fallback';
  END IF;
  IF jsonb_array_length(p_facts) < 1
    OR COALESCE(p_source_sha256,'') !~ '^[0-9a-f]{64}$'
    OR p_response_bytes IS NULL OR p_response_bytes < 0 OR p_response_bytes > 67108864
    OR p_collected_at IS NULL OR p_collected_at > clock_timestamp()
    OR p_primary_reason IS NULL OR p_primary_reason IN ('complete','empty_official_response')
    OR char_length(COALESCE(p_primary_error,'')) NOT BETWEEN 1 AND 500
    OR p_next_attempt_at <= p_collected_at OR p_next_attempt_at > p_collected_at + interval '7 days' THEN
    RAISE EXCEPTION 'invalid_candidate_financial_fallback';
  END IF;

  SELECT * INTO v_job
  FROM public.candidate_financial_acquisition_jobs_v4
  WHERE job_id = p_job_id AND endpoint_key = 'mops_inline'
    AND status = 'running' AND lease_owner = p_owner
  FOR UPDATE;
  IF NOT FOUND OR v_job.lease_expires_at < clock_timestamp() THEN
    RAISE EXCEPTION 'candidate_financial_job_lease_lost';
  END IF;

  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts)
  LOOP
    v_fact_id := NULL;
    IF v_fact #>> '{input,provider}' <> 'finmind'
      OR v_fact #>> '{input,authority_tier}' <> 'finmind_mirror'
      OR (v_fact #>> '{input,stock_id}')::uuid IS DISTINCT FROM v_job.stock_id
      OR (v_fact #>> '{input,period_end}')::date IS DISTINCT FROM v_job.period_end
      OR (v_fact #>> '{input,collected_at}')::timestamptz IS DISTINCT FROM p_collected_at
      OR COALESCE(v_fact #>> '{input,source_ref}','') !~ '^finmind:' THEN
      RAISE EXCEPTION 'candidate_financial_fallback_provenance_invalid';
    END IF;
    -- A mirror's first collection timestamp is its first defensible PIT
    -- availability. Later retries of unchanged content are acquisition
    -- attempts, not new immutable fact revisions.
    SELECT fact.fact_id INTO v_fact_id
    FROM public.opportunity_financial_facts_v3 fact
    WHERE fact.stock_id=v_job.stock_id
      AND fact.fact_key::text=(v_fact #>> '{input,fact_key}')
      AND fact.period_start IS NOT DISTINCT FROM NULLIF(v_fact #>> '{input,period_start}','')::date
      AND fact.period_end=(v_fact #>> '{input,period_end}')::date
      AND fact.duration_kind::text=(v_fact #>> '{input,duration_kind}')
      AND fact.value=(v_fact #>> '{input,value}')::double precision
      AND fact.unit::text=(v_fact #>> '{input,unit}')
      AND fact.provider::text='finmind'
      AND fact.authority_tier::text='finmind_mirror'
      AND fact.estimate_kind::text=(v_fact #>> '{input,estimate_kind}')
      AND fact.estimate_horizon::text=(v_fact #>> '{input,estimate_horizon}')
      AND fact.filing_restatement_id IS NOT DISTINCT FROM NULLIF(v_fact #>> '{input,filing_restatement_id}','')
      AND fact.source_ref=(v_fact #>> '{input,source_ref}')
    ORDER BY fact.recorded_at,fact.fact_id
    LIMIT 1;
    IF v_fact_id IS NULL THEN
      SELECT appended.fact_id INTO v_fact_id
      FROM public.append_financial_fact_v3(
        jsonb_populate_record(NULL::public.financial_fact_input_v3, v_fact->'input'),
        p_caller_principal
      ) appended
      LIMIT 1;
    END IF;
    IF v_fact_id IS NULL THEN RAISE EXCEPTION 'candidate_financial_fact_append_empty'; END IF;
    INSERT INTO public.candidate_financial_fact_provenance_v4(
      fact_id,acquisition_job_id,source_url,source_sha256,locator,extracted_at
    ) VALUES(
      v_fact_id,p_job_id,'https://api.finmindtrade.com/api/v4/data',p_source_sha256,
      COALESCE(v_fact->'locator','{}'::jsonb),p_collected_at
    ) ON CONFLICT DO NOTHING;
    v_written := v_written + 1;
  END LOOP;

  UPDATE public.candidate_financial_acquisition_jobs_v4
  -- Preserve increasing official-retry backoff, but reset the independent
  -- consecutive failure budget after a successful mirror acquisition.
  SET status='queued',attempts=LEAST(attempts+1,19),consecutive_failures=0,lease_owner=NULL,lease_expires_at=NULL,
      terminal_reason=NULL,terminal_detail=p_primary_error,response_sha256=p_source_sha256,
      response_bytes=p_response_bytes,collected_at=p_collected_at,next_attempt_at=p_next_attempt_at,
      updated_at=p_collected_at
  WHERE job_id=p_job_id;

  INSERT INTO public.candidate_financial_acquisition_cursors_v4(
    stock_id,endpoint_key,cursor_value,last_terminal_reason,last_collected_at,updated_at
  ) VALUES(
    v_job.stock_id,v_job.endpoint_key,
    jsonb_build_object(
      'cursor_key',v_job.cursor_key,'job_id',p_job_id,'source_sha256',p_source_sha256,
      'provider','finmind','official_retry_at',p_next_attempt_at
    ),
    p_primary_reason,p_collected_at,p_collected_at
  ) ON CONFLICT(stock_id,endpoint_key) DO UPDATE SET
    cursor_value=EXCLUDED.cursor_value,
    last_terminal_reason=EXCLUDED.last_terminal_reason,
    last_collected_at=EXCLUDED.last_collected_at,
    updated_at=EXCLUDED.updated_at;

  RETURN QUERY SELECT v_written;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_candidate_financial_fallback_v5(uuid,text,uuid,jsonb,text,integer,timestamptz,public.financial_acquisition_terminal_reason_v4,text,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_candidate_financial_fallback_v5(uuid,text,uuid,jsonb,text,integer,timestamptz,public.financial_acquisition_terminal_reason_v4,text,timestamptz)
  TO service_role;

COMMIT;
