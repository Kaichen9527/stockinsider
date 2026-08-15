-- StockInsider V3.16.9 production repair: separate evidence knowledge time
-- from database transaction time while applying one reviewed ingestion chunk.
-- A parent authority may be recorded after the immutable run cutoff, but it is
-- eligible only when its source and collection timestamps were already known at
-- the child evidence cutoff. Public point-in-time readers remain unchanged.

BEGIN;

GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;

CREATE OR REPLACE FUNCTION public.resolve_legacy_trading_session_dependency_v3_16_9_internal(
  p_session_id date,p_market public.tw_market_v3,p_knowledge_cutoff timestamptz,
  p_transaction_cutoff timestamptz
) RETURNS SETOF public.tw_trading_sessions_v3
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $resolver$
DECLARE v_head timestamptz;v_semantics integer;v_retained integer;
BEGIN
  IF p_session_id IS NULL OR p_knowledge_cutoff IS NULL OR p_transaction_cutoff IS NULL
    OR p_knowledge_cutoff>p_transaction_cutoff
  THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='invalid_dependency_cutoff';END IF;
  WITH bounded AS MATERIALIZED(SELECT authority.* FROM public.tw_trading_sessions_v3 authority
    WHERE authority.session_id=p_session_id AND authority.market=p_market
      AND authority.recorded_at<=p_transaction_cutoff
      AND authority.source_timestamp<=p_knowledge_cutoff
      AND authority.collected_at<=p_knowledge_cutoff
    ORDER BY authority.recorded_at DESC,authority.session_authority_id LIMIT 1025)
  SELECT count(*),max(recorded_at) INTO v_retained,v_head FROM bounded;
  IF v_retained>1024 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='bound_violation';END IF;
  IF v_head IS NULL THEN RETURN;END IF;
  SELECT count(DISTINCT jsonb_build_array(session_id,market,open_at,close_at,status,
    provider,source_timestamp,collected_at,source_ref)) INTO v_semantics
  FROM public.tw_trading_sessions_v3
  WHERE session_id=p_session_id AND market=p_market AND recorded_at=v_head
    AND source_timestamp<=p_knowledge_cutoff AND collected_at<=p_knowledge_cutoff;
  IF v_semantics<>1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='authority_revision_conflict';END IF;
  RETURN QUERY SELECT authority.* FROM public.tw_trading_sessions_v3 authority
  WHERE authority.session_id=p_session_id AND authority.market=p_market AND authority.recorded_at=v_head
    AND authority.source_timestamp<=p_knowledge_cutoff AND authority.collected_at<=p_knowledge_cutoff
  ORDER BY authority.session_authority_id LIMIT 1;
END $resolver$;

