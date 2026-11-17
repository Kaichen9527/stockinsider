import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const read = name => fs.readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8');
const source = read('20261115_vnext_launch_source_facts_v1');
const ranking = read('20261115_vnext_launch_ranking_v1');
const tpex = read('20261116_10_vnext_launch_tpex_market_cash_v1');
const twseQueue = read('20261116_15_vnext_launch_twse_close_queue_v1');
const twsePlan = read('20261116_16_vnext_launch_twse_close_plan_v1');
const turnover = read('20261116_29_vnext_launch_twse_turnover_source_v1');
const candidate = read('20261116_31_vnext_launch_turnover_plan_clock_v1');

function piece(source,name) {
  const start = source.indexOf('CREATE FUNCTION public.'+name+'(');
  assert.notEqual(start,-1);
  const opening = /\bAS (\$[a-z_]*\$)/u.exec(source.slice(start));
  assert.ok(opening);
  const bodyStart = start+opening.index+opening[0].length;
  const end = source.indexOf(opening[1]+';',bodyStart);
  assert.ok(end>bodyStart);
  return {header:source.slice(start,bodyStart),body:source.slice(bodyStart,end),end:opening[1]+';'};
}

function applySeams(body,text,pattern,expectedCount) {
  const matches = [...text.matchAll(pattern)];
  assert.equal(matches.length,expectedCount);
  for(const match of matches) {
    const [before,after] = match.slice(-2);
    assert.equal(body.split(before).length,2);
    body = body.replace(before,()=>after);
  }
  return body;
}

const block = (text,name) => {
  const start = text.indexOf('DO $'+name+'$');
  const end = text.indexOf('END $'+name+'$;',start);
  assert.ok(start>=0&&end>start);
  return text.slice(start,end);
};

const tpexTokens = subgroup => new RegExp('\\(\\$f'+subgroup+'old(\\d+)\\$([\\s\\S]*?)\\$f'+subgroup+'old\\1\\$,\\$f'+subgroup+'new\\1\\$([\\s\\S]*?)\\$f'+subgroup+'new\\1\\$\\)','gu');
const numberedTokens = /\(\$b(\d+)\$([\s\S]*?)\$b\1\$,\$a\1\$([\s\S]*?)\$a\1\$\)/gu;
const turnoverTokens = /\(\$before\$([\s\S]*?)\$before\$,\$after\$([\s\S]*?)\$after\$\)/gu;

function installedSourceRoutine(name, subgroup, tpexSeamCount, turnoverBlock, queueAmendments = []) {
  const sql = piece(source,name);
  let body = applySeams(sql.body,tpex,tpexTokens(subgroup),tpexSeamCount);
  for(const [migration,section,count] of queueAmendments) {
    body = applySeams(body,block(migration,section),numberedTokens,count);
  }
  const finalCount = subgroup===2 ? 6 : 1;
  body = applySeams(body,block(turnover,turnoverBlock),turnoverTokens,finalCount);
  return sql.header+body+sql.end;
}

const dependencies = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE stockinsider_vnext_owner;
CREATE TABLE public.vnext_members_v1(symbol text,state text,input_hash text,admitted_session date,updated_at timestamptz);
CREATE TABLE public.vnext_sessions_v1(session_date date,close_at timestamptz,completed boolean);
CREATE TABLE public.tw_trading_sessions_v3(session_authority_id uuid,session_id date,market text,status text,provider text,
 close_at timestamptz,source_timestamp timestamptz,collected_at timestamptz,recorded_at timestamptz);
-- The complete ready statement also resolves the untouched 11764 branch.
CREATE TABLE public.vnext_launch_twse_close_scope_v1(capture_id uuid,roster_hash text,fact_count integer);
CREATE TABLE public.vnext_launch_twse_close_facts_v1(capture_id uuid);
CREATE TABLE public.vnext_source_policies_v1(source text,scope text,enabled boolean,valid_until timestamptz);
CREATE FUNCTION public.vnext_launch_twse_close_profile_v1(date) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE TABLE public.vnext_audit_v1(principal text,command text,request jsonb,result jsonb);
CREATE TABLE public.stockinsider_backend_identities_v1(id uuid PRIMARY KEY);
CREATE TABLE public.private_artifact_receipts_v1(artifact_hash text PRIMARY KEY);
CREATE TABLE public.taiwan_data_refresh_queue_v5(job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),queue_key text UNIQUE,
 dataset text,symbol text,exchange text,refresh_phase text,requested_session_date date,status text,
 next_attempt_at timestamptz,queued_at timestamptz,updated_at timestamptz,attempts integer NOT NULL DEFAULT 0,lease_owner text,
 lease_expires_at timestamptz,terminal_status text,terminal_result jsonb,completed_at timestamptz);
