BEGIN;

-- Resolve each authority stream before applying its current eligibility. A
-- newer delisting or stage demotion must not resurrect an older active row.
CREATE OR REPLACE FUNCTION public.read_taiwan_data_candidate_universe_v6(
  p_cutoff timestamptz,p_after_symbol text DEFAULT '',p_limit integer DEFAULT 200
) RETURNS TABLE(symbol text,exchange text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_cutoff IS NULL OR p_after_symbol IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
    OR (p_after_symbol<>'' AND p_after_symbol!~'^[0-9]{4}$')
  THEN RAISE EXCEPTION 'invalid_taiwan_candidate_page'; END IF;
  RETURN QUERY WITH latest_stage AS (
    SELECT DISTINCT ON (stage.stock_id) stage.stock_id,stage.lifecycle_stage
    FROM public.candidate_daily_stage_snapshots stage
    WHERE stage.session_date<=(p_cutoff AT TIME ZONE 'Asia/Taipei')::date
      AND stage.available_at<=p_cutoff AND stage.created_at<=p_cutoff
    ORDER BY stage.stock_id,stage.session_date DESC,stage.available_at DESC,stage.created_at DESC,stage.id DESC
  ), candidates AS (
    SELECT mention.stock_id FROM public.candidate_source_mentions mention
    WHERE mention.available_at BETWEEN p_cutoff-interval '7 days' AND p_cutoff
      AND mention.created_at<=p_cutoff
      AND COALESCE(mention.content_semantics,'editorial_discussion')<>'bulk_institutional_ranking'
      AND (mention.provenance->'discovery_eligible') IS DISTINCT FROM 'false'::jsonb
      AND (mention.provenance->'invalidated') IS DISTINCT FROM 'true'::jsonb
      AND (lower(mention.platform)<>'gdelt' OR (
        mention.provenance->'discovery_eligible'='true'::jsonb
        AND mention.provenance->>'matcher_version'='gdelt-tw-context-v2'))
    UNION SELECT stage.stock_id FROM latest_stage stage WHERE stage.lifecycle_stage IN ('waiting','actionable')
  ), latest_instrument AS (
    SELECT DISTINCT ON (instrument.stock_id) instrument.stock_id,instrument.symbol,instrument.exchange,
      instrument.instrument_type,instrument.listing_status,instrument.valid_to
    FROM public.stock_instruments_v3 instrument JOIN candidates candidate ON candidate.stock_id=instrument.stock_id
    WHERE instrument.recorded_at<=p_cutoff AND instrument.source_timestamp<=p_cutoff AND instrument.valid_from<=p_cutoff
    ORDER BY instrument.stock_id,instrument.recorded_at DESC,instrument.source_timestamp DESC,
      instrument.valid_from DESC,instrument.instrument_authority_id DESC
  ) SELECT DISTINCT instrument.symbol::text,instrument.exchange::text
    FROM latest_instrument instrument JOIN public.stocks stock ON stock.id=instrument.stock_id
    WHERE stock.market='TW' AND instrument.instrument_type='common_stock' AND instrument.listing_status='active'
      AND instrument.exchange IN ('TWSE','TPEX') AND (instrument.valid_to IS NULL OR instrument.valid_to>p_cutoff)
      AND instrument.symbol>p_after_symbol
    ORDER BY instrument.symbol::text,instrument.exchange::text LIMIT p_limit;
END $$;

CREATE OR REPLACE FUNCTION public.read_taiwan_data_candidate_universe_v5(p_limit integer DEFAULT 5000)
RETURNS TABLE(symbol text,exchange text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_cutoff timestamptz:=statement_timestamp(); v_after text:=''; v_count integer:=0; v_page_count integer; v_row record;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'invalid_taiwan_candidate_limit'; END IF;
  LOOP
    v_page_count:=0;
    FOR v_row IN SELECT * FROM public.read_taiwan_data_candidate_universe_v6(v_cutoff,v_after,least(500,p_limit-v_count)) LOOP
      symbol:=v_row.symbol; exchange:=v_row.exchange; v_after:=v_row.symbol;
      v_count:=v_count+1; v_page_count:=v_page_count+1; RETURN NEXT;
    END LOOP;
    EXIT WHEN v_page_count=0 OR v_count>=p_limit;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.taiwan_data_refresh_scopes_v6 (
  session_date date NOT NULL,
  refresh_phase text NOT NULL CHECK(refresh_phase IN ('preliminary','final')),
  expected_queue_keys text[] NOT NULL CHECK(cardinality(expected_queue_keys)<=20000),
  cutoff_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(session_date,refresh_phase)
);
ALTER TABLE public.taiwan_data_refresh_scopes_v6 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.taiwan_data_refresh_scopes_v6 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.register_taiwan_data_refresh_scope_v6(
  p_session_date date,p_phase text,p_queue_keys text[],p_cutoff timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_keys text[]; v_cutoff timestamptz; v_publication_cutoff timestamptz;
BEGIN
  IF p_session_date IS NULL OR p_phase IS NULL OR p_phase NOT IN ('preliminary','final') OR p_cutoff IS NULL
    OR p_cutoff>clock_timestamp()+interval '5 minutes' OR p_queue_keys IS NULL OR cardinality(p_queue_keys)>20000
    OR EXISTS(SELECT 1 FROM unnest(p_queue_keys) item WHERE item IS NULL OR item!~'^[0-9a-f]{64}$')
  THEN RAISE EXCEPTION 'invalid_taiwan_refresh_scope'; END IF;
  INSERT INTO public.taiwan_data_refresh_scopes_v6(session_date,refresh_phase,expected_queue_keys,cutoff_at)
    VALUES(p_session_date,p_phase,'{}',p_cutoff) ON CONFLICT(session_date,refresh_phase) DO NOTHING;
  SELECT scope.expected_queue_keys,scope.cutoff_at INTO v_keys,v_cutoff
    FROM public.taiwan_data_refresh_scopes_v6 scope
    WHERE scope.session_date=p_session_date AND scope.refresh_phase=p_phase FOR UPDATE;
  SELECT ARRAY(SELECT DISTINCT item FROM unnest(v_keys||p_queue_keys) item ORDER BY item) INTO v_keys;
  IF cardinality(v_keys)>20000 THEN RAISE EXCEPTION 'taiwan_refresh_scope_overflow'; END IF;
  UPDATE public.taiwan_data_refresh_scopes_v6 SET expected_queue_keys=v_keys,
    cutoff_at=greatest(v_cutoff,p_cutoff),updated_at=clock_timestamp()
    WHERE session_date=p_session_date AND refresh_phase=p_phase;
  -- A growing scope immediately invalidates an earlier 100% publication, even
  -- if enqueueing stops before another worker records a completed batch.
  SELECT metadata.data_cutoff_at INTO v_publication_cutoff FROM public.taiwan_data_publication_metadata_v5 metadata
    WHERE metadata.session_date=p_session_date AND metadata.publication_phase=p_phase;
  IF FOUND THEN PERFORM public.record_taiwan_data_publication_metadata_v5(
    p_session_date,p_phase,greatest(v_publication_cutoff,p_cutoff),'{}'::jsonb); END IF;
  RETURN jsonb_build_object('expected',cardinality(v_keys),'cutoffAt',greatest(v_cutoff,p_cutoff));
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_taiwan_data_refresh_batch_v6(
  p_entries jsonb,p_phase text,p_session_date date,p_queued_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_keys text[]; v_entry jsonb; v_ids jsonb:='[]'; v_id uuid;
BEGIN
  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' OR jsonb_array_length(p_entries) NOT BETWEEN 1 AND 100
    OR p_phase IS NULL OR p_phase NOT IN ('preliminary','final') OR p_session_date IS NULL OR p_queued_at IS NULL
  THEN RAISE EXCEPTION 'invalid_taiwan_refresh_batch'; END IF;
  SELECT scope.expected_queue_keys INTO v_keys FROM public.taiwan_data_refresh_scopes_v6 scope
    WHERE scope.session_date=p_session_date AND scope.refresh_phase=p_phase FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'taiwan_refresh_scope_required'; END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' OR v_entry->>'queueKey' IS NULL
      OR NOT (v_entry->>'queueKey'=ANY(v_keys)) OR v_entry->>'dataset' IS NULL OR v_entry->>'exchange' IS NULL
    THEN RAISE EXCEPTION 'taiwan_refresh_batch_scope_mismatch'; END IF;
    v_id:=public.enqueue_taiwan_data_refresh_v5(v_entry->>'queueKey',v_entry->>'dataset',v_entry->>'symbol',
      v_entry->>'exchange',p_phase,p_session_date,p_queued_at);
    -- Check the row that won the unique key, including a concurrent enqueue.
    PERFORM 1 FROM public.taiwan_data_refresh_queue_v5 queue WHERE queue.job_id=v_id
      AND queue.requested_session_date=p_session_date AND queue.refresh_phase=p_phase
      AND queue.dataset IS NOT DISTINCT FROM v_entry->>'dataset' AND queue.symbol IS NOT DISTINCT FROM v_entry->>'symbol'
      AND queue.exchange IS NOT DISTINCT FROM v_entry->>'exchange' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'taiwan_refresh_batch_identity_mismatch'; END IF;
    v_ids:=v_ids||jsonb_build_array(v_id);
  END LOOP;
  RETURN jsonb_build_object('queued',jsonb_array_length(v_ids),'jobIds',v_ids);
END $$;

CREATE OR REPLACE FUNCTION public.read_taiwan_data_refresh_progress_v6(p_session_date date,p_phase text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_keys text[]; v_cutoff timestamptz; v_source text; v_result jsonb;
BEGIN
  IF p_session_date IS NULL OR p_phase IS NULL OR p_phase NOT IN ('preliminary','final')
  THEN RAISE EXCEPTION 'invalid_taiwan_refresh_progress'; END IF;
  SELECT scope.expected_queue_keys,scope.cutoff_at INTO v_keys,v_cutoff FROM public.taiwan_data_refresh_scopes_v6 scope
    WHERE scope.session_date=p_session_date AND scope.refresh_phase=p_phase;
  v_source:=CASE WHEN FOUND THEN 'registered_scope' ELSE 'phase_queue' END;
  IF v_keys IS NULL THEN
    SELECT COALESCE(array_agg(queue.queue_key),'{}') INTO v_keys FROM public.taiwan_data_refresh_queue_v5 queue
      WHERE queue.requested_session_date=p_session_date AND queue.refresh_phase=p_phase;
  END IF;
  WITH expected AS (SELECT DISTINCT unnest(v_keys) AS queue_key), states AS (
    SELECT queue.job_id,queue.status,queue.terminal_status,queue.next_attempt_at,
      EXISTS(SELECT 1 FROM public.taiwan_data_canonical_results_v5 canonical WHERE canonical.job_id=queue.job_id) AS persisted
    FROM expected LEFT JOIN public.taiwan_data_refresh_queue_v5 queue ON queue.queue_key=expected.queue_key
      AND queue.requested_session_date=p_session_date AND queue.refresh_phase=p_phase
  ), counts AS (
    SELECT count(*) AS expected,
      count(*) FILTER(WHERE status='terminal' AND terminal_status='complete' AND persisted) AS completed,
      count(*) FILTER(WHERE status='terminal' AND (terminal_status IS DISTINCT FROM 'complete' OR NOT persisted)) AS failed,
      count(*) FILTER(WHERE status='queued') AS queued,count(*) FILTER(WHERE status='running') AS running,
      count(*) FILTER(WHERE job_id IS NULL) AS missing,
      count(*) FILTER(WHERE status='queued' AND next_attempt_at>statement_timestamp()) AS retrying FROM states
  ) SELECT to_jsonb(counts)||jsonb_build_object('ready',expected>0 AND completed=expected,
    'scopeSource',v_source,'cutoffAt',v_cutoff) INTO v_result FROM counts;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.record_taiwan_data_publication_metadata_v5(
  p_session_date date,p_publication_phase text,p_data_cutoff_at timestamptz,p_dataset_completeness jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_merged jsonb; v_progress jsonb; v_total integer; v_complete integer; v_pct numeric; v_cutoff timestamptz;
BEGIN
  IF p_session_date IS NULL OR p_publication_phase IS NULL OR p_publication_phase NOT IN ('preliminary','final')
    OR jsonb_typeof(p_dataset_completeness) IS DISTINCT FROM 'object' OR p_data_cutoff_at IS NULL
    OR p_data_cutoff_at>clock_timestamp()+interval '5 minutes'
  THEN RAISE EXCEPTION 'invalid_taiwan_publication_metadata'; END IF;
  -- Match registration's lock so scope growth cannot race publication's count.
  PERFORM 1 FROM public.taiwan_data_refresh_scopes_v6 scope
    WHERE scope.session_date=p_session_date AND scope.refresh_phase=p_publication_phase FOR SHARE;
  INSERT INTO public.taiwan_data_publication_metadata_v5(session_date,publication_phase,data_cutoff_at,
    dataset_completeness,dataset_completeness_pct,shadow_eligible)
    VALUES(p_session_date,p_publication_phase,p_data_cutoff_at,'{}',0,false)
    ON CONFLICT(session_date,publication_phase) DO NOTHING;
  SELECT metadata.dataset_completeness||p_dataset_completeness,greatest(metadata.data_cutoff_at,p_data_cutoff_at)
    INTO v_merged,v_cutoff FROM public.taiwan_data_publication_metadata_v5 metadata
    WHERE metadata.session_date=p_session_date AND metadata.publication_phase=p_publication_phase FOR UPDATE;
  v_progress:=public.read_taiwan_data_refresh_progress_v6(p_session_date,p_publication_phase);
  v_total:=(v_progress->>'expected')::integer; v_complete:=(v_progress->>'completed')::integer;
  -- Never round an incomplete scope up to 100 (the scope can contain 20,000 keys).
  v_pct:=CASE WHEN v_total=0 THEN 0 WHEN v_complete=v_total THEN 100 ELSE least(99.99,round(100.0*v_complete/v_total,2)) END;
  v_merged:=v_merged||jsonb_build_object('_refresh_scope_v6',v_progress);
  UPDATE public.taiwan_data_publication_metadata_v5 SET data_cutoff_at=v_cutoff,dataset_completeness=v_merged,
    dataset_completeness_pct=v_pct,shadow_eligible=false,recorded_at=clock_timestamp()
    WHERE session_date=p_session_date AND publication_phase=p_publication_phase;
  RETURN jsonb_build_object('publicationPhase',p_publication_phase,'dataCutoffAt',v_cutoff,
    'datasetCompletenessPct',v_pct,'shadowEligible',false,'refreshProgress',v_progress);
END $$;

CREATE OR REPLACE FUNCTION public.claim_taiwan_data_refresh_jobs_v6(
  p_limit integer,p_owner text,p_claimed_at timestamptz,p_lease_expires_at timestamptz,
  p_session_date date DEFAULT NULL,p_phase text DEFAULT NULL
) RETURNS TABLE(job_id uuid,dataset text,symbol text,exchange text,refresh_phase text,requested_session_date date,attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR length(COALESCE(p_owner,'')) NOT BETWEEN 16 AND 200
    OR p_claimed_at IS NULL OR p_lease_expires_at IS NULL OR p_lease_expires_at<=p_claimed_at
    OR p_lease_expires_at>p_claimed_at+interval '30 minutes' OR p_claimed_at>clock_timestamp()+interval '5 minutes'
    OR (p_phase IS NOT NULL AND p_phase NOT IN ('preliminary','final'))
  THEN RAISE EXCEPTION 'invalid_taiwan_data_claim'; END IF;
  RETURN QUERY WITH picked AS (
    SELECT queue.job_id FROM public.taiwan_data_refresh_queue_v5 queue
    WHERE queue.attempts<20 AND (p_session_date IS NULL OR queue.requested_session_date=p_session_date)
      AND (p_phase IS NULL OR queue.refresh_phase=p_phase)
      AND ((queue.status='queued' AND COALESCE(queue.next_attempt_at,queue.queued_at)<=p_claimed_at)
        OR (queue.status='running' AND queue.lease_expires_at<p_claimed_at))
    ORDER BY queue.requested_session_date DESC,queue.attempts,queue.queued_at,queue.job_id
    FOR UPDATE OF queue SKIP LOCKED LIMIT p_limit
  ) UPDATE public.taiwan_data_refresh_queue_v5 claimed SET status='running',attempts=claimed.attempts+1,
    lease_owner=p_owner,lease_expires_at=p_lease_expires_at,updated_at=p_claimed_at
    FROM picked WHERE claimed.job_id=picked.job_id
    RETURNING claimed.job_id,claimed.dataset,claimed.symbol,claimed.exchange,claimed.refresh_phase,claimed.requested_session_date,claimed.attempts;
END $$;

CREATE OR REPLACE FUNCTION public.claim_taiwan_data_refresh_jobs_v5(
  p_limit integer,p_owner text,p_claimed_at timestamptz,p_lease_expires_at timestamptz
) RETURNS TABLE(job_id uuid,dataset text,symbol text,exchange text,refresh_phase text,requested_session_date date,attempts integer)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT * FROM public.claim_taiwan_data_refresh_jobs_v6(p_limit,p_owner,p_claimed_at,p_lease_expires_at,NULL,NULL);
$$;

REVOKE ALL ON FUNCTION public.read_taiwan_data_candidate_universe_v6(timestamptz,text,integer),
  public.read_taiwan_data_candidate_universe_v5(integer),
  public.register_taiwan_data_refresh_scope_v6(date,text,text[],timestamptz),
  public.enqueue_taiwan_data_refresh_batch_v6(jsonb,text,date,timestamptz),
  public.read_taiwan_data_refresh_progress_v6(date,text),
  public.record_taiwan_data_publication_metadata_v5(date,text,timestamptz,jsonb),
  public.claim_taiwan_data_refresh_jobs_v6(integer,text,timestamptz,timestamptz,date,text),
  public.claim_taiwan_data_refresh_jobs_v5(integer,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_taiwan_data_candidate_universe_v6(timestamptz,text,integer),
  public.read_taiwan_data_candidate_universe_v5(integer),
  public.register_taiwan_data_refresh_scope_v6(date,text,text[],timestamptz),
  public.enqueue_taiwan_data_refresh_batch_v6(jsonb,text,date,timestamptz),
  public.read_taiwan_data_refresh_progress_v6(date,text),
  public.record_taiwan_data_publication_metadata_v5(date,text,timestamptz,jsonb),
  public.claim_taiwan_data_refresh_jobs_v6(integer,text,timestamptz,timestamptz,date,text),
  public.claim_taiwan_data_refresh_jobs_v5(integer,text,timestamptz,timestamptz) TO service_role;

COMMIT;
