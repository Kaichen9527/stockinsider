import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const bin=process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN||execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
test('existing publication tables: exclusive v1/v2 lineage, inert writes, real PG restart and truncate races',async t=>{
 const tmp=fs.mkdtempSync('/tmp/si-lineage-'),cluster=path.join(tmp,'pg'),port=55000+process.pid%5000;
 const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',tmp,'-p',String(port),'-d','postgres'];
 const run=(cmd,argv,input)=>execFileSync(path.join(bin,cmd),argv,{input,encoding:'utf8',timeout:15000,maxBuffer:1048576}).trim();
 const sql=s=>run('psql',args,"SET statement_timeout='8s';"+s);
 const asyncSQL=s=>promisify(execFile)(path.join(bin,'psql'),[...args,'-c',"SET statement_timeout='8s';"+s],{encoding:'utf8',timeout:12000,maxBuffer:1048576}).then(r=>({ok:true,stdout:r.stdout.trim()}),e=>({ok:false,stderr:e.stderr,stdout:e.stdout}));
 const ids={stock:randomUUID(),legacy:randomUUID(),legacyBundle:randomUUID(),job:randomUUID(),input:randomUUID(),prep:randomUUID(),res:randomUUID(),company:randomUUID(),bundle:randomUUID(),outbox:randomUUID()};
 const digest='a'.repeat(64),snap='b'.repeat(64);let active=false,passed=false,failed=false;
 const check=async(name,fn)=>{await t.test(name,async()=>{try{await fn();}catch(e){failed=true;throw e;}});if(failed)throw Error('dependent_lineage_cases_stopped_after_failed_prerequisite');};
 const start=()=>{run('pg_ctl',['-D',cluster,'-l',path.join(tmp,'pg.log'),'-o',`-h '' -k ${tmp} -p ${port}`,'-w','start']);active=true;};
 const audit=()=>sql("SELECT jsonb_build_object('bundles',(SELECT jsonb_agg(to_jsonb(b) ORDER BY bundle_id) FROM candidate_dossier_bundles b),'outbox',(SELECT jsonb_agg(to_jsonb(o) ORDER BY job_id) FROM candidate_dossier_outbox_v5 o),'dossiers',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM candidate_research_dossiers d),'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY submission_id) FROM candidate_dossier_submission_receipts r));");
 const bundlePayload={schemaVersion:'research-bundle-lineage-v2',inputRevisionId:ids.input,inputHash:digest,researchCompanyId:ids.company,snapshotHash:snap,publishableResearch:false,researchQualified:false,strategyApproved:false,entryEligible:false};
 const bundleSQL=(patch={})=>{
  const b={bundle_id:ids.bundle,revision_kind:'research_input_v2',revision_id:null,published_revision_id:null,input_hash:digest,symbol:'2409',payload:bundlePayload,research_input_revision_id:ids.input,research_company_id:ids.company,research_snapshot_hash:snap,...patch};
  return `INSERT INTO candidate_dossier_bundles(${Object.keys(b).join(',')}) VALUES(${Object.values(b).map(v=>v===null?'NULL':q(typeof v==='object'?JSON.stringify(v):v)).join(',')});`;
 };
 const outboxSQL=(patch={})=>{
  const b={job_id:ids.outbox,bundle_id:ids.bundle,revision_kind:'research_input_v2',revision_id:null,input_hash:digest,publication_kind:'deep',research_input_revision_id:ids.input,research_company_id:ids.company,research_snapshot_hash:snap,deep_job_id:ids.job,deep_attempt:1,...patch};
  return `INSERT INTO candidate_dossier_outbox_v5(${Object.keys(b).join(',')}) VALUES(${Object.values(b).map(v=>v===null?'NULL':q(v)).join(',')});`;
 };
 const ownerBundle=s=>'SET ROLE research_input_preparation_owner_v2;'+s;
 const ownerOutbox=s=>'SET ROLE research_observed_rpc_owner;'+s;
 const rejects=(s,pattern)=>{const before=audit();assert.throws(()=>sql(s),pattern);assert.equal(audit(),before);};
 const wait=async(name,event)=>{const until=performance.now()+5000;while(performance.now()<until){if(sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name=${q(name)} AND wait_event=${q(event)};`)==='1')return;await new Promise(r=>setTimeout(r,20));}throw Error('expected PG wait '+name+'/'+event);};
 try{
  run('initdb',['-D',cluster,'-A','trust','--no-instructions']);start();
  sql(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
   CREATE ROLE research_input_preparation_owner_v2 NOLOGIN NOINHERIT NOBYPASSRLS;CREATE ROLE research_observed_rpc_owner NOLOGIN NOINHERIT NOBYPASSRLS;
   GRANT USAGE ON SCHEMA public TO research_input_preparation_owner_v2,research_observed_rpc_owner;
   CREATE TABLE stocks(id uuid PRIMARY KEY,symbol text,market text);
   CREATE TABLE candidate_detail_snapshots(id uuid PRIMARY KEY,stock_id uuid REFERENCES stocks(id),session_date date,model_version text);
   CREATE TABLE candidate_daily_stage_snapshots(detail_revision_id uuid);
   CREATE TABLE candidate_research_dossiers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),detail_snapshot_id uuid NOT NULL REFERENCES candidate_detail_snapshots(id),narrative_kind text NOT NULL CHECK(narrative_kind IN('deterministic_fact','codex_enriched')),content jsonb NOT NULL,claim_fact_map jsonb NOT NULL DEFAULT '{}',validation_status text NOT NULL CHECK(validation_status IN('valid','rejected')),rejection_reasons jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now());`);
  // Original legacy migrations, not recreated claim or submission behavior.
  for(const f of ['20260906_candidate_dossier_v4.sql','20260907_candidate_dossier_outbox_v5.sql','20260929_candidate_dossier_outbox_v6.sql'])sql(fs.readFileSync('migrations/'+f,'utf8'));
  sql(`GRANT ALL ON candidate_research_dossiers TO service_role;
   CREATE TABLE research_deep_jobs_v1(job_id uuid PRIMARY KEY,stock_id uuid REFERENCES stocks(id),research_scope text NOT NULL,status text NOT NULL,lease_owner text,attempts integer,lease_expires_at timestamptz);
   ALTER TABLE candidate_dossier_outbox_v5 ADD COLUMN deep_job_id uuid REFERENCES research_deep_jobs_v1(job_id),ADD COLUMN deep_attempt integer;
   CREATE TABLE research_input_preparations_v2(preparation_id uuid PRIMARY KEY);
   CREATE TABLE research_model_reservations_v1(reservation_id uuid PRIMARY KEY);
   CREATE TABLE research_observed_companies_v1(research_company_id uuid PRIMARY KEY);
   CREATE TABLE research_source_seals_v2(seal_id uuid PRIMARY KEY);`);
  const upstream=fs.readFileSync('migrations/20261009_research_complete_input_v2.sql','utf8');sql(upstream.slice(upstream.indexOf('CREATE TABLE public.research_article_input_revisions_v2'),upstream.indexOf('CREATE TRIGGER immutable_research_article_input_v2')));
  const legacy=fs.readFileSync('migrations/20261008_research_observed_claim_v2.sql','utf8');sql(legacy.slice(legacy.indexOf('CREATE OR REPLACE FUNCTION public.claim_candidate_deep_outbox_v1'),legacy.indexOf('CREATE OR REPLACE FUNCTION public.finish_research_deep_job_v2')));
  const functionHashes=()=>sql("SELECT jsonb_object_agg(proname,encode(sha256(convert_to(prosrc,'UTF8')),'hex')) FROM pg_proc WHERE proname IN('claim_candidate_dossier_outbox_v5','claim_candidate_deep_outbox_v1','record_candidate_dossier_submission_v4');");const oldFunctions=functionHashes();
  sql(`INSERT INTO stocks VALUES(${q(ids.stock)},'2409','TW');INSERT INTO candidate_detail_snapshots(id,stock_id,session_date,model_version,revision_hash) VALUES(${q(ids.legacy)},${q(ids.stock)},'2026-10-08','synthetic',${q(digest)});
   INSERT INTO research_deep_jobs_v1 VALUES(${q(ids.job)},${q(ids.stock)},'formal_v1','running','legacy-owner',1,clock_timestamp()+interval '20 minutes');
   INSERT INTO research_input_preparations_v2 VALUES(${q(ids.prep)});INSERT INTO research_model_reservations_v1 VALUES(${q(ids.res)});INSERT INTO research_observed_companies_v1 VALUES(${q(ids.company)});
   INSERT INTO research_article_input_revisions_v2(preparation_id,revision_id,job_id,attempt,reservation_id,research_company_id,research_scope,snapshot_hash,request_hash,canonical_request,input_hash,canonical_payload,logical_bytes,admitted_at,research_cutoff)
   VALUES(${q(ids.prep)},${q(ids.input)},${q(ids.job)},1,${q(ids.res)},${q(ids.company)},'research_observed_v1',${q(snap)},${q(digest)},'{}',${q(digest)},'{"researchIdentity":{"symbol":"2409"}}',1,now(),now());
   INSERT INTO candidate_dossier_bundles(bundle_id,revision_id,published_revision_id,input_hash,symbol,payload) VALUES(${q(ids.legacyBundle)},${q(ids.legacy)},${q(ids.legacy)},${q(digest)},'2409','{}');`);
  const oldBundle=sql('SELECT to_jsonb(b) FROM candidate_dossier_bundles b;');sql(fs.readFileSync('migrations/20261009_research_publication_lineage_v2.sql','utf8'));
  await check('legacy bytes and functions preserved; absent lawful published stage still rejects',()=>{
   assert.equal(functionHashes(),oldFunctions);assert.equal(sql("SELECT to_jsonb(b)-'revision_kind'-'research_input_revision_id'-'research_company_id'-'research_snapshot_hash' FROM candidate_dossier_bundles b;"),oldBundle);
   rejects(`SET ROLE service_role;SELECT * FROM record_candidate_dossier_submission_v4(${q(ids.legacyBundle)},${q(ids.legacy)},${q(digest)},${q('c'.repeat(64))},'{}','[]','[]','{}','valid','[]');`,/candidate_dossier_revision_not_published/);
   sql(`INSERT INTO candidate_daily_stage_snapshots VALUES(${q(ids.legacy)});SET ROLE service_role;SELECT * FROM record_candidate_dossier_submission_v4(${q(ids.legacyBundle)},${q(ids.legacy)},${q(digest)},${q('c'.repeat(64))},'{}','[]','[]','{}','valid','[]');`);
  });
  await check('v1 deep first binding, rejection and expired later-attempt retries remain lawful',()=>{
   const claim=attempt=>`SET ROLE service_role;SELECT * FROM claim_candidate_deep_outbox_v1(${q(ids.job)},'legacy-owner',${attempt},${q(ids.legacy)},${q(digest)},'legacy-outbox-owner');`;
   sql(claim(1));assert.equal(sql("SELECT deep_attempt FROM candidate_dossier_outbox_v5 WHERE revision_kind='legacy_detail_v1';"),'1');
   sql("SET ROLE service_role;UPDATE candidate_dossier_outbox_v5 SET status='rejected',lease_owner=NULL,lease_expires_at=NULL;RESET ROLE;UPDATE research_deep_jobs_v1 SET attempts=2;");sql(claim(2));assert.equal(sql('SELECT deep_attempt FROM candidate_dossier_outbox_v5;'),'2');
   sql("SET ROLE service_role;UPDATE candidate_dossier_outbox_v5 SET lease_expires_at=clock_timestamp()-interval '1 second';RESET ROLE;UPDATE research_deep_jobs_v1 SET attempts=3;");sql(claim(3));assert.equal(sql('SELECT deep_attempt FROM candidate_dossier_outbox_v5;'),'3');
   sql('SET ROLE service_role;TRUNCATE candidate_dossier_outbox_v5;');assert.equal(sql('SELECT count(*) FROM candidate_dossier_outbox_v5;'),'0');
  });
  await check('v1-only READ COMMITTED bundle truncate rolls back; explicit v1 NULL branch CHECK remains required',()=>{
   const before=audit();sql('BEGIN;SET ROLE service_role;TRUNCATE candidate_dossier_bundles CASCADE;ROLLBACK;');assert.equal(audit(),before);
   const clean={bundle_id:randomUUID(),revision_kind:'legacy_detail_v1',revision_id:ids.legacy,published_revision_id:ids.legacy,research_input_revision_id:null,research_company_id:null,research_snapshot_hash:null,payload:{}};
   for(const patch of [{revision_id:null},{published_revision_id:null},{revision_id:null,published_revision_id:null},{research_input_revision_id:ids.input}])rejects('SET ROLE service_role;'+bundleSQL({...clean,...patch}),/research_bundle_revision_union_v2/);
   rejects(`SET ROLE service_role;INSERT INTO candidate_dossier_outbox_v5(bundle_id,revision_id,input_hash) VALUES(${q(ids.legacyBundle)},NULL,${q(digest)});`,/research_outbox_revision_union_v2/);
  });
  await check('only expected owner admits exact closed inert research bundle; mixed branches cannot bypass NULL CHECK',()=>{
   for(const role of ['service_role','anon','authenticated','research_observed_rpc_owner'])rejects('SET ROLE '+role+';'+bundleSQL(),/research_publication_writer_required|permission denied/);
   for(const patch of [{revision_kind:null},{revision_kind:'unknown'},{revision_kind:'legacy_detail_v1'},{revision_id:ids.legacy},{published_revision_id:ids.legacy},{research_company_id:null},{research_snapshot_hash:null},{research_input_revision_id:randomUUID()},{research_company_id:randomUUID()},{research_snapshot_hash:'c'.repeat(64)},{input_hash:'d'.repeat(64)},{symbol:'2383'},{payload:{...bundlePayload,entryEligible:true}}])rejects(ownerBundle(bundleSQL(patch)),/research_publication_|check constraint|row-level security policy/);
   sql(ownerBundle(bundleSQL()));rejects(ownerBundle(bundleSQL({bundle_id:randomUUID()})),/duplicate key/);
  });
  await check('old-snapshot REPEATABLE READ cannot truncate a subsequently committed v2 outbox',async()=>{
   const b=asyncSQL(`SET application_name='lineage-B-RR';BEGIN;SELECT pg_advisory_xact_lock(61009,7001);SELECT pg_sleep(1.2);${ownerOutbox(outboxSQL())}COMMIT;`);await wait('lineage-B-RR','PgSleep');
   const a=asyncSQL("SET application_name='lineage-A-RR';SET ROLE service_role;BEGIN ISOLATION LEVEL REPEATABLE READ;SELECT count(*) FROM candidate_dossier_outbox_v5;SELECT pg_advisory_xact_lock(61009,7001);TRUNCATE candidate_dossier_outbox_v5;COMMIT;");
   await wait('lineage-A-RR','advisory');assert.equal((await b).ok,true);const result=await a;assert.equal(result.ok,false);assert.match(result.stderr,/research_publication_truncate_isolation/);assert.match(result.stdout,/^0\n/);assert.equal(sql('SELECT count(*) FROM candidate_dossier_outbox_v5;'),'1');
  });
  await check('mismatched lineage, nonqueued state and direct v2 mutation reject with unchanged all-state audit',()=>{
   for(const role of ['service_role','anon','authenticated','research_input_preparation_owner_v2'])rejects('SET ROLE '+role+';'+outboxSQL({job_id:randomUUID()}),/research_publication_writer_required|permission denied/);
   for(const patch of [{revision_kind:'legacy_detail_v1',revision_id:ids.legacy},{revision_id:ids.legacy},{research_company_id:null},{research_input_revision_id:randomUUID()},{research_snapshot_hash:'c'.repeat(64)},{input_hash:'d'.repeat(64)},{deep_job_id:randomUUID()},{deep_attempt:2},{deep_attempt:null},{bundle_id:ids.legacyBundle},{publication_kind:'ordinary'},{status:'failed'},{attempts:1},{lease_owner:'invented'},{last_error:'invented'}])rejects(ownerOutbox(outboxSQL({job_id:randomUUID(),...patch})),/research_publication_|check constraint|row-level security policy/);
   rejects(ownerOutbox(outboxSQL({job_id:randomUUID()})),/duplicate key/);
   for(const s of ["UPDATE candidate_dossier_outbox_v5 SET status='failed' WHERE revision_kind='research_input_v2';","DELETE FROM candidate_dossier_outbox_v5 WHERE revision_kind='research_input_v2';","TRUNCATE candidate_dossier_outbox_v5;","TRUNCATE candidate_dossier_bundles CASCADE;"]){rejects('SET ROLE service_role;'+s,/research_publication_v2_inert/);}
   rejects(`SET ROLE service_role;UPDATE candidate_dossier_outbox_v5 SET revision_kind='legacy_detail_v1',revision_id=${q(ids.legacy)} WHERE revision_kind='research_input_v2';`,/research_publication_branch_immutable/);
  });
  await check('READ COMMITTED truncate waits for a new v2 insertion and sees its committed row',async()=>{
   const b=asyncSQL(`SET application_name='lineage-B-RC';BEGIN;${ownerOutbox(outboxSQL({job_id:randomUUID()}))}COMMIT;`);
   // A different input/bundle is needed because exact v2 outbox identity is unique.
   assert.equal((await b).ok,false);assert.equal(sql('SELECT count(*) FROM candidate_dossier_outbox_v5;'),'1');
   // Hold an insertion into the same protected table under a fresh valid input.
   sql(`INSERT INTO research_input_preparations_v2 VALUES(gen_random_uuid());`);
   const fresh=randomUUID(),bid=randomUUID(),oid=randomUUID();
   sql(`INSERT INTO research_article_input_revisions_v2 SELECT ${q(fresh)},(SELECT preparation_id FROM research_input_preparations_v2 WHERE preparation_id<>${q(ids.prep)} LIMIT 1),job_id,attempt,reservation_id,research_company_id,research_scope,snapshot_hash,${q('d'.repeat(64))},canonical_request,input_hash,canonical_payload,logical_bytes,admitted_at,research_cutoff,source_seal_id FROM research_article_input_revisions_v2 WHERE revision_id=${q(ids.input)};`);
   sql(ownerBundle(bundleSQL({bundle_id:bid,research_input_revision_id:fresh,payload:{...bundlePayload,inputRevisionId:fresh}})));
   const insert=asyncSQL(`SET application_name='lineage-B-RC-insert';BEGIN;${ownerOutbox(outboxSQL({job_id:oid,bundle_id:bid,research_input_revision_id:fresh}))}SELECT pg_sleep(1.2);COMMIT;`);await wait('lineage-B-RC-insert','PgSleep');
   const a=asyncSQL("SET application_name='lineage-A-RC';SET ROLE service_role;BEGIN ISOLATION LEVEL READ COMMITTED;TRUNCATE candidate_dossier_outbox_v5;COMMIT;");await wait('lineage-A-RC','relation');assert.equal((await insert).ok,true);const result=await a;assert.equal(result.ok,false);assert.match(result.stderr,/research_publication_v2_inert/);assert.equal(sql('SELECT count(*) FROM candidate_dossier_outbox_v5;'),'2');
  });
  await check('ordinary claimer excludes v2; legacy downgrade/rebind fails; immutable rows survive actual restart',()=>{
   const before=audit();assert.equal(sql("SET ROLE service_role;SELECT count(*) FROM claim_candidate_dossier_outbox_v5('ordinary-reader',20);"),'0');assert.equal(audit(),before);
   rejects(`SET ROLE service_role;INSERT INTO candidate_dossier_outbox_v5(bundle_id,revision_id,input_hash) VALUES(${q(ids.bundle)},${q(ids.legacy)},${q(digest)});`,/research_publication_branch_mismatch/);
   const legacyDelivery=randomUUID();sql(`SET ROLE service_role;INSERT INTO candidate_dossier_outbox_v5(job_id,bundle_id,revision_id,input_hash) VALUES(${q(legacyDelivery)},${q(ids.legacyBundle)},${q(ids.legacy)},${q(digest)});`);
   rejects(`SET ROLE service_role;UPDATE candidate_dossier_outbox_v5 SET bundle_id=${q(ids.bundle)} WHERE job_id=${q(legacyDelivery)};`,/research_publication_branch_mismatch/);sql(`SET ROLE service_role;DELETE FROM candidate_dossier_outbox_v5 WHERE job_id=${q(legacyDelivery)};`);assert.equal(audit(),before);
   rejects('SET ROLE service_role;BEGIN ISOLATION LEVEL SERIALIZABLE;TRUNCATE candidate_dossier_outbox_v5;COMMIT;',/research_publication_truncate_isolation/);
   rejects(ownerBundle(`UPDATE candidate_dossier_bundles SET research_snapshot_hash=${q('d'.repeat(64))} WHERE revision_kind='research_input_v2';`),/append_only|permission denied/);
   run('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);active=false;start();assert.equal(audit(),before);assert.equal(functionHashes(),oldFunctions);
  });
  passed=!failed;
 }finally{if(active)run('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);if(passed)fs.rmSync(tmp,{recursive:true,force:true});else console.error('Preserved failing isolated lineage evidence:',tmp);}
});
