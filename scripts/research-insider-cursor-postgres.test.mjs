import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const binaries=process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN;
const available=binaries&&['initdb','pg_ctl','psql'].every(name=>fs.existsSync(path.join(binaries,name)));
test('real existing PostgreSQL cursor DDL retains CAS/replay progress after restart',{skip:!available&&'PostgreSQL unavailable'},()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'si-insider-'));const cluster=path.join(tmp,'pg');const port=56000+process.pid%7000;
 const run=(name,args)=>execFileSync(path.join(binaries,name),args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const sql=q=>run('psql',['-X','-At','-v','ON_ERROR_STOP=1','-h',tmp,'-p',String(port),'-d','postgres','-c',q]);
 let started=false;
 try{
  run('initdb',['-D',cluster,'-A','trust','--no-instructions']);run('pg_ctl',['-D',cluster,'-l',path.join(tmp,'pg.log'),'-o',`-h '' -k ${tmp} -p ${port}`,'-w','start']);started=true;
  const shadow=fs.readFileSync('migrations/20260901_source_research_shadow_v2.sql','utf8');const truth=fs.readFileSync('migrations/20260906_truth_research_v3.sql','utf8');
  sql(shadow.match(/CREATE TABLE IF NOT EXISTS public\.source_connector_cursors \([\s\S]*?\n\);/)[0]);
  const start=truth.indexOf('ALTER TABLE public.source_connector_cursors\n  ADD COLUMN');const end=truth.indexOf('ALTER TABLE public.valuation_data_quality_events',start);sql(truth.slice(start,end));
  sql(`INSERT INTO source_connector_cursors(connector,scope_key,cursor_value,observed_at)VALUES('twse_insider_v1','TWSE','page0',clock_timestamp())`);
  assert.equal(sql(`WITH changed AS (UPDATE source_connector_cursors SET cursor_value='page500' WHERE connector='twse_insider_v1' AND scope_key='TWSE' AND cursor_value='page0' RETURNING 1)SELECT count(*)FROM changed`),'1');
  assert.equal(sql(`WITH changed AS (UPDATE source_connector_cursors SET cursor_value='page1' WHERE connector='twse_insider_v1' AND scope_key='TWSE' AND cursor_value='page0' RETURNING 1)SELECT count(*)FROM changed`),'0');
  assert.throws(()=>sql(`INSERT INTO source_connector_cursors(connector,scope_key,cursor_value,observed_at)VALUES('twse_insider_v1','TWSE','page0',clock_timestamp())`),/duplicate key/);
  sql(`INSERT INTO source_connector_cursors(connector,scope_key,cursor_value,observed_at)VALUES('twse_insider_v1','TPEX','page26',clock_timestamp())`);
  run('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);started=false;run('pg_ctl',['-D',cluster,'-l',path.join(tmp,'pg.log'),'-o',`-h '' -k ${tmp} -p ${port}`,'-w','start']);started=true;
  assert.equal(sql(`SELECT cursor_value FROM source_connector_cursors WHERE scope_key='TWSE'`),'page500');assert.equal(sql(`SELECT cursor_value FROM source_connector_cursors WHERE scope_key='TPEX'`),'page26');
 }finally{const target=process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS;if(target&&fs.existsSync(path.join(tmp,'pg.log'))){fs.mkdirSync(target,{recursive:true,mode:0o700});fs.copyFileSync(path.join(tmp,'pg.log'),path.join(target,'cursor-postgres.log'));}if(started)run('pg_ctl',['-D',cluster,'-m','immediate','-w','stop']);fs.rmSync(tmp,{recursive:true,force:true});}
});
