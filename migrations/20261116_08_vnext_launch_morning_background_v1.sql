-- Independent, immutable pre-open context. The ranking regime has its own evidence gate.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(610091002);
SELECT pg_advisory_xact_lock(2409,6002);
SELECT pg_advisory_xact_lock(64221022);

CREATE TABLE public.vnext_launch_morning_background_v1(
 session_date date PRIMARY KEY,cutoff timestamptz NOT NULL,previous_session date NOT NULL CHECK(previous_session<session_date),
 published_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(published_at>=cutoff),
 input_hash text NOT NULL CHECK(input_hash~'^[a-f0-9]{64}$'),
 twn_close numeric NOT NULL CHECK(twn_close>0),otc_close numeric NOT NULL CHECK(otc_close>0),
 input jsonb NOT NULL,
 CHECK(cutoff=(session_date::text||'T08:15:00+08:00')::timestamptz)
);
ALTER TABLE public.vnext_launch_morning_background_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_launch_morning_background_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_launch_morning_background_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER launch_morning_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_launch_morning_background_v1
 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE TRIGGER launch_morning_immutable BEFORE UPDATE OR DELETE ON public.vnext_launch_morning_background_v1
 FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();
CREATE TRIGGER launch_morning_no_truncate BEFORE TRUNCATE ON public.vnext_launch_morning_background_v1
 FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1();

