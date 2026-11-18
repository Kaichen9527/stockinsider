import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const fixture = String.raw`
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE stockinsider_vnext_owner;
CREATE TABLE public.vnext_launch_ranking_mode_v1(singleton boolean,enabled boolean,required_writer_release text);
INSERT INTO public.vnext_launch_ranking_mode_v1 VALUES(true,true,'fixture-release');
GRANT SELECT ON public.vnext_launch_ranking_mode_v1 TO stockinsider_vnext_owner;
CREATE FUNCTION public.vnext_launch_csv_policy_v1(principal text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF principal<>'operator' THEN RAISE EXCEPTION 'fixture_unapproved_principal'; END IF;
 RETURN jsonb_build_object('requiredWriterRelease','fixture-release','rightsBindingHash',repeat(current_setting('fixture.rights'),64));
END $$;
CREATE FUNCTION public.vnext_launch_csv_backend_v1(lease uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF lease<>'00000000-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'fixture_unowned_lease'; END IF;
 RETURN jsonb_build_object('writerRelease','fixture-release');
END $$;
CREATE FUNCTION public.vnext_launch_twse_turnover_close_v1(date,timestamptz) RETURNS timestamptz LANGUAGE sql AS $$
 SELECT CASE WHEN current_setting('fixture.early')='no' THEN current_setting('fixture.close')::timestamptz END
$$;
CREATE FUNCTION public.vnext_launch_tpex_cash_close_v1(date,timestamptz) RETURNS timestamptz LANGUAGE sql AS $$
 SELECT public.vnext_launch_twse_turnover_close_v1($1,$2)
$$;
CREATE FUNCTION public.vnext_launch_disposition_session_v1(text,date,timestamptz) RETURNS uuid LANGUAGE sql AS $$
 SELECT CASE WHEN $1 IN ('TWSE','TPEX') AND $2=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date
  AND $3>=current_setting('fixture.close')::timestamptz
  THEN current_setting(CASE WHEN $1='TWSE' THEN 'fixture.calendar' ELSE 'fixture.tpex_calendar' END)::uuid END
$$;
CREATE FUNCTION public.enforce_production_writer_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('fixture.fence')='disabled' THEN RAISE EXCEPTION 'fixture_write_fenced'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.vnext_launch_csv_immutable_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fixture_immutable'; END $$;
`;
const migration = new URL('../migrations/20261118_54_vnext_twse_opening_limit_receipts_v1.sql', import.meta.url);
const tpexMigration = new URL('../migrations/20261118_55_vnext_tpex_opening_limit_receipts_v1.sql', import.meta.url);
const csvMigration = new URL('../migrations/20261115_vnext_launch_source_facts_v1.sql', import.meta.url);
const authority = '00000000-0000-4000-8000-000000000002';
const different = '00000000-0000-4000-8000-000000000003';
const lease = '00000000-0000-4000-8000-000000000001';
const date = "(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date";
const command = "public.vnext_launch_twse_opening_limit_command_v1";
const args = "'operator','" + lease + "'";
const receipt = "public.vnext_launch_twse_opening_limits_v1";
const signature = command + "(text,uuid,text,date,timestamptz,timestamptz,uuid,text,text,bytea,bytea)";

