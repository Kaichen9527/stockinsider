-- Candidate only. Public projection is read-only and bound to a ranked member.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

CREATE FUNCTION public.vnext_launch_outcome_public_barrier_v1(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN jsonb_typeof(value)='object' AND value->>'state' IN
   ('up_first','down_first','order_unknown','price_data_gap','calendar_gap','pending','not_hit')
 THEN jsonb_build_object('state',value->>'state','session',
  CASE WHEN value->>'session'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN value->>'session' END) END
$$;
ALTER FUNCTION public.vnext_launch_outcome_public_barrier_v1(jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_outcome_public_barrier_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_outcome_public_horizons_v1(items jsonb,include_net boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE output jsonb;
BEGIN
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RETURN NULL;END IF;
 IF jsonb_array_length(items)>3 THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'horizon',CASE WHEN jsonb_typeof(item->'horizon')='number' AND item->>'horizon' IN('20','60','120') THEN item->'horizon' END,
  'state',CASE WHEN item->>'state' IN('ready','pending','price_data_gap','calendar_gap') THEN item->>'state' END,
  'terminalSession',CASE WHEN item->>'terminalSession'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN item->>'terminalSession' END,
  'grossReturnPct',CASE WHEN item->>'state'='ready' AND jsonb_typeof(item->'grossPriceReturnPct')='number' THEN item->'grossPriceReturnPct' END,
  'netReturnPct',CASE WHEN include_net AND item->>'state'='ready' AND jsonb_typeof(item->'netSimulatedReturnPct')='number' THEN item->'netSimulatedReturnPct' END,
  'benchmarkReturnPct',CASE WHEN item->>'state'='ready' AND jsonb_typeof(item->'benchmarkReturnPct')='number' THEN item->'benchmarkReturnPct' END,
  'marketExcessPct',CASE WHEN item->>'state'='ready' AND jsonb_typeof(item->'marketExcessPct')='number' THEN item->'marketExcessPct' END,
  'netMarketExcessPct',CASE WHEN include_net AND item->>'state'='ready' AND jsonb_typeof(item->'netMarketExcessPct')='number' THEN item->'netMarketExcessPct' END
 ) ORDER BY ordinal),'[]'::jsonb) INTO output FROM jsonb_array_elements(items) WITH ORDINALITY f(item,ordinal);
 RETURN output;
END $$;
ALTER FUNCTION public.vnext_launch_outcome_public_horizons_v1(jsonb,boolean) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_outcome_public_horizons_v1(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_outcome_public_v1(p_ranking_run_id uuid,p_symbol text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='5s' AS $$
DECLARE member_session date; anchor public.vnext_launch_outcome_signals_v1; tracked public.vnext_launch_outcome_versions_v1;
 policy constant text:='launch-outcomes-v1'; phase text; report jsonb; execution jsonb;
BEGIN
 IF p_ranking_run_id IS NULL OR p_symbol IS NULL OR p_symbol!~'^[0-9]{4}$'
 OR NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
 OR NOT EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled) THEN RETURN NULL;END IF;
 SELECT s.session_date INTO member_session FROM public.vnext_launch_ranking_snapshots_v1 s
 JOIN public.vnext_launch_ranking_members_v1 m USING(ranking_run_id)
 WHERE s.ranking_run_id=p_ranking_run_id AND m.symbol=p_symbol AND m.rank IS NOT NULL;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO anchor FROM public.vnext_launch_outcome_signals_v1 a WHERE a.ranking_run_id=p_ranking_run_id AND a.symbol=p_symbol;
 phase:=CASE WHEN FOUND THEN 'awaiting_observation' ELSE 'not_started' END;
 IF phase='awaiting_observation' THEN
  SELECT * INTO tracked FROM public.vnext_launch_outcome_versions_v1 v
  WHERE v.ranking_run_id=p_ranking_run_id AND v.symbol=p_symbol AND v.policy_version=policy AND v.as_of<=statement_timestamp()
  ORDER BY v.as_of DESC LIMIT 1;
  IF FOUND AND tracked.result->>'scope'='published_rank' AND tracked.result->>'policyVersion'=policy THEN
   phase:='ready';report:=tracked.result->'research';execution:=tracked.result->'execution';
  END IF;
 END IF;
 RETURN jsonb_build_object('schemaVersion','vnext-launch-outcome-public-v1','policyVersion',policy,
  'rankingRunId',p_ranking_run_id,'symbol',p_symbol,'signalSession',member_session,
  'state',phase,'firstRankingRunId',anchor.first_ranking_run_id,
  'asOf',CASE WHEN phase='ready' THEN tracked.as_of END,'outcomeRevision',CASE WHEN phase='ready' THEN tracked.snapshot_hash END,
  'research',CASE WHEN phase='ready' THEN jsonb_build_object(
   'barrier20',public.vnext_launch_outcome_public_barrier_v1(report->'barrier20'),
   'horizons',public.vnext_launch_outcome_public_horizons_v1(report->'horizons',false)) END,
  'execution',CASE WHEN phase='ready' THEN jsonb_build_object(
   'status',CASE WHEN execution->>'status' IN('pending','opening_evidence_gap','unfillable','modeled_fill') THEN execution->>'status' END,
   'nextSession',CASE WHEN execution->>'nextSession'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN execution->>'nextSession' END,
   'reason',CASE WHEN execution->>'reason' IN('suspended','one_price_upper_limit','no_executable_open') THEN execution->>'reason' END,
   'grossBarrier20',public.vnext_launch_outcome_public_barrier_v1(execution->'grossBarrier20'),
   'netBarrier20',public.vnext_launch_outcome_public_barrier_v1(execution->'netBarrier20'),
   'horizons',public.vnext_launch_outcome_public_horizons_v1(execution->'horizons',true)) END);
END $$;
ALTER FUNCTION public.vnext_launch_outcome_public_v1(uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_outcome_public_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_outcome_public_v1(uuid,text) TO service_role;
COMMIT;