CREATE FUNCTION public.vnext_launch_morning_heads_v1(p_rows jsonb,p_path text[],p_at_key text,p_day date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH ordered AS (
  SELECT value,dense_rank() OVER(ORDER BY (value->>p_at_key)::timestamptz DESC) priority
  FROM jsonb_array_elements(p_rows) WHERE value#>>p_path=p_day::text
 ) SELECT CASE WHEN count(DISTINCT value)=1 THEN jsonb_agg(value)->0 END FROM ordered WHERE priority=1
$$;
ALTER FUNCTION public.vnext_launch_morning_heads_v1(jsonb,text[],text,date) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_morning_heads_v1(jsonb,text[],text,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_morning_context_v1(p_seen timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE today date:=(p_seen AT TIME ZONE 'Asia/Taipei')::date;
 cutoff timestamptz:=(today::text||'T08:15:00+08:00')::timestamptz;
 d date; annual_tw jsonb;annual_otc jsonb; tw jsonb;otc jsonb; rows_json jsonb;
 actual_tw jsonb;actual_otc jsonb;point_tw jsonb;point_otc jsonb;evidence jsonb; inspection jsonb:='[]'::jsonb;
 reason text;
BEGIN
 IF p_seen IS NULL OR p_seen<cutoff THEN RETURN jsonb_build_object('ready',false,'reason','morning_slot_not_ready');END IF;
 annual_tw:=public.vnext_launch_annual_rows_internal_v1('TWSE',today-14,today,cutoff);
 annual_otc:=public.vnext_launch_annual_rows_internal_v1('TPEX',today-14,today,cutoff);
 IF annual_tw IS NULL OR annual_otc IS NULL THEN RETURN jsonb_build_object('ready',false,'reason','morning_official_calendar_unavailable');END IF;
 FOR d IN SELECT g::date FROM generate_series(today,today-14,interval '-1 day') g LOOP
  tw:=public.vnext_launch_morning_heads_v1(annual_tw,ARRAY['row','session'],'knownAt',d);
  otc:=public.vnext_launch_morning_heads_v1(annual_otc,ARRAY['row','session'],'knownAt',d);
  rows_json:=public.vnext_launch_today_calendar_internal_v1(d,cutoff);
  actual_tw:=public.vnext_launch_morning_heads_v1(
   (SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM jsonb_array_elements(rows_json) WHERE value->>'market'='TWSE'),
   ARRAY['session_id'],'recorded_at',d);
  actual_otc:=public.vnext_launch_morning_heads_v1(
   (SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM jsonb_array_elements(rows_json) WHERE value->>'market'='TPEX'),
   ARRAY['session_id'],'recorded_at',d);
  IF (actual_tw IS NULL AND EXISTS(SELECT FROM jsonb_array_elements(rows_json) WHERE value->>'market'='TWSE'))
   OR (actual_otc IS NULL AND EXISTS(SELECT FROM jsonb_array_elements(rows_json) WHERE value->>'market'='TPEX'))
   THEN reason:='morning_official_calendar_conflict';EXIT;END IF;
  IF d<today AND tw IS NULL AND otc IS NULL AND actual_tw IS NULL AND actual_otc IS NULL AND extract(isodow FROM d) IN(6,7)
   AND NOT EXISTS(SELECT FROM jsonb_array_elements(annual_tw||annual_otc) WHERE value#>>'{row,session}'=d::text)
   THEN CONTINUE;END IF;
  IF tw IS NULL OR otc IS NULL OR tw#>>'{row,market}' IS DISTINCT FROM 'TWSE' OR otc#>>'{row,market}' IS DISTINCT FROM 'TPEX'
   OR tw#>>'{row,provider}' IS DISTINCT FROM 'twse' OR otc#>>'{row,provider}' IS DISTINCT FROM 'tpex'
   OR tw->>'knownAt' IS NULL OR otc->>'knownAt' IS NULL OR (tw->>'knownAt')::timestamptz>cutoff OR (otc->>'knownAt')::timestamptz>cutoff THEN reason:='morning_official_calendar_gap';EXIT;END IF;
  inspection:=inspection||jsonb_build_array(jsonb_build_array(d,tw,otc,actual_tw,actual_otc));
  IF d=today THEN
   IF (tw#>>'{row,status}'='holiday' AND otc#>>'{row,status}'='holiday' AND actual_tw IS NULL AND actual_otc IS NULL)
    OR (actual_tw->>'status'='cancelled' AND actual_otc->>'status'='cancelled')
    THEN reason:='morning_market_closed';EXIT;END IF;
   IF tw#>>'{row,status}' IS DISTINCT FROM 'scheduled' OR otc#>>'{row,status}' IS DISTINCT FROM 'scheduled'
    OR actual_tw IS NOT NULL OR actual_otc IS NOT NULL
    OR tw#>>'{row,openAt}' IS NULL OR otc#>>'{row,openAt}' IS NULL
    OR (tw#>>'{row,openAt}')::timestamptz<=p_seen OR (otc#>>'{row,openAt}')::timestamptz<=p_seen
    OR ((tw#>>'{row,openAt}')::timestamptz AT TIME ZONE 'Asia/Taipei')::date<>today
    OR ((otc#>>'{row,openAt}')::timestamptz AT TIME ZONE 'Asia/Taipei')::date<>today
    THEN reason:='morning_preopen_session_unavailable';EXIT;END IF;
   CONTINUE;
  END IF;
  IF tw#>>'{row,status}'='holiday' AND otc#>>'{row,status}'='holiday' AND actual_tw IS NULL AND actual_otc IS NULL THEN CONTINUE;END IF;
  IF actual_tw->>'status'='cancelled' AND actual_otc->>'status'='cancelled' THEN CONTINUE;END IF;
  IF coalesce(tw#>>'{row,status}','') NOT IN('scheduled','completed') OR coalesce(otc#>>'{row,status}','') NOT IN('scheduled','completed')
   OR actual_tw->>'status' IS DISTINCT FROM 'completed' OR actual_otc->>'status' IS DISTINCT FROM 'completed'
   OR actual_tw->>'provider' IS DISTINCT FROM 'twse' OR actual_otc->>'provider' IS DISTINCT FROM 'tpex'
   OR actual_tw->>'close_at' IS NULL OR actual_otc->>'close_at' IS NULL
   OR (actual_tw->>'close_at')::timestamptz>=cutoff OR (actual_otc->>'close_at')::timestamptz>=cutoff
   THEN reason:='morning_previous_completed_session_unavailable';EXIT;END IF;
  point_tw:=public.vnext_launch_outcome_benchmark_point_v1(public.vnext_launch_source_fact_v1(11755,d,'INDEX',NULL,cutoff),d,11755,cutoff);
  point_otc:=public.vnext_launch_outcome_benchmark_point_v1(public.vnext_launch_source_fact_v1(11391,d,'INDEX',NULL,cutoff),d,11391,cutoff);
  IF point_tw IS NULL OR point_otc IS NULL
   OR (point_tw->>'observedAt')::timestamptz<(actual_tw->>'close_at')::timestamptz
   OR (point_otc->>'observedAt')::timestamptz<(actual_otc->>'close_at')::timestamptz THEN reason:='morning_previous_index_unavailable';EXIT;END IF;
  evidence:=jsonb_build_object('calendar',inspection,'twse',point_tw,'tpex',point_otc);
  RETURN jsonb_build_object('ready',true,'session',today,'cutoff',cutoff,'previousSession',d,
    'data',evidence,'inputHash',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-morning-background-v1',today,cutoff,evidence)));
 END LOOP;
 RETURN jsonb_build_object('ready',false,'reason',coalesce(reason,'morning_previous_session_outside_window'));
END $$;
ALTER FUNCTION public.vnext_launch_morning_context_v1(timestamptz) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_morning_context_v1(timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.vnext_launch_morning_command_v1(p_principal text,p_lease_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='20s' SET lock_timeout='2s' AS $$
DECLARE rights jsonb;backend jsonb;mode public.vnext_launch_ranking_mode_v1; chosen jsonb; replay boolean:=false; seen timestamptz;
 saved public.vnext_launch_morning_background_v1; previous public.vnext_launch_morning_background_v1;day date;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'launch_morning_read_committed_required';END IF;
 PERFORM pg_advisory_xact_lock(610091002);PERFORM pg_advisory_xact_lock(2409,6002);PERFORM pg_advisory_xact_lock(64221022);
 rights:=public.vnext_launch_csv_policy_v1(p_principal);backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 SELECT * INTO mode FROM public.vnext_launch_ranking_mode_v1 WHERE singleton;
 IF mode.enabled IS DISTINCT FROM true OR mode.required_writer_release IS NULL
  OR mode.required_writer_release IS DISTINCT FROM backend->>'writerRelease'
  OR mode.required_writer_release IS DISTINCT FROM rights->>'requiredWriterRelease' THEN RAISE EXCEPTION 'launch_morning_reviewed_writer_required';END IF;
 seen:=clock_timestamp();day:=(seen AT TIME ZONE 'Asia/Taipei')::date;
 SELECT * INTO saved FROM public.vnext_launch_morning_background_v1 WHERE session_date=day;
 IF FOUND THEN replay:=true;
 ELSE
  chosen:=public.vnext_launch_morning_context_v1(seen);
  IF chosen->>'ready' IS DISTINCT FROM 'true' THEN
   SELECT * INTO previous FROM public.vnext_launch_morning_background_v1 WHERE session_date<day ORDER BY session_date DESC LIMIT 1;
   RETURN jsonb_build_object('status','deferred','reason',chosen->>'reason','retainedSession',previous.session_date);
  END IF;
  PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
  INSERT INTO public.vnext_launch_morning_background_v1(session_date,cutoff,previous_session,input_hash,twn_close,otc_close,input)
   VALUES(day,(chosen->>'cutoff')::timestamptz,(chosen->>'previousSession')::date,chosen->>'inputHash',
     (chosen#>>'{data,twse,close}')::numeric,(chosen#>>'{data,tpex,close}')::numeric,chosen->'data') RETURNING * INTO saved;
 END IF;
 RETURN jsonb_build_object('status','published','replay',replay,'session',saved.session_date,'cutoff',saved.cutoff,
  'previousSession',saved.previous_session,'revision',saved.input_hash);
END $$;
ALTER FUNCTION public.vnext_launch_morning_command_v1(text,uuid) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_morning_command_v1(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_morning_command_v1(text,uuid) TO service_role;

CREATE FUNCTION public.vnext_launch_morning_public_v1() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='5s' AS $$
 SELECT jsonb_build_object('schemaVersion','vnext-launch-morning-public-v1','session',session_date,'cutoff',cutoff,
   'previousSession',previous_session,'revision',input_hash,'twseClose',twn_close,'tpexClose',otc_close)
 FROM public.vnext_launch_morning_background_v1 WHERE published_at<=statement_timestamp()
 AND EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
 AND EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled)
 ORDER BY session_date DESC LIMIT 1
$$;
ALTER FUNCTION public.vnext_launch_morning_public_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_morning_public_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_morning_public_v1() TO service_role;
COMMIT;
