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
CREATE ROLE opportunity_v3_rpc_owner;
CREATE ROLE stockinsider_vnext_owner;
CREATE TABLE public.stock_instruments_v3(
 instrument_authority_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 stock_id uuid NOT NULL,symbol text NOT NULL,exchange text NOT NULL,
 instrument_type text NOT NULL,listing_status text NOT NULL,provider text NOT NULL,roster_version text NOT NULL,
 source_timestamp timestamptz NOT NULL,recorded_at timestamptz NOT NULL,valid_from timestamptz NOT NULL,valid_to timestamptz
);
ALTER TABLE public.stock_instruments_v3 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.stock_instruments_v3 ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.stock_instruments_v3(symbol,recorded_at DESC,stock_id,instrument_authority_id);
CREATE INDEX ON public.stock_instruments_v3(stock_id,recorded_at DESC);
INSERT INTO public.stock_instruments_v3(stock_id,symbol,exchange,instrument_type,listing_status,provider,roster_version,
 source_timestamp,recorded_at,valid_from)
 SELECT md5(symbol::text)::uuid,symbol::text,'TWSE','common_stock','active','twse','tw-instrument-roster-v3.0',
  timestamptz '2026-11-02T00:00Z'+ n*interval '1 hour',
  timestamptz '2026-11-02T00:01Z'+ n*interval '1 hour',timestamptz '2026-11-01T00:00Z'
 FROM generate_series(1000,1219) symbol CROSS JOIN generate_series(1,112) n
 WHERE n<=6 OR symbol=1000;
