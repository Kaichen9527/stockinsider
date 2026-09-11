import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';

// Private, temporary local cluster only. No production URL or credentials.
test('history completion is atomic, private, idempotent and preserves conflicting official evidence',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'candidate-history-pg-'));
  const data=path.join(directory,'data'),socket=path.join(directory,'socket');
  fs.mkdirSync(socket);
  const user=os.userInfo().username,port=55000+(process.pid%5000);
  const binary=(name)=>process.env.OPPORTUNITY_V3_POSTGRES_BIN?path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN,name)
    :spawnSync('/usr/bin/env',['sh','-c','command -v "$1"','pg-tool',name],{encoding:'utf8'}).stdout.trim();
  const command=(name,args,input)=>{
    const result=spawnSync(binary(name),args,{input,encoding:'utf8',env:{...process.env,LC_ALL:'C'}});
    assert.equal(result.status,0,result.stderr||result.stdout);return result.stdout.trim();
  };
  const args=['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(port),'-U',user,'-d','postgres','-At'];
  const sql=(value)=>command('psql',args,value);
  let started=false;
  try {
    command('initdb',['-D',data,'--auth=trust','--no-locale','--encoding=UTF8','-U',user]);
    command('pg_ctl',['-D',data,'-l',path.join(directory,'postgres.log'),'-o',`-F -k ${socket} -p ${port} -c listen_addresses=''`,'-w','start']);
    started=true;
    sql(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE TABLE public.stocks(id uuid PRIMARY KEY);
      CREATE TABLE public.official_price_history(stock_id uuid,session_date date,open numeric,high numeric,low numeric,close numeric,volume numeric,source_url text,as_of timestamptz,available_at timestamptz,provenance jsonb,PRIMARY KEY(stock_id,session_date));
      CREATE TABLE public.official_multiple_history(stock_id uuid,month_end date,close numeric,pe_ratio numeric,pb_ratio numeric,source_url text,as_of timestamptz,available_at timestamptz,provenance jsonb,valuation_parser_version text,quality_status text,PRIMARY KEY(stock_id,month_end));
      CREATE TABLE public.fundamental_snapshots(stock_id uuid,as_of_date date,pe_ratio numeric,pb_ratio numeric,source_url text,valuation_parser_version text,quality_status text,PRIMARY KEY(stock_id,as_of_date));`);
    const migration=fs.readFileSync(new URL('../migrations/20260911_candidate_history_backfill_v1.sql',import.meta.url),'utf8');
    sql(migration);sql(migration);
    const stock='11111111-1111-4111-8111-111111111111';
    sql(`INSERT INTO stocks VALUES('${stock}')`);
    const url='https://www.twse.com.tw/exchangeReport/STOCK_DAY?stockNo=2330';
    const bar={time:'2025-08-29',open:100,high:105,low:98,close:102,volume:1000,sourceUrl:url,provider:'official_primary',authorityTier:'official_primary'};
    const call=(bars,timestamp='2026-01-01T00:00:00Z')=>`SET ROLE service_role;SELECT public.complete_candidate_history_month_v1('${stock}','price','2025-08-01','${timestamp}','2025-08-29','2025-08-29','complete','complete',NULL,'${url}','candidate-history-month-v1','${JSON.stringify(bars)}'::jsonb,'[]'::jsonb);`;
    const parsed=(value)=>JSON.parse(value.split('\n').at(-1));
    assert.equal(parsed(sql(call([bar]))).status,'complete');
    const firstAvailable=sql(`SELECT available_at FROM official_price_history WHERE stock_id='${stock}'`);
    // Backfilled availability is database collection time, never request time.
    assert.equal(sql(`SELECT available_at>'2026-01-01' FROM official_price_history WHERE stock_id='${stock}'`),'t');
    assert.equal(parsed(sql(call([bar]))).status,'complete');
    assert.equal(sql('SELECT count(*) FROM candidate_history_backfill_attempts_v1'),'1');
    assert.equal(sql(`SELECT available_at FROM official_price_history WHERE stock_id='${stock}'`),firstAvailable);
    assert.equal(sql('SELECT attempts FROM candidate_history_backfill_months_v1'),'1');
    assert.equal(parsed(sql(call([{...bar,close:103}],'2026-01-02T00:00:00Z'))).status,'conflict');
    assert.equal(sql('SELECT close FROM official_price_history'),'102');
    assert.equal(sql('SELECT status FROM candidate_history_backfill_months_v1'),'conflict');
    assert.equal(sql('SELECT count(*) FROM candidate_history_backfill_attempts_v1'),'2');
    const invalid=spawnSync(binary('psql'),args,{input:call([{...bar,time:'2025-09-01'}],'2026-01-03T00:00:00Z'),encoding:'utf8'});
    assert.notEqual(invalid.status,0);
    assert.equal(sql('SELECT count(*) FROM candidate_history_backfill_attempts_v1'),'2');
    const multipleUrl='https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?stockNo=2330';
    const point={date:'2025-08-29',peRatio:20,pbRatio:5,sourceUrl:multipleUrl,provider:'official_primary',authorityTier:'official_primary',parserVersion:'twse-stock-history-v1'};
    sql(`SET ROLE service_role;SELECT public.complete_candidate_history_month_v1('${stock}','multiple','2025-08-01','2026-01-03','2025-08-29','2025-08-29','complete','complete',NULL,'${multipleUrl}','candidate-history-month-v1','[]','${JSON.stringify([point])}');`);
    assert.equal(sql('SELECT count(*) FROM official_multiple_history'),'1');
    assert.equal(sql('SELECT count(*) FROM fundamental_snapshots'),'1');
    assert.equal(sql("SELECT has_table_privilege('anon','public.candidate_history_backfill_months_v1','SELECT')"),'f');
    for(const table of ['candidate_history_backfill_months_v1','candidate_history_backfill_attempts_v1']) {
      for(const role of ['anon','authenticated','service_role']) {
        assert.equal(sql(`SELECT has_table_privilege('${role}','public.${table}','UPDATE')`),'f');
      }
    }
    const signature='public.complete_candidate_history_month_v1(uuid,text,date,timestamptz,date,date,text,text,timestamptz,text,text,jsonb,jsonb)';
    assert.equal(sql(`SELECT has_function_privilege('authenticated','${signature}','EXECUTE')`),'f');
    assert.equal(sql(`SELECT has_function_privilege('service_role','${signature}','EXECUTE')`),'t');

    // Genuine two-connection race: the normal writer's conflicting INSERT is
    // uncommitted (invisible to preflight), then the RPC waits on its unique key.
    // Release that writer only after PostgreSQL proves the RPC is lock-blocked.
    const race=async({raceStock,insert,invoke,table,valueColumn,expected})=>{
      sql(`INSERT INTO stocks VALUES('${raceStock}')`);
      const app=`history-race-${raceStock.slice(-2)}`;
      const writer=spawn(binary('psql'),args,{env:{...process.env,LC_ALL:'C',PGAPPNAME:`${app}-writer`}});
      const reader=spawn(binary('psql'),args,{env:{...process.env,LC_ALL:'C',PGAPPNAME:app}});
      let writerOutput='',readerOutput='',writerError='',readerError='';
      writer.stdout.on('data',(chunk)=>{writerOutput+=chunk;});
      writer.stderr.on('data',(chunk)=>{writerError+=chunk;});
      reader.stdout.on('data',(chunk)=>{readerOutput+=chunk;});
      reader.stderr.on('data',(chunk)=>{readerError+=chunk;});
      const writerDone=new Promise((resolve)=>writer.on('exit',(code)=>resolve(code)));
      const readerDone=new Promise((resolve)=>reader.on('exit',(code)=>resolve(code)));
      const until=async(predicate)=>{
        const deadline=Date.now()+5000;
        while(!predicate()){
          assert.ok(Date.now()<deadline,`race synchronization timeout: ${writerError} ${readerError}`);
          await new Promise((resolve)=>setTimeout(resolve,10));
        }
      };
      try {
        writer.stdin.write(`SET statement_timeout='10s'; BEGIN; ${insert} SELECT 'writer_ready';\n`);
        await until(()=>writerOutput.includes('writer_ready'));
        reader.stdin.end(`SET statement_timeout='10s'; ${invoke}`);
        await until(()=>sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${app}' AND cardinality(pg_blocking_pids(pid))>0`)==='1');
        writer.stdin.end('COMMIT;\n');
        assert.equal(await writerDone,0,writerError);
        assert.equal(await readerDone,0,readerError);
        assert.equal(parsed(readerOutput.trim()).status,'conflict');
        assert.equal(sql(`SELECT ${valueColumn} FROM ${table} WHERE stock_id='${raceStock}'`),expected);
        assert.equal(sql(`SELECT status FROM candidate_history_backfill_months_v1 WHERE stock_id='${raceStock}'`),'conflict');
      } finally { writer.kill();reader.kill(); }
    };
    const priceRaceStock='22222222-2222-4222-8222-222222222222';
    await race({raceStock:priceRaceStock,table:'official_price_history',valueColumn:'close',expected:'103',
      insert:`INSERT INTO official_price_history(stock_id,session_date,open,high,low,close,volume,provenance) VALUES('${priceRaceStock}','2025-08-29',100,105,98,103,1000,'{"authorityTier":"official_primary"}');`,
      invoke:call([bar]).replaceAll(stock,priceRaceStock)});
    for(const [table,raceStock] of [['official_multiple_history','33333333-3333-4333-8333-333333333333'],['fundamental_snapshots','44444444-4444-4444-8444-444444444444']]) {
      const dateColumn=table==='official_multiple_history'?'month_end':'as_of_date';
      await race({raceStock,table,valueColumn:'pe_ratio',expected:'21',
        insert:`INSERT INTO ${table}(stock_id,${dateColumn},pe_ratio,pb_ratio) VALUES('${raceStock}','2025-08-29',21,5);`,
        invoke:`SET ROLE service_role;SELECT public.complete_candidate_history_month_v1('${raceStock}','multiple','2025-08-01','2026-01-03','2025-08-29','2025-08-29','complete','complete',NULL,'${multipleUrl}','candidate-history-month-v1','[]','${JSON.stringify([point])}');`});
    }
  } finally {
    if(started) command('pg_ctl',['-D',data,'-m','fast','-w','stop']);
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
