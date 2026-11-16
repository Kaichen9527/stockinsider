import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const fixture = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE stockinsider_vnext_owner;
CREATE TABLE public.vnext_launch_ranking_mode_v1(singleton boolean,enabled boolean,required_writer_release text);
INSERT INTO public.vnext_launch_ranking_mode_v1 VALUES(true,true,'fixture-release');
CREATE TABLE public.vnext_sessions_v1(session_date date PRIMARY KEY,close_at timestamptz NOT NULL,completed boolean NOT NULL);
CREATE TABLE public.vnext_launch_outcome_signals_v1(ranking_run_id uuid,symbol text,market text,signal_session date,published_at timestamptz);
CREATE TABLE public.vnext_launch_outcome_versions_v1(ranking_run_id uuid,symbol text,policy_version text,as_of timestamptz,result jsonb);
ALTER TABLE public.vnext_sessions_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_sessions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_sessions_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.vnext_launch_ranking_mode_v1,
 public.vnext_launch_outcome_signals_v1,public.vnext_launch_outcome_versions_v1 TO stockinsider_vnext_owner;
CREATE FUNCTION public.vnext_launch_csv_policy_v1(text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('requiredWriterRelease','fixture-release')
$$;
CREATE FUNCTION public.vnext_launch_csv_backend_v1(uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('writerRelease','fixture-release')
$$;
CREATE FUNCTION public.vnext_launch_cycle_context_v1(text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('ready',true,'session',left(current_setting('fixture.day'),10),'cutoff',current_setting('fixture.day'))
$$;
CREATE FUNCTION public.vnext_launch_annual_rows_internal_v1(text,date,date,timestamptz) RETURNS jsonb LANGUAGE sql AS $$
 SELECT '[]'::jsonb
$$;
INSERT INTO public.vnext_sessions_v1
 SELECT day::date, day::date + time '05:30', true
 FROM generate_series(date '2026-11-02',date '2026-11-13',interval '1 day') day
 WHERE extract(isodow FROM day)<6 AND day::date<>'2026-11-04';
INSERT INTO public.vnext_sessions_v1 VALUES
 ('2026-11-04','2026-11-04T05:30Z',false),('2026-11-08','2026-11-20T05:30Z',true);
-- Fourteen preceding ranking snapshots with eight repeating stock symbols.
INSERT INTO public.vnext_launch_outcome_signals_v1
 SELECT md5(signal_day::text)::uuid,(2300+n)::text,'TWSE',signal_day,signal_day+time '13:30'
 FROM (SELECT dates::date AS signal_day FROM generate_series(date '2026-10-07',date '2026-10-30',interval '1 day') dates
  WHERE extract(isodow FROM dates)<6 AND dates::date NOT IN ('2026-10-09','2026-10-23','2026-10-26')
  ORDER BY dates DESC LIMIT 14) snapshots CROSS JOIN generate_series(1,8) n;`;

const migrate = (name) => fs.readFileSync(new URL('../migrations/' + name,import.meta.url),'utf8');
const original = '20261116_03_vnext_launch_outcome_batch_v1.sql';
const correction = '20261116_27_vnext_launch_outcome_session_rotation_v1.sql';
const signature = 'public.vnext_launch_outcome_batch_v1(text,uuid,timestamptz,integer)';
const days = [2,3,5,6,9,10,11,12,13];

test('the native outcome batch advances through the stable work ring on trading sessions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'launch-outcome-batch-pg-'));
  const data = path.join(root,'data');
  const port = String(55000 + process.pid % 5000);
  const binary = (name) => process.env.OPPORTUNITY_V3_POSTGRES_BIN ? path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN,name) : name;
  const command = (name,args,input) => spawnSync(binary(name),args,{
    input,encoding:'utf8',timeout:30000,env:{...process.env,LC_ALL:'C',TZ:'UTC'},
  });
  const check = (result) => {
    assert.equal(result.status,0,result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  };
  const psql = (input) => command('psql',['-X','-q','-v','ON_ERROR_STOP=1','-h',root,'-p',port,'-U','lab','-d','postgres','-At'],input);
  const sql = (input) => check(psql(input));
  const asOf = (day) => '2026-11-' + String(day).padStart(2,'0') + 'T13:30:00Z';
  const run = (day) => JSON.parse(sql(`
    SET ROLE service_role;
    SET fixture.day='${asOf(day)}';
    SELECT public.vnext_launch_outcome_batch_v1('op',
      '00000000-0000-4000-8000-000000000001','${asOf(day)}',16);
  `));
  const key = (row) => row.rankingRunId + ':' + row.symbol;
  const union = (batches) => new Set(batches.flatMap(result => result.signals.map(key)));
  let started = false;
  try {
    check(command('initdb',['-D',data,'-U','lab','-A','trust','--no-locale','--encoding=UTF8']));
    check(command('pg_ctl',['-D',data,'-l',path.join(root,'server.log'),'-w','-o',`-c listen_addresses= -k ${root} -p ${port}`,'start']));
    started = true;
    sql(fixture);
    sql(migrate(original));
    const oldBatches = days.map(run);
    assert.equal(union(oldBatches).size,80,'two civil-date rotations omit the same weekend buckets');
    const routine = () => sql(`SELECT oid,proowner,proacl,prosecdef,proconfig FROM pg_proc WHERE oid='${signature}'::regprocedure;`);
    const priorRoutine = routine();
    sql(migrate(correction));
    assert.equal(routine(),priorRoutine,'preserve the existing signature, owner, ACL and settings');
    const batches = days.map(run);
    assert.ok(batches.every(batch => batch.available === 112 && batch.signals.length === 16));
    assert.equal(union(batches.slice(0,7)).size,112,'each of seven completed sessions advances exactly one batch');
    assert.deepEqual(batches[7].signals,batches[0].signals);
    assert.deepEqual(run(days[7]),batches[7],'unwritten same-cutoff retry selects the same work');
    assert.equal(sql(`SELECT has_function_privilege('anon','${signature}','EXECUTE'),
      has_function_privilege('authenticated','${signature}','EXECUTE'),
      has_function_privilege('service_role','${signature}','EXECUTE');`),'f|f|t');

    const excluded = batches[0].signals.slice(0,2);
    sql(`INSERT INTO public.vnext_launch_outcome_versions_v1 VALUES
      ('${excluded[0].rankingRunId}','${excluded[0].symbol}','launch-outcomes-v1','2026-11-01T13:30Z',
       '{"research":{"horizons":[{},{},{"state":"ready"}]},"execution":{"status":"unfillable"}}'),
      ('${excluded[1].rankingRunId}','${excluded[1].symbol}','launch-outcomes-v1','${asOf(days[0])}','{}');`);
    const due = run(days[0]);
    assert.equal(due.available,110);
    assert.ok(due.signals.every(row => !excluded.some(item => key(item) === key(row))));
    sql('TRUNCATE public.vnext_launch_outcome_signals_v1;');
    assert.deepEqual(run(days[0]).signals,[]);
    assert.equal(run(days[0]).available,0);

    const repeated = psql(migrate(correction));
    assert.notEqual(repeated.status,0);
    assert.match(repeated.stderr,/launch_outcome_batch_reviewed_predecessor_required/);
    assert.equal(routine(),priorRoutine);
  } finally {
    if (started) check(command('pg_ctl',['-D',data,'-w','-m','immediate','stop']));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
