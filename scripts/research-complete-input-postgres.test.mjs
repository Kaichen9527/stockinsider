import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {completeMaterial,runCompleteInput,validateCompleteResponse} from '../web/src/lib/research-complete-input.ts';
import {FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
import {completeCanonical,completeHash} from '../web/src/lib/research-complete-canonical.ts';
import mapping from '../web/src/lib/research-complete-mapping.json' with {type:'json'};
// Preserve explicit environment selection (including an invalid nonempty path).
// Ordinary CI exposes pg_config on PATH; protected CI provides its pinned bin.
const bin=process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN || process.env.OPPORTUNITY_V3_POSTGRES_BIN || (()=>{
 try {return execFileSync('pg_config',['--bindir'],{encoding:'utf8',timeout:5000,maxBuffer:4096}).trim();}
 catch {return '';}
})();
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
test('complete-input actual PG, shared preparations and original lease boundaries (synthetic)',async t=>{
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

  sql(fs.readFileSync('migrations/20261009_research_complete_input_v2.sql','utf8'));
  const db={rpc(name,a){const arg=Object.values(a).map(v=>q(typeof v==='object'?JSON.stringify(v):v)).join(',');const response=promisify(execFile)(path.join(bin,'psql'),[...args,'-c',`SET ROLE service_role;SELECT ${name}(${arg});`],{encoding:'utf8',timeout:6000,maxBuffer:1048576}).then(({stdout})=>({data:JSON.parse(stdout.trim()),error:null}));return Object.assign(response,{abortSignal:()=>response});}};
  const inputs=[];const count=()=>sql('SELECT count(*) FROM research_article_input_revisions_v2;SELECT count(*) FROM stocks;SELECT count(*) FROM research_model_completions_v1;');
  const read=r=>JSON.parse(sql(`SET ROLE service_role;SELECT read_research_article_input_revision_v2(${q(JSON.stringify(r))});`));
  const seal=(r,c)=>JSON.parse(sql(`SET ROLE service_role;SELECT seal_research_article_input_revision_v2(${q(JSON.stringify(r))},${q(JSON.stringify(c))});`));
  await t.test('all frozen canonical vectors agree with actual PG numeric/Unicode bytes',()=>{const vs=JSON.parse(fs.readFileSync('openspec/changes/research-complete-input-v2/canonical-vectors.json'));for(const v of vs.vectors){assert.equal(sql(`SELECT research_complete_canonical_v2(${q(v.rawJson)});`),v.canonicalUtf8);assert.equal(sql(`SELECT research_complete_hash_v2(${q(v.rawJson)});`),v.sha256);}});
  for(const symbol of ['2409','2383'])await t.test(symbol+' real fixed files recompute and private input seals without formal stocks',async()=>{
   const r=unit(),c=randomUUID();sql(`INSERT INTO research_observed_companies_v1 VALUES(${q(c)},${q(symbol)});INSERT INTO research_observed_roster_members_v1 VALUES(${q(snapshot)},${q(c)},${q(symbol)});UPDATE research_deep_jobs_v1 SET symbol=${q(symbol)},research_company_id=${q(c)} WHERE job_id=${q(r.jobId)};`);
   const p=prepare(r),req={owner:r.owner,jobId:r.jobId,attempt:r.attempt,reservationId:r.reservationId,scope:r.scope,snapshotHash:r.snapshotHash,preparationId:p.preparation_id,preparationHash:p.input_hash,expectedArtifactManifestHash:mapping.companies[symbol].inventoryHash,expectedCalculatorExecutionHash:mapping.sourceClosureHash};
   assert.equal(read(req).status,'absent');const material=await completeMaterial(db,req,{...p,replay:true},new FinancialDeadline(),process.cwd());
   const saved=seal(req,material);assert.equal(saved.status,'sealed');assert.equal(saved.input_hash,completeHash(saved.canonical_payload));assert.equal(saved.canonical_payload.financial.material.projection.monthlyFacts.length,3);assert.ok(Object.values(saved.canonical_payload.capabilities).every(x=>x===false));assert.equal(saved.canonical_payload.evidenceStatus,'incomplete');assert.equal(sql('SELECT count(*) FROM stocks;'),'0');
   assert.equal(saved.logical_bytes,Buffer.byteLength(completeCanonical(req))+Buffer.byteLength(completeCanonical(saved.canonical_payload)));
   inputs.push({r,req,material,saved});
  });
  await t.test('application rereads current mapping and full payload without reopening fixed files',async()=>{
   for(const x of inputs){const before=count();for(const sealOnly of [false,true]){const reread=await runCompleteInput(db,x.req,sealOnly,new FinancialDeadline(),'/cannot-open-files-on-replay');assert.equal(reread.input_hash,x.saved.input_hash);assert.deepEqual(reread.canonical_payload,x.saved.canonical_payload);}assert.equal(count(),before);
    for(const mutate of [r=>{r.canonical_payload.researchIdentity.symbol='0000';},r=>{r.canonical_payload.capabilities.entryEligible=true;},r=>{r.canonical_payload.financial.material.projection.reportedFacts[0].value++;},r=>{r.canonical_payload.hashes.sourceClosureHash='0'.repeat(64);},r=>{r.canonical_request.expectedCalculatorExecutionHash='0'.repeat(64);r.request_hash=completeHash(r.canonical_request);},r=>{r.job_id=randomUUID();}]){
     const response=structuredClone(read(x.req));mutate(response);response.input_hash=completeHash(response.canonical_payload);
     const mock={rpc(){return{abortSignal:async()=>({data:response,error:null})};}};
     await assert.rejects(runCompleteInput(mock,x.req,false,new FinancialDeadline(),'/cannot-read-financial'));
    }
    const response=read(x.req);response.input_hash='0'.repeat(64);assert.throws(()=>validateCompleteResponse(x.req,response));
   }
  });
  await t.test('replay and read retain clocks and charges; changed request rejects',()=>{for(const x of inputs){const before=count();assert.deepEqual({...seal(x.req,null),replay:false},x.saved);assert.equal(read(x.req).input_hash,x.saved.input_hash);assert.equal(count(),before);assert.throws(()=>read({...x.req,preparationHash:'d'.repeat(64)}));}});
  await t.test('unknown nested, numeric, locator, clock and mapping material fails before insertion',()=>{for(const x of inputs){const r=unit();const p=prepare(r);const req={...x.req,jobId:r.jobId,reservationId:r.reservationId,preparationId:p.preparation_id,preparationHash:p.input_hash}; // unsupported company inherited5347 must reject
   assert.throws(()=>read(req),/mapping_unavailable/);
  }});
  await t.test('direct service RPC rejects numeric, locator, unit, nested, future and swapped material with rollback',async()=>{
   for(const x of inputs){const r=unit(),symbol=x.material.symbol,c=randomUUID();sql(`INSERT INTO research_observed_companies_v1 VALUES(${q(c)},${q(symbol)});INSERT INTO research_observed_roster_members_v1 VALUES(${q(snapshot)},${q(c)},${q(symbol)});UPDATE research_deep_jobs_v1 SET symbol=${q(symbol)},research_company_id=${q(c)} WHERE job_id=${q(r.jobId)};`);const p=prepare(r),request={...x.req,jobId:r.jobId,reservationId:r.reservationId,preparationId:p.preparation_id,preparationHash:p.input_hash},before=count();
    for(const change of [m=>m.financialMaterial.projection.reportedFacts[0].value++,m=>m.financialMaterial.projection.reportedFacts[0].unit='USD',m=>m.financialMaterial.projection.reportedFacts[0].locator.jsonPointer='/fake',m=>m.financialMaterial.calculation.arbitrary=true,m=>m.symbol='0000',m=>m.sourceClosureHash='d'.repeat(64),m=>m.artifactReadKnownAt='2099-01-01T00:00:00Z']){const m=structuredClone(x.material);change(m);assert.throws(()=>seal(request,m));assert.equal(count(),before);}
   }
  });
  await t.test('BYPASSRLS service and owner cannot mutate history; anonymous and helper access forbidden',()=>{for(const c of ['SELECT * FROM research_article_input_revisions_v2','INSERT INTO research_article_input_revisions_v2 SELECT * FROM research_article_input_revisions_v2','DELETE FROM research_article_input_revisions_v2','TRUNCATE research_article_input_revisions_v2'])assert.throws(()=>sql('SET ROLE service_role;'+c),/permission denied/);assert.throws(()=>sql('SET ROLE research_input_preparation_owner_v2;DELETE FROM research_article_input_revisions_v2;'),/immutable/);assert.throws(()=>sql(`SET ROLE anon;SELECT read_research_article_input_revision_v2(${q(JSON.stringify(inputs[0].req))});`),/permission denied/);});
  await t.test('actual non-superuser login executes closed read RPC but cannot become private owner',()=>{
   sql('CREATE ROLE synthetic_app_login LOGIN INHERIT NOSUPERUSER NOBYPASSRLS;GRANT service_role TO synthetic_app_login;');
   const runApp=s=>run('psql',[...args,'-U','synthetic_app_login'],`SET ROLE service_role;${s}`);
   assert.equal(JSON.parse(runApp(`SELECT read_research_article_input_revision_v2(${q(JSON.stringify(inputs[1].req))});`)).input_hash,inputs[1].saved.input_hash);
   assert.throws(()=>runApp('SELECT * FROM research_article_input_revisions_v2;'),/permission denied/);assert.throws(()=>runApp('SET ROLE research_input_preparation_owner_v2;'),/permission denied/);
  });
  await t.test('new table charge shares four slots with old prepare; full replay is free',()=>{const x=inputs[0];for(const extra of [randomUUID(),randomUUID()]){add(extra,base+'/'+extra);prepare({...x.r,sourceDocumentIds:[extra]});}assert.equal(sql(`SELECT count(*) FROM (SELECT 1 FROM research_input_preparations_v2 WHERE job_id=${q(x.r.jobId)} UNION ALL SELECT 1 FROM research_article_input_revisions_v2 WHERE job_id=${q(x.r.jobId)}) history;`),'4');const extra=randomUUID();add(extra,base+'/'+extra);assert.throws(()=>prepare({...x.r,sourceDocumentIds:[extra]}),/count_bound/);assert.equal(seal(x.req,null).replay,true);});
  await t.test('two actual clients race old preparation versus complete seal for final shared slot',async()=>{
   const x=inputs[1],r=unit(),c=randomUUID(),ids=[randomUUID(),randomUUID()];ids.forEach(v=>add(v,base+'/'+v));sql(`INSERT INTO research_observed_companies_v1 VALUES(${q(c)},'2383');INSERT INTO research_observed_roster_members_v1 VALUES(${q(snapshot)},${q(c)},'2383');UPDATE research_deep_jobs_v1 SET symbol='2383',research_company_id=${q(c)} WHERE job_id=${q(r.jobId)};`);
   const p=prepare(r);prepare({...r,sourceDocumentIds:[]});prepare({...r,sourceDocumentIds:[ids[0]]});const request={...x.req,jobId:r.jobId,reservationId:r.reservationId,preparationId:p.preparation_id,preparationHash:p.input_hash};
   const race=s=>promisify(execFile)(path.join(bin,'psql'),[...args,'-c',`SET statement_timeout='5s';SET ROLE service_role;SELECT ${s};`],{encoding:'utf8',timeout:10000,maxBuffer:1048576});
   const result=await Promise.allSettled([race(`prepare_research_input_v2(${q(JSON.stringify({...r,sourceDocumentIds:[ids[1]]}))})`),race(`seal_research_article_input_revision_v2(${q(JSON.stringify(request))},${q(JSON.stringify(x.material))})`)]);
   assert.equal(result.filter(v=>v.status==='fulfilled').length,1);assert.match(result.find(v=>v.status==='rejected').reason.stderr,/count_bound/);assert.equal(sql(`SELECT count(*) FROM (SELECT 1 FROM research_input_preparations_v2 WHERE job_id=${q(r.jobId)} UNION ALL SELECT 1 FROM research_article_input_revisions_v2 WHERE job_id=${q(r.jobId)}) h;`),'4');
  });
  await t.test('actual restart preserves revision and input hash',()=>{run('pg_ctl',['-D',pg,'-m','fast','-w','stop']);active=false;start();assert.equal(read(inputs[0].req).input_hash,inputs[0].saved.input_hash);});
  await t.test('expired original reservation and RR cannot reread; no lease renewal',()=>{const x=inputs[0];sql(`UPDATE research_model_reservations_v1 SET lease_expires_at=now()-interval '1 microsecond' WHERE reservation_id=${q(x.r.reservationId)};`);assert.throws(()=>read(x.req),/original_lease_lost/);assert.throws(()=>sql(`BEGIN ISOLATION LEVEL REPEATABLE READ;SET ROLE service_role;SELECT read_research_article_input_revision_v2(${q(JSON.stringify(inputs[1].req))});`),/read_committed/);});
  await t.test('withdrawal invalidates persisted read without deleting history',()=>{const x=inputs[1];sql(`SET ROLE service_role;UPDATE source_raw_documents SET metadata=metadata||'{"rights_boundary":"none"}' WHERE id=${q(id)};`);assert.throws(()=>read(x.req),/source_seal_invalidated/);assert.equal(sql(`SELECT count(*) FROM research_article_input_revisions_v2 WHERE preparation_id IN ('${inputs[0].req.preparationId}','${inputs[1].req.preparationId}');`),'2');});
 }finally{if(active)run('pg_ctl',['-D',pg,'-m','immediate','-w','stop']);fs.rmSync(tmp,{recursive:true,force:true});}
});
