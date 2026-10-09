import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,execFile,spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {completeMaterial} from '../web/src/lib/research-complete-input.ts';
import {FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
import {completeHash} from '../web/src/lib/research-complete-canonical.ts';
import mapping from '../web/src/lib/research-complete-mapping.json' with {type:'json'};
// Preserve explicit environment selection (including an invalid nonempty path).
// Ordinary CI exposes pg_config on PATH; protected CI provides its pinned bin.
const bin=process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN || process.env.OPPORTUNITY_V3_POSTGRES_BIN || (()=>{
 try {return execFileSync('pg_config',['--bindir'],{encoding:'utf8',timeout:5000,maxBuffer:4096}).trim();}
 catch {return '';}
})();
const q=v=>"'"+String(v).replaceAll("'","''")+"'";

const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('CI-04 actual PG lock wait rechecks original job/reservation deadline (synthetic short initial leases; natural clock; fixed AUO files)',async t=>{
 assert.ok(bin&&['initdb','pg_ctl','psql'].every(n=>fs.existsSync(path.join(bin,n))),'actual PostgreSQL required; unavailable is not a pass');
 assert.equal(process.env.LD_PRELOAD,undefined,'no preloaded clock/library permitted');for(const key of Object.keys(process.env))assert.ok(!key.startsWith('FAKETIME'),'no fake-clock configuration permitted');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'si-complete-lock-')),pg=path.join(tmp,'pg'),port=55000+process.pid%5000;let active=false;
 const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',tmp,'-p',String(port),'-d','postgres'];
 const run=(n,a,input)=>execFileSync(path.join(bin,n),a,{encoding:'utf8',input,timeout:10000,maxBuffer:4*1024*1024}).trim();
 const sql=s=>run('psql',args,`SET statement_timeout='10s';${s}`);
 const start=()=>{run('pg_ctl',['-D',pg,'-l',path.join(tmp,'pg.log'),'-o',`-h '' -k ${tmp} -p ${port}`,'-w','start']);active=true;};
 const id=randomUUID(),base='https://example.invalid/lock-expiry-synthetic-source';
 const add=()=>sql(`SET ROLE service_role;INSERT INTO source_raw_documents(id,document_url,collected_at,metadata) VALUES(${q(id)},${q(base)},clock_timestamp()-interval '1 second',jsonb_build_object('canonical_url',${q(base)},'rights_boundary','public_citation'));`);
 const job=randomUUID(),reservation=randomUUID(),company=randomUUID(),priority=randomUUID(),snapshot='a'.repeat(64),owner='synthetic-lock-preparer';
 const children=new Set(),evidence=[];
 const child=(label,statement,interactive=false)=>{
  const p=spawn(path.join(bin,'psql'),args,{stdio:['pipe','pipe','pipe']});children.add(p);let stdout='',stderr='',size=0,guard=null;const begun=performance.now();
  const timer=setTimeout(()=>{guard='12s external child deadline';p.kill('SIGKILL');},12000);
  const done=new Promise(resolve=>{p.on('error',e=>{stderr+=String(e);guard='spawn_error';});p.stdout.on('data',d=>{size+=d.length;stdout+=d.toString();if(size>4*1024*1024){guard='4MiB child output';p.kill('SIGKILL');}});p.stderr.on('data',d=>{size+=d.length;stderr+=d.toString();if(size>4*1024*1024){guard='4MiB child output';p.kill('SIGKILL');}});p.on('close',(code,signal)=>{clearTimeout(timer);children.delete(p);const r={label,code,signal,guard,elapsedMs:performance.now()-begun,stdout,stderr};evidence.push(r);resolve(r);});});
  p.stdin.on('error',()=>{});p.stdin.write(`SET statement_timeout='10s';SET application_name=${q(label)};${statement}\n`);if(!interactive)p.stdin.end();return{p,done,label};
 };
 const poll=async(fn,message,limit=3000)=>{const end=performance.now()+limit;while(performance.now()<end){const value=fn();if(value)return value;await wait(15);}assert.fail(message);};
 try{
  run('initdb',['-D',pg,'-A','trust','--no-instructions']);start();
  sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE TABLE source_raw_documents(id uuid PRIMARY KEY,document_url text NOT NULL,published_at timestamptz,collected_at timestamptz NOT NULL,metadata jsonb NOT NULL);GRANT ALL ON source_raw_documents TO service_role;`);
  sql(fs.readFileSync('migrations/20261009_research_publication_source_fence_v2.sql','utf8'));
  sql(`CREATE TABLE research_observed_companies_v1(research_company_id uuid PRIMARY KEY,symbol text);
   CREATE TABLE research_observed_roster_snapshots_v1(snapshot_hash text PRIMARY KEY,mapping_digest text,received_at timestamptz,latest_observed_at timestamptz);
   CREATE TABLE research_observed_roster_members_v1(snapshot_hash text,research_company_id uuid,symbol text);
   CREATE TABLE research_priority_runs_v1(run_id uuid PRIMARY KEY,research_scope text,observed_snapshot_hash text,as_of timestamptz,input_hash text);
   CREATE TABLE research_observed_priority_store_receipts_v1(run_id uuid,stored_run_hash text);
   CREATE TABLE research_deep_jobs_v1(job_id uuid PRIMARY KEY,priority_run_id uuid,symbol text,stock_id uuid,research_scope text,research_company_id uuid,observed_snapshot_hash text,status text,attempts integer,lease_owner text,lease_expires_at timestamptz);
   CREATE TABLE research_deep_job_attempts_v1(job_id uuid,attempt integer,owner text,claimed_at timestamptz,lease_expires_at timestamptz);
   CREATE TABLE research_model_reservations_v1(reservation_id uuid PRIMARY KEY,role text,owner text,work_key text,started_at timestamptz,lease_expires_at timestamptz,reserved_seconds integer NOT NULL DEFAULT 1800 CHECK(reserved_seconds=1800),taipei_day date NOT NULL DEFAULT ((clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date));
   CREATE TABLE research_model_completions_v1(reservation_id uuid);
   CREATE TABLE stocks(id uuid PRIMARY KEY,symbol text);
   INSERT INTO research_observed_companies_v1 VALUES(${q(company)},'2409');
   INSERT INTO research_observed_roster_snapshots_v1 VALUES(${q(snapshot)},${q('b'.repeat(64))},now()-interval '3 minute',now()-interval '4 minute');
   INSERT INTO research_observed_roster_members_v1 VALUES(${q(snapshot)},${q(company)},'2409');
   INSERT INTO research_priority_runs_v1 VALUES(${q(priority)},'research_observed_v1',${q(snapshot)},now()-interval '2 minute',${q('c'.repeat(64))});
   INSERT INTO research_observed_priority_store_receipts_v1 SELECT run_id,encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') FROM research_priority_runs_v1 r;
   INSERT INTO research_deep_jobs_v1 VALUES(${q(job)},${q(priority)},'2409',NULL,'research_observed_v1',${q(company)},${q(snapshot)},'running',1,${q(owner)},now()+interval '28 minute');
   INSERT INTO research_deep_job_attempts_v1 SELECT job_id,1,lease_owner,now()-interval '1 minute',lease_expires_at FROM research_deep_jobs_v1;
   INSERT INTO research_model_reservations_v1 VALUES(${q(reservation)},'company_research',${q(owner)},${q('deep:'+job+':1')},now()-interval '1 minute',now()+interval '28 minute');`);
  const roster=fs.readFileSync('migrations/20261008_research_observed_roster_v1.sql','utf8');sql(roster.slice(roster.indexOf('CREATE FUNCTION public.research_observed_canonical_json_v1'),roster.indexOf('-- Fail closed beyond PostgreSQL')));
  sql(fs.readFileSync('migrations/20261009_research_input_preparations_v2.sql','utf8'));
  sql(fs.readFileSync('migrations/20261009_research_input_preparation_assert_v2.sql','utf8'));
  sql('ALTER TABLE source_raw_documents ENABLE ROW LEVEL SECURITY;ALTER TABLE research_deep_jobs_v1 ENABLE ROW LEVEL SECURITY;ALTER TABLE research_model_reservations_v1 ENABLE ROW LEVEL SECURITY;');
  const req={owner,jobId:job,attempt:1,reservationId:reservation,bundleId:null,sourceDocumentIds:[id],scope:'research_observed_v1',snapshotHash:snapshot};
  // Only initial synthetic INSERTs choose short deadlines. Never UPDATE a
  // sealed preparation, immutable charge, existing job lease or reservation.
  const unit=(jobSeconds=20,reservationSeconds=20)=>{assert.ok([jobSeconds,reservationSeconds].every(n=>Number.isInteger(n)&&n>=6&&n<=30));const j=randomUUID(),r=randomUUID();sql(`WITH n AS(SELECT clock_timestamp() n) INSERT INTO research_deep_jobs_v1 SELECT ${q(j)},priority_run_id,symbol,stock_id,research_scope,research_company_id,observed_snapshot_hash,status,attempts,lease_owner,n.n+interval '${jobSeconds} seconds' FROM research_deep_jobs_v1 CROSS JOIN n WHERE job_id=${q(job)};
   INSERT INTO research_deep_job_attempts_v1 SELECT job_id,1,lease_owner,clock_timestamp(),lease_expires_at FROM research_deep_jobs_v1 WHERE job_id=${q(j)};
   INSERT INTO research_model_reservations_v1 SELECT ${q(r)},role,owner,${q('deep:'+j+':1')},clock_timestamp(),clock_timestamp()+interval '${reservationSeconds} seconds' FROM research_model_reservations_v1 WHERE reservation_id=${q(reservation)};`);return {...req,jobId:j,reservationId:r};};
  const prepare=r=>JSON.parse(sql(`SET ROLE service_role;SELECT prepare_research_input_v2(${q(JSON.stringify(r))});`));
  add();let saved;

  sql(fs.readFileSync('migrations/20261009_research_complete_input_v2.sql','utf8'));
  const db={rpc(name,a){const arg=Object.values(a).map(v=>q(typeof v==='object'?JSON.stringify(v):v)).join(',');const response=promisify(execFile)(path.join(bin,'psql'),[...args,'-c',`SET ROLE service_role;SELECT ${name}(${arg});`],{encoding:'utf8',timeout:6000,maxBuffer:1048576}).then(({stdout})=>({data:JSON.parse(stdout.trim()),error:null}));return Object.assign(response,{abortSignal:()=>response});}};

  const request=p=>({owner,jobId:p.job_id,attempt:1,reservationId:p.reservation_id,scope:'research_observed_v1',snapshotHash:snapshot,preparationId:p.preparation_id,preparationHash:p.input_hash,expectedArtifactManifestHash:mapping.companies['2409'].inventoryHash,expectedCalculatorExecutionHash:mapping.sourceClosureHash});
  const read=req=>JSON.parse(sql(`SET ROLE service_role;SELECT read_research_article_input_revision_v2(${q(JSON.stringify(req))});`));
  const seal=(req,m)=>JSON.parse(sql(`SET ROLE service_role;SELECT seal_research_article_input_revision_v2(${q(JSON.stringify(req))},${q(JSON.stringify(m))});`));
  const audit=()=>JSON.parse(sql(`SELECT jsonb_build_object(${['source_raw_documents','research_source_seals_v2','research_source_fence_events_v2','research_source_seal_invalidations_v2','research_input_preparations_v2','research_article_input_revisions_v2','research_model_reservations_v1','research_model_completions_v1','research_deep_jobs_v1','research_deep_job_attempts_v1','stocks'].map(name=>`${q(name)},(SELECT jsonb_build_object('count',count(*),'rowHash',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'[]'),'UTF8')),'hex')) FROM ${name} x)`).join(',')},'budgetReservedSeconds',(SELECT coalesce(sum(reserved_seconds),0) FROM research_model_reservations_v1),'charge',(SELECT coalesce(sum(logical_bytes),0) FROM (SELECT logical_bytes FROM research_input_preparations_v2 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2) h));`));
  const leases=r=>JSON.parse(sql(`SELECT jsonb_build_object('jobExpiresAt',j.lease_expires_at,'reservationExpiresAt',r.lease_expires_at,'reservationStartedAt',r.started_at,'serverNow',clock_timestamp(),'bothLive',clock_timestamp()<least(j.lease_expires_at,r.lease_expires_at)) FROM research_deep_jobs_v1 j JOIN research_model_reservations_v1 r ON r.reservation_id=${q(r.reservationId)} WHERE j.job_id=${q(r.jobId)};`));
  const locks=[{kind:'shared_source',call:'pg_advisory_xact_lock(610091002::bigint)',classid:0,objid:610091002,objsubid:1},{kind:'global_deep',call:'pg_advisory_xact_lock(2409,6002)',classid:2409,objid:6002,objsubid:2}];
  const held=lock=>{const label='ci_lock_holder_'+randomUUID().replaceAll('-',''),h=child(label,`BEGIN;SELECT ${lock.call};`,true);return{...h,lock};};
  const holderReady=async h=>poll(()=>{const rows=JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('pid',a.pid,'granted',l.granted)),'[]') FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE a.application_name=${q(h.label)} AND l.locktype='advisory' AND l.classid=${h.lock.classid} AND l.objid=${h.lock.objid} AND l.objsubid=${h.lock.objsubid} AND l.granted;`));return rows[0];},'holder never acquired exact production advisory lock');
  const waiting=async(h,w,deadline)=>poll(()=>{const rows=JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('pid',a.pid,'granted',l.granted,'blockedBy',pg_blocking_pids(a.pid),'waitEvent',a.wait_event,'observedAt',clock_timestamp(),'beforeOriginalDeadline',clock_timestamp()<${q(deadline)}::timestamptz)),'[]') FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE a.application_name=${q(w.label)} AND l.locktype='advisory' AND l.classid=${h.lock.classid} AND l.objid=${h.lock.objid} AND l.objsubid=${h.lock.objsubid} AND NOT l.granted;`));return rows[0];},'original RPC did not wait on the exact held advisory lock');
  const release=async h=>{h.p.stdin.end('COMMIT;\n');const done=await h.done;assert.equal(done.code,0);assert.equal(done.guard,null);};
  const spawnRPC=(action,req,m)=>child('ci_lock_waiter_'+randomUUID().replaceAll('-',''),`SET ROLE service_role;SELECT ${action==='read'?'read_research_article_input_revision_v2': 'seal_research_article_input_revision_v2'}(${q(JSON.stringify(req))}${action==='read'?'':','+q(JSON.stringify(m))});`);
  await t.test('natural PostgreSQL wall clock advances; no preload or clock function replacement',async()=>{const a=sql('SELECT clock_timestamp()::text;');await wait(40);assert.ok(Date.parse(sql('SELECT clock_timestamp()::text;'))>Date.parse(a));});
  for(const lock of locks){
   await t.test(lock.kind+' positive: verified real wait, release before both original deadlines, fixed AUO complete succeeds',async()=>{
    const r=unit(),p=prepare(r),req=request(p),material=await completeMaterial(db,req,{...p,replay:true},new FinancialDeadline(),process.cwd()),original=leases(r);assert.equal(original.bothLive,true);
    const before=audit(),h=held(lock);try{const holder=await holderReady(h),w=spawnRPC('seal',req,material),proof=await waiting(h,w,original.jobExpiresAt);assert.ok(proof.blockedBy.includes(holder.pid));assert.equal(proof.beforeOriginalDeadline,true);await wait(40);const releaseAt=leases(r);assert.equal(releaseAt.bothLive,true);await release(h);const result=await w.done;assert.equal(result.code,0);assert.equal(result.guard,null);const saved=JSON.parse(result.stdout.trim());assert.equal(saved.status,'sealed');assert.equal(saved.input_hash,completeHash(saved.canonical_payload));assert.ok(Object.values(saved.canonical_payload.capabilities).every(v=>v===false));
     const after=audit();for(const name of Object.keys(before).filter(k=>!['research_article_input_revisions_v2','charge'].includes(k)))assert.deepEqual(after[name],before[name]);assert.equal(after.research_article_input_revisions_v2.count,before.research_article_input_revisions_v2.count+1);assert.equal(after.charge,before.charge+saved.logical_bytes);assert.deepEqual({...seal(req,null),replay:false},saved);assert.deepEqual(audit(),after);
     console.log('lock_expiry_positive',JSON.stringify({lock:lock.kind,original,proof,holderPid:holder.pid,releaseAt,elapsedMs:result.elapsedMs,savedRevisionId:saved.revision_id,capabilities:saved.canonical_payload.capabilities}));
    }finally{if(children.has(h.p)){h.p.stdin.end('ROLLBACK;\n');await h.done;}}
   });
   for(const expired of ['job','reservation'])await t.test(lock.kind+' '+expired+' expiry during verified real lock wait rejects seal/read/replay without renewal or any new history',async()=>{
    const r=unit(expired==='job'?6:20,expired==='reservation'?6:20),p=prepare(r),req=request(p),material=await completeMaterial(db,req,{...p,replay:true},new FinancialDeadline(),process.cwd()),original=leases(r);assert.equal(original.bothLive,true);const deadline=expired==='job'?original.jobExpiresAt:original.reservationExpiresAt;
    const before=audit(),h=held(lock);try{const holder=await holderReady(h),w=spawnRPC('seal',req,material),proof=await waiting(h,w,deadline);assert.ok(proof.blockedBy.includes(holder.pid));assert.equal(proof.beforeOriginalDeadline,true);
     const releaseAt=await poll(()=>{const now=leases(r);return Date.parse(now.serverNow)>Date.parse(deadline)+25?now:null;},'real clock did not cross original deadline',8000);assert.equal(releaseAt.bothLive,false);await release(h);const result=await w.done;assert.notEqual(result.code,0);assert.equal(result.guard,null);assert.match(result.stderr,/input_preparation_original_lease_lost/);assert.equal(result.stdout.trim(),'');assert.deepEqual(audit(),before);
     for(const operation of [()=>read(req),()=>seal(req,null),()=>prepare(r)]){assert.throws(operation,/input_preparation_original_lease_lost/);assert.deepEqual(audit(),before);}const after=leases(r);assert.equal(after.jobExpiresAt,original.jobExpiresAt);assert.equal(after.reservationExpiresAt,original.reservationExpiresAt);assert.equal(after.reservationStartedAt,original.reservationStartedAt);
     console.log('lock_expiry_negative',JSON.stringify({lock:lock.kind,expired,original,deadline,proof,holderPid:holder.pid,releaseAt,elapsedMs:result.elapsedMs,rejection:result.stderr.trim(),before,after:audit()}));
    }finally{if(children.has(h.p)){h.p.stdin.end('ROLLBACK;\n');await h.done;}}
   });
   await t.test(lock.kind+' persisted complete read waits past original reservation deadline; read and duplicate seal cannot resurrect it',async()=>{
    const r=unit(20,6),p=prepare(r),req=request(p),material=await completeMaterial(db,req,{...p,replay:true},new FinancialDeadline(),process.cwd()),saved=seal(req,material),original=leases(r),deadline=original.reservationExpiresAt,before=audit();assert.equal(original.bothLive,true);
    const h=held(lock);try{const holder=await holderReady(h),w=spawnRPC('read',req),proof=await waiting(h,w,deadline);assert.ok(proof.blockedBy.includes(holder.pid));assert.equal(proof.beforeOriginalDeadline,true);const releaseAt=await poll(()=>{const now=leases(r);return Date.parse(now.serverNow)>Date.parse(deadline)+25?now:null;},'natural reservation expiry not reached',8000);await release(h);const result=await w.done;assert.notEqual(result.code,0);assert.equal(result.guard,null);assert.match(result.stderr,/input_preparation_original_lease_lost/);assert.equal(result.stdout.trim(),'');assert.deepEqual(audit(),before);assert.throws(()=>seal(req,null),/input_preparation_original_lease_lost/);assert.deepEqual(audit(),before);
     console.log('lock_expiry_persisted',JSON.stringify({lock:lock.kind,original,proof,holderPid:holder.pid,releaseAt,elapsedMs:result.elapsedMs,rejection:result.stderr.trim(),preservedRevisionId:saved.revision_id,preservedInputHash:saved.input_hash,before,after:audit()}));
    }finally{if(children.has(h.p)){h.p.stdin.end('ROLLBACK;\n');await h.done;}}
   });
  }
 }finally{
  for(const p of children)p.kill('SIGKILL');
  if(active){run('pg_ctl',['-D',pg,'-m','immediate','-w','stop']);active=false;}
  const dest=process.env.RESEARCH_LOCK_EXPIRY_ARTIFACTS;if(dest){fs.mkdirSync(dest,{recursive:true,mode:0o700});if(fs.existsSync(path.join(tmp,'pg.log')))fs.copyFileSync(path.join(tmp,'pg.log'),path.join(dest,'pg.log'));fs.writeFileSync(path.join(dest,'children.json'),JSON.stringify(evidence,null,2)+'\n');fs.writeFileSync(path.join(dest,'cleanup.json'),JSON.stringify({ownedTemporaryCluster:tmp,stopped:!active,activeChildrenAfterStop:children.size,noFakeClock:true,originalSqlUnchanged:true})+'\n');}
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
