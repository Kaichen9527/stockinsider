BEGIN;

-- V3.13 deliberately revokes CREATE after installation.  Re-open the narrow
-- ownership hand-off window for this additive migration and close it again
-- before commit.
GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;

CREATE TABLE IF NOT EXISTS public.legacy_runtime_failure_diagnostics_v3_14 (
  diagnostic_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.legacy_producer_jobs_v3_11(job_id) ON DELETE RESTRICT,
  stage text NOT NULL CHECK (stage IN ('source_sync','mention_claim_extraction','candidate_funnel','facts_refresh','analysis_revision','compact_radar_projection','worker_terminal')),
  job_kind text NOT NULL CHECK (job_kind IN ('source_root','revision_shard','stage_barrier','candidate_batch','analysis_batch','projection_batch','terminal')),
  failure_code text NOT NULL CHECK (failure_code IN ('provider_unavailable','data_integrity_failure','authentication_rejected')),
  failure_origin text NOT NULL CHECK (failure_origin IN ('handler','rpc_validation','persistence','provider','runtime')),
  invariant_code text NOT NULL CHECK (invariant_code IN ('candidate_seed_membership_missing','database_constraint_rejected','provider_timeout','authentication_rejected','data_integrity_failure')),
  sqlstate text CHECK (sqlstate IS NULL OR sqlstate IN ('22000','22023','23502','23503','23505','23514','40001','40P01','PT403','PT409')),
  constraint_name text CHECK (constraint_name IS NULL OR constraint_name ~ '^[a-z][a-z0-9_]{0,95}$'),
  item_ordinal integer CHECK (item_ordinal IS NULL OR item_ordinal >= 0),
  field_path text CHECK (field_path IS NULL OR field_path ~ '^[A-Za-z][A-Za-z0-9_.]{0,127}$'),
  input_hash text CHECK (input_hash IS NULL OR input_hash ~ '^[0-9a-f]{64}$'),
  producer_sha text NOT NULL CHECK (producer_sha ~ '^[0-9a-f]{40}$'),
  diagnostic_hash text NOT NULL CHECK (diagnostic_hash ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (run_id,job_id,diagnostic_hash)
);

ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14
  DROP CONSTRAINT IF EXISTS legacy_runtime_failure_diagnostics_v3_14_job_kind_check;
ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14
  ADD CONSTRAINT legacy_runtime_failure_diagnostics_v3_14_job_kind_check
  CHECK (job_kind IN ('source_root','revision_shard','stage_barrier','candidate_batch','analysis_batch','projection_batch','terminal'));
REVOKE ALL ON public.legacy_runtime_failure_diagnostics_v3_14 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.legacy_runtime_failure_diagnostics_v3_14 FROM service_role;

CREATE OR REPLACE FUNCTION public.append_legacy_runtime_failure_diagnostic_v3_14(
  p_run_id uuid,p_job_id uuid,p_owner_token uuid,p_stage text,p_job_kind text,p_failure_code text,p_failure_origin text,
  p_invariant_code text,p_sqlstate text,p_constraint_name text,p_item_ordinal integer,p_field_path text,
  p_input_hash text,p_producer_sha text,p_diagnostic_hash text
  ,p_recorded_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.legacy_producer_jobs_v3_11 job
    JOIN public.legacy_producer_runs_v3_11 run USING(run_id)
    WHERE job.job_id=p_job_id AND job.run_id=p_run_id AND job.status='leased' AND run.status='running'
      AND job.owner_token_hash=encode(extensions.digest(convert_to(p_owner_token::text,'utf8'),'sha256'),'hex')
      AND run.owner_token_hash=job.owner_token_hash AND job.lease_expires_at>=clock_timestamp()
      AND run.lease_expires_at>=clock_timestamp() AND job.stage::text=p_stage AND job.job_kind::text=p_job_kind)
  THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';END IF;
  INSERT INTO public.legacy_runtime_failure_diagnostics_v3_14(run_id,job_id,stage,job_kind,failure_code,
    failure_origin,invariant_code,sqlstate,constraint_name,item_ordinal,field_path,input_hash,producer_sha,diagnostic_hash,recorded_at)
  VALUES(p_run_id,p_job_id,p_stage,p_job_kind,p_failure_code,p_failure_origin,p_invariant_code,p_sqlstate,
    p_constraint_name,p_item_ordinal,p_field_path,p_input_hash,p_producer_sha,p_diagnostic_hash,p_recorded_at)
  ON CONFLICT(run_id,job_id,diagnostic_hash) DO NOTHING RETURNING diagnostic_id INTO v_id;
  IF v_id IS NULL THEN SELECT diagnostic_id INTO v_id FROM public.legacy_runtime_failure_diagnostics_v3_14
    WHERE run_id=p_run_id AND job_id=p_job_id AND diagnostic_hash=p_diagnostic_hash; END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.append_legacy_runtime_failure_diagnostic_v3_14(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,text,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_legacy_runtime_failure_diagnostic_v3_14(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,text,text,text,text,timestamptz) TO service_role;

CREATE TABLE IF NOT EXISTS public.legacy_official_ingestion_chunks_v3_14(
  run_id uuid NOT NULL REFERENCES public.legacy_producer_runs_v3_11(run_id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.legacy_producer_jobs_v3_11(job_id) ON DELETE RESTRICT,
  chunk_kind text NOT NULL CHECK(chunk_kind IN('trading_sessions','financial_facts','price_observations',
    'corporate_action_snapshots','reported_valuations','terminal')),
  chunk_ordinal integer NOT NULL CHECK(chunk_ordinal>=0),item_count integer NOT NULL CHECK(item_count>=0),
  chunk_hash text NOT NULL CHECK(chunk_hash~'^[0-9a-f]{64}$'),producer_sha text NOT NULL CHECK(producer_sha~'^[0-9a-f]{40}$'),
  source_cutoff timestamptz NOT NULL,items_json jsonb NOT NULL CHECK(jsonb_typeof(items_json)='array'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(job_id,chunk_kind,chunk_ordinal)
);
ALTER TABLE public.legacy_official_ingestion_chunks_v3_14 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_official_ingestion_chunks_v3_14 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.legacy_official_ingestion_chunks_v3_14 FROM service_role;

CREATE OR REPLACE FUNCTION public.apply_legacy_official_ingestion_chunk_v3_14(
  p_run_id uuid,p_job_id uuid,p_owner_token uuid,p_kind text,p_ordinal integer,p_items jsonb,p_chunk_hash text,
  p_producer_sha text,p_source_cutoff timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $ingest$
DECLARE v_item jsonb;v_now timestamptz:=clock_timestamp();v_stock uuid;
  v_exchange public.stock_exchange_v3;v_session date;v_session_authority uuid;v_feed_evidence public.corporate_action_feed_evidence_input_v3[];
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
      IF v_stock IS NULL THEN CONTINUE;END IF;
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
      FROM public.resolve_legacy_trading_session_authority_v3_13(v_session,v_exchange::text::public.tw_market_v3,
        (v_item->>'collectedAt')::timestamptz) selected WHERE selected.status='completed';
      IF v_stock IS NULL OR v_session_authority IS NULL THEN CONTINUE;END IF;
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
      FROM public.resolve_legacy_trading_session_authority_v3_13(v_session,v_exchange::text::public.tw_market_v3,
        (v_item->>'collectedAt')::timestamptz) selected WHERE selected.status='completed';
      IF v_session_authority IS NULL THEN CONTINUE;END IF;
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
        WHERE stock_id=v_stock AND exchange=v_exchange AND session_id=v_session ORDER BY recorded_at DESC LIMIT 1;END IF;
      IF v_stock IS NULL OR v_close IS NULL OR(NOT(coalesce(v_item->>'peRatio','')~'^[0-9]+([.][0-9]+)?$' AND(v_item->>'peRatio')::double precision>0)
        AND NOT(coalesce(v_item->>'pbRatio','')~'^[0-9]+([.][0-9]+)?$' AND(v_item->>'pbRatio')::double precision>0)) THEN CONTINUE;END IF;
      PERFORM public.append_exchange_reported_valuation_v3_13(ROW(v_stock,v_exchange,v_session,v_close,
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
REVOKE ALL ON FUNCTION public.apply_legacy_official_ingestion_chunk_v3_14(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.append_legacy_official_ingestion_chunk_v3_14(
  p_run_id uuid,p_job_id uuid,p_owner_token uuid,p_kind text,p_ordinal integer,p_items jsonb,p_chunk_hash text,
  p_producer_sha text,p_source_cutoff timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $stage$
DECLARE v_existing record;v_now timestamptz:=clock_timestamp();v_expected_hash text;
BEGIN
  IF p_kind NOT IN('trading_sessions','financial_facts','price_observations',
      'corporate_action_snapshots','reported_valuations','terminal') OR p_ordinal<0
    OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>200 OR p_chunk_hash!~'^[0-9a-f]{64}$'
    OR p_producer_sha!~'^[0-9a-f]{40}$' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='authentication_rejected';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.legacy_producer_jobs_v3_11 job
    JOIN public.legacy_producer_runs_v3_11 run USING(run_id)
    WHERE job.job_id=p_job_id AND job.run_id=p_run_id AND job.stage='facts_refresh' AND job.status='leased'
      AND run.status='running' AND run.producer_commit_sha=p_producer_sha AND run.source_cutoff=p_source_cutoff
      AND job.owner_token_hash=encode(extensions.digest(convert_to(p_owner_token::text,'utf8'),'sha256'),'hex')
      AND run.owner_token_hash=job.owner_token_hash AND job.lease_expires_at>=v_now AND run.lease_expires_at>=v_now)
  THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_lease_mismatch';END IF;
  IF p_kind<>'terminal' THEN
    v_expected_hash:=encode(extensions.digest(convert_to(public.legacy_canonical_json_v3_13(jsonb_build_array(
      'official-ingestion-chunk-v3.14',p_kind,p_ordinal,p_items)),'utf8'),'sha256'),'hex');
  ELSE
    v_expected_hash:=encode(extensions.digest(convert_to(public.legacy_canonical_json_v3_13(jsonb_build_array(
      'official-ingestion-terminal-v3.14',p_items#>>'{0,sourceCutoff}',p_items#>'{0,counts}',p_items#>'{0,chunks}')),'utf8'),'sha256'),'hex');
    IF jsonb_array_length(p_items)<>1 OR p_items#>>'{0,terminalRoot}'<>p_chunk_hash
      OR (p_items#>>'{0,sourceCutoff}')::timestamptz<>p_source_cutoff
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_items->0) key)
        <>ARRAY['chunks','counts','sourceCutoff','terminalRoot']::text[]
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_items#>'{0,counts}') key)
        <>ARRAY['corporate_action_snapshots','financial_facts','price_observations','reported_valuations','trading_sessions']::text[]
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_items#>'{0,chunks}','[]'::jsonb)) member(value)
        WHERE jsonb_typeof(value)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(value) key)
          <>ARRAY['chunkHash','itemCount','kind','ordinal']::text[])
    THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_terminal_invalid';END IF;
  END IF;
  IF v_expected_hash<>p_chunk_hash THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_chunk_hash';END IF;
  SELECT chunk_hash,item_count,items_json INTO v_existing FROM public.legacy_official_ingestion_chunks_v3_14
    WHERE job_id=p_job_id AND chunk_kind=p_kind AND chunk_ordinal=p_ordinal;
  IF FOUND THEN
    IF v_existing.chunk_hash<>p_chunk_hash OR v_existing.item_count<>jsonb_array_length(p_items)
      OR v_existing.items_json<>p_items THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_chunk_conflict';
    END IF;
    RETURN true;
  END IF;
  INSERT INTO public.legacy_official_ingestion_chunks_v3_14(run_id,job_id,chunk_kind,chunk_ordinal,item_count,
    chunk_hash,producer_sha,source_cutoff,items_json,recorded_at) VALUES(p_run_id,p_job_id,p_kind,p_ordinal,
    jsonb_array_length(p_items),p_chunk_hash,p_producer_sha,p_source_cutoff,p_items,v_now);
  RETURN true;
END $stage$;
REVOKE ALL ON FUNCTION public.append_legacy_official_ingestion_chunk_v3_14(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_legacy_official_ingestion_chunk_v3_14(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  TO service_role;

-- A database that already received V3.13 owns the current public completion
-- wrapper. Extend that exact wrapper in place so V3.14 facts-refresh results
-- retain every V3.13 decision/revision invariant. The guarded rewrite fails
-- closed if the installed predecessor is not the reviewed definition.
DO $extend_v313_completion$
DECLARE v_definition text;v_extended text;
BEGIN
  SELECT pg_get_functiondef('public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure)
    INTO v_definition;
  IF position('legacy-official-ingestion-v3.14' IN v_definition)=0 THEN
    v_extended:=replace(v_definition,
      $$p_json#>>'{officialIngestion,schema}' IS DISTINCT FROM 'legacy-official-ingestion-v3.13'$$,
      $$coalesce(p_json#>>'{officialIngestion,schema}','') NOT IN ('legacy-official-ingestion-v3.13','legacy-official-ingestion-v3.14')$$);
    v_extended:=replace(v_extended,
      $$p_json->'officialIngestion'->>'schema'='legacy-official-ingestion-v3.13'$$,
      $$p_json->'officialIngestion'->>'schema' IN ('legacy-official-ingestion-v3.13','legacy-official-ingestion-v3.14')$$);
    IF v_extended=v_definition OR position('legacy-official-ingestion-v3.14' IN v_extended)=0 THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v313_completion_upgrade_shape';
    END IF;
    EXECUTE v_extended;
  END IF;
END $extend_v313_completion$;

-- V3.14 keeps the append-only V3.13 revision tables as the compatibility read
-- plane, but expands their closed constraints and completion validator. This is
-- an in-place additive upgrade: existing V3.13 revisions remain valid while a
-- V3.14 revision must carry the matching V3.14 envelope and bundle kind.
DO $preserve_v313_envelope_validator$
BEGIN
  IF to_regprocedure('public.legacy_valid_decision_envelope_strict_v3_13(jsonb)') IS NULL THEN
    ALTER FUNCTION public.legacy_valid_decision_envelope_v3_13(jsonb)
      RENAME TO legacy_valid_decision_envelope_strict_v3_13;
  END IF;
END $preserve_v313_envelope_validator$;

CREATE OR REPLACE FUNCTION public.legacy_valid_decision_envelope_v3_14(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $envelope_v314$
DECLARE adapted jsonb;action text;threshold jsonb;unlock jsonb;summary jsonb;plan jsonb;
  actual_margin numeric;actual_reward_risk numeric;recomputed_margin numeric;recomputed_reward_risk numeric;
  required_margin numeric;required_reward_risk numeric;target_value numeric;entry_midpoint numeric;stop_value numeric;
  margin_passed boolean;reward_risk_passed boolean;
BEGIN
  IF jsonb_typeof(value)<>'object' OR value->>'version'<>'decision-envelope-v3.14.0'
    OR coalesce(value->>'decisionRevisionId','')!~'^decision-v3[.]14:[0-9a-f]{64}$'
    OR coalesce(value->>'userAction','') NOT IN ('buy','accumulate','research_starter','wait_value','wait_market',
      'wait_breakout','wait_reclaim','avoid_chase','avoid','unavailable')
  THEN RETURN false;END IF;
  action:=value->>'userAction';threshold:=value->'thresholdAuthority';unlock:=value->'nextUnlock';
  IF NOT (value ? 'thresholdAuthority') THEN RETURN false;END IF;
  IF action IN ('buy','accumulate','research_starter','wait_value','wait_market') THEN
    IF jsonb_typeof(threshold) IS DISTINCT FROM 'object' THEN RETURN false;END IF;
  ELSIF action='unavailable' THEN
    IF jsonb_typeof(threshold) IS DISTINCT FROM 'object'
      AND threshold IS DISTINCT FROM 'null'::jsonb THEN RETURN false;END IF;
  ELSIF threshold IS DISTINCT FROM 'null'::jsonb THEN RETURN false;END IF;
  IF jsonb_typeof(threshold)='object' THEN
    IF jsonb_typeof(threshold)<>'object'
      OR action NOT IN ('buy','accumulate','research_starter','wait_value','wait_market','unavailable')
      OR NOT (threshold ?& ARRAY['actualMarginPct','actualRewardRisk','evidenceRoot','marketRegime',
        'requiredMarginPct','requiredRewardRisk']::text[])
      OR (SELECT count(*) FROM jsonb_object_keys(threshold))<>6
      OR coalesce(threshold->>'marketRegime','') NOT IN ('risk_on','selective_or_defensive')
      OR jsonb_typeof(threshold->'requiredMarginPct') IS DISTINCT FROM 'number'
      OR (threshold->>'requiredMarginPct')::numeric NOT IN (15,20)
      OR jsonb_typeof(threshold->'requiredRewardRisk') IS DISTINCT FROM 'number'
      OR (threshold->>'requiredRewardRisk')::numeric NOT IN (2,2.5)
      OR jsonb_typeof(threshold->'actualMarginPct') IS DISTINCT FROM 'number'
      OR jsonb_typeof(threshold->'actualRewardRisk') IS DISTINCT FROM 'number'
      OR coalesce(threshold->>'evidenceRoot','')!~'^[0-9a-f]{64}$'
      OR (threshold->>'marketRegime'='risk_on'
        AND ((threshold->>'requiredMarginPct')::numeric IS DISTINCT FROM 15
          OR (threshold->>'requiredRewardRisk')::numeric IS DISTINCT FROM 2))
      OR (threshold->>'marketRegime'='selective_or_defensive'
        AND ((threshold->>'requiredMarginPct')::numeric IS DISTINCT FROM 20
          OR (threshold->>'requiredRewardRisk')::numeric IS DISTINCT FROM 2.5))
    THEN RETURN false;END IF;
  END IF;
  IF action='wait_value' THEN
    IF jsonb_typeof(unlock)<>'object' OR unlock->>'kind'<>'max_entry'
      OR jsonb_typeof(unlock->'price')<>'number' OR (unlock->>'price')::numeric<=0
      OR jsonb_typeof(unlock->'requiredMarginPct')<>'number'
      OR jsonb_typeof(unlock->'requiredRewardRisk')<>'number'
    THEN RETURN false;END IF;
  ELSIF unlock IS DISTINCT FROM 'null'::jsonb THEN RETURN false;END IF;
  IF action='wait_market' AND NOT (value->'blockers' ? 'market_regime_gate') THEN RETURN false;END IF;
  adapted:=jsonb_set(jsonb_set(value,'{version}',to_jsonb('decision-envelope-v3.13.0'::text)),
    '{decisionRevisionId}',to_jsonb('decision-v3.13:'||substring(value->>'decisionRevisionId' from 16)));
  IF action IN ('wait_value','wait_market') THEN
    adapted:=jsonb_set(adapted,'{userAction}',to_jsonb('unavailable'::text));
  END IF;
  IF NOT public.legacy_valid_decision_envelope_strict_v3_13(adapted) THEN RETURN false;END IF;
  IF jsonb_typeof(threshold)='object' THEN
    summary:=value->'valuationSummary';plan:=value->'entryPlan';
    IF jsonb_typeof(summary)<>'object' OR jsonb_typeof(plan)<>'object'
      OR jsonb_array_length(plan->'entryZone')<>2 THEN RETURN false;END IF;
    required_margin:=(threshold->>'requiredMarginPct')::numeric;
    required_reward_risk:=(threshold->>'requiredRewardRisk')::numeric;
    actual_margin:=(threshold->>'actualMarginPct')::numeric;
    actual_reward_risk:=(threshold->>'actualRewardRisk')::numeric;
    entry_midpoint:=((plan#>>'{entryZone,0}')::numeric+(plan#>>'{entryZone,1}')::numeric)/2;
    stop_value:=(plan->>'invalidation')::numeric;
    IF value->>'recommendationAuthority'='formal' THEN
      target_value:=(summary#>>'{thresholdAuthority,baseTargetRaw}')::numeric;
      recomputed_margin:=100*(target_value/(summary->>'currentPrice')::numeric-1);
    ELSIF value->>'recommendationAuthority'='conditional_research' THEN
      target_value:=(summary->>'currentPrice')::numeric
        /(summary#>>'{thresholdAuthority,currentMultiple}')::numeric
        *(summary#>>'{thresholdAuthority,referenceMultiple}')::numeric;
      recomputed_margin:=100*(1-(summary#>>'{thresholdAuthority,currentMultiple}')::numeric
        /(summary#>>'{thresholdAuthority,referenceMultiple}')::numeric);
    ELSE RETURN false;END IF;
    IF entry_midpoint<=stop_value THEN RETURN false;END IF;
    recomputed_reward_risk:=(target_value-entry_midpoint)/(entry_midpoint-stop_value);
    IF abs(actual_margin-recomputed_margin)>0.000000001*greatest(1,abs(actual_margin),abs(recomputed_margin))
      OR abs(actual_reward_risk-recomputed_reward_risk)>0.000000001
        *greatest(1,abs(actual_reward_risk),abs(recomputed_reward_risk)) THEN RETURN false;END IF;
    margin_passed:=actual_margin>=required_margin
      -0.000000000000003552713678800501*greatest(1,abs(actual_margin),abs(required_margin));
    reward_risk_passed:=actual_reward_risk>=required_reward_risk
      -0.000000000000003552713678800501*greatest(1,abs(actual_reward_risk),abs(required_reward_risk));
    IF action IN ('buy','accumulate','research_starter','wait_market')
      AND NOT (margin_passed AND reward_risk_passed) THEN RETURN false;END IF;
    IF action='wait_market' AND (jsonb_array_length(value->'blockers')<>1
      OR value#>>'{blockers,0}'<>'market_regime_gate') THEN RETURN false;END IF;
    IF action='wait_value' AND (margin_passed=reward_risk_passed OR jsonb_array_length(value->'blockers')<>1
      OR value#>>'{blockers,0}'<>'entry_price_above_required_value_gate'
      OR (unlock->>'requiredMarginPct')::numeric<>required_margin
      OR (unlock->>'requiredRewardRisk')::numeric<>required_reward_risk) THEN RETURN false;END IF;
    IF action='unavailable' AND margin_passed AND reward_risk_passed
      AND value->>'reason'<>'insufficient_cited_decision_brief' THEN RETURN false;END IF;
  END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $envelope_v314$;

CREATE OR REPLACE FUNCTION public.legacy_valid_decision_envelope_v3_13(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $dispatcher$
  SELECT CASE value->>'version'
    WHEN 'decision-envelope-v3.13.0' THEN public.legacy_valid_decision_envelope_strict_v3_13(value)
    WHEN 'decision-envelope-v3.14.0' THEN public.legacy_valid_decision_envelope_v3_14(value)
    ELSE false END
$dispatcher$;
ALTER FUNCTION public.legacy_valid_decision_envelope_v3_13(jsonb) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.legacy_valid_decision_envelope_v3_14(jsonb) OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.legacy_valid_decision_envelope_strict_v3_13(jsonb) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.legacy_valid_decision_envelope_v3_13(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.legacy_valid_decision_envelope_v3_14(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.legacy_valid_decision_envelope_strict_v3_13(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_valid_decision_envelope_v3_13(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.legacy_valid_decision_envelope_v3_14(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.legacy_valid_decision_envelope_strict_v3_13(jsonb) TO service_role;

DO $drop_revision_compatibility_checks$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT constraint_value.conrelid,constraint_value.conname
    FROM pg_constraint constraint_value
    WHERE constraint_value.conrelid IN (
      'public.legacy_decision_revisions_v3_13'::regclass,
      'public.legacy_decision_revision_evaluations_v3_13'::regclass)
      AND constraint_value.contype='c'
      AND (constraint_value.conname IN ('legacy_revision_id_v314_check','legacy_evaluation_schema_v314_check')
        OR pg_get_constraintdef(constraint_value.oid) LIKE '%decision-v3[.]13:%'
        OR pg_get_constraintdef(constraint_value.oid) LIKE '%legacy-radar-v3.13.0%')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',constraint_row.conrelid::regclass,constraint_row.conname);
  END LOOP;
END $drop_revision_compatibility_checks$;

ALTER TABLE public.legacy_decision_revisions_v3_13
  ADD CONSTRAINT legacy_revision_id_v314_check
  CHECK(decision_revision_id~'^decision-v3[.](13|14):[0-9a-f]{64}$');
ALTER TABLE public.legacy_decision_revision_evaluations_v3_13
  ADD CONSTRAINT legacy_evaluation_schema_v314_check
  CHECK(source_led_correctness->>'schema' IN ('legacy-radar-v3.13.0','legacy-radar-v3.14.0'));

DO $extend_v314_revision_completion$
DECLARE v_definition text;v_extended text;
BEGIN
  SELECT pg_get_functiondef('public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure)
    INTO v_definition;
  IF position('legacy_decision_revision_v3_14' IN v_definition)=0 THEN
    v_extended:=replace(v_definition,
      $$coalesce(v_item->>'decisionRevisionId','')!~'^decision-v3[.]13:[0-9a-f]{64}$'$$,
      $$coalesce(v_item->>'decisionRevisionId','')!~'^decision-v3[.](13|14):[0-9a-f]{64}$'$$);
    v_extended:=replace(v_extended,
      $$v_item#>>'{bundle,kind}'<>'legacy_decision_revision_v3_13'$$,
      $$coalesce(v_item#>>'{bundle,kind}','') NOT IN ('legacy_decision_revision_v3_13','legacy_decision_revision_v3_14')$$);
    v_extended:=replace(v_extended,
      $$coalesce(v_item#>>'{bundle,json,decisionEnvelope,version}','')<>'decision-envelope-v3.13.0'$$,
      $$coalesce(v_item#>>'{bundle,json,decisionEnvelope,version}','') NOT IN ('decision-envelope-v3.13.0','decision-envelope-v3.14.0')
        OR (v_item#>>'{bundle,json,decisionEnvelope,version}'='decision-envelope-v3.13.0'
          AND v_item#>>'{bundle,kind}'<>'legacy_decision_revision_v3_13')
        OR (v_item#>>'{bundle,json,decisionEnvelope,version}'='decision-envelope-v3.14.0'
          AND v_item#>>'{bundle,kind}'<>'legacy_decision_revision_v3_14')$$);
    v_extended:=replace(v_extended,
      $$NOT IN ('buy','accumulate','research_starter','wait_breakout','wait_reclaim','avoid_chase','avoid','unavailable')$$,
      $$NOT IN ('buy','accumulate','research_starter','wait_value','wait_market','wait_breakout','wait_reclaim','avoid_chase','avoid','unavailable')$$);
    v_extended:=replace(v_extended,
      $$('buy','accumulate','research_starter','wait_breakout','wait_reclaim','avoid_chase')$$,
      $$('buy','accumulate','research_starter','wait_value','wait_market','wait_breakout','wait_reclaim','avoid_chase')$$);
    v_extended:=replace(v_extended,
      $$OR v_item->>'decisionRevisionId'<>'decision-v3.13:'||(v_item#>>'{identityBundle,hash}')$$,
      $$OR v_item->>'decisionRevisionId'<>(
          'decision-v3.'||CASE WHEN v_item#>>'{bundle,json,decisionEnvelope,version}'='decision-envelope-v3.14.0'
            THEN '14' ELSE '13' END||':'||(v_item#>>'{identityBundle,hash}'))$$);
    IF v_extended=v_definition OR position('legacy_decision_revision_v3_14' IN v_extended)=0
      OR position($$THEN '14' ELSE '13' END$$ IN v_extended)=0
    THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v314_revision_completion_upgrade_shape';END IF;
    EXECUTE v_extended;
  END IF;
END $extend_v314_revision_completion$;

CREATE OR REPLACE FUNCTION public.complete_legacy_producer_job_v3_14(
  p_run_id uuid,p_job_id uuid,p_owner_token uuid,p_result bytea,p_json jsonb,p_hash text
) RETURNS TABLE(status text,next_job jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $complete$
DECLARE v_status text;v_next_job jsonb;v_terminal text;v_summary jsonb;v_chunk record;v_manifest_count integer;
BEGIN
  IF p_json->'officialIngestion'->>'schema'='legacy-official-ingestion-v3.14' THEN
    v_summary:=p_json->'officialIngestion';v_terminal:=v_summary->>'terminalRoot';
    IF coalesce(v_terminal,'')!~'^[0-9a-f]{64}$' OR NOT EXISTS(
      SELECT 1 FROM public.legacy_official_ingestion_chunks_v3_14 chunk
      WHERE chunk.job_id=p_job_id AND chunk.run_id=p_run_id AND chunk.chunk_kind='terminal'
        AND chunk.chunk_hash=v_terminal AND chunk.producer_sha=(SELECT producer_commit_sha FROM public.legacy_producer_runs_v3_11 WHERE run_id=p_run_id)
    ) OR (SELECT count(*) FROM public.legacy_official_ingestion_chunks_v3_14 chunk
      WHERE chunk.job_id=p_job_id AND chunk.chunk_kind<>'terminal')<>jsonb_array_length(coalesce(v_summary->'chunks','[]'::jsonb))
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v_summary->'chunks','[]'::jsonb)) member(value)
        WHERE NOT EXISTS(SELECT 1 FROM public.legacy_official_ingestion_chunks_v3_14 chunk
          WHERE chunk.job_id=p_job_id AND chunk.chunk_kind=value->>'kind'
            AND chunk.chunk_ordinal=(value->>'ordinal')::integer AND chunk.item_count=(value->>'itemCount')::integer
            AND chunk.chunk_hash=value->>'chunkHash'))
    THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_terminal_incomplete';END IF;
    SELECT count(DISTINCT jsonb_build_array(value->>'kind',value->>'ordinal',value->>'itemCount',value->>'chunkHash'))
      INTO v_manifest_count FROM jsonb_array_elements(coalesce(v_summary->'chunks','[]'::jsonb)) member(value);
    IF v_manifest_count<>jsonb_array_length(coalesce(v_summary->'chunks','[]'::jsonb))
      OR coalesce((v_summary#>>'{counts,trading_sessions}')::integer,0)>1200
      OR coalesce((v_summary#>>'{counts,financial_facts}')::integer,0)>3840
      OR coalesce((v_summary#>>'{counts,price_observations}')::integer,0)>5200
      OR coalesce((v_summary#>>'{counts,corporate_action_snapshots}')::integer,0)>260
      OR coalesce((v_summary#>>'{counts,reported_valuations}')::integer,0)>8000
      OR (SELECT coalesce(sum(chunk.item_count),0) FROM public.legacy_official_ingestion_chunks_v3_14 chunk
          WHERE chunk.job_id=p_job_id AND chunk.chunk_kind='trading_sessions')
          <>coalesce((v_summary#>>'{counts,trading_sessions}')::integer,-1)
      OR (SELECT coalesce(sum(chunk.item_count),0) FROM public.legacy_official_ingestion_chunks_v3_14 chunk
          WHERE chunk.job_id=p_job_id AND chunk.chunk_kind='financial_facts')
          <>coalesce((v_summary#>>'{counts,financial_facts}')::integer,-1)
      OR (SELECT coalesce(sum(chunk.item_count),0) FROM public.legacy_official_ingestion_chunks_v3_14 chunk
          WHERE chunk.job_id=p_job_id AND chunk.chunk_kind='price_observations')
          <>coalesce((v_summary#>>'{counts,price_observations}')::integer,-1)
      OR (SELECT coalesce(sum(chunk.item_count),0) FROM public.legacy_official_ingestion_chunks_v3_14 chunk
          WHERE chunk.job_id=p_job_id AND chunk.chunk_kind='corporate_action_snapshots')
          <>coalesce((v_summary#>>'{counts,corporate_action_snapshots}')::integer,-1)
      OR (SELECT coalesce(sum(chunk.item_count),0) FROM public.legacy_official_ingestion_chunks_v3_14 chunk
          WHERE chunk.job_id=p_job_id AND chunk.chunk_kind='reported_valuations')
          <>coalesce((v_summary#>>'{counts,reported_valuations}')::integer,-1)
    THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_conservation';END IF;
    IF EXISTS(SELECT 1 FROM(SELECT chunk_kind,chunk_ordinal,
        row_number() OVER(PARTITION BY chunk_kind ORDER BY chunk_ordinal)-1 expected_ordinal
      FROM public.legacy_official_ingestion_chunks_v3_14
      WHERE run_id=p_run_id AND job_id=p_job_id AND chunk_kind<>'terminal') ordered
      WHERE chunk_ordinal<>expected_ordinal)
    THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='official_ingestion_chunk_ordinal_gap';END IF;
  END IF;
  SELECT completed.status,completed.next_job INTO v_status,v_next_job FROM public.complete_legacy_producer_job_v3_11(
    p_run_id,p_job_id,p_owner_token,p_result,p_json,p_hash) completed;
  IF v_status IS NULL THEN RETURN;END IF;
  IF p_json->'officialIngestion'->>'schema'='legacy-official-ingestion-v3.14' THEN
    FOR v_chunk IN SELECT chunk_kind,chunk_ordinal,items_json,chunk_hash,producer_sha,source_cutoff
      FROM public.legacy_official_ingestion_chunks_v3_14
      WHERE run_id=p_run_id AND job_id=p_job_id AND chunk_kind<>'terminal'
      ORDER BY CASE chunk_kind WHEN 'trading_sessions' THEN 1 WHEN 'financial_facts' THEN 2
        WHEN 'price_observations' THEN 3 WHEN 'corporate_action_snapshots' THEN 4 ELSE 5 END,chunk_ordinal
    LOOP
      PERFORM public.apply_legacy_official_ingestion_chunk_v3_14(p_run_id,p_job_id,p_owner_token,
        v_chunk.chunk_kind,v_chunk.chunk_ordinal,v_chunk.items_json,v_chunk.chunk_hash,
        v_chunk.producer_sha,v_chunk.source_cutoff);
    END LOOP;
  END IF;
  status:=v_status;next_job:=v_next_job;RETURN NEXT;
END $complete$;
REVOKE ALL ON FUNCTION public.complete_legacy_producer_job_v3_14(uuid,uuid,uuid,bytea,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_legacy_producer_job_v3_14(uuid,uuid,uuid,bytea,jsonb,text) TO service_role;

DO $upgrade$
BEGIN
  IF to_regprocedure('public.read_legacy_candidate_fact_plane_decision_integrity_v3_13(timestamptz,jsonb)') IS NULL THEN
    ALTER FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
      RENAME TO read_legacy_candidate_fact_plane_decision_integrity_v3_13;
  END IF;
END $upgrade$;

CREATE OR REPLACE FUNCTION public.read_legacy_candidate_fact_plane_v3_11(
  p_source_cutoff timestamptz,p_candidate_result jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_base jsonb;v_prices jsonb;v_candidate_authority jsonb;v_peers jsonb;v_price_backfill jsonb;
BEGIN
  v_base:=public.read_legacy_candidate_fact_plane_decision_integrity_v3_13(p_source_cutoff,p_candidate_result);
  WITH requested AS MATERIALIZED(
    SELECT (value->>'stockId')::uuid stock_id,value->>'symbol' symbol,ordinality::integer ordinal
    FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
    WHERE coalesce((value->>'deepSelected')::boolean,false)
      AND coalesce(value->>'stockId','')~*'^[0-9a-f-]{36}$' AND (value->>'symbol')~'^[0-9]{4}$'
    ORDER BY ordinality LIMIT 30
  ), selected_prices AS MATERIALIZED(
    SELECT requested.ordinal,requested.symbol,price.observation_id,price.session_id,price.volume,
      max(price.session_id) OVER(PARTITION BY requested.stock_id) anchor_session
    FROM requested JOIN LATERAL(
      SELECT bounded.* FROM(
        SELECT DISTINCT ON(observation.session_id) observation.*
        FROM public.opportunity_price_observations_v3 observation
        WHERE observation.stock_id=requested.stock_id AND observation.recorded_at<=p_source_cutoff
          AND observation.source_timestamp<=p_source_cutoff AND observation.collected_at<=p_source_cutoff
        ORDER BY observation.session_id DESC,observation.source_timestamp DESC,observation.collected_at DESC,
          observation.recorded_at DESC,observation.source_ref,observation.observation_id LIMIT 130
      ) bounded ORDER BY bounded.session_id
    ) price ON true
  ), adjusted AS MATERIALIZED(
    SELECT selected_prices.*,evidence.payload
    FROM selected_prices LEFT JOIN LATERAL(SELECT public.opportunity_adjusted_price_evidence_v3_internal(
      selected_prices.observation_id,selected_prices.anchor_session,p_source_cutoff) payload) evidence ON true
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(symbol,session_id,
    (payload#>>'{evidence,11}')::double precision,(payload#>>'{evidence,12}')::double precision,
    (payload#>>'{evidence,13}')::double precision,(payload#>>'{evidence,14}')::double precision,
    volume,payload->>'ref',payload->'evidence') ORDER BY ordinal,session_id),'[]'::jsonb)
    INTO v_prices FROM adjusted WHERE payload IS NOT NULL;

  WITH requested AS MATERIALIZED(
    SELECT (value->>'stockId')::uuid stock_id,value->>'symbol' symbol,ordinality::integer ordinal
    FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
    WHERE coalesce((value->>'deepSelected')::boolean,false)
      AND coalesce(value->>'stockId','')~*'^[0-9a-f-]{36}$' AND (value->>'symbol')~'^[0-9]{4}$'
    ORDER BY ordinality LIMIT 30
  ), candidate_instrument AS MATERIALIZED(
    SELECT requested.ordinal,requested.stock_id,requested.symbol,instrument.exchange
    FROM requested JOIN LATERAL public.resolve_legacy_instrument_authority_v3_13_internal(
      requested.stock_id,p_source_cutoff) instrument ON true
    WHERE instrument.symbol=requested.symbol AND instrument.instrument_type='common_stock'
      AND instrument.listing_status='active'
      AND (instrument.valid_to IS NULL OR p_source_cutoff<instrument.valid_to)
  ), candidate_sector AS MATERIALIZED(
    SELECT instrument.ordinal,instrument.stock_id,instrument.symbol,instrument.exchange,
      sector.canonical_sector_key
    FROM candidate_instrument instrument
    JOIN LATERAL public.resolve_legacy_sector_authority_v3_13_internal(
      instrument.stock_id,instrument.exchange::text::public.tw_market_v3,p_source_cutoff) sector ON true
    WHERE sector.status='active' AND sector.canonical_sector_key<>'unknown'
      AND (sector.valid_to IS NULL OR p_source_cutoff<sector.valid_to)
  ), instrument_heads AS MATERIALIZED(
    SELECT * FROM(SELECT instrument.*,row_number() OVER(PARTITION BY instrument.stock_id
      ORDER BY instrument.recorded_at DESC,instrument.source_timestamp DESC,instrument.instrument_authority_id) precedence
      FROM public.stock_instruments_v3 instrument WHERE instrument.recorded_at<=p_source_cutoff
        AND instrument.source_timestamp<=p_source_cutoff AND instrument.valid_from<=p_source_cutoff
        AND (instrument.valid_to IS NULL OR p_source_cutoff<instrument.valid_to)) ranked
    WHERE precedence=1 AND instrument_type='common_stock' AND listing_status='active'
  ), sector_heads AS MATERIALIZED(
    SELECT * FROM(SELECT sector.*,row_number() OVER(PARTITION BY sector.stock_id,sector.market
      ORDER BY sector.recorded_at DESC,sector.source_timestamp DESC,sector.assignment_authority_id) precedence
      FROM public.stock_sector_assignments_v3 sector WHERE sector.recorded_at<=p_source_cutoff
        AND sector.source_timestamp<=p_source_cutoff AND sector.valid_from<=p_source_cutoff
        AND (sector.valid_to IS NULL OR p_source_cutoff<sector.valid_to)) ranked
    WHERE precedence=1 AND status='active' AND canonical_sector_key<>'unknown'
  ), universe AS MATERIALIZED(
    SELECT DISTINCT instrument.symbol,instrument.stock_id,instrument.exchange,sector.canonical_sector_key
    FROM instrument_heads instrument JOIN sector_heads sector ON sector.stock_id=instrument.stock_id
      AND sector.market::text=instrument.exchange::text
    JOIN candidate_sector requested ON requested.canonical_sector_key=sector.canonical_sector_key
      AND requested.exchange=instrument.exchange
    LEFT JOIN candidate_sector candidate ON candidate.stock_id=instrument.stock_id
    WHERE candidate.stock_id IS NULL
  ), ranked AS MATERIALIZED(
    SELECT universe.*,row_number() OVER(PARTITION BY exchange,canonical_sector_key
      ORDER BY symbol,stock_id) sector_rank FROM universe
  ), bounded AS(
    SELECT * FROM ranked ORDER BY CASE WHEN sector_rank<=8 THEN 0 ELSE 1 END,
      canonical_sector_key,exchange,sector_rank,symbol,stock_id LIMIT 240
  ) SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_array(symbol,stock_id,exchange,canonical_sector_key)
      ORDER BY ordinal,symbol,stock_id) FROM candidate_sector),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_array(symbol,stock_id,exchange,canonical_sector_key)
      ORDER BY CASE WHEN sector_rank<=8 THEN 0 ELSE 1 END,
        canonical_sector_key,exchange,sector_rank,symbol,stock_id) FROM bounded),'[]'::jsonb)
    INTO v_candidate_authority,v_peers;

  WITH requested AS MATERIALIZED(
    SELECT (value->>'stockId')::uuid stock_id,value->>'symbol' symbol,ordinality::integer ordinal
    FROM jsonb_array_elements(coalesce(p_candidate_result->'candidates','[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
    WHERE coalesce((value->>'deepSelected')::boolean,false)
      AND coalesce(value->>'stockId','')~*'^[0-9a-f-]{36}$' AND (value->>'symbol')~'^[0-9]{4}$'
    ORDER BY ordinality LIMIT 30
  ), resolved AS MATERIALIZED(
    SELECT requested.*,instrument.exchange::text exchange
    FROM requested JOIN LATERAL public.resolve_legacy_instrument_authority_v3_13_internal(
      requested.stock_id,p_source_cutoff) instrument ON instrument.symbol=requested.symbol
  ), incomplete AS(
    SELECT resolved.symbol,resolved.exchange,resolved.ordinal,count(DISTINCT observation.session_id) observed_sessions
    FROM resolved LEFT JOIN public.opportunity_price_observations_v3 observation ON observation.stock_id=resolved.stock_id
      AND observation.exchange::text=resolved.exchange AND observation.source_timestamp<=p_source_cutoff
      AND observation.collected_at<=p_source_cutoff AND observation.recorded_at<=p_source_cutoff
    GROUP BY resolved.stock_id,resolved.symbol,resolved.exchange,resolved.ordinal
    HAVING count(DISTINCT observation.session_id)<130
  ) SELECT coalesce(jsonb_agg(jsonb_build_array(symbol,exchange) ORDER BY observed_sessions,ordinal),'[]'::jsonb)
    INTO v_price_backfill FROM(SELECT * FROM incomplete ORDER BY observed_sessions,ordinal LIMIT 20) bounded;

  v_base:=v_base||jsonb_build_object('priceRows',v_prices,'candidateAuthorityRows',v_candidate_authority,
    'peerUniverseRows',v_peers,
    'officialPriceBackfillSymbols',v_price_backfill,'bridgeSchema','legacy-product-value-bridge-v3.14');
  IF jsonb_array_length(v_prices)>3900 OR jsonb_array_length(v_candidate_authority)>30
    OR jsonb_array_length(v_peers)>240
    OR octet_length(convert_to(v_base::text,'utf8'))>6291456 THEN RAISE EXCEPTION 'bound_violation';END IF;
  RETURN v_base;
END $function$;

ALTER TABLE public.legacy_runtime_failure_diagnostics_v3_14 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.legacy_official_ingestion_chunks_v3_14 OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.append_legacy_runtime_failure_diagnostic_v3_14(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,text,text,text,text,timestamptz)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.append_legacy_official_ingestion_chunk_v3_14(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.apply_legacy_official_ingestion_chunk_v3_14(uuid,uuid,uuid,text,integer,jsonb,text,text,timestamptz)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.complete_legacy_producer_job_v3_14(uuid,uuid,uuid,bytea,jsonb,text)
  OWNER TO opportunity_v3_rpc_owner;
ALTER FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb) TO legacy_correctness_rpc_owner;

-- Preserve immutable 1.45.1 projections for audit, while ensuring every newly
-- started/sealed/completed run uses the canonical V3.14 acceptance identity.
DO $acceptance_upgrade$
DECLARE
  v_constraint record;
  v_regprocedure regprocedure;
  v_definition text;
  v_old_count integer;
  v_new_count integer;
BEGIN
  FOR v_constraint IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='opportunity_public_projections_v3'
      AND constraint_type='CHECK'
      AND constraint_name IN(
        SELECT conname FROM pg_constraint
        WHERE conrelid='public.opportunity_public_projections_v3'::regclass
          AND pg_get_constraintdef(oid) LIKE '%acceptance_version%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.opportunity_public_projections_v3 DROP CONSTRAINT %I',v_constraint.constraint_name);
  END LOOP;
  ALTER TABLE public.opportunity_public_projections_v3
    ADD CONSTRAINT opportunity_projection_acceptance_v3_14_check
    CHECK(acceptance_version IN('1.44.6','1.45.1','1.46.0')) NOT VALID;
  ALTER TABLE public.opportunity_public_projections_v3
    VALIDATE CONSTRAINT opportunity_projection_acceptance_v3_14_check;

  FOREACH v_regprocedure IN ARRAY ARRAY[
    'public.begin_opportunity_run_v3(opportunity_mode_v3,opportunity_run_purpose_v3,timestamp with time zone,text,uuid)'::regprocedure,
    'public.seal_opportunity_run_inputs_v3(uuid,text)'::regprocedure,
    'public.complete_opportunity_job_v3(uuid,text,text,opportunity_job_counts_v3)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_regprocedure) INTO STRICT v_definition;
    v_old_count :=
      (length(v_definition)-length(replace(v_definition,'1.44.6','')))/length('1.44.6')
      +(length(v_definition)-length(replace(v_definition,'1.45.1','')))/length('1.45.1');
    v_new_count := (length(v_definition)-length(replace(v_definition,'1.46.0','')))/length('1.46.0');
    IF v_old_count=1 AND v_new_count=0 THEN
      EXECUTE replace(replace(v_definition,'1.44.6','1.46.0'),'1.45.1','1.46.0');
    ELSIF NOT(v_old_count=0 AND v_new_count=1) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='acceptance_identity_upgrade_shape';
    END IF;
  END LOOP;

  FOREACH v_regprocedure IN ARRAY ARRAY[
    'public.begin_opportunity_run_v3(opportunity_mode_v3,opportunity_run_purpose_v3,timestamp with time zone,text,uuid)'::regprocedure,
    'public.select_opportunity_public_projection_v3(timestamp with time zone)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_regprocedure) INTO STRICT v_definition;
    v_old_count :=
      (length(v_definition)-length(replace(v_definition,
        'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41','')))/64
      +(length(v_definition)-length(replace(v_definition,
        '393a6080aad2278b5da08b2a34ae824cca0fa83f99221ebc07c077753adcf9c9','')))/64;
    v_new_count := (length(v_definition)-length(replace(v_definition,
      'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729','')))/64;
    IF v_old_count=1 AND v_new_count=0 THEN
      EXECUTE replace(replace(v_definition,
        'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41',
        'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729'),
        '393a6080aad2278b5da08b2a34ae824cca0fa83f99221ebc07c077753adcf9c9',
        'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729');
    ELSIF NOT(v_old_count=0 AND v_new_count=1) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='comparison_identity_upgrade_shape';
    END IF;
  END LOOP;
END
$acceptance_upgrade$;

REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner,legacy_correctness_rpc_owner;

COMMIT;
