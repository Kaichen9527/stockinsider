/** Read-only continuation of retained worker-native-02, never a second model run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const {Client}=createRequire(import.meta.url)('pg');
const output=process.env.VNEXT_NATIVE_ARTIFACTS;
if(!output||!path.isAbsolute(output)||fs.existsSync(output))throw Error('fresh_owned_read_artifact_required');
fs.mkdirSync(output,{mode:0o700});
const save=(n,v)=>fs.writeFileSync(path.join(output,n+'.json'),JSON.stringify(v,null,2)+'\n',{mode:0o600});
const hash=b=>createHash('sha256').update(b).digest('hex');
const prior=JSON.parse(fs.readFileSync('/tmp/stockinsider-vnext-oct22-private/worker-native-02/final-state.json'));
const connection={host:'/tmp/stockinsider-vnext-oct22-private/worker-pg-socket-02/socket',user:'postgres',database:'vnext_worker',ssl:false,connectionTimeoutMillis:3000,statement_timeout:30000};
await test('actual service-role public READ preserves the retained worker revisions and all ledger rows',async()=>{
 const reader=new Client(connection),observer=new Client(connection);const states=[];
 const snapshot=async()=>{const result={};await observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{for(const name of Object.keys(prior)){assert.match(name,/^[a-z0-9_]+$/u);const rows=(await observer.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM public.${name} t`)).rows[0].rows;result[name]={count:rows.length,sha256:hash(JSON.stringify(rows))};}await observer.query('COMMIT');return result;}catch(error){await observer.query('ROLLBACK');throw error;}};
 try{
  await reader.connect();await observer.connect();assert.notEqual(reader.processID,observer.processID);const before=await snapshot();assert.deepEqual(before,Object.fromEntries(Object.entries(prior).map(([n,v])=>[n,{count:v.count,sha256:v.sha256}])));
  await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await reader.query('SET LOCAL ROLE service_role');assert.equal((await reader.query('SELECT current_user AS role')).rows[0].role,'service_role');
  for(const [name,symbol] of [['home',null],['detail','2409']]){const ready=new Promise(resolve=>reader.connection.once('readyForQuery',m=>resolve(m.status)));const [query,settled]=await Promise.all([reader.query('SELECT public.vnext_read_v1($1) AS value',[symbol]),ready]);assert.equal(settled,'T');states.push({name,ready:settled,querySettled:true});save(name,query.rows[0].value);}
  const ready=new Promise(resolve=>reader.connection.once('readyForQuery',m=>resolve(m.status)));await reader.query('COMMIT');assert.equal(await ready,'I');states.push({command:'COMMIT READ ONLY',ready:'I'});
  const home=JSON.parse(fs.readFileSync(path.join(output,'home.json'))),detail=JSON.parse(fs.readFileSync(path.join(output,'detail.json')));assert.equal(detail.history.length,1);assert.equal(detail.history[0].content.claims[0].numeric.value,0.5);assert.equal(detail.history[0].qualification.qualified,false);
  assert.equal(home.members.find(m=>m.symbol==='2409').revisionId,detail.history[0].revisionId);assert.ok(home.members.every(m=>m.state!=='eligible'));
  const after=await snapshot();assert.deepEqual(after,before);save('receipt',{scope:'actual read-only service-role RPC over retained synthetic worker-native-02; no additional provider/receive/publish/model calls or production identity',baselineSource:'be66937d7081d35baedeec47e20a49a9af0160c8',readerPid:reader.processID,observerPid:observer.processID,before,after,states,homeMembers:home.members.length,revisionId:detail.history[0].revisionId,qualified:false});
 }finally{await Promise.allSettled([reader.end(),observer.end()]);}
});