CREATE OR REPLACE FUNCTION public.append_exchange_reported_valuation_transaction_v3_16_9(
  p_input public.exchange_reported_valuation_input_v3_13,p_caller uuid
) RETURNS TABLE(reported_valuation_id uuid,recorded_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_now timestamptz:=clock_timestamp();v_id uuid;v_created boolean:=false;v_hash text;
  v_session_count integer;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal(p_caller,'opportunity_runner',v_now)
  THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='principal_role_unavailable';END IF;
  IF (p_input).stock_id IS NULL OR (p_input).close<=0 OR (p_input).close>='Infinity'::double precision
    OR ((p_input).reported_pe IS NULL AND (p_input).reported_pb IS NULL)
    OR ((p_input).reported_pe IS NOT NULL AND ((p_input).reported_pe<=0 OR (p_input).reported_pe>200))
    OR ((p_input).reported_pb IS NOT NULL AND ((p_input).reported_pb<=0 OR (p_input).reported_pb>100))
    OR NOT ((p_input).published_at<=(p_input).source_timestamp
      AND (p_input).source_timestamp<=(p_input).collected_at AND (p_input).collected_at<=v_now)
    OR char_length((p_input).source_ref) NOT BETWEEN 1 AND 120
    OR ((p_input).exchange='TWSE' AND (p_input).source_ref
      !~ '^(twse-openapi:BWIBBU_ALL|twse-rwd:BWIBBU_d):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}$')
    OR ((p_input).exchange='TPEX' AND (p_input).source_ref
      !~ '^(tpex-openapi:peratio|tpex-rwd:peratio):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}$')
  THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='invalid_exchange_reported_valuation';END IF;
  SELECT count(*) INTO v_session_count
  FROM public.resolve_legacy_trading_session_dependency_v3_16_9_internal((p_input).session_date,
    (p_input).exchange::text::public.tw_market_v3,(p_input).collected_at,v_now) session
  WHERE session.status='completed' AND session.close_at<=(p_input).collected_at;
  IF v_session_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='calendar_dependency_unavailable',
      CONSTRAINT='calendar_dependency_unavailable';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('exchange_reported_valuation',
    (p_input).stock_id,(p_input).exchange,(p_input).session_date)::text,0));
  SELECT reported_pe_id INTO v_id FROM public.opportunity_exchange_reported_pe_v3 row
  WHERE row.stock_id=(p_input).stock_id AND row.exchange=(p_input).exchange
    AND row.session_date=(p_input).session_date AND row.close=(p_input).close
    AND row.reported_pe IS NOT DISTINCT FROM (p_input).reported_pe
    AND row.reported_pb IS NOT DISTINCT FROM (p_input).reported_pb
    AND row.published_at=(p_input).published_at AND row.source_timestamp=(p_input).source_timestamp
    AND row.collected_at=(p_input).collected_at AND row.source_ref=(p_input).source_ref
  ORDER BY row.recorded_at,row.reported_pe_id LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.opportunity_exchange_reported_pe_v3(stock_id,exchange,session_date,close,
      reported_pe,reported_pb,published_at,source_timestamp,collected_at,source_ref,recorded_at)
    VALUES((p_input).stock_id,(p_input).exchange,(p_input).session_date,(p_input).close,
      (p_input).reported_pe,(p_input).reported_pb,(p_input).published_at,(p_input).source_timestamp,
      (p_input).collected_at,(p_input).source_ref,v_now) RETURNING reported_pe_id INTO v_id;
    v_created:=true;
  END IF;
  v_hash:=encode(extensions.digest(convert_to(regexp_replace(jsonb_build_array(
    (p_input).stock_id,(p_input).exchange,(p_input).session_date,(p_input).close,(p_input).reported_pe,
    (p_input).reported_pb,(p_input).published_at,(p_input).source_timestamp,(p_input).collected_at,
    (p_input).source_ref)::text,', ', ',', 'g'),'utf8'),'sha256'),'hex');
  INSERT INTO public.opportunity_rpc_audit_v3(function_name,caller_principal_id,subject_kind,subject_id,
    input_hash,disposition,recorded_at)
  VALUES('append_price_authority_v3',p_caller,'exchange_reported_pe',v_id,v_hash,
    (CASE WHEN v_created THEN 'appended' ELSE 'idempotent' END)::public.opportunity_rpc_audit_disposition_v3,v_now);
  RETURN QUERY SELECT v_id,v_now;
END $function$;

