-- Add a three-calendar-year view of the same pinned official calendar.
-- The legacy 240/520 path runs the same validation and produces the same digest.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';

DO $preflight$
DECLARE before_oid oid:=to_regprocedure('public.vnext_launch_calendar_v1(text,date,timestamptz,integer)');
BEGIN
 IF before_oid IS NULL OR NOT EXISTS(
  SELECT FROM pg_proc WHERE oid=before_oid AND prosecdef AND provolatile='s'
   AND proowner=(SELECT oid FROM pg_roles WHERE rolname='opportunity_v3_rpc_owner')
   AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='a7a31aa34ac20a81a1c7d19a5b7407c4062a17e4c740db40b330a68250d91949'
 ) THEN RAISE EXCEPTION 'launch_chart_calendar_reviewed_predecessor_required';END IF;
END $preflight$;

CREATE FUNCTION public.vnext_launch_calendar_window_internal_v1(market_name text,signal_day date,cutoff timestamptz,required_sessions integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE heads jsonb;annual jsonb;first_day date;day date;entry jsonb;row_item jsonb;known_at timestamptz;days jsonb;
 display_from date;chart_window boolean:=required_sessions IS NULL;
 heads_by_day jsonb;annual_by_day jsonb;ambiguous_annual text[];
BEGIN
 IF market_name NOT IN('TWSE','TPEX') OR cutoff IS NULL OR cutoff>statement_timestamp() OR signal_day IS NULL OR (NOT chart_window AND required_sessions NOT IN(240,520)) THEN RETURN NULL;END IF;
 IF EXISTS(WITH ranked AS(SELECT t.*,dense_rank() OVER(PARTITION BY session_id ORDER BY recorded_at DESC) priority
  FROM public.tw_trading_sessions_v3 t WHERE market::text=market_name AND session_id<=signal_day AND session_id>=signal_day-2400
   AND source_timestamp<=cutoff AND collected_at<=cutoff AND recorded_at<=cutoff)
  SELECT FROM ranked WHERE priority=1 GROUP BY session_id HAVING count(DISTINCT(to_jsonb(ranked)-'session_authority_id'-'priority'))>1) THEN RETURN NULL;END IF;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY session_id) INTO heads FROM(
  SELECT DISTINCT ON(session_id) * FROM public.tw_trading_sessions_v3 WHERE market::text=market_name
   AND session_id BETWEEN signal_day-2400 AND signal_day AND source_timestamp<=cutoff AND collected_at<=cutoff AND recorded_at<=cutoff
  ORDER BY session_id,recorded_at DESC,session_authority_id
 ) r;
 IF heads IS NULL OR jsonb_array_length(heads)>2401 OR EXISTS(SELECT FROM jsonb_array_elements(heads) r
  WHERE r->>'provider'<>lower(market_name) OR r->>'status' NOT IN('completed','cancelled')
   OR (r->>'source_timestamp')::timestamptz>(r->>'collected_at')::timestamptz
   OR (r->>'collected_at')::timestamptz>(r->>'recorded_at')::timestamptz
   OR (r->>'open_at')::timestamptz>=(r->>'close_at')::timestamptz
   OR ((r->>'close_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::date<>(r->>'session_id')::date) THEN RETURN NULL;END IF;
 IF chart_window THEN
  display_from:=(signal_day-interval '3 years')::date;
  -- This is the 239th real completed session before the visible window.
  -- Cancellations, suspended issues, and missing coverage never invent a bar.
  SELECT (value->>'session_id')::date INTO first_day
  FROM jsonb_array_elements(heads)
  WHERE value->>'status'='completed' AND (value->>'session_id')::date<display_from
  ORDER BY value->>'session_id' DESC OFFSET 238 LIMIT 1;
  IF first_day IS NULL THEN RETURN NULL;END IF;
  SELECT jsonb_agg(value ORDER BY value->>'session_id') INTO days FROM jsonb_array_elements(heads)
  WHERE value->>'status'='completed' AND (value->>'session_id')::date>=first_day AND (value->>'close_at')::timestamptz<=cutoff;
  IF days IS NULL OR jsonb_array_length(days) NOT BETWEEN 240 AND 1320 OR days->-1->>'session_id'<>signal_day::text
   OR (SELECT count(*) FROM jsonb_array_elements(days) WHERE (value->>'session_id')::date<display_from)<>239 THEN RETURN NULL;END IF;
 ELSE
  SELECT jsonb_agg(value ORDER BY value->>'session_id') INTO days FROM(
   SELECT value FROM jsonb_array_elements(heads) WHERE value->>'status'='completed' AND (value->>'close_at')::timestamptz<=cutoff
   ORDER BY value->>'session_id' DESC LIMIT required_sessions
  ) required;
  IF days IS NULL OR jsonb_array_length(days)<>required_sessions OR days->-1->>'session_id'<>signal_day::text THEN RETURN NULL;END IF;
  first_day:=(days->0->>'session_id')::date;
 END IF;
 annual:=public.vnext_launch_annual_rows_internal_v1(market_name,first_day,signal_day,cutoff);
 IF annual IS NULL OR jsonb_array_length(annual)=0 THEN RETURN NULL;END IF;
 IF chart_window THEN
  SELECT jsonb_object_agg(value->>'session_id',value) INTO heads_by_day FROM jsonb_array_elements(heads);
  WITH annual_rows AS (
   SELECT value packet,value->'row'->>'session' AS day_key,(value->>'knownAt')::timestamptz AS known,ordinal
   FROM jsonb_array_elements(annual) WITH ORDINALITY q(value,ordinal)
  ), chosen AS (
   SELECT DISTINCT ON (day_key) day_key,packet,known
   FROM annual_rows ORDER BY day_key,known DESC,packet->>'jobId',ordinal
  ), ambiguous AS (
   SELECT c.day_key FROM chosen c JOIN annual_rows a USING(day_key)
   WHERE c.known=a.known AND c.packet->'row' IS DISTINCT FROM a.packet->'row' GROUP BY c.day_key
  )
  SELECT jsonb_object_agg(day_key,packet),(SELECT array_agg(day_key) FROM ambiguous)
  INTO annual_by_day,ambiguous_annual FROM chosen;
 END IF;
 FOR day IN SELECT generate_series(first_day,signal_day,interval '1 day')::date LOOP
  IF chart_window THEN
   row_item:=heads_by_day->day::text;
   entry:=annual_by_day->day::text;
  ELSE
   SELECT value INTO row_item FROM jsonb_array_elements(heads) WHERE value->>'session_id'=day::text;
   SELECT value INTO entry FROM jsonb_array_elements(annual) WHERE value->'row'->>'session'=day::text
    ORDER BY (value->>'knownAt')::timestamptz DESC,value->>'jobId' LIMIT 1;
  END IF;
  IF row_item IS NOT NULL AND row_item->>'status'='cancelled' THEN CONTINUE;END IF;
  IF entry IS NULL THEN
   -- Reuse ONLY the pinned completed v3.14 producer's weekday-only contract.
   -- A recorded weekend/makeup opening contradicts it and remains unsupported.
   IF row_item IS NULL AND extract(isodow FROM day) IN(6,7) THEN CONTINUE;ELSE RETURN NULL;END IF;
  END IF;
  IF (chart_window AND day::text=ANY(ambiguous_annual))
   OR (NOT chart_window AND EXISTS(SELECT FROM jsonb_array_elements(annual) other WHERE other->'row'->>'session'=day::text
    AND other->>'knownAt'=entry->>'knownAt' AND other->'row' IS DISTINCT FROM entry->'row')) THEN RETURN NULL;END IF;
  IF entry->'row'->>'provider'<>lower(market_name) OR entry->'row'->>'sourceSha256'!~'^[a-f0-9]{64}$'
   OR entry->'row'->>'sourceRef'<>lower(market_name)||'-annual-calendar:'||extract(year FROM day)::text||':'||day::text||':'||(entry->'row'->>'sourceSha256')
   OR entry->'row'->>'sourceUrl'<>(CASE market_name WHEN 'TWSE' THEN 'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date='||extract(year FROM day)::integer::text||'0101'
    ELSE 'https://www.tpex.org.tw/storage/zh-tw/web/bulletin/trading_date/trading_date_'||(extract(year FROM day)::integer-1911)::text||'.htm' END)
   OR (entry->'row'->>'sourceTimestamp')::timestamptz>(entry->'row'->>'collectedAt')::timestamptz
   OR (entry->'row'->>'collectedAt')::timestamptz>(entry->>'knownAt')::timestamptz
   OR entry->'row'->>'status' NOT IN('completed','holiday') THEN RETURN NULL;END IF;
  IF (entry->'row'->>'status'='completed') IS DISTINCT FROM(row_item IS NOT NULL AND row_item->>'status'='completed') THEN RETURN NULL;END IF;
 END LOOP;
 SELECT greatest(max((d->>'recorded_at')::timestamptz),(SELECT max((a->>'knownAt')::timestamptz) FROM jsonb_array_elements(annual) a)) INTO known_at FROM jsonb_array_elements(heads) d;
 IF chart_window THEN
  RETURN jsonb_build_object('schemaVersion','launch-chart-official-calendar-v1','sessions',days,'displayFrom',display_from,
   'throughSession',signal_day,'warmupSessions',239,'knownAt',known_at,'annual',annual,
   'calendarRevision',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-chart-calendar-selected-v1',market_name,
    signal_day,cutoff,display_from,days,annual,
    'official-calendar-acquisition-v3.14:weekday-only:220147e99e54ecda8fdaad10f6bee026591f88dc144c3a19f886ab78dc2b668a')));
 END IF;
 RETURN jsonb_build_object('sessions',days,'calendarRevision',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-calendar-selected-v1',market_name,signal_day,cutoff,heads,annual,
  'official-calendar-acquisition-v3.14:weekday-only:220147e99e54ecda8fdaad10f6bee026591f88dc144c3a19f886ab78dc2b668a')),
  'coverage','verified_v314_weekday_calendar_only','knownAt',known_at,'annual',annual);
