// Explicit VM-only actual stack acceptance. Never skips missing tools/build.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFileSync,spawn} from 'node:child_process';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {localProcessEnvironment,redactLocalLogChunks} from './research-local-inbox-dataplane.mjs';
import {insiderContinuationCommand} from './research-insider-continuation-command.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
async function port(){const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p;}
async function ready(url,child){for(let i=0;i<200;i++){if(child.exitCode!==null)throw Error('isolated_child_exited');try{await fetch(url,{signal:AbortSignal.timeout(100),redirect:'error'});return;}catch{await new Promise(r=>setTimeout(r,100));}}throw Error('isolated_child_not_ready');}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);if(child.exitCode===null)child.kill('SIGKILL');}
function profile(){
 const pieces=[];const definitions=[];
 const select=(file,marker,end='\n);')=>{const text=fs.readFileSync(path.join(root,file),'utf8');const start=text.indexOf(marker);const finish=text.indexOf(end,start);assert.ok(start>=0&&finish>start,marker);const sql=text.slice(start,finish+end.length);pieces.push(sql);definitions.push({file,marker,sha256:hash(sql)});};
 select('supabase_schema.sql','CREATE TABLE IF NOT EXISTS stocks (');
 select('migrations/20260315_research_system_v2.sql','CREATE TABLE IF NOT EXISTS source_entities (');
 select('migrations/20260315_research_system_v2.sql','CREATE TABLE IF NOT EXISTS source_raw_documents (');
 select('migrations/20260901_source_research_shadow_v2.sql','ALTER TABLE public.source_raw_documents',';');
 select('migrations/20260906_source_identity_v4.sql','ALTER TABLE public.source_raw_documents',';');
 select('migrations/20260315_research_runtime_v21.sql','CREATE TABLE IF NOT EXISTS connector_runs (');
 select('migrations/20260830_source_ranking_v2.sql','CREATE TABLE IF NOT EXISTS public.source_run_ledger (');
 select('migrations/20260830_source_ranking_v2.sql','CREATE TABLE IF NOT EXISTS public.source_connector_registry (');
 select('migrations/20260906_source_identity_v4.sql','ALTER TABLE public.source_run_ledger',';');
 select('migrations/20260831_candidate_shadow_performance.sql','CREATE TABLE IF NOT EXISTS public.production_write_leases (');
 for(const name of ['acquire_production_write_lease','release_production_write_lease'])select('migrations/20260831_candidate_shadow_performance.sql',`CREATE OR REPLACE FUNCTION public.${name}(`,'$function$;');
 pieces.push('REVOKE ALL ON FUNCTION public.acquire_production_write_lease(text,uuid,integer),public.release_production_write_lease(text,uuid) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.acquire_production_write_lease(text,uuid,integer),public.release_production_write_lease(text,uuid) TO service_role;');
 // Existing production service operations reproduced explicitly in this narrow test profile.
 for(const table of ['source_entities','source_raw_documents','connector_runs','source_run_ledger','source_connector_registry'])pieces.push(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;REVOKE ALL ON ${table} FROM PUBLIC,anon,authenticated;GRANT SELECT,INSERT,UPDATE ON ${table} TO service_role;CREATE POLICY isolated_service_only ON ${table} TO service_role USING(true) WITH CHECK(true);`);
 pieces.push('ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;REVOKE ALL ON stocks FROM PUBLIC,anon,authenticated,service_role;GRANT SELECT ON stocks TO service_role;CREATE POLICY isolated_empty_stock_read ON stocks FOR SELECT TO service_role USING(true);');
 const migration=fs.readFileSync(path.join(root,'migrations/20261008_insider_snapshots_v1.sql'),'utf8');pieces.push(migration);definitions.push({file:'migrations/20261008_insider_snapshots_v1.sql',sha256:hash(migration)});
 return {sql:pieces.join('\n'),definitions};
}
test('actual isolated Next→PostgREST→PostgreSQL snapshot continuation and maximum admission transport',{timeout:180000},async t=>{
 assert.equal(process.platform,'linux','VM Linux acceptance required');assert.equal(process.env.NODE_TEST_CONTEXT,'child-v8');
 const pg=process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN;const pgrst=process.env.RESEARCH_LOCAL_DATAPLANE_POSTGREST_BIN;const artifacts=process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS;
 for(const value of [pg,pgrst,artifacts])assert.ok(value&&path.isAbsolute(value),'explicit isolated tool/artifact paths required');assert.ok(fs.existsSync(path.join(root,'web/.next/BUILD_ID')),'normal built Next artifact required');
 const env=localProcessEnvironment();const archive=fs.readFileSync(path.join(path.dirname(pgrst),'postgrest-v16.3.tar.xz'));assert.equal(hash(archive),'4eb414eb948c8800863cc8c9896a17b611b2dccf9ff581f4d57f42ec9ccee40d');
 const extracted=execFileSync('tar',['-xOJf','-','postgrest'],{input:archive,maxBuffer:32_000_000,env});assert.equal(hash(fs.readFileSync(pgrst)),hash(extracted));
 fs.mkdirSync(artifacts,{mode:0o700});const socket=path.join(artifacts,'s');fs.mkdirSync(socket,{mode:0o700});assert.ok(Buffer.byteLength(socket)<95);const cluster=path.join(artifacts,'pg');const pgPort=await port(),rpcPort=await port(),compatPort=await port(),appPort=await port();
 const exec=(name,args,input)=>execFileSync(path.join(pg,name),args,{env:{...env,PGPASSFILE:'/dev/null'},encoding:'utf8',input,stdio:['pipe','pipe','pipe'],timeout:45000,maxBuffer:32*1024*1024}).trim();
 const sql=text=>exec('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(pgPort),'-d','postgres'],text);
 const key=randomBytes(32).toString('hex'),secret=randomBytes(48).toString('hex');const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const unsigned=`${encode({alg:'HS256',typ:'JWT'})}.${encode({role:'service_role',exp:Math.floor(Date.now()/1000)+1800})}`;const bearer=unsigned+'.'+createHmac('sha256',secret).update(unsigned).digest('base64url');
 const logs={next:[],postgrest:[]};let pgRunning=false,postgrest,next,compatibility;
 const report={syntheticSourceFixture:true,officialSourceTransport:'not requested: all five pins are preadmitted synthetic fixtures; not an egress trace',production:false,fullPredecessorProfile:false,checks:[],startedAt:new Date().toISOString()};
 try{
  exec('initdb',['-D',cluster,'-A','trust','--no-instructions']);exec('pg_ctl',['-D',cluster,'-l',path.join(artifacts,'pg.log'),'-o',`-h '' -k ${socket} -p ${pgPort}`,'-w','start']);pgRunning=true;
  sql('CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;CREATE ROLE local_postgrest LOGIN NOINHERIT;GRANT anon,service_role TO local_postgrest;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;');
  const installed=profile();sql(installed.sql);report.definitions=installed.definitions;
  postgrest=spawn(pgrst,[],{env:{...env,PGRST_DB_URI:`postgresql://local_postgrest@/postgres?host=${socket}&port=${pgPort}`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(rpcPort),PGRST_DB_POOL:'2',PGRST_OPENAPI_MODE:'disabled'},stdio:['ignore','pipe','pipe']});
  for(const stream of [postgrest.stdout,postgrest.stderr])stream.on('data',b=>logs.postgrest.push(String(b)));await ready(`http://127.0.0.1:${rpcPort}/`,postgrest);
  compatibility=http.createServer(async(req,res)=>{try{
   if(!req.url.startsWith('/rest/v1/')){res.writeHead(404);res.end();return;}
   const parts=[];let count=0;for await(const part of req){count+=part.length;if(count>16777216+4096)throw Error('request_bound');parts.push(part);}
   const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
   const result=await fetch(`http://127.0.0.1:${rpcPort}/${req.url.slice(9)}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(parts),redirect:'error',signal:AbortSignal.timeout(45000)});
   const responseParts=[];let bytes=0;for await(const part of result.body??[]){bytes+=part.length;if(bytes>4*1024*1024)throw Error('response_bound');responseParts.push(part);}
   const output=Object.fromEntries(result.headers);delete output['content-length'];delete output['content-encoding'];res.writeHead(result.status,output);res.end(Buffer.concat(responseParts));
  }catch{res.writeHead(502);res.end('{"error":"isolated_compatibility_failed"}');}});
  await new Promise(resolve=>compatibility.listen(compatPort,'127.0.0.1',resolve));
  const rpc=async(name,args)=>{const r=await fetch(`http://127.0.0.1:${compatPort}/rest/v1/rpc/${name}`,{method:'POST',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(45000)});const body=await r.json();return {status:r.status,body};};
  const begin=async id=>{const r=await rpc('insider_snapshot_run_v1',{p_run:id});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const admit=async(state,dataset,rows,raw=Buffer.from(JSON.stringify(rows)))=>rpc('admit_insider_snapshot_v1',{p_run:state.runId,p_dataset:dataset,p_token:state.members[dataset].acquisitionToken,p_raw_base64:raw.toString('base64'),p_hash:hash(raw),p_rows:rows.length,p_attempted:new Date(Date.now()-2000).toISOString(),p_observed:new Date(Date.now()-1000).toISOString(),p_parser:'insider-db-projection-v1',p_rights:'official-insider-private-research-retain-v1'});
  const row={公司代號:'2330',公司名稱:'Synthetic Fixture',職稱:'董事',姓名:'Synthetic Person',出表日期:'1151008',資料年月:'11509',目前持股:'100'};
  let run=await begin(randomUUID());for(let d=0;d<5;d++){const r=await admit(run,d,d===0?Array.from({length:1001},(_,i)=>({...row,姓名:`Synthetic ${i}`})):[]);assert.equal(r.status,200,JSON.stringify(r.body));run=r.body;}assert.equal(run.frozen,true);
  const pins=run.members.map(({dataset,snapshotId})=>({dataset,snapshotId}));
  next=spawn(process.execPath,[path.join(root,'web/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(appPort)],{cwd:path.join(root,'web'),env:{...env,NODE_ENV:'production',INTERNAL_API_KEY:key,LEGACY_RADAR_CORRECTNESS_PROJECTION:'enabled',SUPABASE_URL:`http://127.0.0.1:${compatPort}/`,SUPABASE_SERVICE_ROLE_KEY:bearer,TWSE_OFFICIAL_OPENAPI_ENABLED:'true',RADAR_PUBLIC_SNAPSHOTS_ENABLED:'disabled',SOURCE_LED_OPPORTUNITY_V3:'disabled'},stdio:['ignore','pipe','pipe']});
  for(const stream of [next.stdout,next.stderr])stream.on('data',b=>logs.next.push(String(b)));const origin=`http://127.0.0.1:${appPort}/`;await ready(origin+'api/internal/source-sync',next);
  const request={connector:'twse_insider',insiderSnapshot:{runId:run.runId,pins}};
  await t.test('real guarded endpoint unauthorized401 writes no documents',async()=>{const r=await fetch(origin+'api/internal/source-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});assert.equal(r.status,401);assert.equal(sql('SELECT count(*) FROM source_raw_documents;'),'0');report.checks.push('auth401_zero_documents');});
  await t.test('real Next/DB three rounds complete1001rows and fourempty snapshots via existing document writer',async()=>{
   const input=path.join(artifacts,'run-input.json');fs.writeFileSync(input,JSON.stringify(request.insiderSnapshot),{mode:0o600});
   const result=await insiderContinuationCommand(['--input',input,'--origin',origin,'--journal',path.join(artifacts,'journal')],{env:{INTERNAL_API_KEY:key}});
   assert.equal(result.stopped,'complete');assert.equal(result.invocations,3);assert.equal(sql('SELECT count(*) FROM source_raw_documents;'),'1001');assert.equal(sql('SELECT count(*) FROM insider_snapshots_v1;'),'5');assert.equal(sql('SELECT count(*) FROM insider_snapshot_progress_v1 WHERE complete;'),'5');assert.equal(sql('SELECT count(*) FROM source_run_ledger WHERE succeeded_at IS NOT NULL;'),'0');assert.equal(sql('SELECT count(*) FROM stocks;'),'0');report.checks.push('three_rounds_exact_five_pins');
  });
  await t.test('real completed replay keeps fiveidentities and first collected_at unchanged',async()=>{
   const before=sql("SELECT md5(string_agg(id::text||collected_at::text,'' ORDER BY id)) FROM source_raw_documents;");const r=await fetch(origin+'api/internal/source-sync',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(request)});assert.equal(r.status,200);const body=await r.json();assert.equal(body.result.recordsWritten,0);assert.equal(body.result.metadata.insider_snapshot.liveAcquisitions.length,0);assert.deepEqual(body.result.metadata.insider_snapshot.pins,pins);assert.equal(sql("SELECT md5(string_agg(id::text||collected_at::text,'' ORDER BY id)) FROM source_raw_documents;"),before);report.checks.push('replay_no_reacquisition_or_clock_reset');
  });
  await t.test('actual PostgREST12MiB raw /16MiBbase64 envelope accepted; +1 rejected',async()=>{
   const capacityRun=await begin(randomUUID());const raw=Buffer.from('[]'+' '.repeat(12*1024*1024-2));report.maxRawBytes=raw.length;report.maxBase64Bytes=raw.toString('base64').length;
   const exact=await admit(capacityRun,0,[],raw);assert.equal(exact.status,200,JSON.stringify(exact.body));const over=await admit(exact.body,1,[],Buffer.concat([raw,Buffer.from(' ')]));assert.notEqual(over.status,200);assert.equal(sql('SELECT max(octet_length(raw)) FROM insider_snapshots_v1;'),String(12*1024*1024));report.checks.push('actual_maximum_base64_transport');
  });
  await t.test('actual escaped500row projection rejects before activation over PostgREST',async()=>{
   const state=await begin(randomUUID());const candidate=Array.from({length:500},()=>({...row,姓名:'\u0001'.repeat(512),公司名稱:'\u0001'.repeat(512),職稱:'\u0001'.repeat(512)}));const before=sql('SELECT count(*) FROM insider_snapshots_v1;');const r=await admit(state,3,candidate);assert.notEqual(r.status,200);assert.match(String(r.body.message),/projection_transport_bound/);assert.equal(sql('SELECT count(*) FROM insider_snapshots_v1;'),before);report.checks.push('projection_rejection_atomic');
  });
  report.databaseBytes=Number(sql("SELECT pg_database_size('postgres');"));report.snapshotRelationBytes=Number(sql("SELECT pg_total_relation_size('insider_snapshots_v1');"));report.pendingReservations=Number(sql('SELECT count(*) FROM insider_acquisitions_v1 WHERE snapshot_id IS NULL;'));report.nodeMemoryAtCompletion=process.memoryUsage();report.peakProcessMemoryMeasured=false;report.walBytes=Number(sql('SELECT wal_bytes FROM pg_stat_wal;'));report.passed=true;
 }finally{
  await stop(next);await stop(postgrest);if(compatibility){compatibility.closeAllConnections();await new Promise(r=>compatibility.close(r));}if(pgRunning)exec('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);
  for(const [name,chunks] of Object.entries(logs))fs.writeFileSync(path.join(artifacts,name+'.log'),redactLocalLogChunks(chunks,[key,bearer,secret]),{mode:0o600,flag:'wx'});
  fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 }
 assert.equal(report.passed,true);
});
