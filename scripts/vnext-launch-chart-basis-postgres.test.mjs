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
const baseline = fs.readFileSync(new URL('../migrations/20261115_vnext_launch_ranking_v1.sql',import.meta.url),'utf8');
const migration = fs.readFileSync(new URL('../migrations/20261116_20_vnext_launch_chart_basis_v1.sql',import.meta.url),'utf8');
const extractFunction = (name) => {
  const start = baseline.indexOf('CREATE FUNCTION public.'+name+'(');
  assert.ok(start >= 0, name);
  const end = baseline.indexOf('\nEND $$;',start);
  assert.ok(end >= start, name);
  return baseline.slice(start,end+8);
};

test('native launch chart basis preserves predecessor calendar, cutoff, row bindings and private ACLs',()=>{
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
    sql(verify);
  } finally {
    if (started) run('pg_ctl',['-D',data,'-w','-m','immediate','stop']);
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
