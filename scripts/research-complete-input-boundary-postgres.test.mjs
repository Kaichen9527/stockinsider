import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {completeMaterial} from '../web/src/lib/research-complete-input.ts';
import {FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
import {completeCanonical} from '../web/src/lib/research-complete-canonical.ts';
import mapping from '../web/src/lib/research-complete-mapping.json' with {type:'json'};
// Preserve explicit environment selection (including an invalid nonempty path).
// Ordinary CI exposes pg_config on PATH; protected CI provides its pinned bin.
const bin=process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN || process.env.OPPORTUNITY_V3_POSTGRES_BIN || (()=>{
 try {return execFileSync('pg_config',['--bindir'],{encoding:'utf8',timeout:5000,maxBuffer:4096}).trim();}
 catch {return '';}
})();
const q=v=>"'"+String(v).replaceAll("'","''")+"'";

// Exact-byte fixture uses the already built official -UFAKE_SLEEP clock library,
// PG children only. Frozen wall time stabilizes JSON timestamp lengths; this
// proves quota accounting, NOT real-time expiry or production clock readiness.
const lib=process.env.STOCKINSIDER_TEST_PG_CLOCK_LIBRARY;
const cap=524288;
function plainCanonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(plainCanonical).join(',')+']';return '{'+Object.keys(v).sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))).map(k=>JSON.stringify(k)+':'+plainCanonical(v[k])).join(',')+'}';}
const bytes=v=>Buffer.byteLength(plainCanonical(v),'utf8');
test('CI-03 original SQL real PG exact cumulative bytes, +1 rollback and shared count (synthetic clock/source/job; real fixed financial material)',async t=>{
 assert.ok(bin&&['initdb','pg_ctl','psql'].every(n=>fs.existsSync(path.join(bin,n))),'actual PostgreSQL required; unavailable is not a pass');
 assert.ok(lib&&path.isAbsolute(lib)&&fs.lstatSync(lib).isFile(),'explicit regular reviewed test clock library required');
 assert.equal(createHash('sha256').update(fs.readFileSync(lib)).digest('hex'),'483dfc28d0b87718ce50b48d382f03b8615fe861c5f859c958ddfc934fa0b3c6','exact existing reviewed official -UFAKE_SLEEP library; no install/fallback');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'si-complete-byte-'));const pg=path.join(tmp,'pg'),port=55000+process.pid%5000;let active=false;
 const frozen=new Date(Date.now()+60000).toISOString().slice(0,19).replace('T',' ');
 const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',tmp,'-p',String(port),'-d','postgres'];
 const run=(n,a,input,env=process.env)=>execFileSync(path.join(bin,n),a,{encoding:'utf8',input,env,timeout:10000,maxBuffer:4*1024*1024}).trim();
 const sql=s=>run('psql',args,`SET statement_timeout='5s';${s}`);
 const start=()=>{run('pg_ctl',['-D',pg,'-l',path.join(tmp,'pg.log'),'-o',`-h '' -k ${tmp} -p ${port}`,'-w','start'],undefined,{...process.env,LD_PRELOAD:lib,FAKETIME:frozen,FAKETIME_DONT_FAKE_MONOTONIC:'1'});active=true;};
 const id=randomUUID(),base='https://example.invalid/byte-fixture';
 const add=(key=id,url=base)=>sql(`SET ROLE service_role;INSERT INTO source_raw_documents(id,document_url,collected_at,metadata) VALUES(${q(key)},${q(url)},clock_timestamp()-interval '1 second',jsonb_build_object('canonical_url',${q(url)},'rights_boundary','public_citation'));`);
 const job=randomUUID(),reservation=randomUUID(),company=randomUUID(),priority=randomUUID(),snapshot='a'.repeat(64),owner='synthetic-byte-preparer';
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
   CREATE TABLE research_model_reservations_v1(reservation_id uuid PRIMARY KEY,role text,owner text,work_key text,started_at timestamptz,lease_expires_at timestamptz);
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
  const unit=()=>{const j=randomUUID(),r=randomUUID();sql(`INSERT INTO research_deep_jobs_v1 SELECT ${q(j)},priority_run_id,symbol,stock_id,research_scope,research_company_id,observed_snapshot_hash,status,attempts,lease_owner,lease_expires_at FROM research_deep_jobs_v1 WHERE job_id=${q(job)};INSERT INTO research_deep_job_attempts_v1 SELECT ${q(j)},attempt,owner,claimed_at,lease_expires_at FROM research_deep_job_attempts_v1 WHERE job_id=${q(job)};INSERT INTO research_model_reservations_v1 SELECT ${q(r)},role,owner,${q('deep:'+j+':1')},started_at,lease_expires_at FROM research_model_reservations_v1 WHERE reservation_id=${q(reservation)};`);return {...req,jobId:j,reservationId:r};};
  const prepare=r=>JSON.parse(sql(`SET ROLE service_role;SELECT prepare_research_input_v2(${q(JSON.stringify(r))});`));
  add();

  sql(fs.readFileSync('migrations/20261009_research_complete_input_v2.sql','utf8'));
  const db={rpc(name,a){const arg=Object.values(a).map(v=>q(typeof v==='object'?JSON.stringify(v):v)).join(',');const response=promisify(execFile)(path.join(bin,'psql'),[...args,'-c',`SET ROLE service_role;SELECT ${name}(${arg});`],{encoding:'utf8',timeout:6000,maxBuffer:1048576}).then(({stdout})=>({data:JSON.parse(stdout.trim()),error:null}));return Object.assign(response,{abortSignal:()=>response});}};

  await t.test('PG-only deterministic serialization clock; original RPC bodies/cap unchanged',async()=>{
   const a=sql('SELECT clock_timestamp()::text;');await new Promise(r=>setTimeout(r,30));assert.equal(sql('SELECT clock_timestamp()::text;'),a);
   for(const name of ['prepare_research_input_v2','seal_research_article_input_revision_v2'])assert.match(sql(`SELECT prosrc FROM pg_proc WHERE oid=${q(name+'('+ (name==='prepare_research_input_v2'?'jsonb':'jsonb,jsonb') +')')}::regprocedure;`),/>524288/);
  });
  const baseline=prepare(req),request=p=>({owner,jobId:p.job_id,attempt:1,reservationId:p.reservation_id,scope:'research_observed_v1',snapshotHash:snapshot,preparationId:p.preparation_id,preparationHash:p.input_hash,expectedArtifactManifestHash:mapping.companies['2409'].inventoryHash,expectedCalculatorExecutionHash:mapping.sourceClosureHash});
  const material=await completeMaterial(db,request(baseline),{...baseline,replay:true},new FinancialDeadline(),process.cwd());
  const ids=Array.from({length:30},()=>randomUUID()).sort(),r=unit();
  const roots=(common,a=0,b=0)=>ids.map((_,i)=>base+'/'+String(i).padStart(2,'0')+'/界é/"\\/'+ 'x'.repeat(common+(i===0?a:i===29?b:0)));
  const sourceSQL=urls=>urls.map((url,i)=>`INSERT INTO source_raw_documents(id,document_url,collected_at,metadata) VALUES(${q(ids[i])},${q(url)},clock_timestamp()-interval '1 second',jsonb_build_object('canonical_url',${q(url)},'rights_boundary','public_citation'));`).join('\n');
  const requestSQL=`jsonb_build_object('owner',${q(owner)},'jobId',${q(r.jobId)},'attempt',1,'reservationId',${q(r.reservationId)},'scope','research_observed_v1','snapshotHash',${q(snapshot)},'preparationId',a->'preparation_id','preparationHash',a->'input_hash','expectedArtifactManifestHash',${q(mapping.companies['2409'].inventoryHash)},'expectedCalculatorExecutionHash',${q(mapping.sourceClosureHash)})`;
  const oldRequest={...r,sourceDocumentIds:ids},secondRequest={...r,sourceDocumentIds:ids.slice(0,29)};
  const calls=`DO $fixture$ DECLARE a jsonb;b jsonb;c jsonb; BEGIN a:=prepare_research_input_v2(${q(JSON.stringify(oldRequest))});b:=prepare_research_input_v2(${q(JSON.stringify(secondRequest))});c:=seal_research_article_input_revision_v2(${requestSQL},${q(JSON.stringify(material))});END $fixture$;`;
  const history=`SELECT jsonb_build_object('preparations',(SELECT jsonb_agg(to_jsonb(p) ORDER BY preparation_id) FROM research_input_preparations_v2 p WHERE job_id=${q(r.jobId)}),'revisions',(SELECT jsonb_agg(to_jsonb(c) ORDER BY revision_id) FROM research_article_input_revisions_v2 c WHERE job_id=${q(r.jobId)}),'seals',(SELECT jsonb_agg(to_jsonb(s) ORDER BY seal_id) FROM research_source_seals_v2 s WHERE seal_id IN(SELECT source_seal_id FROM research_input_preparations_v2 WHERE job_id=${q(r.jobId)})));`;
  const trial=urls=>JSON.parse(sql(`BEGIN;SET ROLE service_role;${sourceSQL(urls)}${calls}RESET ROLE;${history}ROLLBACK;`));
  const audit=()=>JSON.parse(sql(`SELECT jsonb_build_object(${['source_raw_documents','research_source_seals_v2','research_source_fence_events_v2','research_source_seal_invalidations_v2','research_input_preparations_v2','research_article_input_revisions_v2','research_model_reservations_v1','research_model_completions_v1','research_deep_jobs_v1','research_deep_job_attempts_v1','stocks'].map(name=>`${q(name)},(SELECT jsonb_build_object('count',count(*),'rowHash',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'[]'),'UTF8')),'hex')) FROM ${name} x)`).join(',')},'charge',(SELECT coalesce(sum(logical_bytes),0) FROM (SELECT logical_bytes FROM research_input_preparations_v2 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2) h));`));
  const total=h=>h.preparations.reduce((n,p)=>n+p.logical_bytes,0)+h.revisions.reduce((n,c)=>n+c.logical_bytes,0);
  const verify=h=>{for(const p of h.preparations){const s=h.seals.find(s=>s.seal_id===p.source_seal_id),receipt={...s,publicationAuthorized:false,historicalPITEligible:false};assert.equal(p.logical_bytes,bytes(p.request)+bytes(p.payload)+bytes(receipt));}for(const c of h.revisions)assert.equal(c.logical_bytes,Buffer.byteLength(completeCanonical(c.canonical_request))+Buffer.byteLength(completeCanonical(c.canonical_payload)));};
  const beforeProbe=audit(),small=trial(roots(10));verify(small);assert.deepEqual(audit(),beforeProbe);
  const gap=cap-total(small),common=10+Math.floor(gap/148),rest=gap%148;
  // Twenty-nine shared roots contribute5 bytes per ASCII character (two old
  // payload+new-seal pairs and one complete payload); last root contributes3.
  // GCD(5,3)=1 lets valid source bytes reach any integer without charge edits.
  let da,dbPad;for(let a=0;a<20;a++){const b=(rest-5*a)/3;if(Number.isInteger(b)&&common+b>=3){da=a;dbPad=b;break;}}
  assert.notEqual(da,undefined);const exactRoots=roots(common,da,dbPad);
  assert.ok(exactRoots.every(s=>Buffer.byteLength(s)<=4096));
  const expected=trial(exactRoots);verify(expected);assert.equal(total(expected),cap);assert.deepEqual(audit(),beforeProbe);
  const overRoots=roots(common,da+2,dbPad-3);
  const projected=structuredClone(expected);const replacements=new Map(exactRoots.map((url,i)=>[url,overRoots[i]]));
  const replace=v=>{if(typeof v==='string')return replacements.get(v)??v;if(Array.isArray(v))return v.map(replace);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)]));return v;};
  const over=replace(projected);const prospectiveCharges=[...over.preparations.map(p=>{const s=over.seals.find(s=>s.seal_id===p.source_seal_id);return bytes(p.request)+bytes(p.payload)+bytes({...s,publicationAuthorized:false,historicalPITEligible:false});}),...over.revisions.map(c=>Buffer.byteLength(completeCanonical(c.canonical_request))+Buffer.byteLength(completeCanonical(c.canonical_payload)))];
  const prospectiveTotal=prospectiveCharges.reduce((a,b)=>a+b,0);assert.equal(prospectiveTotal,cap+1); // Only an in-memory independent byte oracle;
  // no stored immutable row/charge is updated, inserted or forged by fixture.
  await t.test('actual original RPC rejects cumulative524289 at third shared slot; all counts/row hashes/charges roll back',()=>{
   // Independent byte oracle uses an ACTUAL original-RPC payload returned by
   // the rollback probe. Only its parent/source binding fields are projected
   // from the two newly returned preparations; the fixed financial material,
   // clocks, identities and complete canonical encoding are unchanged. Setup
   // administrator reads the private canonical helper, then returns to the
   // original service_role for the admission RPC. No helper/ACL/cap is patched.
   const overCalls=`DO $fixture$ DECLARE a jsonb;b jsonb;candidate jsonb;candidate_request jsonb;candidate_charge int;used int;BEGIN
    PERFORM set_config('role','service_role',true);
    a:=prepare_research_input_v2(${q(JSON.stringify(oldRequest))});b:=prepare_research_input_v2(${q(JSON.stringify(secondRequest))});
    candidate_request:=${requestSQL};candidate:=${q(JSON.stringify(expected.revisions[0].canonical_payload))}::jsonb;
    candidate:=jsonb_set(candidate,'{preparation}',jsonb_build_object('id',a->'preparation_id','inputHash',a->'input_hash'));
    candidate:=jsonb_set(candidate,'{sources,sealId}',a->'source_seal_id');candidate:=jsonb_set(candidate,'{sources,manifest}',a->'payload'->'sourceManifest');
    candidate:=jsonb_set(candidate,'{hashes,preparationInputHash}',a->'input_hash');candidate:=jsonb_set(candidate,'{clocks,originalPreparationAdmittedAt}',a->'admitted_at');
    PERFORM set_config('role','none',true);
    candidate_charge:=octet_length(convert_to(research_complete_canonical_v2(candidate_request),'UTF8'))+octet_length(convert_to(research_complete_canonical_v2(candidate),'UTF8'));
    used:=(a->>'logical_bytes')::int+(b->>'logical_bytes')::int;
    RAISE NOTICE 'byte_boundary_candidate %',jsonb_build_object('sharedCountBeforeSeal',2,'actualPreparationChargeBytes',used,'prospectiveCompleteChargeBytes',candidate_charge,'prospectiveCumulativeBytes',used+candidate_charge);
    PERFORM set_config('role','service_role',true);
    PERFORM seal_research_article_input_revision_v2(candidate_request,${q(JSON.stringify(material))});
   END $fixture$;`;
   const before=audit();let diagnostic;
   assert.throws(()=>sql(`BEGIN;SET ROLE service_role;${sourceSQL(overRoots)}RESET ROLE;${overCalls}COMMIT;`),error=>{
    assert.match(error.stderr,/complete_byte_bound/);const match=/byte_boundary_candidate (\{[^\n]+\})/.exec(error.stderr);assert.ok(match,'actual PG candidate byte diagnostic required');diagnostic=JSON.parse(match[1]);assert.equal(diagnostic.prospectiveCumulativeBytes,cap+1);assert.equal(diagnostic.sharedCountBeforeSeal,2);assert.equal(diagnostic.actualPreparationChargeBytes,prospectiveCharges[0]+prospectiveCharges[1]);assert.equal(diagnostic.prospectiveCompleteChargeBytes,prospectiveCharges[2]);return true;
   });assert.deepEqual(audit(),before);
   console.log('byte_boundary_overlimit',JSON.stringify({expectedCumulativeBytes:prospectiveTotal,actualPgByteDiagnostic:diagnostic,before,after:audit()}));
  });
  let committed;
  await t.test('actual original RPC admits exactly524288 with real AUO recomputation and three shared entries',()=>{
   committed=JSON.parse(sql(`BEGIN;SET ROLE service_role;${sourceSQL(exactRoots)}${calls}RESET ROLE;${history}COMMIT;`));verify(committed);assert.equal(total(committed),cap);assert.equal(committed.preparations.length+committed.revisions.length,3);assert.equal(committed.revisions[0].canonical_payload.financial.material.projection.monthlyFacts.length,3);assert.ok(Object.values(committed.revisions[0].canonical_payload.capabilities).every(v=>v===false));
   console.log('byte_boundary_exact',JSON.stringify({cap,total:total(committed),preparationCharges:committed.preparations.map(p=>p.logical_bytes),completeCharge:committed.revisions[0].logical_bytes,sharedCount:3}));
  });
  await t.test('full exact replay at byte cap is free; fourth new preparation rejects by bytes and leaves complete/source/budget history identical',()=>{
   const before=audit(),c=committed.revisions[0];assert.equal(prepare(oldRequest).replay,true);assert.equal(prepare(secondRequest).replay,true);
   const replay=JSON.parse(sql(`SET ROLE service_role;SELECT seal_research_article_input_revision_v2(${q(JSON.stringify(c.canonical_request))},NULL);`));assert.equal(replay.replay,true);assert.deepEqual({...replay,status:undefined,replay:undefined,dispatchReady:undefined},{...c,status:undefined,replay:undefined,dispatchReady:undefined});assert.deepEqual(audit(),before);
   assert.throws(()=>prepare({...r,sourceDocumentIds:[]}),/input_preparation_byte_bound/);assert.deepEqual(audit(),before);
  });
  await t.test('independent four-count gate remains active below byte cap across old prepares and complete revision',async()=>{
   const r2=unit();const a=prepare({...r2,sourceDocumentIds:[id]}),b=prepare({...r2,sourceDocumentIds:[]});prepare({...r2,sourceDocumentIds:[ids[0]]});
   const c=JSON.parse(sql(`SET ROLE service_role;SELECT seal_research_article_input_revision_v2(${q(JSON.stringify(request(a)))},${q(JSON.stringify(material))});`));assert.equal(c.status,'sealed');
   assert.equal(Number(sql(`SELECT sum(logical_bytes) FROM (SELECT logical_bytes FROM research_input_preparations_v2 WHERE job_id=${q(r2.jobId)} UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2 WHERE job_id=${q(r2.jobId)}) h;`))<cap,true);
   const before=audit();assert.throws(()=>prepare({...r2,sourceDocumentIds:[ids[1]]}),/input_preparation_count_bound/);assert.deepEqual(audit(),before);assert.equal(prepare({...r2,sourceDocumentIds:[]}).preparation_id,b.preparation_id);assert.deepEqual(audit(),before);
  });
 }finally{
  if(active){run('pg_ctl',['-D',pg,'-m','immediate','-w','stop']);active=false;}
  if(process.env.RESEARCH_BYTE_BOUNDARY_ARTIFACTS){const dest=process.env.RESEARCH_BYTE_BOUNDARY_ARTIFACTS;fs.mkdirSync(dest,{recursive:true,mode:0o700});if(fs.existsSync(path.join(tmp,'pg.log')))fs.copyFileSync(path.join(tmp,'pg.log'),path.join(dest,'pg.log'));fs.writeFileSync(path.join(dest,'cleanup.json'),JSON.stringify({ownedTemporaryCluster:tmp,stopped:!active,syntheticFrozenPgWallClock:frozen,originalSqlUnchanged:true})+'\n');}
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
