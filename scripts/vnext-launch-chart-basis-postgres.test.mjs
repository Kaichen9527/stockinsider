import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const fixture = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE stockinsider_vnext_owner NOLOGIN;
CREATE ROLE opportunity_v3_rpc_owner NOLOGIN;

CREATE TABLE public.tw_trading_sessions_v3(
 session_authority_id uuid DEFAULT gen_random_uuid(), market text, session_id date, status text, provider text,
 open_at timestamptz, close_at timestamptz, source_timestamp timestamptz,collected_at timestamptz,recorded_at timestamptz
);
CREATE TABLE public.opportunity_price_observations_v3(
 observation_id uuid DEFAULT gen_random_uuid(),stock_id uuid,exchange text,session_id date,session_authority_id uuid,
 raw_open numeric,raw_high numeric,raw_low numeric,raw_close numeric,provider text,source_timestamp timestamptz,
 collected_at timestamptz,source_ref text,recorded_at timestamptz
);
CREATE TABLE public.vnext_launch_ranking_snapshots_v1(ranking_run_id uuid,session_date date,input_cutoff timestamptz);
CREATE TABLE public.vnext_launch_ranking_members_v1(ranking_run_id uuid,symbol text,score_revision uuid,research_revision uuid,input_hash text,rank integer);
CREATE TABLE public.vnext_launch_score_evidence_v1(score_revision uuid,research_revision uuid,symbol text,input_hash text,
 signal_session date,input_cutoff timestamptz,source_inputs jsonb,source_hash text);
CREATE TABLE public.fixture_annual(market text,day date,status text,known_at timestamptz DEFAULT '2024-02-29T07:00Z');

GRANT SELECT ON public.tw_trading_sessions_v3,public.fixture_annual,public.opportunity_price_observations_v3 TO opportunity_v3_rpc_owner;
GRANT SELECT ON public.vnext_launch_ranking_snapshots_v1,public.vnext_launch_ranking_members_v1,
 public.vnext_launch_score_evidence_v1 TO stockinsider_vnext_owner;

