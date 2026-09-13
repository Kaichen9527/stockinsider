BEGIN;

-- Provider/parser changes create new immutable queue jobs. The active scope is
-- replaced once per contract generation, while independent schedules using the
-- same generation continue to merge their expected keys.
ALTER TABLE public.taiwan_data_refresh_scopes_v6
  ADD COLUMN IF NOT EXISTS contract_version text NOT NULL DEFAULT 'taiwan-data-provider-v5';

CREATE OR REPLACE FUNCTION public.register_taiwan_data_refresh_scope_v7(
  p_session_date date,p_phase text,p_queue_keys text[],p_cutoff timestamptz,p_contract_version text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_keys text[]; v_cutoff timestamptz; v_contract text; v_publication_cutoff timestamptz;
BEGIN
  IF p_session_date IS NULL OR p_phase IS NULL OR p_phase NOT IN ('preliminary','final') OR p_cutoff IS NULL
    OR p_cutoff>clock_timestamp()+interval '5 minutes' OR p_queue_keys IS NULL OR cardinality(p_queue_keys)>20000
    OR p_contract_version IS NULL OR p_contract_version !~ '^taiwan-data-provider-v[0-9]+$'
    OR EXISTS(SELECT 1 FROM unnest(p_queue_keys) item WHERE item IS NULL OR item!~'^[0-9a-f]{64}$')
  THEN RAISE EXCEPTION 'invalid_taiwan_refresh_scope'; END IF;
  INSERT INTO public.taiwan_data_refresh_scopes_v6(
    session_date,refresh_phase,expected_queue_keys,cutoff_at,contract_version
  ) VALUES(p_session_date,p_phase,'{}',p_cutoff,p_contract_version)
  ON CONFLICT(session_date,refresh_phase) DO NOTHING;
  SELECT scope.expected_queue_keys,scope.cutoff_at,scope.contract_version INTO v_keys,v_cutoff,v_contract
    FROM public.taiwan_data_refresh_scopes_v6 scope
    WHERE scope.session_date=p_session_date AND scope.refresh_phase=p_phase FOR UPDATE;
  IF v_contract IS DISTINCT FROM p_contract_version THEN
    SELECT ARRAY(SELECT DISTINCT item FROM unnest(p_queue_keys) item ORDER BY item) INTO v_keys;
    v_cutoff:=p_cutoff;
  ELSE
    SELECT ARRAY(SELECT DISTINCT item FROM unnest(v_keys||p_queue_keys) item ORDER BY item) INTO v_keys;
    v_cutoff:=greatest(v_cutoff,p_cutoff);
  END IF;
  IF cardinality(v_keys)>20000 THEN RAISE EXCEPTION 'taiwan_refresh_scope_overflow'; END IF;
  UPDATE public.taiwan_data_refresh_scopes_v6 SET expected_queue_keys=v_keys,cutoff_at=v_cutoff,
    contract_version=p_contract_version,updated_at=clock_timestamp()
    WHERE session_date=p_session_date AND refresh_phase=p_phase;
  SELECT metadata.data_cutoff_at INTO v_publication_cutoff FROM public.taiwan_data_publication_metadata_v5 metadata
    WHERE metadata.session_date=p_session_date AND metadata.publication_phase=p_phase;
  IF FOUND THEN PERFORM public.record_taiwan_data_publication_metadata_v5(
    p_session_date,p_phase,greatest(v_publication_cutoff,p_cutoff),'{}'::jsonb); END IF;
  RETURN jsonb_build_object('expected',cardinality(v_keys),'cutoffAt',v_cutoff,'contractVersion',p_contract_version);
END $$;

-- Only exchange-wide evidence needed to determine the market regime is a
-- global research blocker. Valuation, revenue, margin and individual prices
-- remain explicit per-company gaps and may never promote the affected stock.
CREATE OR REPLACE FUNCTION public.read_taiwan_data_refresh_progress_v6(p_session_date date,p_phase text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_keys text[]; v_cutoff timestamptz; v_source text; v_contract text; v_result jsonb;
BEGIN
  IF p_session_date IS NULL OR p_phase IS NULL OR p_phase NOT IN ('preliminary','final')
  THEN RAISE EXCEPTION 'invalid_taiwan_refresh_progress'; END IF;
  SELECT scope.expected_queue_keys,scope.cutoff_at,scope.contract_version INTO v_keys,v_cutoff,v_contract
    FROM public.taiwan_data_refresh_scopes_v6 scope
    WHERE scope.session_date=p_session_date AND scope.refresh_phase=p_phase;
  v_source:=CASE WHEN FOUND THEN 'registered_scope' ELSE 'phase_queue' END;
  IF v_keys IS NULL THEN
    SELECT COALESCE(array_agg(queue.queue_key),'{}') INTO v_keys FROM public.taiwan_data_refresh_queue_v5 queue
      WHERE queue.requested_session_date=p_session_date AND queue.refresh_phase=p_phase;
  END IF;
  WITH expected AS (SELECT DISTINCT unnest(v_keys) AS queue_key), states AS (
    SELECT queue.job_id,queue.status,queue.terminal_status,queue.next_attempt_at,queue.dataset,queue.symbol,
      EXISTS(SELECT 1 FROM public.taiwan_data_canonical_results_v5 canonical WHERE canonical.job_id=queue.job_id) AS persisted
    FROM expected LEFT JOIN public.taiwan_data_refresh_queue_v5 queue ON queue.queue_key=expected.queue_key
      AND queue.requested_session_date=p_session_date AND queue.refresh_phase=p_phase
  ), counts AS (
    SELECT count(*) AS expected,
      count(*) FILTER(WHERE status='terminal' AND terminal_status='complete' AND persisted) AS completed,
      count(*) FILTER(WHERE status='terminal' AND (terminal_status IS DISTINCT FROM 'complete' OR NOT persisted)) AS failed,
      count(*) FILTER(WHERE status='terminal' AND (terminal_status IS DISTINCT FROM 'complete' OR NOT persisted)
        AND dataset NOT IN ('market_index','institutional_flow','stock_master','trading_calendar')) AS "failedCandidate",
      count(*) FILTER(WHERE status='terminal' AND (terminal_status IS DISTINCT FROM 'complete' OR NOT persisted)
        AND dataset IN ('market_index','institutional_flow','stock_master','trading_calendar')) AS "failedCritical",
      count(*) FILTER(WHERE status='queued') AS queued,count(*) FILTER(WHERE status='running') AS running,
      count(*) FILTER(WHERE job_id IS NULL) AS missing,
      count(*) FILTER(WHERE status='queued' AND next_attempt_at>statement_timestamp()) AS retrying FROM states
  ) SELECT to_jsonb(counts)||jsonb_build_object('ready',expected>0 AND completed=expected,
    'settled',expected>0 AND completed+failed=expected,
    'researchReady',expected>0 AND completed+failed=expected AND "failedCritical"=0,
    'scopeSource',v_source,'cutoffAt',v_cutoff,'contractVersion',v_contract) INTO v_result FROM counts;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.register_taiwan_data_refresh_scope_v7(date,text,text[],timestamptz,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_taiwan_data_refresh_scope_v7(date,text,text[],timestamptz,text)
  TO service_role;

COMMIT;