test('PostgreSQL bounds TWSE and TPEx receipt custody to an approved lease, calendar, rights and cutoff', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'si-opening-limit-'));
  const data = path.join(root,'data'), port = String(55000 + process.pid % 5000);
  const run = (name,argv,input) => spawnSync(
    process.env.OPPORTUNITY_V3_POSTGRES_BIN ? path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN,name) : name,
    argv,{input,encoding:'utf8',timeout:30000,env:{...process.env,LC_ALL:'C',TZ:'UTC'}});
  const check = result => {
    assert.equal(result.status,0,result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  };
  const psql = input => run('psql',['-X','-q','-v','ON_ERROR_STOP=1','-h',root,'-p',port,'-U','lab','-d','postgres','-At'],input);
  let started = false;
  try {
    check(run('initdb',['-D',data,'-U','lab','-A','trust','--no-locale','--encoding=UTF8']));
    check(run('pg_ctl',['-D',data,'-l',path.join(root,'server.log'),'-w','-o','-c listen_addresses= -k '+root+' -p '+port,'start']));
    started = true;
    check(psql(fixture));
    const csvSource=fs.readFileSync(csvMigration,'utf8');
    const start=csvSource.indexOf('CREATE FUNCTION public.vnext_launch_csv_rows_v1(');
    const end=csvSource.indexOf('END $csv$;',start)+'END $csv$;'.length;
    assert.ok(start>=0&&end>start);
    check(psql(csvSource.slice(start,end)));
    check(psql('ALTER FUNCTION public.vnext_launch_csv_rows_v1(bytea,integer) OWNER TO stockinsider_vnext_owner;'
      +' REVOKE ALL ON FUNCTION public.vnext_launch_csv_rows_v1(bytea,integer) FROM PUBLIC,anon,authenticated,service_role;'));
    check(psql(fs.readFileSync(migration,'utf8')));
    check(psql(fs.readFileSync(tpexMigration,'utf8')));
    const close = check(psql("SELECT clock_timestamp()-interval '30 seconds';"));
    const env = "SET fixture.early='no'; SET fixture.fence='enabled'; SET fixture.rights='a'; SET fixture.close='"+close
      +"'; SET fixture.calendar='"+authority+"'; SET fixture.tpex_calendar='"+different+"'; ";
    const admin = sql => check(psql(env+sql));
    const rpc = sql => check(psql(env+'SET ROLE service_role; '+sql));
    const rejects = (sql,reason) => {
      const result=psql(env+sql);
      assert.notEqual(result.status,0);
      assert.match(result.stderr,reason);
    };
    assert.equal(admin("SELECT has_function_privilege('anon','"+signature+"','EXECUTE'),"
      +"has_function_privilege('authenticated','"+signature+"','EXECUTE'),"
      +"has_function_privilege('service_role','"+signature+"','EXECUTE'),"
      +"has_table_privilege('service_role','"+receipt+"','SELECT'),"
      +"has_table_privilege('service_role','"+receipt+"','INSERT');"),'f|f|t|f|f');

    const admit="SELECT "+command+"("+args+",'admit');";
    assert.equal(rpc("SET fixture.early='yes'; "+admit),'');
    const ready = JSON.parse(rpc(admit));
    assert.equal(ready.alreadyCaptured,false);
    assert.equal(ready.sessionAuthorityId,authority);

    const append = (sessionAuthorityId=authority, {badDate=false, badHash=false}={}) => {
      const report = "convert_to(jsonb_build_object('stat','OK','selectType','ALLBUT0999','date',to_char("
        +date+(badDate?'-1':'')+",'YYYYMMDD'),'data',jsonb_build_array(jsonb_build_array('6614')))::text,'UTF8')";
      const bytes = "convert_to('fixture CSV','UTF8')";
      return "SELECT "+command+"("+args+",'append',"+date+",NULL,clock_timestamp(),'"+sessionAuthorityId+"',"
        +(badHash?"repeat('d',64)":"encode(sha256("+bytes+"),'hex')")+",encode(sha256("+report+"),'hex'),"+bytes+","+report+");";
    };
    const service='SET ROLE service_role; ';
    rejects(service+admit.replace("'operator'","'other'"),/fixture_unapproved_principal/u);
    rejects(service+admit.replace(lease,different),/fixture_unowned_lease/u);
    rejects(service+append(different),/launch_twse_opening_limit_capture_invalid/u);
    rejects(service+append(authority,{badDate:true}),/launch_twse_opening_limit_dated_report_invalid/u);
    rejects(service+append(authority,{badHash:true}),/launch_twse_opening_limit_capture_invalid/u);
    rejects(service+"SET fixture.fence='disabled'; "+append(),/fixture_write_fenced/u);

    const saved=JSON.parse(rpc(append()));
    assert.equal(saved.session,ready.session);
    assert.equal(saved.replay,false);
    assert.equal(JSON.parse(rpc(append())).replay,true);
    assert.equal(JSON.parse(rpc(admit)).alreadyCaptured,true);
    assert.equal(admin("SELECT count(*) FROM "+receipt+";"),'1');
    const read=cutoff=>"SELECT "+command+"("+args+",'read','"+saved.session+"',"+cutoff+");";
    assert.equal(rpc(read("'"+saved.recordedAt+"'::timestamptz-interval '1 microsecond'")),'');
    const found=JSON.parse(rpc(read("'"+saved.recordedAt+"'::timestamptz")));
    assert.equal(found.csvSha256,saved.csvSha256);
    assert.equal(found.datedSha256,saved.datedSha256);
    assert.equal(found.sessionAuthorityId,authority);
    assert.equal(Buffer.from(found.csvBase64,'base64').toString('utf8'),'fixture CSV');
    assert.equal(rpc("SET fixture.rights='b'; "+read('clock_timestamp()')),'');
    const revised="SET fixture.calendar='"+different+"'; ";
    assert.equal(rpc(revised+read('clock_timestamp()')),'');
    const updated=JSON.parse(rpc(revised+append(different)));
    assert.equal(updated.replay,false);
    assert.equal(JSON.parse(rpc(revised+read('clock_timestamp()'))).sessionAuthorityId,different);
    assert.equal(JSON.parse(rpc(read('clock_timestamp()'))).sessionAuthorityId,authority);
    assert.equal(admin("SELECT count(*) FROM "+receipt+";"),'2');
    rejects(service+read("clock_timestamp()+interval '1 minute'"),/launch_twse_opening_limit_cutoff_invalid/u);
    rejects(service+'SELECT csv_body FROM '+receipt+';',/permission denied/u);
    rejects("SET ROLE stockinsider_vnext_owner; DELETE FROM "+receipt+";",/fixture_immutable/u);
    rejects("SET ROLE stockinsider_vnext_owner; TRUNCATE "+receipt+";",/fixture_immutable/u);

    const otc='public.vnext_launch_tpex_opening_limit_command_v1';
    const otcTable='public.vnext_launch_tpex_opening_limits_v1';
    const otcSignature=otc+'(text,uuid,text,date,timestamptz,timestamptz,uuid,text,bytea)';
    assert.equal(admin("SELECT has_function_privilege('anon','"+otcSignature+"','EXECUTE'),"
      +"has_function_privilege('authenticated','"+otcSignature+"','EXECUTE'),"
      +"has_function_privilege('service_role','"+otcSignature+"','EXECUTE'),"
      +"has_table_privilege('service_role','"+otcTable+"','SELECT'),"
      +"has_table_privilege('service_role','"+otcTable+"','INSERT');"),'f|f|t|f|f');
    const otcAdmit="SELECT "+otc+"("+args+",'admit');";
    assert.equal(rpc("SET fixture.early='yes'; "+otcAdmit),'');
    const otcReady=JSON.parse(rpc(otcAdmit));
    assert.equal(otcReady.sessionAuthorityId,different);
    assert.equal(otcReady.alreadyCaptured,false);
    const header='資料日期,股票代號,名稱,收盤價,漲跌,總成交張數,漲跌停成交張數,漲跌停委託張數,漲跌停未成交張數';
    const otcAppend=(scenario='valid',id=different)=>{
      const dayExpr=date+(scenario==='stale'?'-1':'');
      const roc="lpad((extract(year FROM ("+dayExpr+"))::integer-1911)::text,3,'0')||to_char("+dayExpr+",'MMDD')";
      const row=roc+"||',4174,fixture,78.40,7.1,343,313,7172,6859'||chr(10)";
      const values=scenario==='empty'?"''":scenario==='duplicate'?row+'||'+row:row;
      const bytes="convert_to('"+header+"'||chr(10)||"+values+",'UTF8')";
      return "SELECT "+otc+"("+args+",'append',"+date+",NULL,clock_timestamp(),'"+id+"',"
        +(scenario==='bad_hash'?"repeat('f',64)":"encode(sha256("+bytes+"),'hex')")+","+bytes+");";
    };
    rejects(service+otcAppend('valid',authority),/launch_tpex_opening_limit_capture_invalid/u);
    rejects(service+otcAppend('stale'),/launch_tpex_opening_limit_report_invalid/u);
    rejects(service+otcAppend('empty'),/launch_tpex_opening_limit_report_invalid/u);
    rejects(service+otcAppend('duplicate'),/launch_tpex_opening_limit_report_invalid/u);
    rejects(service+otcAppend('bad_hash'),/launch_tpex_opening_limit_capture_invalid/u);
    rejects(service+"SET fixture.fence='disabled'; "+otcAppend(),/fixture_write_fenced/u);
    const otcSaved=JSON.parse(rpc(otcAppend()));
    assert.equal(otcSaved.session,otcReady.session);
    assert.equal(otcSaved.replay,false);
    assert.equal(JSON.parse(rpc(otcAppend())).replay,true);
    assert.equal(JSON.parse(rpc(otcAdmit)).alreadyCaptured,true);
    assert.equal(admin("SELECT count(*) FROM "+otcTable+";"),'1');
    const otcRead=cutoff=>"SELECT "+otc+"("+args+",'read','"+otcSaved.session+"',"+cutoff+");";
    assert.equal(rpc(otcRead("'"+otcSaved.recordedAt+"'::timestamptz-interval '1 microsecond'")),'');
    const otcFound=JSON.parse(rpc(otcRead("'"+otcSaved.recordedAt+"'::timestamptz")));
    assert.equal(otcFound.sha256,otcSaved.sha256);
    assert.equal(otcFound.sessionAuthorityId,different);
    assert.ok(Buffer.from(otcFound.bodyBase64,'base64').toString('utf8').startsWith(header));
    assert.equal(rpc("SET fixture.rights='b'; "+otcRead('clock_timestamp()')),'');
    assert.equal(rpc("SET fixture.tpex_calendar='"+authority+"'; "+otcRead('clock_timestamp()')),'');
    rejects(service+'SELECT body FROM '+otcTable+';',/permission denied/u);
    rejects("SET ROLE stockinsider_vnext_owner; DELETE FROM "+otcTable+";",/fixture_immutable/u);
  } finally {
    if (started) check(run('pg_ctl',['-D',data,'-w','-m','immediate','stop']));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
