import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const migration = file => fs.readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8');
const ranking = migration('20261115_vnext_launch_ranking_v1.sql');
const turnover = migration('20261116_29_vnext_launch_twse_turnover_source_v1.sql');
const cashWindow = migration('20261116_30_vnext_launch_twse_cash_window_v1.sql');

function routine(name) {
  const start = ranking.indexOf('CREATE FUNCTION public.' + name + '(');
  assert.notEqual(start, -1);
  const opening = ranking.indexOf(' AS $$', start);
  const end = ranking.indexOf('$$;', opening + 6);
  assert.ok(opening > start && end > opening);
  return ranking.slice(start, end + 3);
}

const schema = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE stockinsider_vnext_owner;
CREATE TABLE public.vnext_members_v1(symbol text, state text, input_hash text, contraindication boolean, evidence jsonb);
CREATE TABLE public.vnext_publications_v1(revision_id uuid, symbol text, input_hash text, published_at timestamptz, job_id uuid);
CREATE TABLE public.vnext_jobs_v1(job_id uuid, symbol text, state text, sources_read_at timestamptz);
CREATE TABLE public.vnext_provider_invocations_v1(job_id uuid, state text);
CREATE TABLE public.vnext_launch_ranking_snapshots_v1(ordinal bigint,ranking_run_id uuid, snapshot jsonb);
CREATE TABLE public.vnext_launch_ranking_mode_v1(enabled boolean);
CREATE TABLE public.vnext_launch_score_evidence_v1(score_revision uuid);
CREATE TABLE public.vnext_launch_qualifications_v1(qualification_revision uuid);
CREATE TABLE public.stock_instruments_v3(
 instrument_authority_id uuid,stock_id uuid,symbol text,exchange text,source_timestamp timestamptz,recorded_at timestamptz
);
CREATE TABLE public.tw_trading_sessions_v3(
 session_authority_id uuid,session_id date,market text,status text,provider text,open_at timestamptz,close_at timestamptz,
 source_timestamp timestamptz,collected_at timestamptz,recorded_at timestamptz
);
CREATE TABLE public.vnext_source_policies_v1(source text,scope text,enabled boolean,valid_until timestamptz);
CREATE TABLE public.vnext_launch_csv_captures_v1(
 capture_id uuid,attempt_id uuid,artifact_hash text,coverage text,pool_targets jsonb,pool_revision text,rights_binding_hash text,
 observed_at timestamptz,available_at timestamptz,recorded_at timestamptz,dataset_id integer,request_key text,source_url text,provider text
);
CREATE TABLE public.vnext_launch_csv_ready_acks_v1(capture_id uuid,ack_id uuid,recorded_at timestamptz);
CREATE TABLE public.vnext_launch_csv_outcomes_v1(capture_id uuid,attempt_id uuid,outcome text);
CREATE TABLE public.vnext_launch_csv_attempts_v1(attempt_id uuid,job_id uuid);
CREATE TABLE public.vnext_launch_csv_bindings_v1(job_id uuid,dataset_id integer,capture_generation date,created_at timestamptz);
CREATE TABLE public.vnext_launch_csv_facts_v1(capture_id uuid,session_date date,symbol text,traded_ntd bigint,fact_hash text);
CREATE FUNCTION public.vnext_launch_csv_hash_v1(value jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex')
$$;
CREATE FUNCTION public.vnext_launch_csv_profile_v1(dataset integer,key text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('sourceUrl','https://example.invalid/'||dataset::text,
 'coverage',CASE dataset WHEN 11549 THEN 'twse_11549_reported_turnover_v1' WHEN 11370 THEN 'tpex_11370_all_sessions_v1' END)
$$;
CREATE FUNCTION public.vnext_trading_invalid_current_v1(text,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE FUNCTION public.vnext_business_criteria_current_v1(uuid,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE FUNCTION public.vnext_input_sources_current_v1(jsonb,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
-- Source parser installed by 20261116_29. This fixture exercises already checked and ACKed operands.
CREATE FUNCTION public.vnext_launch_twse_turnover_derive_v1(jsonb,bytea) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE FUNCTION public.vnext_launch_instrument_v1(target text,cutoff timestamptz) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('stockId',stock_id,'exchange',exchange,'instrumentType','common_stock',
  'listingStatus','active','recordedAt',recorded_at,'sourceAt',source_timestamp,'validFrom','2026-01-01T00:00:00Z')
 FROM public.stock_instruments_v3 WHERE symbol=target AND recorded_at<=cutoff
$$;
CREATE FUNCTION public.vnext_launch_annual_rows_internal_v1(venue text,first_day date,last_day date,cutoff timestamptz)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_agg(jsonb_build_object('knownAt','2026-01-01T00:00:00Z','jobId','fixture','row',
  jsonb_build_object('session',d::date,'provider',lower(venue),'sourceSha256',repeat('a',64),
   'sourceRef',lower(venue)||'-annual-calendar:2026:'||d::date::text||':'||repeat('a',64),
   'sourceUrl',CASE venue WHEN 'TWSE' THEN 'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date=20260101'
                         ELSE 'https://www.tpex.org.tw/storage/zh-tw/web/bulletin/trading_date/trading_date_115.htm' END,
   'status',CASE WHEN extract(isodow FROM d)<=5 AND d::date<>'2026-10-06' THEN 'completed' ELSE 'holiday' END,
   'sourceTimestamp','2026-01-01T00:00:00Z','collectedAt','2026-01-01T00:00:00Z')) ORDER BY d)
 FROM generate_series(first_day,last_day,interval '1 day') x(d)
$$;
INSERT INTO public.vnext_members_v1 VALUES
 ('2330','active',repeat('1',64),false,'{}'),('6488','active',repeat('2',64),false,'{}');
INSERT INTO public.stock_instruments_v3
 SELECT gen_random_uuid(),md5(symbol)::uuid,symbol,venue,timestamptz '2026-01-03T00:00Z',timestamptz '2026-01-03T00:01Z'
 FROM (VALUES('2330','TWSE'),('6488','TPEX')) m(symbol,venue);
INSERT INTO public.tw_trading_sessions_v3
 SELECT md5(venue||d::date::text)::uuid,d::date,venue,'completed',lower(venue),
  (d::date+time '01:00') AT TIME ZONE 'UTC',
  (d::date+time '05:30') AT TIME ZONE 'UTC',(d::date+time '05:30') AT TIME ZONE 'UTC',
  (d::date+time '05:30:05') AT TIME ZONE 'UTC',(d::date+time '05:30:10') AT TIME ZONE 'UTC'
 FROM generate_series(date '2026-09-21',date '2026-10-22',interval '1 day') x(d)
 CROSS JOIN (VALUES('TWSE'),('TPEX')) m(venue)
 WHERE extract(isodow FROM d)<=5 AND d::date<>'2026-10-06';
INSERT INTO public.vnext_source_policies_v1 VALUES ('official','official_original',true,'2999-01-01T00:00:00Z');
CREATE FUNCTION public.seed_cash(dataset integer,day date,symbol text,amount bigint,ready_at timestamptz,variant text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE id uuid:=md5(dataset::text||day::text||variant)::uuid;
 observed timestamptz:=(day+time '06:00') AT TIME ZONE 'UTC';
 profile jsonb:=public.vnext_launch_csv_profile_v1(dataset,day::text);
BEGIN
 INSERT INTO public.vnext_launch_csv_bindings_v1 VALUES(id,dataset,day,observed-interval '1 minute');
 INSERT INTO public.vnext_launch_csv_attempts_v1 VALUES(id,id);
 INSERT INTO public.vnext_launch_csv_captures_v1 VALUES(id,id,repeat('a',64),profile->>'coverage',
  CASE dataset WHEN 11549 THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('symbol','6488','inputHash',repeat('2',64),'state','active')) END,
  repeat('b',64),(SELECT public.vnext_launch_csv_hash_v1(to_jsonb(p)) FROM public.vnext_source_policies_v1 p),
  observed,observed,observed,dataset,day::text,profile->>'sourceUrl',CASE dataset WHEN 11549 THEN 'twse' ELSE 'tpex' END);
 INSERT INTO public.vnext_launch_csv_outcomes_v1 VALUES(id,id,'complete');
 IF ready_at IS NOT NULL THEN INSERT INTO public.vnext_launch_csv_ready_acks_v1 VALUES(id,id,ready_at);END IF;
 IF symbol IS NOT NULL THEN INSERT INTO public.vnext_launch_csv_facts_v1 VALUES(id,day,symbol,amount,repeat('c',64));END IF;
END $$;
`;

test('native TWSE cash gate binds 20 official-calendar slots and the exact frozen source lineage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-twse-cash-window-pg-'));
  const data = path.join(root, 'pg'), port = String(55000 + process.pid % 5000);
  const binary = name => process.env.OPPORTUNITY_V3_POSTGRES_BIN ? path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN, name) : name;
  const run = (name,args,input) => spawnSync(binary(name),args,{
    input, encoding:'utf8', timeout:30000, env:{...process.env,LC_ALL:'C',TZ:'UTC'},
  });
  const success = result => {
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  };
  const psql = input => run('psql',['-X','-q','-At','-v','ON_ERROR_STOP=1','-h',root,'-p',port,'-U','lab','-d','postgres'],input);
  const sql = input => success(psql(input));
  const pinnedRoutines = ['vnext_launch_cash_calendar_internal_v1','vnext_launch_rank_preflight_v1','vnext_launch_qualification_checks_v1',
    'vnext_launch_ranking_command_v1','vnext_launch_live_v1'];
  const metadata = () => sql('SELECT jsonb_agg(to_jsonb(p)-\'prosrc\' ORDER BY proname) FROM pg_proc p'+
    ' WHERE pronamespace=\'public\'::regnamespace AND proname IN ('+pinnedRoutines.map(name=>"'"+name+"'").join(',')+');');
  const requestDay = '2026-10-22', cutoff = '2026-10-22T13:30:00Z';
  const preflight = (symbol='2330',digest='1') => JSON.parse(sql('SELECT public.vnext_launch_rank_preflight_v1(\''+
    symbol+'\',repeat(\''+digest+'\',64),\''+requestDay+'\',\''+cutoff+'\');'));
  const selection = result => ({
    calendar:{sessions:result.cashCalendar.sessions},price:{priceBasis:'adjusted_to_signal_session',anchor:requestDay},
    technicalInventory:[],institutionalInventory:[],flowInventory:[],indexInventory:[],score:{availableWeight:100},
    ...(result.cashWindow?{cashWindow:result.cashWindow}:{}),
  });
  const qualifies = selected => JSON.parse(sql("SELECT public.vnext_launch_qualification_checks_v1('2330',NULL,"+
    "repeat('1',64),$selected$"+JSON.stringify(selected)+"$selected$::jsonb,'"+cutoff+"');"));
  let running = false;
  try {
    success(run('initdb',['-D',data,'-U','lab','-A','trust','--no-locale','--encoding=UTF8']));
    success(run('pg_ctl',['-D',data,'-l',path.join(root,'pg.log'),'-w','-o','-c listen_addresses= -k '+root+' -p '+port,'start']));
    running = true;
    sql(schema + ['vnext_launch_source_fact_v1',...pinnedRoutines].map(routine).join('\n'));
    const start = turnover.indexOf('DO $fact_update$'), end = turnover.indexOf('END $fact_update$;',start);
    assert.ok(start>=0&&end>start);
    sql(turnover.slice(start,end+'END $fact_update$;'.length));
    sql(pinnedRoutines.map(name=>'ALTER FUNCTION public.'+name+' OWNER TO stockinsider_vnext_owner;'+
      'REVOKE ALL ON FUNCTION public.'+name+' FROM PUBLIC,anon,authenticated,service_role;').join('\n'));
    sql('GRANT SELECT ON ALL TABLES IN SCHEMA public TO stockinsider_vnext_owner;');
    const originalMetadata = metadata();
    sql(cashWindow);
    assert.equal(metadata(), originalMetadata);
    assert.match(psql(cashWindow).stderr,/launch_twse_cash_window_predecessor_changed/);
    assert.equal(metadata(), originalMetadata);
    assert.equal(preflight().cashKnown,false);
    // 19 positive facts and one reported zero total exactly NTD 1 billion.
    sql(`
      WITH window_days AS (
       SELECT session_id,row_number() OVER(ORDER BY session_id DESC) n FROM public.tw_trading_sessions_v3 WHERE market='TWSE'
      )
      SELECT public.seed_cash(11549,session_id,'2330',
       CASE n WHEN 20 THEN 0 WHEN 19 THEN 100000000 ELSE 50000000 END,
       (session_id+time '06:05') AT TIME ZONE 'UTC','original')
      FROM window_days WHERE n BETWEEN 2 AND 20;
    `);
    const missing = preflight();
    assert.equal(missing.cashKnown,false);
    assert.equal(missing.cashTotalNtd,null);
    assert.equal(missing.cashInventory.length,19);
    assert.equal(missing.cashWindow,undefined);
    assert.equal(qualifies(selection(missing)).checks.liquidity,null);
    sql("SELECT public.seed_cash(11549,'2026-10-22','2330',50000000,NULL,'unready');");
    assert.equal(preflight().cashKnown,false);
    sql("INSERT INTO public.vnext_launch_csv_ready_acks_v1 SELECT capture_id,capture_id,'2026-10-22T06:05:00Z'"+
      " FROM public.vnext_launch_csv_captures_v1 WHERE request_key='2026-10-22' AND dataset_id=11549;");
    const exact = preflight(), frozen = selection(exact);
    assert.equal(exact.cashTotalNtd,1000000000);
    assert.equal(exact.cashWindow.inventory[0].source.fact.traded_ntd,0);
    assert.equal(exact.cashWindow.inventory.length,20);
    assert.equal(exact.outcome,'unknown');
    assert.equal(qualifies(frozen).checks.liquidity,true);
    assert.equal(qualifies(frozen).qualified,false);
    const reversed = {...frozen, cashWindow:{...frozen.cashWindow, inventory:[...frozen.cashWindow.inventory].reverse()}};
    assert.equal(qualifies(reversed).checks.liquidity,null);
    sql("UPDATE public.vnext_launch_csv_facts_v1 SET traded_ntd=49999999 WHERE session_date='2026-10-22' AND symbol='2330';");
    const below = preflight();
    assert.equal(below.outcome,'known_reject');
    assert.equal(below.reason,'illiquid');
    assert.equal(below.cashTotalNtd,999999999);
    assert.equal(qualifies(selection(below)).checks.liquidity,false);
    sql("SELECT public.seed_cash(11549,'2026-10-22',NULL,NULL,'2026-10-22T13:31:00Z','postcutoff-head');");
    const afterClose = preflight();
    assert.equal(afterClose.cashKnown,false);
    assert.equal(afterClose.cashWindow,undefined);
    assert.equal(afterClose.reason,null);
    sql(`
      WITH window_days AS (
       SELECT session_id,row_number() OVER(ORDER BY session_id DESC) n FROM public.tw_trading_sessions_v3 WHERE market='TPEX'
      )
      SELECT public.seed_cash(11370,session_id,'6488',49999999,(session_id+time '06:05') AT TIME ZONE 'UTC','original')
      FROM window_days WHERE n<=20;
    `);
    const unchangedTpex = preflight('6488','2');
    assert.equal(unchangedTpex.reason,'illiquid');
    assert.equal(unchangedTpex.cashCoverage,'tpex_11370_all_sessions_v1');
    assert.equal(unchangedTpex.cashWindow,undefined);
  } finally {
    if (running) success(run('pg_ctl',['-D',data,'-w','-m','immediate','stop']));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
