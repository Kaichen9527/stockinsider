/** Actual rotation orchestration -> service_role SQL. Synthetic cached factors and
 * calendar only; real-clock postclose guard is never changed. Selection extraction
 * is a read-only SQL predicate proof, NOT a completed two-day atomic swap proof. */
import assert from 'node:assert/strict';import test from 'node:test';import fs from 'node:fs';import path from 'node:path';import {createHash}from'node:crypto';import{createRequire}from'node:module';import{gunzipSync}from'node:zlib';import{spawnSync}from'node:child_process';
import {rotateCachedObservations} from '../web/src/lib/vnext/rotation.ts';
const{Client}=createRequire(import.meta.url)('pg');const out=process.env.VNEXT_NATIVE_ARTIFACTS;
if(!out||!path.isAbsolute(out)||fs.existsSync(out))throw Error('fresh_absolute_rotation_evidence_required');fs.mkdirSync(out,{mode:0o700});
const container='stockinsider-vnext-oct22-legacy-full-03';const host='/tmp/stockinsider-vnext-oct22-private/legacy-full-pg-socket-03/socket';const database='vnext_rotation_01';
const made=spawnSync('docker',['--host=unix:///var/run/docker.sock','exec',container,'createdb','-U','postgres',database],{encoding:'utf8'});assert.equal(made.status,0,made.stderr);
const sha=x=>createHash('sha256').update(x).digest('hex');const save=(n,v)=>fs.writeFileSync(path.join(out,n+'.json'),JSON.stringify(v,null,2)+'\n',{mode:0o600});
const source=fs.readFileSync('migrations/20261022_stockinsider_vnext_20_v1.sql');const captured=gunzipSync(fs.readFileSync('scripts/opportunity-v3/fixtures/vps-schema-20261011.sql.gz')).toString();
function definition(kind,name){const m=captured.match(kind==='FUNCTION'?new RegExp(`CREATE FUNCTION public\\.${name}\\(.*?\\n\\$\\$;`,'su'):new RegExp(`CREATE TABLE public\\.${name} \\(.*?\\n\\);`,'su'));assert.ok(m);return m[0];}
const connect=async()=>{const c=new Client({host,database,user:'postgres',ssl:false,connectionTimeoutMillis:3000,statement_timeout:30000});await c.connect();return c;};const events=[];
await test('waiting incumbents remain comparable and actual rotation obeys the real postclose SQL fence',async()=>{
 const admin=await connect(),observer=await connect(),writer=await connect();assert.notEqual(observer.processID,writer.processID);
 const state=async()=>{const rows=(await observer.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'vnext_%' ORDER BY 1")).rows;const result={};for(const {tablename}of rows){assert.match(tablename,/^[a-z0-9_]+$/u);const full=(await observer.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM public.${tablename} t`)).rows[0].rows;result[tablename]={count:full.length,hash:sha(JSON.stringify(full))};}return result;};
 const rpc=async(action,body)=>{await writer.query('SET ROLE service_role');try{const ready=new Promise(resolve=>writer.connection.once('readyForQuery',m=>resolve(m.status)));const response=await writer.query('SELECT public.vnext_command_v1($1,$2,$3) AS result',['synthetic-rotation-operator',action,body]);assert.equal(await ready,'I');events.push({action,bodyHash:sha(JSON.stringify(body)),ready:'I'});return response.rows[0].result;}finally{await writer.query('RESET ROLE');}};
 try{
  await admin.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC;GRANT USAGE ON SCHEMA public TO service_role;${definition('TABLE','production_writer_releases')}\n${definition('TABLE','production_write_leases')}\n${definition('FUNCTION','enforce_production_writer_fence')}`);await admin.query(source.toString());
  await admin.query("UPDATE vnext_mode_v1 SET enabled=true,legacy_fenced=true;INSERT INTO vnext_principals_v1 VALUES('synthetic-rotation-operator','operator',true)");
  const session=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await admin.query("INSERT INTO vnext_sessions_v1 VALUES($1,clock_timestamp()-interval '1 hour',true)",[session]);
  const candidate=(symbol,points,price=true)=>({symbol,hash:sha(symbol),eligible:true,priceEvidence:price,eventEvidence:true,rootEvidence:true,eventAt:new Date().toISOString(),contraindication:false,overheated:symbol==='6001',initialScore:{confirmedPoints:points,availableWeight:100},factors:{recency:{value:points/100,provenance:['synthetic original date'],reason:'fixture'}}});
  const inputs=[candidate('6001',20),candidate('6002',40),candidate('6003',1,false),candidate('6999',90)];
  for(const row of inputs.slice(0,3))await admin.query("INSERT INTO vnext_members_v1(symbol,state,input_hash,evidence,admitted_session) VALUES($1,$2,$3,$4,$5)",[row.symbol,row.symbol==='6002'?'eligible':'waiting',row.hash,row,session]);
  await rpc('screen-observations',{session,observations:inputs.map(input=>({symbol:input.symbol,input}))});
  const match=source.toString().match(/SELECT member\.\* INTO v_incumbent FROM public\.vnext_members_v1 member[\s\S]*?LIMIT 1;/u);assert.ok(match);
  const query=match[0].replace(' INTO v_incumbent','').replaceAll('session_date=s','session_date=$1');
  const selected=(await observer.query(query,[session])).rows;assert.equal(selected.length,1);assert.equal(selected[0].symbol,'6001');assert.equal(selected[0].state,'waiting');
  const observed=[];const before=await state();
  const rotation=await rotateCachedObservations({session,completed:true,postclose:true,weeklyDue:false},inputs.map(input=>({symbol:input.symbol,input,candidate:input,active:input.symbol!=='6999'})),async(action,body)=>{
   const beforeCall=await state();const result=await rpc(action,body);if(action==='swap'){const after=await state();if(result.deferred==='routine_swap_requires_postclose')assert.deepEqual(after,beforeCall);observed.push({result,before:beforeCall,after});}return result;
  });
  assert.equal(observed.length,1);const realPostclose=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(':',''))>=1830;
  if(!realPostclose)assert.equal(observed[0].result.deferred,'routine_swap_requires_postclose');
  else assert.equal(observed[0].result.deferred,'confirmation_pending');
  save('receipt',{migrationSha256:sha(source),querySha256:sha(query),exactExtractionSha256:sha(match[0]),selection:selected.map(r=>({symbol:r.symbol,state:r.state})),observerPid:observer.processID,writerPid:writer.processID,rotation,observed,before,events,realPostclose,scope:'actual orchestration and DB selection/rejection; synthetic calendar/factors; completed two-day positive swap NOT_RUN',notRun:['two actual postclose sessions','formal source/model/qualification','production ACL/HBA']});
 }finally{await Promise.all([admin.end(),observer.end(),writer.end()]);save('cleanup',{trackedClientsEnded:true,dataRetained:true});}
});