CREATE FUNCTION public.vnext_launch_csv_hash_v1(value jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex')
$$;
-- This fixture isolates the actual calendar and raw selectors. It provides the
-- output shape of the verified annual acquisition routine, never a source receipt.
CREATE FUNCTION public.vnext_launch_annual_rows_internal_v1(venue text,first_day date,last_day date,cutoff timestamptz) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_agg(jsonb_build_object('row',jsonb_build_object('session',day,'provider',lower(venue),'status',status,
  'sourceSha256',repeat('a',64),'sourceRef',lower(venue)||'-annual-calendar:'||extract(year FROM day)::text||':'||day::text||':'||repeat('a',64),
  'sourceUrl',CASE venue WHEN 'TWSE' THEN 'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date='||extract(year FROM day)::integer::text||'0101'
   ELSE 'https://www.tpex.org.tw/storage/zh-tw/web/bulletin/trading_date/trading_date_'||(extract(year FROM day)::integer-1911)::text||'.htm' END,
  'sourceTimestamp',known_at-interval '1 hour','collectedAt',known_at),'knownAt',known_at,'jobId','fixture') ORDER BY day)
 FROM public.fixture_annual WHERE market=venue AND day BETWEEN first_day AND last_day AND known_at<=cutoff
$$;

INSERT INTO public.fixture_annual(market,day,status)
 SELECT market,calendar.day::date,CASE WHEN calendar.day::date='2021-12-31' THEN 'holiday' ELSE 'completed' END
 FROM unnest(ARRAY['TWSE','TPEX']) market CROSS JOIN generate_series('2018-12-31'::date,'2024-02-29'::date,interval '1 day') calendar(day)
 WHERE extract(isodow FROM calendar.day)<6;
INSERT INTO public.tw_trading_sessions_v3(market,session_id,status,provider,open_at,close_at,source_timestamp,collected_at,recorded_at)
 SELECT market,day,status,lower(market),(day::text||'T01:00Z')::timestamptz,(day::text||'T05:30Z')::timestamptz,(day::text||'T05:30Z')::timestamptz,(day::text||'T06:00Z')::timestamptz,(day::text||'T07:00Z')::timestamptz
 FROM public.fixture_annual WHERE status='completed';
INSERT INTO public.opportunity_price_observations_v3(stock_id,exchange,session_id,session_authority_id,raw_open,raw_high,raw_low,raw_close,
 provider,source_timestamp,collected_at,source_ref,recorded_at)
 SELECT CASE market WHEN 'TWSE' THEN md5('listed')::uuid ELSE md5('otc')::uuid END,market,session_id,session_authority_id,
  101,105,98,103,lower(market),close_at,collected_at,lower(market)||'-fixture',recorded_at
 FROM public.tw_trading_sessions_v3;
`;
const seed = `
-- Seed two genuine-format but synthetic frozen score records before the migration.
CREATE TABLE public.fixture_predecessor AS
 SELECT venue, sessions,
  public.vnext_launch_calendar_v1(venue,'2024-02-29','2024-02-29T13:30Z',sessions) packet
 FROM unnest(ARRAY['TWSE','TPEX']) venue CROSS JOIN unnest(ARRAY[240,520]) sessions;
DO $seed$
DECLARE v text; stock uuid; matches jsonb; selected jsonb; calendar jsonb; settings jsonb;
BEGIN
 FOR v IN SELECT unnest(ARRAY['TWSE','TPEX']) LOOP
  stock:=CASE v WHEN 'TWSE' THEN md5('listed')::uuid ELSE md5('otc')::uuid END;
  SELECT packet INTO calendar FROM public.fixture_predecessor WHERE venue=v AND sessions=240;
  IF calendar IS NULL THEN RAISE EXCEPTION 'fixture calendar resolution';END IF;
  matches:=public.vnext_launch_price_rows_internal_v1(stock,v,(calendar->'sessions'->0->>'session_id')::date,'2024-02-29','2024-02-29T13:30Z');
  selected:=jsonb_build_object('schemaVersion','launch-db-selected-price-v1','priceBasis','adjusted_to_signal_session',
   'anchor','2024-02-29','priceRevision',repeat('e',64),'calendarRevision',calendar->>'calendarRevision','rawRows',matches);
  settings:=jsonb_build_object('price',selected,'calendar',calendar);
  INSERT INTO public.vnext_launch_ranking_snapshots_v1 VALUES(md5(v||'run')::uuid,'2024-02-29','2024-02-29T13:30Z');
  INSERT INTO public.vnext_launch_ranking_members_v1 VALUES(md5(v||'run')::uuid,'2330',md5(v||'score')::uuid,md5(v||'research')::uuid,'fixture',1);
  INSERT INTO public.vnext_launch_score_evidence_v1 VALUES(md5(v||'score')::uuid,md5(v||'research')::uuid,'2330','fixture',
   '2024-02-29','2024-02-29T13:30Z',settings,public.vnext_launch_csv_hash_v1(settings));
 END LOOP;
END $seed$;
`;
const verify = `
DO $verify$
DECLARE packet jsonb; leap_window jsonb; quote jsonb; old_row record; v text; first_day date;
BEGIN
 FOR old_row IN SELECT * FROM public.fixture_predecessor LOOP
  IF old_row.packet IS NULL OR old_row.packet IS DISTINCT FROM public.vnext_launch_calendar_v1(old_row.venue,'2024-02-29','2024-02-29T13:30Z',old_row.sessions)
   THEN RAISE EXCEPTION '240 or 520 predecessor changed';END IF;
 END LOOP;
 IF public.vnext_launch_calendar_v1('TWSE','2024-02-29','2024-02-29T13:30Z') IS DISTINCT FROM
  (SELECT p.packet FROM public.fixture_predecessor p WHERE p.venue='TWSE' AND p.sessions=240)
  OR public.vnext_launch_calendar_v1('TWSE','2024-02-29','2024-02-29T13:30Z',NULL) IS NOT NULL
  THEN RAISE EXCEPTION 'old wrapper is not closed to its selected windows';END IF;
 IF has_function_privilege('service_role','public.vnext_launch_chart_basis_internal_v1(uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.vnext_launch_chart_calendar_internal_v1(text,date,timestamptz)','EXECUTE')
  OR has_function_privilege('anon','public.vnext_launch_chart_calendar_internal_v1(text,date,timestamptz)','EXECUTE')
  OR NOT has_function_privilege('stockinsider_vnext_owner','public.vnext_launch_chart_calendar_internal_v1(text,date,timestamptz)','EXECUTE')
  THEN RAISE EXCEPTION 'unexpected new RPC grant';END IF;

 FOR v IN SELECT unnest(ARRAY['TWSE','TPEX']) LOOP
  leap_window:=public.vnext_launch_chart_calendar_internal_v1(v,'2024-02-29','2024-02-29T13:30Z');
  packet:=public.vnext_launch_chart_basis_internal_v1(md5(v||'run')::uuid,'2330');
  IF leap_window->>'displayFrom' IS DISTINCT FROM '2021-02-28' OR leap_window->>'warmupSessions' IS DISTINCT FROM '239'
   OR leap_window->'sessions'->-1->>'session_id' IS DISTINCT FROM '2024-02-29'
   OR (SELECT count(*) FROM jsonb_array_elements(leap_window->'sessions') r WHERE r->>'session_id'<leap_window->>'displayFrom')<>239
   OR EXISTS(SELECT FROM jsonb_array_elements(leap_window->'sessions') r WHERE r->>'session_id'='2021-12-31')
   THEN RAISE EXCEPTION 'visible/warmup calendar corruption';END IF;
  first_day:=(leap_window->'sessions'->0->>'session_id')::date;
  IF packet IS NULL OR packet->>'scorePriceRevision' IS DISTINCT FROM repeat('e',64)
   OR packet->'calendar' IS DISTINCT FROM leap_window OR '2024-02-29'::date-first_day<=900
   OR jsonb_array_length(packet->'rawRows')<>jsonb_array_length(leap_window->'sessions')
   OR (packet->>'knownAt')::timestamptz>'2024-02-29T13:30Z'::timestamptz
   OR packet ? 'candles' OR packet ? 'chart' THEN RAISE EXCEPTION 'private chart basis unbound';END IF;
  IF public.vnext_launch_chart_basis_internal_v1(md5('missing run')::uuid,'2330') IS NOT NULL
   OR public.vnext_launch_chart_basis_internal_v1(md5(v||'run')::uuid,'9999') IS NOT NULL
   THEN RAISE EXCEPTION 'run/symbol leaked';END IF;
  UPDATE public.vnext_launch_ranking_members_v1 SET rank=NULL WHERE ranking_run_id=md5(v||'run')::uuid;
  IF public.vnext_launch_chart_basis_internal_v1(md5(v||'run')::uuid,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'unranked candidate acquired a chart basis';END IF;
  UPDATE public.vnext_launch_ranking_members_v1 SET rank=1 WHERE ranking_run_id=md5(v||'run')::uuid;

  -- Late corrections cannot change a previously selected cutoff. An older
  -- available correction superseding the frozen tail disables the bridge.
  INSERT INTO public.opportunity_price_observations_v3
   SELECT gen_random_uuid(),stock_id,exchange,session_id,session_authority_id,raw_open,raw_high,raw_low,104,
    provider,source_timestamp,collected_at,source_ref,'2024-03-04T08:00Z'
   FROM public.opportunity_price_observations_v3 WHERE exchange=v AND session_id='2024-02-29';
  IF packet IS DISTINCT FROM public.vnext_launch_chart_basis_internal_v1(md5(v||'run')::uuid,'2330')
   THEN RAISE EXCEPTION 'post-cutoff price correction altered basis';END IF;
  UPDATE public.opportunity_price_observations_v3 SET recorded_at='2024-02-29T08:00Z'
   WHERE exchange=v AND session_id='2024-02-29' AND raw_close=104;
  IF public.vnext_launch_chart_basis_internal_v1(md5(v||'run')::uuid,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'recent price changed under frozen score';END IF;
  DELETE FROM public.opportunity_price_observations_v3 WHERE exchange=v AND session_id='2024-02-29' AND raw_close=104;

  INSERT INTO public.opportunity_price_observations_v3
   SELECT gen_random_uuid(),stock_id,exchange,session_id,session_authority_id,raw_open,raw_high,raw_low,104,
    provider,source_timestamp,collected_at,source_ref,recorded_at
   FROM public.opportunity_price_observations_v3 WHERE exchange=v AND session_id=first_day;
  IF public.vnext_launch_chart_basis_internal_v1(md5(v||'run')::uuid,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'conflicting highest-priority old price selected';END IF;
  DELETE FROM public.opportunity_price_observations_v3 WHERE exchange=v AND session_id=first_day AND raw_close=104;
  UPDATE public.opportunity_price_observations_v3 SET raw_low=0 WHERE exchange=v AND session_id=first_day;
  IF public.vnext_launch_chart_basis_internal_v1(md5(v||'run')::uuid,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'invalid old OHLC exposed';END IF;
  UPDATE public.opportunity_price_observations_v3 SET raw_low=98 WHERE exchange=v AND session_id=first_day;
  DELETE FROM public.opportunity_price_observations_v3 WHERE exchange=v AND session_id=first_day;
  IF public.vnext_launch_chart_basis_internal_v1(md5(v||'run')::uuid,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'missing old price imputed';END IF;
 END LOOP;
 INSERT INTO public.fixture_annual(market,day,status) VALUES('TWSE','2021-03-05','holiday');
 IF public.vnext_launch_chart_calendar_internal_v1('TWSE','2024-02-29','2024-02-29T13:30Z') IS NOT NULL
  THEN RAISE EXCEPTION 'tied official calendar heads changed the history window';END IF;
 DELETE FROM public.fixture_annual WHERE market='TWSE' AND day='2021-03-05' AND status='holiday';
 UPDATE public.fixture_annual SET known_at='2024-03-04T07:00Z' WHERE market='TWSE' AND day='2021-03-05';
 IF public.vnext_launch_chart_calendar_internal_v1('TWSE','2024-02-29','2024-02-29T13:30Z') IS NOT NULL
  THEN RAISE EXCEPTION 'late annual provenance hid historical calendar gap';END IF;
END $verify$;
`;
const actionSetup = `
CREATE TABLE public.opportunity_corporate_action_snapshots_v3(
 snapshot_id uuid PRIMARY KEY,exchange text,session_id date,session_authority_id uuid,
 corporate_action_version text,provider text,collected_at timestamptz,recorded_at timestamptz,declared_event_count integer,dataset_hash text
);
CREATE TABLE public.opportunity_corporate_action_feed_evidence_v3(
 snapshot_id uuid,feed_ordinal integer,feed_identity text,response_sha256 text,response_byte_count integer,parsed_row_count integer,recorded_at timestamptz
);
CREATE TABLE public.opportunity_corporate_action_events_v3(
 snapshot_id uuid,event_ordinal integer,symbol text,event_kind text,feed_identity text,pre_action_reference_price numeric,
 post_action_reference_price numeric,daily_adjustment_factor numeric,source_row_ref text,recorded_at timestamptz
);
CREATE TABLE public.fixture_action_terms(snapshot_id uuid,ordinal integer,receipt jsonb);
CREATE INDEX fixture_snapshot_venue ON public.opportunity_corporate_action_snapshots_v3(exchange,session_id);
CREATE INDEX fixture_feeds_id ON public.opportunity_corporate_action_feed_evidence_v3(snapshot_id);
CREATE INDEX fixture_events_id ON public.opportunity_corporate_action_events_v3(snapshot_id);
GRANT SELECT ON public.opportunity_corporate_action_snapshots_v3,public.opportunity_corporate_action_feed_evidence_v3,
 public.opportunity_corporate_action_events_v3 TO opportunity_v3_rpc_owner;
GRANT SELECT ON public.fixture_action_terms TO stockinsider_vnext_owner;

-- This adapter provides fixtures for the output of the independently tested
-- publisher and terms reader. It does not give the data any production rights.
CREATE FUNCTION public.vnext_action_terms_current_internal_v1(p_stock uuid,p_symbol text,p_cutoff timestamptz) RETURNS jsonb
LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('receipts',coalesce(jsonb_agg(receipt),'[]'::jsonb))
 FROM public.fixture_action_terms WHERE (receipt->'source'->>'knownAt')::timestamptz<=p_cutoff
$$;
CREATE TABLE public.fixture_adjustment_inputs AS
 SELECT md5(market||session_id::text)::uuid snapshot_id,market,session_id,session_authority_id,lower(market) provider,
  collected_at,recorded_at,
  CASE WHEN market='TWSE' THEN CASE session_id
   WHEN '2022-09-01' THEN 10::numeric WHEN '2023-01-02' THEN 10::numeric WHEN '2023-12-04' THEN 30::numeric END
  END post_price,
  CASE market WHEN 'TWSE' THEN ARRAY['twse:twt49u:v1','twse:twtauu:v1','twse:twtb8u:v1']
   ELSE ARRAY['tpex:exright-cal:v1','tpex:reduction-reference:v1','tpex:change-reference:v1'] END feeds
 FROM public.tw_trading_sessions_v3 WHERE status='completed';

INSERT INTO public.opportunity_corporate_action_feed_evidence_v3
 SELECT f.snapshot_id,n-1,feed,repeat('a',64),512,CASE WHEN n=3 AND f.post_price IS NOT NULL THEN 1 ELSE 0 END,f.recorded_at
 FROM public.fixture_adjustment_inputs f CROSS JOIN LATERAL unnest(f.feeds) WITH ORDINALITY q(feed,n);
INSERT INTO public.opportunity_corporate_action_events_v3
 SELECT snapshot_id,0,'2330','par_value_change',feeds[3],100,post_price,post_price/100,
   public.vnext_launch_csv_hash_v1(jsonb_build_array('corporate-action-source-row-v3.1',market,session_id,'2330',
    'par_value_change',100,post_price,feeds[3])),recorded_at
 FROM public.fixture_adjustment_inputs WHERE post_price IS NOT NULL;

SET timezone='UTC';
INSERT INTO public.opportunity_corporate_action_snapshots_v3
 SELECT f.snapshot_id,f.market,f.session_id,f.session_authority_id,'tw-corporate-action-v3.1',f.provider,f.collected_at,
  f.recorded_at,CASE WHEN f.post_price IS NULL THEN 0 ELSE 1 END,
  public.vnext_launch_csv_hash_v1(jsonb_build_array('corporate-action-snapshot-v3.1',
   f.market,f.session_id,f.session_authority_id,'tw-corporate-action-v3.1',f.provider,to_char(f.collected_at,'YYYY-MM-DD"T"HH24:MI:SS')||'+00:00',
   (SELECT jsonb_agg(jsonb_build_array(e.feed_identity,e.response_byte_count,e.response_sha256,e.parsed_row_count) ORDER BY e.feed_ordinal)
    FROM public.opportunity_corporate_action_feed_evidence_v3 e WHERE e.snapshot_id=f.snapshot_id),
   (SELECT coalesce(jsonb_agg(jsonb_build_array(e.symbol,e.event_kind,e.pre_action_reference_price,e.post_action_reference_price,e.feed_identity,e.source_row_ref)
    ORDER BY e.event_ordinal),'[]'::jsonb) FROM public.opportunity_corporate_action_events_v3 e WHERE e.snapshot_id=f.snapshot_id)))
 FROM public.fixture_adjustment_inputs f;
INSERT INTO public.fixture_action_terms
 SELECT snapshot_id,event_ordinal,jsonb_build_object('event',jsonb_build_object('snapshotId',snapshot_id,'ordinal',event_ordinal,'kind',event_kind),
  'terms',jsonb_build_object('cashDividendPerOldShare',0,'cashReturnPerOldShare',0,'subscriptionCashPerOldShare',0),
  'source',jsonb_build_object('knownAt',recorded_at),'receiptHash',repeat('b',64))
 FROM public.opportunity_corporate_action_events_v3;
`;
const verifyAdjustment = `
CREATE TEMP TABLE fixture_original_score AS SELECT * FROM public.vnext_launch_score_evidence_v1;
DO $adjusted$
DECLARE v text; result jsonb; price jsonb; item record; saved_cutoff timestamptz:='2024-02-29T13:30Z';
 expected_factor double precision:=0.1::double precision*0.1::double precision*0.3::double precision;
BEGIN
 FOR item IN SELECT * FROM public.vnext_launch_score_evidence_v1 LOOP
  v:=item.source_inputs->'price'->'rawRows'->0->>'exchange';
  price:=public.vnext_launch_price_v1((item.source_inputs->'price'->'rawRows'->0->>'stock_id')::uuid,item.symbol,v,item.source_inputs->'calendar',saved_cutoff);
  IF price IS NULL OR price ? 'gap' THEN RAISE EXCEPTION 'fixture must use actual frozen price authority, got %',price->>'gap';END IF;
  UPDATE public.vnext_launch_score_evidence_v1 s
  SET source_inputs=item.source_inputs||jsonb_build_object('price',price),
      source_hash=public.vnext_launch_csv_hash_v1(item.source_inputs||jsonb_build_object('price',price))
  WHERE s.score_revision=item.score_revision;
 END LOOP;

 FOR v IN SELECT unnest(ARRAY['TWSE','TPEX']) LOOP
  result:=public.vnext_launch_chart_adjusted_internal_v1(md5(v||'run')::uuid,'2330');
  IF result IS NULL OR result->>'schemaVersion'<>'launch-chart-private-adjusted-v1'
   OR jsonb_array_length(result->'bars')-jsonb_array_length(result->'actionPins')<>1
   OR result->>'displayFrom'<>'2021-02-28' OR result ? 'candles'
   OR (result->'bars'->-1->>'factor')::double precision<>1
   OR (result->>'knownAt')::timestamptz>saved_cutoff THEN RAISE EXCEPTION 'wrong adjusted chart basis for %',v;END IF;
  IF (result->'bars'->0->>'factor')::double precision IS DISTINCT FROM
   (CASE v WHEN 'TWSE' THEN expected_factor ELSE 1::double precision END)
   THEN RAISE EXCEPTION 'chronological binary64 factor or identity changed';END IF;
 END LOOP;

 IF has_function_privilege('anon','public.vnext_launch_chart_adjusted_internal_v1(uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.vnext_launch_chart_adjusted_internal_v1(uuid,text)','EXECUTE')
  OR has_function_privilege('service_role','public.vnext_launch_chart_adjusted_internal_v1(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'unexpected public adjustment grant';END IF;

 BEGIN
  UPDATE public.fixture_action_terms SET receipt=jsonb_set(receipt,'{terms,cashDividendPerOldShare}','1')
  WHERE snapshot_id=md5('TWSE2022-09-01')::uuid;
  IF public.vnext_launch_chart_adjusted_internal_v1(md5('TWSErun')::uuid,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'unresolved cash was applied';END IF;
  RAISE SQLSTATE 'P1001';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
 END;
 BEGIN
  DELETE FROM public.opportunity_corporate_action_feed_evidence_v3 WHERE snapshot_id=md5('TWSE2022-09-01')::uuid AND feed_ordinal=1;
  IF public.vnext_launch_chart_adjusted_internal_v1(md5('TWSErun')::uuid,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'missing older feed treated as a known action';END IF;
  RAISE SQLSTATE 'P1001';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
 END;
 BEGIN
  UPDATE public.fixture_action_terms SET receipt=jsonb_set(receipt,'{source,knownAt}','"2024-03-01T13:30Z"')
  WHERE snapshot_id=md5('TWSE2022-09-01')::uuid;
  IF public.vnext_launch_chart_adjusted_internal_v1(md5('TWSErun')::uuid,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'future terms filled an old gap';END IF;
  RAISE SQLSTATE 'P1001';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
 END;
 BEGIN
  UPDATE public.fixture_action_terms SET receipt=jsonb_set(receipt,'{receiptHash}',to_jsonb(repeat('c',64)))
  WHERE snapshot_id=md5('TWSE2023-12-04')::uuid;
  IF public.vnext_launch_chart_adjusted_internal_v1(md5('TWSErun')::uuid,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'chart accepted a different receipt than the score';END IF;
  RAISE SQLSTATE 'P1001';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
 END;
 BEGIN
  UPDATE public.vnext_launch_score_evidence_v1
  SET source_inputs=jsonb_set(source_inputs,'{price,bars,239,close}','999')
  WHERE score_revision=md5('TWSEscore')::uuid;
  UPDATE public.vnext_launch_score_evidence_v1 SET source_hash=public.vnext_launch_csv_hash_v1(source_inputs)
  WHERE score_revision=md5('TWSEscore')::uuid;
  IF public.vnext_launch_chart_adjusted_internal_v1(md5('TWSErun')::uuid,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'chart did not compare the exact adjusted overlapping bars';END IF;
  RAISE SQLSTATE 'P1001';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
 END;
END $adjusted$;
UPDATE public.vnext_launch_score_evidence_v1 s SET source_inputs=o.source_inputs, source_hash=o.source_hash
FROM fixture_original_score o WHERE s.score_revision=o.score_revision;
`;
const volumeSetup = `
ALTER TABLE public.vnext_launch_ranking_snapshots_v1 ADD COLUMN snapshot jsonb;
UPDATE public.vnext_launch_ranking_snapshots_v1 SET snapshot=jsonb_build_object('cutoff','2024-02-29T13:30:00+00:00');

CREATE TABLE public.vnext_source_policies_v1(source text,scope text,enabled boolean,valid_until timestamptz);
INSERT INTO public.vnext_source_policies_v1 VALUES('official','official_original',true,'infinity');
CREATE TABLE public.vnext_launch_csv_captures_v1(
 capture_id uuid PRIMARY KEY,attempt_id uuid,artifact_hash text,dataset_id integer,request_key text,source_url text,
 observed_at timestamptz,recorded_at timestamptz,available_at timestamptz,rights_binding_hash text,coverage text,pool_targets jsonb,pool_revision text
);
CREATE TABLE public.vnext_launch_csv_ready_acks_v1(capture_id uuid PRIMARY KEY,ack_id uuid,recorded_at timestamptz);
CREATE TABLE public.vnext_launch_csv_outcomes_v1(attempt_id uuid,capture_id uuid,outcome text);
CREATE TABLE public.vnext_launch_csv_attempts_v1(attempt_id uuid PRIMARY KEY,job_id uuid);
CREATE TABLE public.vnext_launch_csv_bindings_v1(job_id uuid,dataset_id integer);
CREATE TABLE public.vnext_launch_csv_facts_v1(
 capture_id uuid,session_date date,symbol text,raw_open numeric,raw_high numeric,raw_low numeric,raw_close numeric,shares bigint,fact_hash text,
 PRIMARY KEY(capture_id,session_date,symbol)
);
GRANT SELECT ON public.vnext_source_policies_v1,public.vnext_launch_csv_captures_v1,public.vnext_launch_csv_ready_acks_v1,
 public.vnext_launch_csv_outcomes_v1,public.vnext_launch_csv_attempts_v1,public.vnext_launch_csv_bindings_v1,
 public.vnext_launch_csv_facts_v1 TO stockinsider_vnext_owner;
CREATE TABLE public.fixture_chart_captures AS
 SELECT md5('capture'||session_id::text)::uuid capture_id,md5('attempt'||session_id::text)::uuid attempt_id,
  md5('job'||session_id::text)::uuid job_id,md5('ack'||session_id::text)::uuid ack_id,session_id,
  public.vnext_launch_csv_profile_v1(11371,session_id::text) profile,close_at,recorded_at
 FROM public.tw_trading_sessions_v3 WHERE market='TPEX' AND status='completed';
INSERT INTO public.vnext_launch_csv_captures_v1
 SELECT capture_id,attempt_id,repeat('c',64),11371,session_id::text,profile->>'sourceUrl',
  close_at+interval '5 minutes',recorded_at,recorded_at,
  (SELECT public.vnext_launch_csv_hash_v1(to_jsonb(p)) FROM public.vnext_source_policies_v1 p),profile->>'coverage',
  '[{"symbol":"2330","inputHash":"fixture","state":"active"}]'::jsonb,repeat('d',64)
 FROM public.fixture_chart_captures;
INSERT INTO public.vnext_launch_csv_ready_acks_v1 SELECT capture_id,ack_id,recorded_at+interval '5 minutes' FROM public.fixture_chart_captures;
INSERT INTO public.vnext_launch_csv_outcomes_v1 SELECT attempt_id,capture_id,'complete' FROM public.fixture_chart_captures;
INSERT INTO public.vnext_launch_csv_attempts_v1 SELECT attempt_id,job_id FROM public.fixture_chart_captures;
INSERT INTO public.vnext_launch_csv_bindings_v1 SELECT job_id,11371 FROM public.fixture_chart_captures;
INSERT INTO public.vnext_launch_csv_facts_v1 SELECT capture_id,session_id,'2330',101,105,98,103,
 CASE session_id WHEN '2024-02-29' THEN 0 WHEN '2024-02-28' THEN NULL ELSE 30500 END,repeat('c',64)
 FROM public.fixture_chart_captures;
`;
const verifyVolume = `
-- Freeze a score by using the same real 240-day price/action validation.
CREATE TEMP TABLE fixture_volume_original AS SELECT * FROM public.vnext_launch_score_evidence_v1;
DO $volume$
DECLARE item public.vnext_launch_score_evidence_v1; price jsonb; packet jsonb; chart jsonb; chart_id uuid:=md5('TPEXrun')::uuid;
 counter integer; old_day date:='2021-03-05';
BEGIN
 SELECT * INTO item FROM public.vnext_launch_score_evidence_v1 WHERE score_revision=md5('TPEXscore')::uuid;
 price:=public.vnext_launch_price_v1(md5('otc')::uuid,item.symbol,'TPEX',item.source_inputs->'calendar',item.input_cutoff);
 IF price IS NULL OR price ? 'gap' THEN RAISE EXCEPTION 'fixture missing actual price scoring inputs';END IF;
 UPDATE public.vnext_launch_score_evidence_v1
 SET source_inputs=item.source_inputs||jsonb_build_object('price',price),
     source_hash=public.vnext_launch_csv_hash_v1(item.source_inputs||jsonb_build_object('price',price))
 WHERE score_revision=item.score_revision;
 packet:=public.vnext_launch_chart_volume_internal_v1(chart_id,'2330');
 chart:=packet->'chart';
 IF chart IS NULL OR packet->>'datasetId'<>'11371' OR packet->>'volumeBasis'<>'tpex_11371_report_excluding_fixed_price_v1'
  OR chart->>'schemaVersion'<>'launch-frozen-chart-v1' OR chart->>'cutoff'<>'2024-02-29T13:30:00+00:00'
  OR chart->>'priceRevision' IS DISTINCT FROM price->>'priceRevision'
  OR chart->>'actionsRevision' IS DISTINCT FROM price->>'actionsRevision'
  OR coalesce(chart->>'seriesRevision','')!~'^[a-f0-9]{64}$'
  OR chart->'candles'->-1->'volume' IS DISTINCT FROM '0'::jsonb
  OR chart->'candles'->-2->'volume' IS DISTINCT FROM 'null'::jsonb
  OR chart->'candles'->-3->'volume' IS DISTINCT FROM '30500'::jsonb
  OR jsonb_array_length(packet->'sourcePins')<>jsonb_array_length(chart->'candles')
  OR public.vnext_launch_chart_volume_internal_v1(md5('TWSErun')::uuid,'2330') IS NOT NULL
  THEN RAISE EXCEPTION 'chart lost the approved clock, source, score or volume distinction';END IF;
 SELECT count(*) INTO counter FROM jsonb_object_keys(chart);
 IF counter<>11 OR EXISTS(SELECT FROM jsonb_array_elements(chart->'candles') r
  WHERE (SELECT count(*) FROM jsonb_object_keys(r))<>6 OR NOT(r ?& ARRAY['time','open','high','low','close','volume']))
  THEN RAISE EXCEPTION 'chart contains private or extra fields';END IF;
 IF has_function_privilege('anon','public.vnext_launch_chart_volume_internal_v1(uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.vnext_launch_chart_volume_internal_v1(uuid,text)','EXECUTE')
  OR has_function_privilege('service_role','public.vnext_launch_chart_volume_internal_v1(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'unexpected new public RPC grant';END IF;

 BEGIN
  UPDATE public.vnext_launch_csv_ready_acks_v1 SET recorded_at='2024-03-01T13:30Z' WHERE capture_id=md5('capture'||old_day::text)::uuid;
  IF public.vnext_launch_chart_volume_internal_v1(chart_id,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'after-cutoff acknowledgement was accepted';END IF;
  RAISE SQLSTATE 'P1001';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
 END;
 BEGIN
  UPDATE public.vnext_launch_csv_facts_v1 SET raw_open=102 WHERE capture_id=md5('capture'||old_day::text)::uuid;
  IF public.vnext_launch_chart_volume_internal_v1(chart_id,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'different official candle inherited public rights';END IF;
  RAISE SQLSTATE 'P1001';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
 END;
 BEGIN
  UPDATE public.vnext_launch_csv_captures_v1 SET coverage='tpex_11370_all_sessions_v1' WHERE capture_id=md5('capture'||old_day::text)::uuid;
  IF public.vnext_launch_chart_volume_internal_v1(chart_id,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'different volume scope was accepted';END IF;
  RAISE SQLSTATE 'P1001';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
 END;
 BEGIN
  UPDATE public.vnext_source_policies_v1 SET enabled=false;
  IF public.vnext_launch_chart_volume_internal_v1(chart_id,'2330') IS NOT NULL
   THEN RAISE EXCEPTION 'revoked permissions were accepted';END IF;
  RAISE SQLSTATE 'P1001';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
 END;
END $volume$;
UPDATE public.vnext_launch_score_evidence_v1 s SET source_inputs=o.source_inputs, source_hash=o.source_hash
FROM fixture_volume_original o WHERE s.score_revision=o.score_revision;
`;
const baseline = fs.readFileSync(new URL('../migrations/20261115_vnext_launch_ranking_v1.sql',import.meta.url),'utf8');
const migration = fs.readFileSync(new URL('../migrations/20261116_20_vnext_launch_chart_basis_v1.sql',import.meta.url),'utf8');
const adjustment = fs.readFileSync(new URL('../migrations/20261116_21_vnext_launch_chart_adjustment_v1.sql',import.meta.url),'utf8');
const source = fs.readFileSync(new URL('../migrations/20261115_vnext_launch_source_facts_v1.sql',import.meta.url),'utf8');
const chartVolume = fs.readFileSync(new URL('../migrations/20261116_22_vnext_launch_chart_volume_v1.sql',import.meta.url),'utf8');
const extractFunction = (name) => {
  const start = baseline.indexOf('CREATE FUNCTION public.'+name+'(');
  assert.ok(start >= 0, name);
  const end = baseline.indexOf('\nEND $$;',start);
  assert.ok(end >= start, name);
  return baseline.slice(start,end+8);
};

test('native launch chart preserves pricing cutoffs, CA-D1, licensed share volume and private ACLs',()=>{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'stockinsider-launch-chart-pg-'));
  const data = path.join(directory,'data');
  const socket = path.join(directory,'socket');
  fs.mkdirSync(socket);
  const port = String(55000+(process.pid%5000));
  const bin = (name) => process.env.OPPORTUNITY_V3_POSTGRES_BIN ? path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN,name) : name;
  const run = (name,args,input) => {
    const result = spawnSync(bin(name),args,{input,encoding:'utf8',timeout:45000,env:{...process.env,LC_ALL:'C',TZ:'UTC'}});
    assert.equal(result.status,0,result.stderr||result.stdout||result.error?.message);
    return result.stdout.trim();
  };
  const sql = (text) => run('psql',['-X','-Atq','-h',socket,'-p',port,'-U','lab','-d','postgres','-v','ON_ERROR_STOP=1'],text);
  let started = false;
  try {
    run('initdb',['-D',data,'-U','lab','-A','trust','--no-locale','--encoding=UTF8']);
    run('pg_ctl',['-D',data,'-l',path.join(directory,'server.log'),'-w','-o',`-c listen_addresses= -k ${socket} -p ${port}`,'start']);
    started = true;
    sql(fixture + extractFunction('vnext_launch_calendar_v1') + '\n' +
      'ALTER FUNCTION public.vnext_launch_calendar_v1(text,date,timestamptz,integer) OWNER TO opportunity_v3_rpc_owner;\n' +
      'REVOKE ALL ON FUNCTION public.vnext_launch_calendar_v1(text,date,timestamptz,integer) FROM PUBLIC;\n' +
      'GRANT EXECUTE ON FUNCTION public.vnext_launch_calendar_v1(text,date,timestamptz,integer) TO stockinsider_vnext_owner;\n' +
      extractFunction('vnext_launch_price_rows_internal_v1') + '\n' +
      'ALTER FUNCTION public.vnext_launch_price_rows_internal_v1(uuid,text,date,date,timestamptz) OWNER TO opportunity_v3_rpc_owner;\n' +
      'REVOKE ALL ON FUNCTION public.vnext_launch_price_rows_internal_v1(uuid,text,date,date,timestamptz) FROM PUBLIC;\n' +
      'GRANT EXECUTE ON FUNCTION public.vnext_launch_price_rows_internal_v1(uuid,text,date,date,timestamptz) TO stockinsider_vnext_owner;\n' +
      seed);
    sql(migration);
    const finiteStart = baseline.indexOf('CREATE FUNCTION public.vnext_launch_finite_v1(');
    const finiteEnd = baseline.indexOf('\n$$;',finiteStart);
    assert.ok(finiteStart >= 0 && finiteEnd > finiteStart);
    sql(actionSetup + baseline.slice(finiteStart,finiteEnd+4) + '\n' +
      extractFunction('vnext_launch_action_day_v1') + '\n' + extractFunction('vnext_launch_price_v1'));
    sql(adjustment);
    sql(verifyAdjustment);
    const profileStart = source.indexOf('CREATE FUNCTION public.vnext_launch_csv_profile_v1(');
    const profileEnd = source.indexOf('END $profile$;',profileStart);
    assert.ok(profileStart >= 0 && profileEnd > profileStart);
    sql(source.slice(profileStart,profileEnd+'END $profile$;'.length) +'\n' +
      volumeSetup + extractFunction('vnext_launch_source_fact_v1'));
    sql(chartVolume);
    sql(verifyVolume);
    sql(verify);
  } finally {
    if (started) run('pg_ctl',['-D',data,'-w','-m','immediate','stop']);
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