END $$;
ALTER FUNCTION public.vnext_launch_calendar_window_internal_v1(text,date,timestamptz,integer) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_calendar_window_internal_v1(text,date,timestamptz,integer) FROM PUBLIC,anon,authenticated,service_role,stockinsider_vnext_owner;

CREATE OR REPLACE FUNCTION public.vnext_launch_calendar_v1(market_name text,signal_day date,cutoff timestamptz,required_sessions integer DEFAULT 240)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
 SELECT public.vnext_launch_calendar_window_internal_v1(market_name,signal_day,cutoff,required_sessions)
 WHERE required_sessions IN(240,520)
$$;

CREATE FUNCTION public.vnext_launch_chart_calendar_internal_v1(market_name text,signal_day date,cutoff timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
 SELECT public.vnext_launch_calendar_window_internal_v1(market_name,signal_day,cutoff,NULL)
$$;
ALTER FUNCTION public.vnext_launch_chart_calendar_internal_v1(text,date,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_chart_calendar_internal_v1(text,date,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_chart_calendar_internal_v1(text,date,timestamptz) TO stockinsider_vnext_owner;

-- This is private provenance used for chart construction, not a public DTO
-- or an input capability. The terminal 240 sessions must match the frozen
-- score's exact selected observations and trading-session authorities.
CREATE FUNCTION public.vnext_launch_chart_basis_internal_v1(p_ranking_run_id uuid,p_symbol text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET extra_float_digits=3 AS $$
DECLARE score_row public.vnext_launch_score_evidence_v1;stored_price jsonb;stored_calendar jsonb;
 stock uuid;venue text;calendar jsonb;sessions jsonb;observations jsonb:='[]';chunk jsonb;
 first_day date;chunk_start date;chunk_end date;selected jsonb;known_at timestamptz;recent jsonb;
BEGIN
 IF p_ranking_run_id IS NULL OR p_symbol IS NULL OR p_symbol!~'^[0-9]{4}$' THEN RETURN NULL;END IF;
 SELECT score.* INTO score_row
 FROM public.vnext_launch_ranking_members_v1 member
 JOIN public.vnext_launch_ranking_snapshots_v1 snapshot USING(ranking_run_id)
 JOIN public.vnext_launch_score_evidence_v1 score ON score.score_revision=member.score_revision
  AND score.research_revision=member.research_revision AND score.symbol=member.symbol AND score.input_hash=member.input_hash
  AND score.signal_session=snapshot.session_date AND score.input_cutoff=snapshot.input_cutoff
 WHERE member.ranking_run_id=p_ranking_run_id AND member.symbol=p_symbol AND member.rank IS NOT NULL;
 IF NOT FOUND OR NOT isfinite(score_row.signal_session) OR NOT isfinite(score_row.input_cutoff)
  OR score_row.input_cutoff>statement_timestamp()
  OR score_row.source_hash IS DISTINCT FROM public.vnext_launch_csv_hash_v1(score_row.source_inputs) THEN RETURN NULL;END IF;

 stored_price:=score_row.source_inputs->'price';
 stored_calendar:=score_row.source_inputs->'calendar';
 IF stored_price->>'schemaVersion' IS DISTINCT FROM 'launch-db-selected-price-v1'
  OR stored_price->>'priceBasis' IS DISTINCT FROM 'adjusted_to_signal_session'
  OR stored_price->>'anchor' IS DISTINCT FROM score_row.signal_session::text
  OR coalesce(stored_price->>'priceRevision','')!~'^[a-f0-9]{64}$'
  OR stored_price->>'calendarRevision' IS DISTINCT FROM stored_calendar->>'calendarRevision'
  OR jsonb_typeof(stored_price->'rawRows') IS DISTINCT FROM 'array'
  OR jsonb_typeof(stored_calendar->'sessions') IS DISTINCT FROM 'array' THEN RETURN NULL;END IF;
 IF jsonb_array_length(stored_price->'rawRows')<>240 OR jsonb_array_length(stored_calendar->'sessions')<>240 THEN RETURN NULL;END IF;
 stock:=(stored_price->'rawRows'->0->>'stock_id')::uuid;
 venue:=stored_price->'rawRows'->0->>'exchange';
 IF stock IS NULL OR venue IS NULL OR venue NOT IN('TWSE','TPEX') THEN RETURN NULL;END IF;

 calendar:=public.vnext_launch_chart_calendar_internal_v1(venue,score_row.signal_session,score_row.input_cutoff);
 IF calendar IS NULL THEN RETURN NULL;END IF;
 sessions:=calendar->'sessions';
 SELECT jsonb_agg(value ORDER BY ordinal) INTO recent FROM jsonb_array_elements(sessions) WITH ORDINALITY q(value,ordinal)
 WHERE ordinal>jsonb_array_length(sessions)-240;
 IF recent IS DISTINCT FROM stored_calendar->'sessions' THEN RETURN NULL;END IF;

 first_day:=(sessions->0->>'session_id')::date;
 chunk_start:=first_day;
 WHILE chunk_start<=score_row.signal_session LOOP
  chunk_end:=least(chunk_start+899,score_row.signal_session);
  chunk:=public.vnext_launch_price_rows_internal_v1(stock,venue,chunk_start,chunk_end,score_row.input_cutoff);
  IF chunk IS NULL THEN RETURN NULL;END IF;
  observations:=observations||chunk;
  chunk_start:=chunk_end+1;
 END LOOP;

 WITH days AS (
  SELECT value day_row,ordinal FROM jsonb_array_elements(sessions) WITH ORDINALITY q(value,ordinal)
 ), prioritized AS (
  SELECT value obs,dense_rank() OVER(PARTITION BY value->>'session_id' ORDER BY
   (value->>'source_timestamp')::timestamptz DESC,(value->>'collected_at')::timestamptz DESC,(value->>'recorded_at')::timestamptz DESC) priority
  FROM jsonb_array_elements(observations)
 ), heads AS (
  SELECT DISTINCT ON (obs->>'session_id') obs
  FROM prioritized WHERE priority=1 ORDER BY obs->>'session_id',obs->>'observation_id'
 ), ambiguous AS (
  SELECT obs->>'session_id' AS session
  FROM prioritized WHERE priority=1 GROUP BY obs->>'session_id'
  HAVING count(DISTINCT obs-'observation_id')>1
 )
 SELECT jsonb_agg(h.obs ORDER BY d.ordinal),greatest((calendar->>'knownAt')::timestamptz,max((h.obs->>'recorded_at')::timestamptz))
 INTO selected,known_at
 FROM days d
 LEFT JOIN heads h ON h.obs->>'session_id'=d.day_row->>'session_id'
 LEFT JOIN ambiguous conflict ON conflict.session=d.day_row->>'session_id'
 HAVING count(*)=count(h.obs) AND NOT bool_or(
   h.obs->>'session_authority_id' IS DISTINCT FROM d.day_row->>'session_authority_id'
   OR h.obs->>'provider' IS DISTINCT FROM lower(venue)
   OR coalesce(h.obs->>'source_ref','') NOT LIKE lower(venue)||'-%'
   OR (h.obs->>'source_timestamp')::timestamptz<(d.day_row->>'close_at')::timestamptz
   OR (h.obs->>'source_timestamp')::timestamptz>(h.obs->>'collected_at')::timestamptz
   OR (h.obs->>'collected_at')::timestamptz>(h.obs->>'recorded_at')::timestamptz
   OR conflict.session IS NOT NULL
 );
 IF selected IS NULL OR EXISTS(SELECT FROM jsonb_array_elements(selected) p
  CROSS JOIN unnest(ARRAY['raw_open','raw_high','raw_low','raw_close']) AS k(field)
  WHERE jsonb_typeof(p->k.field) IS DISTINCT FROM 'number') THEN RETURN NULL;END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(selected) p
  WHERE (p->>'raw_low')::numeric<=0
   OR (p->>'raw_low')::numeric>least((p->>'raw_open')::numeric,(p->>'raw_close')::numeric)
   OR (p->>'raw_high')::numeric<greatest((p->>'raw_open')::numeric,(p->>'raw_close')::numeric)
   OR (p->>'raw_high')::numeric>9007199254740991) THEN RETURN NULL;END IF;

 SELECT jsonb_agg(value ORDER BY ordinal) INTO recent FROM jsonb_array_elements(selected) WITH ORDINALITY q(value,ordinal)
 WHERE ordinal>jsonb_array_length(selected)-240;
 IF recent IS DISTINCT FROM stored_price->'rawRows' THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('schemaVersion','launch-chart-private-basis-v1','rankingRunId',p_ranking_run_id,
  'symbol',p_symbol,'scoreRevision',score_row.score_revision,'cutoff',score_row.input_cutoff,
  'scorePriceRevision',stored_price->>'priceRevision','calendar',calendar,'rawRows',selected,'knownAt',known_at,
  'rawSeriesRevision',public.vnext_launch_csv_hash_v1(jsonb_build_array('launch-chart-private-basis-v1',
   p_ranking_run_id,score_row.score_revision,p_symbol,score_row.input_cutoff,calendar->>'calendarRevision',selected)));
END $$;
ALTER FUNCTION public.vnext_launch_chart_basis_internal_v1(uuid,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_chart_basis_internal_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
