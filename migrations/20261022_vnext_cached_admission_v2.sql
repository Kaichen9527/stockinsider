BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
-- Explicit additive feature read dependency; no original role/table owner or
-- existing policy/table ACL is changed. New profile must assert these 11 column
-- SELECT privileges and this SELECT-only policy, and no write privilege.
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.tw_trading_sessions_v3'::regclass)
  OR EXISTS(SELECT FROM pg_policy WHERE polrelid='public.tw_trading_sessions_v3'::regclass)
  OR has_any_column_privilege('stockinsider_vnext_owner','public.tw_trading_sessions_v3','SELECT') THEN RAISE EXCEPTION 'vnext_calendar_read_predecessor_privilege_changed'; END IF;
END $$;
GRANT SELECT(session_authority_id,session_id,market,open_at,close_at,status,provider,source_timestamp,collected_at,source_ref,recorded_at) ON public.tw_trading_sessions_v3 TO stockinsider_vnext_owner;
CREATE POLICY vnext_calendar_read_v2 ON public.tw_trading_sessions_v3 FOR SELECT TO stockinsider_vnext_owner USING((market='TWSE' AND provider='twse') OR (market='TPEX' AND provider='tpex'));
CREATE TABLE public.vnext_calendar_receipts_v2(receipt_hash text PRIMARY KEY,source_rows jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.vnext_calendar_receipts_v2 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_calendar_receipts_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_calendar_receipts_v2 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_calendar_receipts_v2 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE FUNCTION public.vnext_cached_clues_current_v2(input jsonb,p_symbol text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_typeof(input->'clues')='array' AND jsonb_array_length(input->'clues')>0 AND NOT EXISTS(SELECT FROM jsonb_array_elements(input->'clues') clue WHERE clue->>'symbol' IS DISTINCT FROM p_symbol OR NOT EXISTS(
  SELECT FROM public.vnext_extractions_v1 receipt WHERE receipt.content_hash=clue->>'contentHash' AND receipt.extraction->'clues' @> jsonb_build_array(clue) AND public.vnext_source_evidence_current_v1(receipt.extraction->'evidence',p_symbol))),false)
$$;
ALTER FUNCTION public.vnext_cached_clues_current_v2(jsonb,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_cached_clues_current_v2(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_cached_admission_v1(p_principal text,p_command text,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE symbol_name text; item jsonb; admitted jsonb; safe_symbols jsonb:='[]'::jsonb; deferred jsonb:='[]'::jsonb; receipts jsonb; calendar_rows jsonb; source_hash text; cutoff timestamptz:=clock_timestamp(); pair record; prior public.vnext_sessions_v1; synced integer:=0;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT public.vnext_provider_envelope_v1(p_request) THEN RAISE EXCEPTION 'vnext_cached_request_bounds'; END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced) OR NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND role='operator' AND enabled) THEN RAISE EXCEPTION 'vnext_cached_operator_mode_required'; END IF;
 IF p_command='sync-calendar' THEN
  IF p_request<>'{}'::jsonb THEN RAISE EXCEPTION 'vnext_calendar_no_caller_dates_or_flags'; END IF;
  -- The original authority chooses the latest recorded as-of head, rejects tied
  -- semantic conflicts, checks provider/clock/civil dates, and requires agreement
  -- between TWSE and TPEX. No weekday or foreign-holiday inference is used.
  SELECT coalesce(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.session_id,source_row.market,source_row.recorded_at,source_row.session_authority_id),'[]'::jsonb) INTO calendar_rows
  FROM(SELECT session_authority_id,session_id,market,open_at,close_at,status,provider,source_timestamp,collected_at,source_ref,recorded_at FROM public.tw_trading_sessions_v3
   WHERE session_id BETWEEN ((cutoff AT TIME ZONE 'Asia/Taipei')::date-900) AND (cutoff AT TIME ZONE 'Asia/Taipei')::date
   AND source_timestamp<=cutoff AND collected_at<=cutoff AND recorded_at<=cutoff ORDER BY session_id DESC,recorded_at DESC LIMIT 20001) source_row;
  IF jsonb_array_length(calendar_rows)=0 OR jsonb_array_length(calendar_rows)>20000 THEN RAISE EXCEPTION 'vnext_cached_official_calendar_unavailable_or_unbounded'; END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements(calendar_rows) row_item WHERE row_item->>'status' NOT IN('completed','cancelled') OR row_item->>'provider' IS DISTINCT FROM lower(row_item->>'market') OR row_item->>'market' NOT IN('TWSE','TPEX') OR nullif(row_item->>'source_ref','') IS NULL OR (row_item->>'source_timestamp')::timestamptz>(row_item->>'collected_at')::timestamptz OR (row_item->>'collected_at')::timestamptz>(row_item->>'recorded_at')::timestamptz OR (row_item->>'open_at')::timestamptz>=(row_item->>'close_at')::timestamptz OR ((row_item->>'open_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::date<>(row_item->>'session_id')::date OR ((row_item->>'close_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::date<>(row_item->>'session_id')::date) THEN RAISE EXCEPTION 'vnext_cached_calendar_authority_invalid'; END IF;
  IF EXISTS(WITH ranked AS(SELECT value,dense_rank() OVER(PARTITION BY value->>'market',value->>'session_id' ORDER BY (value->>'recorded_at')::timestamptz DESC) AS version FROM jsonb_array_elements(calendar_rows)) SELECT FROM ranked WHERE version=1 GROUP BY value->>'market',value->>'session_id' HAVING count(DISTINCT(value-'session_authority_id'))>1) THEN RAISE EXCEPTION 'vnext_cached_calendar_head_conflict'; END IF;
  FOR pair IN WITH ranked AS(SELECT value,row_number() OVER(PARTITION BY value->>'market',value->>'session_id' ORDER BY (value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id') AS version FROM jsonb_array_elements(calendar_rows)), heads AS(SELECT value FROM ranked WHERE version=1)
   SELECT (value->>'session_id')::date AS session_date,count(*) AS markets,count(DISTINCT value->>'status') AS statuses,min(value->>'status') AS status,max((value->>'close_at')::timestamptz) AS close_at FROM heads GROUP BY value->>'session_id' ORDER BY value->>'session_id'
  LOOP
   IF pair.markets<>2 THEN CONTINUE; END IF;
   IF pair.statuses<>1 THEN RAISE EXCEPTION 'vnext_cached_calendar_cross_market_conflict'; END IF;
   IF pair.session_date=(cutoff AT TIME ZONE 'Asia/Taipei')::date AND pair.status='cancelled' THEN RAISE EXCEPTION 'vnext_cached_calendar_today_cancelled'; END IF;
   SELECT * INTO prior FROM public.vnext_sessions_v1 WHERE session_date=pair.session_date;
   IF prior.session_date IS NOT NULL AND (pair.status<>'completed' OR prior.close_at<>pair.close_at OR (prior.completed AND pair.close_at>cutoff)) THEN RAISE EXCEPTION 'vnext_cached_calendar_immutable_past_mismatch'; END IF;
   -- A known official trading date is distinct from a completed close. Only an
   -- exact same pair/close can advance false to true; completed history never regresses.
   IF pair.status='completed' THEN INSERT INTO public.vnext_sessions_v1(session_date,close_at,completed) VALUES(pair.session_date,pair.close_at,pair.close_at<=cutoff)
    ON CONFLICT(session_date) DO UPDATE SET completed=true WHERE NOT public.vnext_sessions_v1.completed AND excluded.completed;
    synced:=synced+1; END IF;
  END LOOP;
  IF synced=0 THEN RAISE EXCEPTION 'vnext_cached_calendar_composite_unavailable'; END IF;
  source_hash:=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(calendar_rows),'UTF8')),'hex');
  INSERT INTO public.vnext_calendar_receipts_v2(receipt_hash,source_rows) VALUES(source_hash,calendar_rows) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('sessions',synced,'latestCompleted',(SELECT max(session_date) FROM public.vnext_sessions_v1 WHERE completed AND close_at<=cutoff),'sourceHash',source_hash,'sourceCutoff',cutoff,'source','actual_cached_twse_tpex_calendar');
 ELSIF p_command='enqueue' THEN
  IF jsonb_typeof(p_request->'symbols') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'symbols')>20 OR coalesce(p_request->>'requestKey','') !~ '^[A-Za-z0-9_:.-]{1,180}$' OR jsonb_typeof(p_request->'inputs') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'vnext_cached_explicit_scope_required'; END IF;
  FOR symbol_name IN SELECT DISTINCT jsonb_array_elements_text(p_request->'symbols') ORDER BY 1 LOOP
   item:=p_request->'inputs'->symbol_name;
   IF symbol_name !~ '^[0-9]{4}$' OR item->'initialScore'->>'derivationVersion' IS DISTINCT FROM 'vnext-initial-cached-v2' THEN RAISE EXCEPTION 'vnext_cached_initial_policy_required'; END IF;
   IF NOT public.vnext_cached_clues_current_v2(item,symbol_name) OR NOT public.vnext_input_sources_current_v1(item,symbol_name) THEN deferred:=deferred||jsonb_build_array(jsonb_build_object('symbol',symbol_name,'deferred','current_resolved_source_receipt_required'));CONTINUE; END IF;
   safe_symbols:=safe_symbols||jsonb_build_array(symbol_name);
  END LOOP;
  IF jsonb_array_length(safe_symbols)=0 THEN RETURN jsonb_build_object('jobs',deferred,'expensiveCalls',0); END IF;
  admitted:=public.vnext_command_v1(p_principal,'enqueue',p_request||jsonb_build_object('symbols',safe_symbols));
  RETURN admitted||jsonb_build_object('jobs',coalesce(admitted->'jobs','[]'::jsonb)||deferred);
 ELSIF p_command='content-receipts' THEN
  IF jsonb_typeof(p_request->'receiptIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'receiptIds')>200 OR EXISTS(SELECT FROM jsonb_array_elements_text(p_request->'receiptIds') hash WHERE hash !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'vnext_current_receipt_hash_scope_required'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('contentHash',receipt.content_hash,'clues',receipt.extraction->'clues','evidence',receipt.extraction->'evidence')),'[]'::jsonb) INTO receipts FROM public.vnext_extractions_v1 receipt WHERE p_request->'receiptIds' ? receipt.content_hash AND EXISTS(SELECT FROM jsonb_array_elements(receipt.extraction->'clues') clue WHERE public.vnext_source_evidence_current_v1(receipt.extraction->'evidence',clue->>'symbol'));
  RETURN jsonb_build_object('receipts',receipts,'requested',jsonb_array_length(p_request->'receiptIds'),'current',jsonb_array_length(receipts),'parserCalls',0);
 ELSE RAISE EXCEPTION 'vnext_cached_command_unsupported'; END IF;
END $$;
ALTER FUNCTION public.vnext_cached_admission_v1(text,text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_cached_admission_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_cached_admission_v1(text,text,jsonb) TO service_role;
DO $cached_screening_v2$
DECLARE original text; definition text; changed text; swap_body text; changed_swap text;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid=to_regprocedure('public.vnext_command_v1(text,text,jsonb)');
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '5dbab9e05b90b7bb2c323c3862ed8b64ee9bbe0fc25ac268f736da1078c91a41' THEN RAISE EXCEPTION 'vnext_cached_core_predecessor_changed'; END IF;
 swap_body:=substring(original FROM position($swap_start$ ELSIF p_command='swap' THEN$swap_start$ IN original) FOR position($swap_end$ ELSE RAISE EXCEPTION 'vnext_command_unsupported'; END IF;$swap_end$ IN original)-position($swap_start$ ELSIF p_command='swap' THEN$swap_start$ IN original));
 changed_swap:=replace(swap_body,$old_candidate$  IF candidate IS NULL THEN RETURN jsonb_build_object('deferred','current_challenger_observation_missing'); END IF;$old_candidate$,$new_candidate$  IF candidate IS NULL THEN RETURN jsonb_build_object('deferred','current_challenger_observation_missing'); END IF;
  IF candidate->'initialScore'->>'derivationVersion' IS DISTINCT FROM 'vnext-initial-cached-v2' OR NOT public.vnext_cached_clues_current_v2(candidate,v_symbol) THEN RETURN jsonb_build_object('deferred','current_receipt_or_initial_policy_missing'); END IF;$new_candidate$);
 changed_swap:=replace(changed_swap,$old_incumbent$  SELECT input INTO v_incumbent.evidence FROM public.vnext_screening_v1 WHERE session_date=s AND symbol=v_incumbent.symbol;$old_incumbent$,$new_incumbent$  SELECT input INTO v_incumbent.evidence FROM public.vnext_screening_v1 WHERE session_date=s AND symbol=v_incumbent.symbol;
  IF v_incumbent.evidence->'initialScore'->>'derivationVersion' IS DISTINCT FROM 'vnext-initial-cached-v2' OR NOT public.vnext_cached_clues_current_v2(v_incumbent.evidence,v_incumbent.symbol) THEN RETURN jsonb_build_object('deferred','current_incumbent_receipt_or_initial_policy_missing'); END IF;
  v_comparison_policy:=(r->>'policy')||':vnext-initial-cached-v2';$new_incumbent$);
 changed_swap:=replace(changed_swap,$old_nested$IF f.key='sourceVolume' THEN
    FOR g IN SELECT unnest(ARRAY['independent','volume']) AS key LOOP$old_nested$,$new_nested$IF f.key IN('sourceVolume','operationsCatalyst') THEN
    FOR g IN SELECT unnest(CASE f.key WHEN 'sourceVolume' THEN ARRAY['independent','volume'] ELSE ARRAY['operations','catalyst'] END) AS key LOOP$new_nested$);
 changed_swap:=replace(changed_swap,'12.5','(f.weight::numeric/2)');
 changed_swap:=replace(replace(replace(changed_swap,$old_other$policy<>r->>'policy'$old_other$,'policy<>v_comparison_policy'),$old_same$policy=r->>'policy'$old_same$,'policy=v_comparison_policy'),$old_values$VALUES(v_symbol,v_incumbent.symbol,r->>'policy',s,n)$old_values$,'VALUES(v_symbol,v_incumbent.symbol,v_comparison_policy,s,n)');
 IF changed_swap=swap_body OR position('current_incumbent_receipt_or_initial_policy_missing' IN changed_swap)=0 OR position('operationsCatalyst' IN changed_swap)=0 THEN RAISE EXCEPTION 'vnext_cached_swap_seam_missing'; END IF;
 changed:=replace(replace(original,swap_body,changed_swap),' s date; count_started integer;',' s date; v_comparison_policy text; count_started integer;');
 EXECUTE replace(definition,original,changed);
END $cached_screening_v2$;
COMMIT;
