import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {loadResearchFinancialSupplement} from '../web/src/lib/research-financial-supplement.ts';
// Preserve explicit environment selection (including an invalid nonempty path).
// Ordinary CI exposes pg_config on PATH; protected CI provides its pinned bin.
const bin=process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN || process.env.OPPORTUNITY_V3_POSTGRES_BIN || (()=>{
 try {return execFileSync('pg_config',['--bindir'],{encoding:'utf8',timeout:5000,maxBuffer:4096}).trim();}
 catch {return '';}
})();
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
test('real PostgreSQL immutable input preparations, original leases and source fences (synthetic)',async t=>{
 assert.ok(bin&&['initdb','pg_ctl','psql'].every(n=>fs.existsSync(path.join(bin,n))),'actual PostgreSQL required; unavailable is not a pass');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'si-publication-fence-'));const pg=path.join(tmp,'pg');const port=55000+process.pid%5000;let active=false;
 const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',tmp,'-p',String(port),'-d','postgres'];
 const run=(n,a,input)=>execFileSync(path.join(bin,n),a,{encoding:'utf8',input,timeout:10000,maxBuffer:4*1024*1024}).trim();
 const sql=s=>run('psql',args,`SET statement_timeout='5s';${s}`);
 const start=()=>{run('pg_ctl',['-D',pg,'-l',path.join(tmp,'pg.log'),'-o',`-h '' -k ${tmp} -p ${port}`,'-w','start']);active=true;};
 const id=randomUUID();const base='https://example.invalid/public-research';
 const add=(key=id,url=base,extra={})=>sql(`SET ROLE service_role;INSERT INTO source_raw_documents(id,document_url,collected_at,metadata) VALUES(${q(key)},${q(url)},clock_timestamp()-interval '1 second',${q(JSON.stringify({canonical_url:url,rights_boundary:'public_citation',...extra}))}::jsonb);`);
 try {
  run('initdb',['-D',pg,'-A','trust','--no-instructions']);start();
  sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE TABLE source_raw_documents(id uuid PRIMARY KEY,document_url text NOT NULL,published_at timestamptz,collected_at timestamptz NOT NULL,metadata jsonb NOT NULL);GRANT ALL ON source_raw_documents TO service_role;`);
  sql(fs.readFileSync('migrations/20261009_research_publication_source_fence_v2.sql','utf8'));
  const job=randomUUID(),reservation=randomUUID(),company=randomUUID(),priority=randomUUID(),snapshot='a'.repeat(64),owner='synthetic-preparer';
  sql(`CREATE TABLE research_observed_companies_v1(research_company_id uuid PRIMARY KEY,symbol text);
   CREATE TABLE research_observed_roster_snapshots_v1(snapshot_hash text PRIMARY KEY,mapping_digest text,received_at timestamptz,latest_observed_at timestamptz);
   CREATE TABLE research_observed_roster_members_v1(snapshot_hash text,research_company_id uuid,symbol text);
   CREATE TABLE research_priority_runs_v1(run_id uuid PRIMARY KEY,research_scope text,observed_snapshot_hash text,as_of timestamptz,input_hash text);
   CREATE TABLE research_observed_priority_store_receipts_v1(run_id uuid,stored_run_hash text);
   CREATE TABLE research_deep_jobs_v1(job_id uuid PRIMARY KEY,priority_run_id uuid,symbol text,stock_id uuid,research_scope text,research_company_id uuid,observed_snapshot_hash text,status text,attempts integer,lease_owner text,lease_expires_at timestamptz);
   CREATE TABLE research_deep_job_attempts_v1(job_id uuid,attempt integer,owner text,claimed_at timestamptz,lease_expires_at timestamptz);
   CREATE TABLE research_model_reservations_v1(reservation_id uuid PRIMARY KEY,role text,owner text,work_key text,started_at timestamptz,lease_expires_at timestamptz);
   CREATE TABLE research_model_completions_v1(reservation_id uuid);
   CREATE TABLE stocks(id uuid PRIMARY KEY,symbol text);
   INSERT INTO research_observed_companies_v1 VALUES(${q(company)},'5347');
   INSERT INTO research_observed_roster_snapshots_v1 VALUES(${q(snapshot)},${q('b'.repeat(64))},now()-interval '3 minute',now()-interval '4 minute');
   INSERT INTO research_observed_roster_members_v1 VALUES(${q(snapshot)},${q(company)},'5347');
   INSERT INTO research_priority_runs_v1 VALUES(${q(priority)},'research_observed_v1',${q(snapshot)},now()-interval '2 minute',${q('c'.repeat(64))});
   INSERT INTO research_observed_priority_store_receipts_v1 SELECT run_id,encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') FROM research_priority_runs_v1 r;
   INSERT INTO research_deep_jobs_v1 VALUES(${q(job)},${q(priority)},'5347',NULL,'research_observed_v1',${q(company)},${q(snapshot)},'running',1,${q(owner)},now()+interval '28 minute');
   INSERT INTO research_deep_job_attempts_v1 SELECT job_id,1,lease_owner,now()-interval '1 minute',lease_expires_at FROM research_deep_jobs_v1;
   INSERT INTO research_model_reservations_v1 VALUES(${q(reservation)},'company_research',${q(owner)},${q('deep:'+job+':1')},now()-interval '1 minute',now()+interval '28 minute');`);
  const roster=fs.readFileSync('migrations/20261008_research_observed_roster_v1.sql','utf8');sql(roster.slice(roster.indexOf('CREATE FUNCTION public.research_observed_canonical_json_v1'),roster.indexOf('-- Fail closed beyond PostgreSQL')));
  sql(fs.readFileSync('migrations/20261009_research_input_preparations_v2.sql','utf8'));
  sql(fs.readFileSync('migrations/20261009_research_input_preparation_assert_v2.sql','utf8'));
  sql('ALTER TABLE source_raw_documents ENABLE ROW LEVEL SECURITY;ALTER TABLE research_deep_jobs_v1 ENABLE ROW LEVEL SECURITY;ALTER TABLE research_model_reservations_v1 ENABLE ROW LEVEL SECURITY;');
  const req={owner,jobId:job,attempt:1,reservationId:reservation,bundleId:null,sourceDocumentIds:[id],scope:'research_observed_v1',snapshotHash:snapshot};
  const unit=()=>{const j=randomUUID(),r=randomUUID();sql(`INSERT INTO research_deep_jobs_v1 SELECT ${q(j)},priority_run_id,symbol,stock_id,research_scope,research_company_id,observed_snapshot_hash,status,attempts,lease_owner,lease_expires_at FROM research_deep_jobs_v1 WHERE job_id=${q(job)};INSERT INTO research_deep_job_attempts_v1 SELECT ${q(j)},attempt,owner,claimed_at,lease_expires_at FROM research_deep_job_attempts_v1 WHERE job_id=${q(job)};INSERT INTO research_model_reservations_v1 SELECT ${q(r)},role,owner,${q('deep:'+j+':1')},started_at,lease_expires_at FROM research_model_reservations_v1 WHERE reservation_id=${q(reservation)};`);return {...req,jobId:j,reservationId:r};};
  const prepare=r=>JSON.parse(sql(`SET ROLE service_role;SELECT prepare_research_input_v2(${q(JSON.stringify(r))});`));
  add();let saved;
  await t.test('company absent from stocks prepares an immutable incomplete input without claiming or dispatching',()=>{
   saved=prepare(req);assert.equal(saved.payload.researchCompanyId,company);assert.equal(saved.payload.stockId,null);assert.equal(saved.payload.status,'draft_incomplete');assert.equal(saved.payload.modelDispatched,false);assert.equal(saved.dispatchReady,false);assert.equal(saved.payload.sourceManifest[0].publishedAt,null);assert.equal(saved.payload.calculator,null);assert.equal(saved.payload.originalModelCutoff,null);assert.equal(sql('SELECT count(*) FROM stocks;'),'0');assert.equal(sql('SELECT count(*) FROM research_model_reservations_v1;'),'1');
  });
  await t.test('read-only assertion rechecks existing preparation without any new charge or seal',()=>{
   const counts=()=>sql('SELECT count(*),sum(logical_bytes) FROM research_input_preparations_v2;SELECT count(*) FROM research_source_seals_v2;SELECT count(*) FROM research_model_reservations_v1;SELECT count(*) FROM research_model_completions_v1;');
   const before=counts();const call=(r=req,p=saved.preparation_id,h=saved.input_hash)=>JSON.parse(sql(`SET ROLE service_role;SELECT assert_research_input_preparation_v2(${q(JSON.stringify(r))},${q(p)},${q(h)});`));
   assert.deepEqual({...call(),replay:false},saved);assert.equal(counts(),before);
   for(const[r,p,h]of [[{...req,owner:'other-owner'},saved.preparation_id,saved.input_hash],[req,randomUUID(),saved.input_hash],[req,saved.preparation_id,'d'.repeat(64)]])assert.throws(()=>call(r,p,h),/assert_mismatch/);
   assert.throws(()=>sql(`SET ROLE anon;SELECT assert_research_input_preparation_v2(${q(JSON.stringify(req))},${q(saved.preparation_id)},${q(saved.input_hash)});`),/permission denied/);
   sql(`INSERT INTO research_model_completions_v1 VALUES(${q(reservation)});`);assert.throws(()=>call(),/original_lease_lost/);sql('DELETE FROM research_model_completions_v1;');
   sql(`UPDATE research_model_reservations_v1 SET lease_expires_at=now()-interval '1 microsecond';`);assert.throws(()=>call(),/original_lease_lost/);sql(`UPDATE research_model_reservations_v1 SET lease_expires_at=now()+interval '28 minute';`);
   assert.equal(counts(),before);
  });
  await t.test('real PG read-only assertions feed both fixed calculators without formal rows or durable financial state',async()=>{
   for(const symbol of ['2409','2383']){
    const r=unit(),c=randomUUID();sql(`INSERT INTO research_observed_companies_v1 VALUES(${q(c)},${q(symbol)});INSERT INTO research_observed_roster_members_v1 VALUES(${q(snapshot)},${q(c)},${q(symbol)});UPDATE research_deep_jobs_v1 SET symbol=${q(symbol)},research_company_id=${q(c)} WHERE job_id=${q(r.jobId)};`);
    const p=prepare(r),before=sql('SELECT count(*),sum(logical_bytes) FROM research_input_preparations_v2;SELECT count(*) FROM research_source_seals_v2;SELECT count(*) FROM stocks;SELECT count(*) FROM research_model_reservations_v1;');let calls=0;
    const db={rpc(name,a){assert.equal(name,'assert_research_input_preparation_v2');calls++;const response=promisify(execFile)(path.join(bin,'psql'),[...args,'-c',`SET ROLE service_role;SELECT ${name}(${q(JSON.stringify(a.p_request))},${q(a.p_preparation_id)},${q(a.p_input_hash)});`],{encoding:'utf8',timeout:5000,maxBuffer:524288}).then(({stdout})=>({data:JSON.parse(stdout.trim()),error:null}));
     // psql stdin is sent through a fixed SQL argument; fixture IDs only, never
     // caller commands. The actual migration RPC performs both lease rechecks.
     return Object.assign(response,{abortSignal:()=>response});}};
    const result=await loadResearchFinancialSupplement(db,{request:r,preparationId:p.preparation_id,preparationInputHash:p.input_hash},process.cwd());assert.equal(calls,2);assert.equal(result.status,'unsealed_calculation_only');assert.equal(result.financialVerified,false);assert.equal(result.dispatchReady,false);assert.equal(result.calculation.symbol,symbol);assert.equal(sql('SELECT count(*),sum(logical_bytes) FROM research_input_preparations_v2;SELECT count(*) FROM research_source_seals_v2;SELECT count(*) FROM stocks;SELECT count(*) FROM research_model_reservations_v1;'),before);
   }
  });
  await t.test('exact replay preserves hash/clocks and restart remains identical',()=>{
   const same=prepare(req);assert.equal(same.replay,true);assert.deepEqual({...same,replay:false},saved);
   run('pg_ctl',['-D',pg,'-m','fast','-w','stop']);active=false;start();assert.deepEqual({...prepare(req),replay:false},saved);
  });
  await t.test('unknown identity/authority/calculator/clock fields and wrong binding fail closed',()=>{
   for(const field of ['authorId','reviewerId','execution','verified','calculator','researchCutoff','inputHash'])assert.throws(()=>prepare({...req,[field]:'synthetic'}),/input_preparation_shape/);
   for(const patch of [{owner:'different-owner'},{attempt:2},{snapshotHash:'d'.repeat(64)},{reservationId:randomUUID()},{jobId:randomUUID()},{scope:'formal_v1'},{bundleId:randomUUID()},{sourceDocumentIds:[id,id]},{sourceDocumentIds:[randomUUID()]}])assert.throws(()=>prepare({...req,...patch}));
  });
  await t.test('BYPASSRLS direct insert/update/delete/truncate and anonymous RPC forbidden',()=>{
   for(const command of ['INSERT INTO research_input_preparations_v2 SELECT * FROM research_input_preparations_v2','UPDATE research_input_preparations_v2 SET payload=payload','DELETE FROM research_input_preparations_v2','TRUNCATE research_input_preparations_v2'])assert.throws(()=>sql('SET ROLE service_role;'+command),/permission denied/);
   assert.throws(()=>sql(`SET ROLE anon;SELECT prepare_research_input_v2(${q(JSON.stringify(req))});`),/permission denied/);
   assert.throws(()=>sql(`SET ROLE research_input_preparation_owner_v2;UPDATE research_deep_jobs_v1 SET job_id=${q(randomUUID())};`),/row-level security/);
   assert.throws(()=>sql('SET ROLE research_input_preparation_owner_v2;DELETE FROM research_input_preparations_v2;'),/immutable/);
  });
  await t.test('priority immutable-store proof cannot be bypassed by service RPC',()=>{
   sql('DELETE FROM research_observed_priority_store_receipts_v1;');assert.throws(()=>prepare(req),/input_preparation_lineage/);
   sql(`INSERT INTO research_observed_priority_store_receipts_v1 SELECT run_id,encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') FROM research_priority_runs_v1 r;`);
  });
  await t.test('completed or expired reservation never becomes fresh and receipts remain immutable',()=>{
   sql(`INSERT INTO research_model_completions_v1 VALUES(${q(reservation)});`);assert.throws(()=>prepare(req),/original_lease_lost/);sql('DELETE FROM research_model_completions_v1;');
   sql(`UPDATE research_model_reservations_v1 SET lease_expires_at=now()-interval '1 microsecond';`);assert.throws(()=>prepare(req),/original_lease_lost/);
   sql(`UPDATE research_model_reservations_v1 SET lease_expires_at=now()+interval '27 minute';`);
   assert.equal(sql(`SELECT input_hash FROM research_input_preparations_v2 WHERE job_id=${q(job)};`),saved.input_hash);
  });
  await t.test('four preparations fill one original unit; fifth rejects instead of durable growth',()=>{
   const r=unit();const ids=Array.from({length:8},()=>randomUUID());ids.forEach(x=>add(x,base+'/'+x));
   for(let i=0;i<4;i++)prepare({...r,sourceDocumentIds:ids.slice(0,i+1).sort()});
   const counts=sql(`SELECT count(*) FROM research_input_preparations_v2 WHERE job_id=${q(r.jobId)};SELECT count(*) FROM research_source_seals_v2;SELECT count(*) FROM research_model_reservations_v1;`);
   assert.throws(()=>prepare({...r,sourceDocumentIds:ids.slice(0,5).sort()}),/input_preparation_count_bound/);
   assert.equal(sql(`SELECT count(*) FROM research_input_preparations_v2 WHERE job_id=${q(r.jobId)};SELECT count(*) FROM research_source_seals_v2;SELECT count(*) FROM research_model_reservations_v1;`),counts);
   assert.equal(prepare({...r,sourceDocumentIds:[ids[0]]}).replay,true);
   sql(`UPDATE research_model_reservations_v1 SET lease_expires_at=now()-interval '1 microsecond' WHERE reservation_id=${q(r.reservationId)};`);
   assert.throws(()=>prepare({...r,sourceDocumentIds:[ids[0]]}),/original_lease_lost/);
   sql(`UPDATE research_model_reservations_v1 SET lease_expires_at=now()+interval '26 minute' WHERE reservation_id=${q(r.reservationId)};`);
   sql(`SET ROLE service_role;UPDATE source_raw_documents SET metadata=metadata||'{"rights_boundary":"none"}' WHERE id=${q(ids[0])};`);
   assert.throws(()=>prepare({...r,sourceDocumentIds:[ids[0]]}),/source_seal_invalidated_or_missing/);
   assert.equal(sql(`SELECT count(*) FROM research_input_preparations_v2 WHERE job_id=${q(r.jobId)};SELECT count(*) FROM research_source_seals_v2;SELECT count(*) FROM research_model_reservations_v1;`),counts);
  });
  await t.test('full UTF-8 serialized request/payload/new seal charges include exact524288 and +1 bytes',()=>{
   const n=Number(sql(`SELECT research_input_preparation_bytes_v2('{}','{}','null');`));
   const overhead=Number(sql(`SELECT research_input_preparation_bytes_v2('{"padding":""}','{}','null');`));
   assert.equal(Number(sql(`SELECT research_input_preparation_bytes_v2(jsonb_build_object('padding',repeat('x',524288-${overhead})),'{}','null');`)),524288);
   assert.equal(Number(sql(`SELECT research_input_preparation_bytes_v2(jsonb_build_object('padding',repeat('x',524289-${overhead})),'{}','null');`)),524289);
   assert.equal(n,4);assert.equal(Number(sql(`SELECT research_input_preparation_bytes_v2('{"s":"界"}','{}','{"receipt":"é"}');`)),Buffer.byteLength('{"s":"界"}{}{"receipt":"é"}','utf8'));
   const row=prepare(req);const source=JSON.parse(sql(`SELECT row_to_json(s) FROM research_source_seals_v2 s WHERE seal_id=${q(row.source_seal_id)};`));
   const receipt={...source,publicationAuthorized:false,historicalPITEligible:false};
   assert.equal(row.logical_bytes,Number(sql(`SELECT research_input_preparation_bytes_v2(${q(JSON.stringify(row.request))},${q(JSON.stringify(row.payload))},${q(JSON.stringify(receipt))});`)));
  });
  await t.test('cumulative bytes reject below count cap and rollback seal/preparation/budget counts',()=>{
   const r=unit(),ids=Array.from({length:30},()=>randomUUID());ids.forEach((x,i)=>add(x,'https://example.invalid/'+String(i).padStart(2,'0')+'/'+'x'.repeat(3700)));
   prepare({...r,sourceDocumentIds:ids.slice().sort()});prepare({...r,sourceDocumentIds:ids.slice(0,29).sort()});
   const query=`SELECT count(*),sum(logical_bytes) FROM research_input_preparations_v2 WHERE job_id=${q(r.jobId)};SELECT count(*) FROM research_source_seals_v2;SELECT count(*) FROM research_model_reservations_v1;SELECT count(*) FROM research_model_completions_v1;`;
   const counts=sql(query);assert.throws(()=>prepare({...r,sourceDocumentIds:ids.slice(0,28).sort()}),/input_preparation_byte_bound/);assert.equal(sql(query),counts);
   assert.equal(prepare({...r,sourceDocumentIds:ids.slice().sort()}).replay,true);assert.equal(sql(query),counts);
  });
  await t.test('two actual concurrent clients compete for the last original-unit slot',async()=>{
   const r=unit(),ids=Array.from({length:5},()=>randomUUID());ids.forEach(x=>add(x,base+'/'+x));
   for(let i=0;i<3;i++)prepare({...r,sourceDocumentIds:ids.slice(0,i+1).sort()});
   const race=x=>promisify(execFile)(path.join(bin,'psql'),[...args,'-c',`SET statement_timeout='5s';SET ROLE service_role;SELECT prepare_research_input_v2(${q(JSON.stringify({...r,sourceDocumentIds:x}))});`],{encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024});
   const result=await Promise.allSettled([race(ids.slice(0,4).sort()),race(ids.slice().sort())]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.match(result.find(x=>x.status==='rejected').reason.stderr,/input_preparation_count_bound/);assert.equal(sql(`SELECT count(*) FROM research_input_preparations_v2 WHERE job_id=${q(r.jobId)};`),'4');
  });
  await t.test('source withdrawal rejects replay without replacing old bytes or returning publishable',()=>{
   sql(`SET ROLE service_role;UPDATE source_raw_documents SET metadata=metadata||'{"rights_boundary":"none"}' WHERE id=${q(id)};`);
   assert.throws(()=>prepare(req),/source_seal_invalidated_or_missing/);
   assert.throws(()=>sql(`SET ROLE service_role;SELECT assert_research_input_preparation_v2(${q(JSON.stringify(req))},${q(saved.preparation_id)},${q(saved.input_hash)});`),/source_seal_invalidated_or_missing/);
   assert.equal(sql(`SELECT count(*) FROM research_input_preparations_v2 WHERE job_id=${q(job)};`),'1');assert.equal(sql(`SELECT input_hash FROM research_input_preparations_v2 WHERE job_id=${q(job)};`),saved.input_hash);
  });
  await t.test('repeatable read cannot seal stale input; null/oversized/invalid-ID requests reject',()=>{
   assert.throws(()=>sql(`BEGIN ISOLATION LEVEL REPEATABLE READ;SET ROLE service_role;SELECT prepare_research_input_v2(${q(JSON.stringify(req))});`),/read_committed_required/);
   for(const v of [null,{}, {...req,sourceDocumentIds:['bad-id']},{...req,owner:'x'.repeat(9000)}])assert.throws(()=>prepare(v));
  });
 }finally{if(active)run('pg_ctl',['-D',pg,'-m','immediate','-w','stop']);fs.rmSync(tmp,{recursive:true,force:true});}
});
