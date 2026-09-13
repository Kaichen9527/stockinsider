BEGIN;

-- TWSE's exchange-wide T86 response is currently about 2.13 MB.  The runtime
-- already enforces a strict 5 MB transport ceiling, but the original v5
-- receipt constraint still rejected anything above 2 MiB after canonical
-- persistence.  Keep one extra byte for the explicit response_too_large
-- sentinel emitted by the bounded fetcher.
ALTER TABLE public.taiwan_data_provider_attempts_v5
  DROP CONSTRAINT IF EXISTS taiwan_data_provider_attempts_v5_response_bytes_check;

ALTER TABLE public.taiwan_data_provider_attempts_v5
  ADD CONSTRAINT taiwan_data_provider_attempts_v5_response_bytes_check
  CHECK (response_bytes BETWEEN 0 AND 5000001) NOT VALID;

ALTER TABLE public.taiwan_data_provider_attempts_v5
  VALIDATE CONSTRAINT taiwan_data_provider_attempts_v5_response_bytes_check;

CREATE OR REPLACE FUNCTION public.complete_taiwan_data_refresh_job_v5(
  p_job_id uuid, p_owner text, p_result jsonb, p_completed_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $complete$
DECLARE v_status text; v_attempt jsonb; v_order integer := 0; v_job_attempts integer; v_terminal text;
  v_dataset text; v_symbol text; v_exchange text; v_phase text;
BEGIN
  IF jsonb_typeof(p_result) <> 'object' OR p_result->>'schema' <> 'taiwan-data-provider-result-v1'
    OR p_result->>'terminal' NOT IN ('complete','empty','timeout','usage_limited','auth_failed','http_error','network_error','schema_invalid','not_configured')
    OR jsonb_typeof(p_result->'attempts') <> 'array' OR jsonb_array_length(p_result->'attempts') NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT422', MESSAGE = 'invalid_taiwan_data_terminal_result';
  END IF;
  SELECT status,attempts,dataset,symbol,exchange,refresh_phase
    INTO v_status,v_job_attempts,v_dataset,v_symbol,v_exchange,v_phase
    FROM public.taiwan_data_refresh_queue_v5
    WHERE job_id=p_job_id AND status='running' AND lease_owner=p_owner AND lease_expires_at >= p_completed_at FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'taiwan_data_job_lease_lost'; END IF;
  IF p_result->>'dataset' IS DISTINCT FROM v_dataset
    OR p_result->>'symbol' IS DISTINCT FROM v_symbol
    OR p_result->>'exchange' IS DISTINCT FROM v_exchange
    OR p_result->>'phase' IS DISTINCT FROM v_phase THEN
    RAISE EXCEPTION USING ERRCODE = 'PT422', MESSAGE = 'taiwan_data_result_identity_mismatch';
  END IF;
  IF p_result->>'terminal'='complete' AND (
    COALESCE((p_result->>'actionEligible')::boolean,false) IS NOT TRUE
    OR NOT EXISTS(SELECT 1 FROM public.taiwan_data_canonical_results_v5 c WHERE c.job_id=p_job_id)
  ) THEN RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='taiwan_data_canonical_persistence_required'; END IF;
  SELECT COALESCE(max(attempt_order),0) INTO v_order FROM public.taiwan_data_provider_attempts_v5 WHERE job_id=p_job_id;
  FOR v_attempt IN SELECT value FROM jsonb_array_elements(p_result->'attempts') LOOP
    v_order := v_order + 1;
    IF v_attempt->>'provider' NOT IN ('twse','tpex','finmind')
      OR v_attempt->>'authorityTier' NOT IN ('official_primary','finmind_fallback')
      OR v_attempt->>'terminal' NOT IN ('complete','empty','timeout','usage_limited','auth_failed','http_error','network_error','schema_invalid','not_configured')
      OR (v_attempt->>'provider'='finmind') <> (v_attempt->>'authorityTier'='finmind_fallback')
      OR COALESCE((v_attempt->>'responseBytes')::integer, -1) NOT BETWEEN 0 AND 5000001
      OR (v_attempt->>'responseSha256' IS NOT NULL AND v_attempt->>'responseSha256' !~ '^[0-9a-f]{64}$')
      OR (v_attempt->>'httpStatus' IS NOT NULL AND COALESCE((v_attempt->>'httpStatus')::integer,0) NOT BETWEEN 100 AND 599)
    THEN RAISE EXCEPTION USING ERRCODE = 'PT422', MESSAGE = 'invalid_taiwan_data_attempt'; END IF;
    INSERT INTO public.taiwan_data_provider_attempts_v5(
      job_id,attempt_order,provider,authority_tier,terminal_status,source_url,fetched_at,http_status,response_sha256,response_bytes,api_usage,normalized_payload,detail
    ) VALUES (
      p_job_id,v_order,v_attempt->>'provider',v_attempt->>'authorityTier',v_attempt->>'terminal',
      COALESCE(v_attempt->>'sourceUrl',''),(v_attempt->>'fetchedAt')::timestamptz,
      NULLIF(v_attempt->>'httpStatus','')::integer,v_attempt->>'responseSha256',(v_attempt->>'responseBytes')::integer,
      NULLIF(v_attempt->'apiUsage','null'::jsonb),
      NULLIF(v_attempt->'normalizedPayload','null'::jsonb),
      v_attempt->>'detail'
    );
  END LOOP;
  v_terminal:=p_result->>'terminal';
  IF v_terminal IN ('timeout','usage_limited','http_error','network_error') AND v_job_attempts < 3 THEN
    UPDATE public.taiwan_data_refresh_queue_v5 SET status='queued',terminal_status=NULL,terminal_result=NULL,
      completed_at=NULL,lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=p_completed_at + interval '15 minutes',updated_at=p_completed_at
    WHERE job_id=p_job_id;
    RETURN 'retry_scheduled';
  END IF;
  UPDATE public.taiwan_data_refresh_queue_v5 SET status='terminal',terminal_status=v_terminal,terminal_result=p_result,
    completed_at=p_completed_at,lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=p_completed_at WHERE job_id=p_job_id;
  RETURN 'terminal';
END $complete$;

REVOKE ALL ON FUNCTION public.complete_taiwan_data_refresh_job_v5(uuid,text,jsonb,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_taiwan_data_refresh_job_v5(uuid,text,jsonb,timestamptz)
  TO service_role;

COMMIT;