`;
const filename = (name) => new URL('../migrations/'+name,import.meta.url);
const baseline = fs.readFileSync(filename('20261115_vnext_launch_ranking_v1.sql'),'utf8');
const first = baseline.indexOf('CREATE FUNCTION public.vnext_launch_instrument_v1(');
const last = baseline.indexOf('\nCREATE FUNCTION public.vnext_launch_selected_score_v1(',first);
const migration = fs.readFileSync(filename('20261116_28_vnext_launch_roster_heads_v1.sql'),'utf8');

test('native screening and ranking resolve the same scoped head across appended roster history',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'launch-roster-heads-pg-'));
  const data=path.join(root,'data'),port=String(55000+process.pid%5000);
  const binary=(name)=>process.env.OPPORTUNITY_V3_POSTGRES_BIN?path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN,name):name;
  const command=(name,args,input)=>spawnSync(binary(name),args,{
    input,encoding:'utf8',timeout:30000,env:{...process.env,LC_ALL:'C',TZ:'UTC'},
  });
  const check=(result)=>{
    assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);
    return result.stdout.trim();
  };
  const psql=(text)=>command('psql',['-X','-q','-v','ON_ERROR_STOP=1','-h',root,'-p',port,'-U','lab','-d','postgres','-At'],text);
  const sql=(text)=>check(psql(text));
  const before='2026-11-13T13:30:00Z',after='2026-11-15T13:30:00Z';
  const ranking='public.vnext_launch_instrument_v1(text,timestamptz)';
  const screen='public.vnext_screen_roster_heads_v1(text[],timestamptz)';
  const head=(symbol,cutoff=after)=>JSON.parse(sql(`SELECT coalesce(public.vnext_launch_instrument_v1('${symbol}','${cutoff}'),'null');`));
  let running=false;
  try{
    check(command('initdb',['-D',data,'-U','lab','-A','trust','--no-locale','--encoding=UTF8']));
    check(command('pg_ctl',['-D',data,'-l',path.join(root,'pg.log'),'-w','-o',`-c listen_addresses= -k ${root} -p ${port}`,'start']));
    running=true;
    assert.ok(first>=0&&last>first);
    sql(fixture+baseline.slice(first,last)+`
      ALTER FUNCTION ${ranking} OWNER TO opportunity_v3_rpc_owner;
      REVOKE ALL ON FUNCTION ${ranking} FROM PUBLIC,anon,authenticated,service_role;
      GRANT EXECUTE ON FUNCTION ${ranking} TO stockinsider_vnext_owner;`);
    assert.equal(Number(sql('SELECT count(*) FROM public.stock_instruments_v3;')),1426);
    assert.equal(head('1000',before),null,'the previous per-symbol history limit rejected a valid head');
    const metadata=()=>sql(`SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid='${ranking}'::regprocedure;`);
    const oldMetadata=metadata();
    sql(migration);
    assert.equal(metadata(),oldMetadata);
    const scopedBatch=JSON.parse(sql(`SET ROLE service_role; SELECT public.vnext_screen_roster_heads_v1(
      ARRAY(SELECT generate_series(1000,1219)::text),'${before}');`));
    assert.equal(Object.keys(scopedBatch).length,220);
    assert.ok(Object.entries(scopedBatch).every(([symbol,row])=>row.symbol===symbol&&row.exchange==='TWSE'));
    assert.equal(scopedBatch['1000'].instrument_authority_id,head('1000',before).id);
    assert.equal(sql("SELECT public.vnext_launch_instrument_v1('1000',clock_timestamp()) IS NOT NULL;"),'t',
      'live ranking can evaluate a cutoff taken later than statement start');

    sql(`INSERT INTO public.stock_instruments_v3(stock_id,symbol,exchange,instrument_type,listing_status,provider,roster_version,
      source_timestamp,recorded_at,valid_from,valid_to)
     SELECT md5(stock_key)::uuid,symbol,exchange,kind,status,lower(exchange),'tw-instrument-roster-v3.0',
       CASE WHEN valid_to IS NULL THEN '2026-11-14T05:30Z' ELSE '2026-11-01T00:00Z' END::timestamptz,
       CASE WHEN valid_to IS NULL THEN '2026-11-14T05:31Z' ELSE '2026-11-01T00:01Z' END::timestamptz,
       CASE WHEN valid_to IS NULL THEN '2026-11-14T05:30Z' ELSE '2026-11-01T00:00Z' END::timestamptz,
       valid_to::timestamptz
     FROM (VALUES
       ('1001','1001','TPEX','common_stock','active',NULL),
       ('1002','1002','TWSE','common_stock','suspended',NULL),
       ('1003','1003','TWSE','depositary_receipt','active',NULL),
       ('1004','1004','TWSE','common_stock','delisted',NULL),
       ('1004','1004','TWSE','common_stock','active',NULL),
       ('1005','9999','TWSE','common_stock','active',NULL),
       ('9006','1006','TWSE','common_stock','active',NULL),
       ('1007','2007','TWSE','common_stock','active','2026-11-03T00:00Z'),
       ('1008','1008','TWSE','common_stock','active',NULL),
       ('1008','1008','TWSE','common_stock','active',NULL)
     ) source(symbol,stock_key,exchange,kind,status,valid_to);`);
    assert.equal(head('1001',before).exchange,'TWSE');
    assert.equal(head('1001',after).exchange,'TPEX');
    assert.equal(head('1001',before).stockId,head('1001',after).stockId);
    assert.equal(head('1002').listingStatus,'suspended');
    assert.equal(head('1003').instrumentType,'depositary_receipt');
    for(const symbol of ['1004','1005','1006'])assert.equal(head(symbol),null);
    for(const symbol of ['1007','1008'])assert.equal(head(symbol).listingStatus,'active');
    const result=JSON.parse(sql(`SET ROLE service_role; SELECT public.vnext_screen_roster_heads_v1(
      ARRAY['1001','1002','1004','1005','1006','9998'],'${after}');`));
    assert.equal(result['1001'].instrument_authority_id,head('1001').id);
    assert.equal(result['1002'].listing_status,'suspended');
    for(const symbol of ['1004','1005','1006','9998'])assert.equal(result[symbol],null);

    assert.equal(sql(`SELECT has_function_privilege('anon','${screen}','EXECUTE'),
      has_function_privilege('authenticated','${screen}','EXECUTE'),has_function_privilege('service_role','${screen}','EXECUTE'),
      has_function_privilege('service_role','${ranking}','EXECUTE'),
      has_table_privilege('service_role','public.stock_instruments_v3','SELECT');`),'f|f|t|f|f');
    assert.equal(sql(`SET ROLE service_role; SELECT public.vnext_screen_roster_heads_v1(ARRAY[]::text[],'${after}');`),'{}');
    for(const scope of ["ARRAY['1000','1000']","ARRAY['1000',NULL]","ARRAY['x']","ARRAY(SELECT generate_series(1000,1220)::text)"]){
      const refused=psql(`SET ROLE service_role; SELECT public.vnext_screen_roster_heads_v1(${scope},'${after}');`);
      assert.notEqual(refused.status,0);
      assert.match(refused.stderr,/vnext_screen_roster_scope_invalid/);
    }
    assert.match(psql(migration).stderr,/launch_instrument_reviewed_predecessor_required/);
  }finally{
    if(running)check(command('pg_ctl',['-D',data,'-w','-m','immediate','stop']));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