CREATE FUNCTION public.vnext_catalog_canonical_v1(jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $1::text $$;
-- Narrow fixture authority. The production writer gate, identity and lease are never loaded or enabled.
CREATE FUNCTION public.vnext_launch_csv_policy_v1(text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('requiredWriterRelease','isolation-fixture','rightsBindingHash',repeat('a',64))
$$;
CREATE FUNCTION public.vnext_launch_csv_backend_v1(owner uuid,artifact text DEFAULT NULL,length integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $$
BEGIN
 IF owner<>'11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'fixture_lease_mismatch';END IF;
 RETURN jsonb_build_object('writerRelease','isolation-fixture','backendId','22222222-2222-4222-8222-222222222222',
   'leaseExpiresAt',clock_timestamp()+interval '4 minutes','artifactRecordedAt',clock_timestamp());
END $$;
CREATE FUNCTION public.vnext_launch_tpex_cash_calendar_v1(date,timestamptz) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE FUNCTION public.vnext_launch_tpex_cash_close_v1(date,timestamptz) RETURNS timestamptz LANGUAGE sql AS $$ SELECT NULL::timestamptz $$;
INSERT INTO public.stockinsider_backend_identities_v1 VALUES('22222222-2222-4222-8222-222222222222');
INSERT INTO public.vnext_members_v1 VALUES('2330','active',repeat('a',64),current_date,clock_timestamp());
WITH stamp AS (SELECT statement_timestamp() AS at), dated AS (
 SELECT (at AT TIME ZONE 'Asia/Taipei')::date AS day,
 greatest(((at AT TIME ZONE 'Asia/Taipei')::date::timestamp AT TIME ZONE 'Asia/Taipei'),at-interval '1 second') AS close_at
 FROM stamp
)
INSERT INTO public.tw_trading_sessions_v3
 SELECT gen_random_uuid(),day,'TWSE','completed','twse',close_at,close_at,close_at,close_at FROM dated;
INSERT INTO public.vnext_sessions_v1 SELECT session_id,close_at,true FROM public.tw_trading_sessions_v3;
`;

test('an actual statement snapshot allows same-day turnover plan and committed ready receipt', () => {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'launch-turnover-plan-pg-'));
  const data=path.join(tmp,'db'),port=String(54500+process.pid%10000);
  const run=(name,args,input)=>spawnSync(process.env.OPPORTUNITY_V3_POSTGRES_BIN
    ?path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN,name):name,args,
    {input,encoding:'utf8',timeout:30000,env:{...process.env,LC_ALL:'C',TZ:'UTC'}});
  const ok=result=>{assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);return result.stdout.trim();};
  const psql=input=>run('psql',['-X','-q','-v','ON_ERROR_STOP=1','-At','-h',tmp,'-p',port,'-U','lab','-d','postgres'],input);
  const sql=input=>ok(psql(input));
  const fn="public.vnext_launch_csv_command_v1('staging-fixture','11111111-1111-4111-8111-111111111111',";
  const rpc=(operation,body={},bytes='NULL')=>JSON.parse(sql('SET ROLE service_role; SELECT '+fn+"'"+operation+"',$req$"+JSON.stringify(body)+"$req$::jsonb,"+bytes+');'));
  const turnoverBindings="SELECT count(*) FROM public.vnext_launch_csv_bindings_v1 WHERE dataset_id=11549;";
  const metadata=() => sql("SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid='public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)'::regprocedure;");
  let running=false;
  try {
    ok(run('initdb',['-D',data,'-U','lab','-A','trust','--no-locale','--encoding=UTF8']));
    ok(run('pg_ctl',['-D',data,'-l',path.join(tmp,'pg.log'),'-o','-c listen_addresses= -k '+tmp+' -p '+port,'-w','start']));
    running=true;
    const definitions=source.slice(source.indexOf('CREATE TABLE public.vnext_launch_csv_mode_v1('),
      source.indexOf('CREATE FUNCTION public.vnext_launch_csv_immutable_v1()'));
    const sqlRoutine=(text,name)=>Object.values(piece(text,name)).join('');
    const essential=['vnext_launch_csv_rows_v1','vnext_launch_csv_integer_v1','vnext_launch_csv_date_v1','vnext_launch_csv_hash_v1','vnext_launch_csv_pool_v1'];
    sql(dependencies+definitions+turnover.slice(turnover.indexOf('ALTER TABLE public.vnext_launch_csv_bindings_v1 '),
      turnover.indexOf('CREATE FUNCTION public.vnext_launch_twse_turnover_derive_v1('))+
      essential.map(name=>sqlRoutine(source,name)).join('\n')+sqlRoutine(ranking,'vnext_launch_today_calendar_internal_v1')+
      sqlRoutine(turnover,'vnext_launch_twse_turnover_close_v1')+sqlRoutine(turnover,'vnext_launch_twse_turnover_derive_v1')+
      installedSourceRoutine('vnext_launch_csv_profile_v1',0,5,'profile_update',[[twseQueue,'apply_0',1]])+
      installedSourceRoutine('vnext_launch_csv_derive_v1',1,1,'parser_update')+
      installedSourceRoutine('vnext_launch_csv_command_v1',2,6,'queue_update',
        [[twseQueue,'apply_1',8],[twsePlan,'claim_update_0',3]])+
      "REVOKE ALL ON FUNCTION public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea) FROM PUBLIC,anon,authenticated;"+
      "GRANT EXECUTE ON FUNCTION public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea) TO service_role;");
    const day=sql('SELECT session_date FROM public.vnext_sessions_v1;');
    const before=metadata();
    const original=rpc('enqueue-current');
    assert.equal(original.session,day);
    assert.equal(sql(turnoverBindings),'0');
    const explicit={datasetId:11549,requestKey:day};
    const direct=fn+"'enqueue', '"+JSON.stringify(explicit)+"'::jsonb,NULL)";
    assert.equal(psql('SELECT '+direct+';').status,3);
    sql(candidate);
    assert.equal(metadata(),before);
    const completed=rpc('enqueue-current');
    assert.equal(completed.session,day);
    assert.equal(completed.jobs,original.jobs+1);
    assert.equal(sql(turnoverBindings),'1');
    assert.equal(rpc('enqueue',explicit).replay,true);
    assert.equal(sql(turnoverBindings),'1');
    const {jobs:[job]}=rpc('claim',{limit:1});
    assert.equal(job.datasetId,11549);
    assert.equal(job.requestKey,day);
    const parts=day.split('-'), roc=String(Number(parts[0])-1911)+parts[1]+parts[2];
    const csv=Buffer.from('"日期","證券代號","證券名稱","成交股數","成交金額","開盤價","最高價","最低價","收盤價","漲跌價差","成交筆數"\r\n"'+
      roc+'","2330","fixture","10","500","50","51","49","50","0","1"\r\n');
    const hash=createHash('sha256').update(csv).digest('hex');
    sql("INSERT INTO public.private_artifact_receipts_v1 VALUES('"+hash+"');");
    const observedAt=sql("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');");
    const appended=rpc('complete',{attemptId:job.attemptId,artifactHash:hash,observedAt,httpStatus:200,
      redirectCount:0,contentType:'text/csv',responseUrl:job.sourceUrl},"decode('"+csv.toString('hex')+"','hex')");
    assert.equal(appended.facts,1);
    assert.equal(appended.actionEligible,false);
    assert.equal(sql('SELECT count(*) FROM public.vnext_launch_csv_ready_acks_v1;'),'0');
    const ready=rpc('ready',{attemptId:job.attemptId,captureId:appended.captureId});
    assert.ok(Date.parse(ready.availableAt)>=Date.parse(observedAt));
    assert.equal(rpc('ready',{attemptId:job.attemptId,captureId:appended.captureId}).readyAckId,ready.readyAckId);
    assert.equal(sql('SELECT traded_ntd FROM public.vnext_launch_csv_facts_v1;'),'500');
    assert.equal(rpc('claim',{limit:1}).jobs.some(j=>j.datasetId===11549),false);
    assert.equal(sql(turnoverBindings),'1');
    assert.equal(sql("SELECT public.vnext_launch_twse_turnover_close_v1((statement_timestamp() AT TIME ZONE 'Asia/Taipei')::date,statement_timestamp()+interval '1 second') IS NULL;"),'t');
  } finally {
    if(running)ok(run('pg_ctl',['-D',data,'-w','-m','immediate','stop']));
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});