CREATE OR REPLACE FUNCTION public.apply_legacy_official_ingestion_chunk_base_v3_15(
  p_run_id uuid,p_job_id uuid,p_owner_token uuid,p_kind text,p_ordinal integer,p_items jsonb,p_chunk_hash text,
  p_producer_sha text,p_source_cutoff timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $ingest$
DECLARE v_item jsonb;v_now timestamptz:=clock_timestamp();v_stock uuid;
  v_exchange public.stock_exchange_v3;v_session date;v_session_authority uuid;
  v_feed_evidence public.corporate_action_feed_evidence_input_v3[];
  v_action_events public.corporate_action_event_input_v3[];v_close double precision;v_expected_hash text;
BEGIN
  IF p_kind NOT IN('trading_sessions','financial_facts','price_observations',
      'corporate_action_snapshots','reported_valuations','terminal') OR p_ordinal<0
    OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>200 OR p_chunk_hash!~'^[0-9a-f]{64}$'
    OR p_producer_sha!~'^[0-9a-f]{40}$' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';END IF;
  IF p_kind<>'terminal' THEN
    v_expected_hash:=encode(extensions.digest(convert_to(public.legacy_canonical_json_v3_13(jsonb_build_array(
      'official-ingestion-chunk-v3.14',p_kind,p_ordinal,p_items)),'utf8'),'sha256'),'hex');
    IF v_expected_hash<>p_chunk_hash THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_chunk_hash';END IF;
  ELSE
    v_expected_hash:=encode(extensions.digest(convert_to(public.legacy_canonical_json_v3_13(jsonb_build_array(
      'official-ingestion-terminal-v3.14',p_items#>>'{0,sourceCutoff}',p_items#>'{0,counts}',p_items#>'{0,chunks}')),'utf8'),'sha256'),'hex');
    IF v_expected_hash<>p_chunk_hash THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_terminal_hash';END IF;
  END IF;
  IF p_kind='trading_sessions' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) item(value) LOOP
      IF coalesce(v_item->>'market','') NOT IN('TWSE','TPEX') OR coalesce(v_item->>'status','') NOT IN('completed','holiday','scheduled')
        OR coalesce(v_item->>'provider','')<>lower(v_item->>'market')
        OR coalesce(v_item->>'sourceRef','') NOT LIKE lower(v_item->>'market')||'-annual-calendar:%'
        OR (v_item->>'sourceTimestamp')::timestamptz>(v_item->>'collectedAt')::timestamptz
        OR (v_item->>'collectedAt')::timestamptz>v_now THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      IF v_item->>'status'='scheduled' THEN CONTINUE;END IF;
      PERFORM public.append_trading_session_v3(ROW((v_item->>'session')::date,
        (v_item->>'market')::public.tw_market_v3,(v_item->>'openAt')::timestamptz,
        (v_item->>'scheduledCloseAt')::timestamptz,
        CASE WHEN v_item->>'status'='completed' THEN 'completed'::public.trading_session_status_v3
          ELSE 'cancelled'::public.trading_session_status_v3 END,
        (v_item->>'provider')::public.official_roster_provider_v3,(v_item->>'sourceTimestamp')::timestamptz,
        (v_item->>'collectedAt')::timestamptz,v_item->>'sourceRef')::public.trading_session_input_v3,
        'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'::uuid);
    END LOOP;
  ELSIF p_kind='financial_facts' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) item(value) LOOP
      IF (v_item->>'symbol')!~'^[0-9]{4}$' OR coalesce(v_item->>'provider','') NOT IN('twse','tpex')
        OR NOT(coalesce(v_item->>'sourceRef','') LIKE (v_item->>'provider')||'-openapi:%'
          OR coalesce(v_item->>'sourceRef','') LIKE (v_item->>'provider')||'-mops-inline:%')
        OR (v_item->>'filingPublishedAt')::timestamptz>(v_item->>'sourceTimestamp')::timestamptz
        OR (v_item->>'sourceTimestamp')::timestamptz>(v_item->>'collectedAt')::timestamptz
        OR (v_item->>'collectedAt')::timestamptz>v_now THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      SELECT selected.stock_id INTO v_stock FROM public.resolve_legacy_instrument_symbol_authority_v3_13(
        v_item->>'symbol',(v_item->>'collectedAt')::timestamptz) selected
      WHERE selected.instrument_type='common_stock' AND selected.listing_status='active'
        AND selected.provider::text=v_item->>'provider' AND(selected.valid_to IS NULL OR (v_item->>'collectedAt')::timestamptz<selected.valid_to);
      IF v_stock IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='instrument_dependency_unavailable',
        CONSTRAINT='instrument_dependency_unavailable';END IF;
      PERFORM public.append_financial_fact_v3(ROW(v_stock,(v_item->>'factKey')::public.financial_fact_key_v3,
        NULLIF(v_item->>'periodStart','')::date,(v_item->>'periodEnd')::date,
        (v_item->>'durationKind')::public.financial_duration_kind_v3,(v_item->>'value')::double precision,
        (v_item->>'unit')::public.financial_unit_v3,(v_item->>'provider')::public.financial_provider_v3,
        (v_item->>'authorityTier')::public.financial_authority_tier_v3,(v_item->>'estimateKind')::public.financial_estimate_kind_v3,
        (v_item->>'estimateHorizon')::public.financial_estimate_horizon_v3,(v_item->>'filingPublishedAt')::timestamptz,
        (v_item->>'sourceTimestamp')::timestamptz,(v_item->>'collectedAt')::timestamptz,NULL,
        v_item->>'sourceRef')::public.financial_fact_input_v3,'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'::uuid);
    END LOOP;
  ELSIF p_kind='price_observations' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) item(value) LOOP
      IF (v_item->>'symbol')!~'^[0-9]{4}$' OR coalesce(v_item->>'exchange','') NOT IN('TWSE','TPEX')
        OR coalesce(v_item->>'provider','')<>lower(v_item->>'exchange')
        OR coalesce(v_item->>'sourceRef','')<>lower(v_item->>'exchange')||'-rwd:'||
          (CASE WHEN v_item->>'exchange'='TWSE' THEN 'STOCK_DAY:' ELSE 'tradingStock:' END)||
          (v_item->>'session')||':'||(v_item->>'symbol')
        OR (v_item->>'sourceTimestamp')::timestamptz>(v_item->>'collectedAt')::timestamptz
        OR (v_item->>'collectedAt')::timestamptz>v_now THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      v_exchange:=(v_item->>'exchange')::public.stock_exchange_v3;v_session:=(v_item->>'session')::date;
      SELECT selected.stock_id INTO v_stock FROM public.resolve_legacy_instrument_symbol_authority_v3_13(
        v_item->>'symbol',(v_item->>'collectedAt')::timestamptz) selected
      WHERE selected.exchange=v_exchange AND selected.instrument_type='common_stock' AND selected.listing_status='active'
        AND(selected.valid_to IS NULL OR (v_item->>'collectedAt')::timestamptz<selected.valid_to);
      SELECT selected.session_authority_id INTO v_session_authority
      FROM public.resolve_legacy_trading_session_dependency_v3_16_9_internal(v_session,
        v_exchange::text::public.tw_market_v3,(v_item->>'collectedAt')::timestamptz,v_now) selected
      WHERE selected.status='completed' AND selected.close_at<=(v_item->>'collectedAt')::timestamptz;
      IF v_stock IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='instrument_dependency_unavailable',
        CONSTRAINT='instrument_dependency_unavailable';END IF;
      IF v_session_authority IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='calendar_dependency_unavailable',
        CONSTRAINT='calendar_dependency_unavailable';END IF;
      PERFORM public.append_price_authority_v3(ROW('raw_price',ROW(v_stock,v_exchange,v_session,v_session_authority,
        (v_item->>'open')::double precision,(v_item->>'high')::double precision,(v_item->>'low')::double precision,
        (v_item->>'close')::double precision,(v_item->>'volume')::double precision,(v_item->>'turnoverTwd')::double precision,
        (v_item->>'provider')::public.price_provider_v3,(v_item->>'sourceTimestamp')::timestamptz,
        (v_item->>'collectedAt')::timestamptz,v_item->>'sourceRef')::public.price_observation_input_v3,NULL,NULL)
        ::public.price_authority_input_v3,'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'::uuid);
    END LOOP;
  ELSIF p_kind='corporate_action_snapshots' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) item(value) LOOP
      IF coalesce(v_item->>'exchange','') NOT IN('TWSE','TPEX') OR (v_item->>'corporateActionVersion')<>'tw-corporate-action-v3.1'
        OR jsonb_array_length(coalesce(v_item->'feedEvidence','[]'::jsonb))<>3
        OR jsonb_array_length(coalesce(v_item->'events','[]'::jsonb))<>coalesce((v_item->>'declaredEventCount')::integer,-1)
        OR (v_item->>'collectedAt')::timestamptz>v_now THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      v_exchange:=(v_item->>'exchange')::public.stock_exchange_v3;v_session:=(v_item->>'session')::date;
      SELECT selected.session_authority_id INTO v_session_authority
      FROM public.resolve_legacy_trading_session_dependency_v3_16_9_internal(v_session,
        v_exchange::text::public.tw_market_v3,(v_item->>'collectedAt')::timestamptz,v_now) selected
      WHERE selected.status='completed' AND selected.close_at<=(v_item->>'collectedAt')::timestamptz;
      IF v_session_authority IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='calendar_dependency_unavailable',
        CONSTRAINT='calendar_dependency_unavailable';END IF;
      SELECT coalesce(array_agg(ROW(value->>'feedIdentity',(value->>'responseByteCount')::integer,
        value->>'responseSha256',(value->>'parsedRowCount')::integer)::public.corporate_action_feed_evidence_input_v3
        ORDER BY ordinality),ARRAY[]::public.corporate_action_feed_evidence_input_v3[]) INTO v_feed_evidence
      FROM jsonb_array_elements(v_item->'feedEvidence') WITH ORDINALITY feed(value,ordinality);
      SELECT coalesce(array_agg(ROW(value->>'symbol',(value->>'eventKind')::public.corporate_action_kind_v3,
        (value->>'preActionReferencePrice')::double precision,(value->>'postActionReferencePrice')::double precision,
        value->>'feedIdentity',value->>'sourceRowRef')::public.corporate_action_event_input_v3 ORDER BY value->>'symbol'),
        ARRAY[]::public.corporate_action_event_input_v3[]) INTO v_action_events FROM jsonb_array_elements(v_item->'events') event(value);
      PERFORM public.append_price_authority_v3(ROW('corporate_action_snapshot',NULL,
        ROW(v_exchange,v_session,v_session_authority,'tw-corporate-action-v3.1',(v_item->>'provider')::public.official_roster_provider_v3,
          (v_item->>'collectedAt')::timestamptz,v_feed_evidence,(v_item->>'declaredEventCount')::integer,v_action_events)
          ::public.corporate_action_snapshot_input_v3,NULL)::public.price_authority_input_v3,
        'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'::uuid);
    END LOOP;
  ELSIF p_kind='reported_valuations' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) item(value) LOOP
      IF (v_item->>'symbol')!~'^[0-9]{4}$' OR NOT (coalesce(v_item->>'sourceRef','') LIKE ANY(ARRAY['twse-openapi:%','tpex-openapi:%','twse-rwd:%','tpex-rwd:%']))
        OR (v_item->>'collectedAt')::timestamptz>v_now THEN RAISE EXCEPTION 'data_integrity_failure';END IF;
      v_exchange:=CASE WHEN(v_item->>'sourceRef') LIKE 'twse-%' THEN 'TWSE'::public.stock_exchange_v3 ELSE 'TPEX'::public.stock_exchange_v3 END;
      v_session:=(v_item->>'session')::date;
      SELECT selected.stock_id INTO v_stock FROM public.resolve_legacy_instrument_symbol_authority_v3_13(
        v_item->>'symbol',(v_item->>'collectedAt')::timestamptz) selected
      WHERE selected.exchange=v_exchange AND selected.instrument_type='common_stock' AND selected.listing_status='active';
      v_close:=CASE WHEN coalesce(v_item->>'close','')~'^[0-9]+([.][0-9]+)?$' THEN(v_item->>'close')::double precision ELSE NULL END;
      IF v_close IS NULL THEN SELECT raw_close INTO v_close FROM public.opportunity_price_observations_v3
        WHERE stock_id=v_stock AND exchange=v_exchange AND session_id=v_session
          AND source_timestamp<=(v_item->>'collectedAt')::timestamptz
          AND collected_at<=(v_item->>'collectedAt')::timestamptz AND recorded_at<=v_now
        ORDER BY source_timestamp DESC,collected_at DESC,recorded_at DESC,observation_id LIMIT 1;END IF;
      IF v_stock IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='instrument_dependency_unavailable',
        CONSTRAINT='instrument_dependency_unavailable';END IF;
      IF v_close IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='price_dependency_unavailable',
        CONSTRAINT='price_dependency_unavailable';END IF;
      IF NOT(coalesce(v_item->>'peRatio','')~'^[0-9]+([.][0-9]+)?$' AND(v_item->>'peRatio')::double precision>0)
        AND NOT(coalesce(v_item->>'pbRatio','')~'^[0-9]+([.][0-9]+)?$' AND(v_item->>'pbRatio')::double precision>0)
      THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='valuation_metric_unavailable',
        CONSTRAINT='valuation_metric_unavailable';END IF;
      PERFORM public.append_exchange_reported_valuation_transaction_v3_16_9(ROW(v_stock,v_exchange,v_session,v_close,
        CASE WHEN coalesce(v_item->>'peRatio','')~'^[0-9]+([.][0-9]+)?$' AND(v_item->>'peRatio')::double precision>0 THEN(v_item->>'peRatio')::double precision END,
        CASE WHEN coalesce(v_item->>'pbRatio','')~'^[0-9]+([.][0-9]+)?$' AND(v_item->>'pbRatio')::double precision>0 THEN(v_item->>'pbRatio')::double precision END,
        (v_session::text||' 06:30:00+00')::timestamptz,(v_session::text||' 06:30:00+00')::timestamptz,
        (v_item->>'collectedAt')::timestamptz,v_item->>'sourceRef')::public.exchange_reported_valuation_input_v3_13,
        'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'::uuid);
    END LOOP;
  ELSE
    IF jsonb_array_length(p_items)<>1 OR p_items#>>'{0,terminalRoot}'<>p_chunk_hash
      OR (p_items#>>'{0,sourceCutoff}')::timestamptz<>p_source_cutoff
    THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_terminal_invalid';END IF;
  END IF;
  RETURN true;
END $ingest$;

ALTER FUNCTION public.resolve_legacy_trading_session_dependency_v3_16_9_internal(
  date,public.tw_market_v3,timestamptz,timestamptz) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.append_exchange_reported_valuation_transaction_v3_16_9(
  public.exchange_reported_valuation_input_v3_13,uuid) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.apply_legacy_official_ingestion_chunk_base_v3_15(
  uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION
  public.resolve_legacy_trading_session_dependency_v3_16_9_internal(date,public.tw_market_v3,timestamptz,timestamptz),
  public.append_exchange_reported_valuation_transaction_v3_16_9(public.exchange_reported_valuation_input_v3_13,uuid),
  public.apply_legacy_official_ingestion_chunk_base_v3_15(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

COMMIT;
