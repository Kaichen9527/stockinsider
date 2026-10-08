import test from 'node:test';
import {randomUUID}from 'node:crypto';
import {sourceControllerInstant}from '../web/src/lib/research-source-attempt-controller.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyLocalInboxDataPlane} from './research-local-inbox-dataplane.mjs';
import {executeSourceController} from './research-source-controller.mjs';
import {prepareObservedRosterAdmission} from '../web/src/lib/research-observed-roster.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'docs/research/2026-10-08-discovery-live');
const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
const body={legacyClassification:read('observed-security-classification.json'),securityScope:read('official-security-scope-reconciliation.json')};
const enabled=process.env.RESEARCH_LOCAL_DATAPLANE_VERIFY==='enabled';
test('real observed priority accounts1978 and admits an old public company research lead without formal identity',{skip:!enabled&&'explicit isolated profile not enabled',timeout:120000},async t=>{
 const report=await verifyLocalInboxDataPlane({root,artifacts:process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS,pgBin:process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN,postgrestBin:process.env.RESEARCH_LOCAL_DATAPLANE_POSTGREST_BIN,observedPriority:true,check:(name,fn)=>t.test(name,fn),
 afterBaseline:async({sql,sqlAsync,post,rpc,report,restart,priorityRequest})=>{
  const prepared=prepareObservedRosterAdmission(body);let receipt;
  await t.test('guarded1978 admission retains formal stocks count zero',async()=>{
   const response=await post('api/internal/research-observed-roster',body);assert.equal(response.status,200);receipt=(await response.json()).receipt;
   assert.equal(receipt.snapshotHash,prepared.snapshotHash);assert.equal(receipt.includedCount,1978);assert.equal(sql('SELECT count(*)FROM stocks'),'0');
  });
  const scope={scope:'research_observed_v1',snapshotHash:prepared.snapshotHash};
  let empty;
  await t.test('formal409, observed200 all1978 needs evidence and no synthetic queue',async()=>{
   const response=await post('api/internal/research-priority-run',{...priorityRequest,asOf:new Date().toISOString(),assessments:[],...scope});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));empty=data;
   assert.equal(data.expectedCount,1978);assert.equal(data.accountedCount,1978);assert.equal(data.rows.length,1978);assert.ok(data.rows.every(r=>r.disposition==='needs_evidence'));assert.equal(data.queue.length,0);assert.equal(data.newDeepResearchJobs,0);assert.equal(data.researchQualified,false);assert.equal(data.priceContexts.length,1978);assert.ok(data.priceContexts.every(r=>r.priceContext.quote===null));
   const formal=await post('api/internal/research-priority-run',{...priorityRequest,asOf:new Date().toISOString(),assessments:[]});assert.equal(formal.status,409);assert.equal((await formal.json()).error,'research_priority_official_roster_missing');
   report.observedEmpty={runId:data.runId,inputHash:data.inputHash,accountedCount:1978,queueLength:0};
  });
  const relay=read('investanchors-podcast-description-relay.json');const source=relay.attempts[0];let controller;
  await t.test('existing controller and guarded inbox consume actual EP8 description with original March/October clocks',async()=>{
   controller=await executeSourceController({runId:randomUUID(),priorItems:[],scopes:[{
    id:'investanchors-ep8-public-description',platform:'podcast',url:relay.summary.sourceUrl,scope:'one publisher episode description only; no audio/transcript/member report; March publication acquired October8',method:'public_summary_relay',contentScope:'article_body',
    rights:{basis:'public_summary_relay',checkedAt:relay.recordedAt,checkedBy:'root-attributed-public-publisher-relay'},summary:relay.summary,
    publicRelay:{observer:'root-Mac-public-reader',observedAt:relay.summary.observedAt,acquisition:{responseSha256:source.sha256,responseBytes:source.bytes,readSurfaceUrl:source.finalUrl},publication:{precision:'instant',value:relay.summary.publishedAt}},
    localRead:{attemptedAt:source.attemptedAt,completedAt:source.completedAt,outcome:'read_success'},
   }]});
   assert.equal(controller.inboxRequest.items.length,1);const accepted=await post('api/internal/research-inbox',controller.inboxRequest);assert.equal(accepted.status,200);const data=await accepted.json();assert.equal(data.accepted,1);assert.match(data.revisions[0].id,/^[a-f0-9-]{36}$/u);
   const item=controller.inboxRequest.items[0];assert.equal(item.publishedAt,'2026-03-16T22:30:00Z');assert.equal(item.firstObservedAt,relay.summary.firstObservedAt);assert.deepEqual(item.symbols,['5347','6531']);
   report.ep8={documentId:data.revisions[0].id,sourceUrl:item.sourceUrl,publishedAt:item.publishedAt,firstObservedAt:item.firstObservedAt,acquisition:'attributed Mac relay, not VM HTTP',scope:'public publisher description only; not episode audio/transcript',controllerRunHash:controller.runHash};
  });
  let positive;
  await t.test('reasoned low-impact zero-novelty old lead creates one real observed-only job and accounts all other companies',async()=>{
   const request={...priorityRequest,asOf:new Date().toISOString(),sourceAttempts:[...priorityRequest.sourceAttempts,...controller.priorityRequest.sourceAttempts],...scope,assessments:[{
    symbol:'5347',profitImpact:{level:0,reason:'舊節目說明沒有可量化當前訂單或獲利影響'},novelty:{level:0,reason:'三月發表的舊內容，十月才取得，非新市場催化'},researchability:{level:1,reason:'出版方直接列出公司，僅可排查舊線索與尋找法說反證'},lane:'general',disposition:'queued',inProgress:false,
   }]};
   const response=await post('api/internal/research-priority-run',request);const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));positive=data;
   assert.equal(data.accountedCount,1978);assert.equal(data.queue.length,1);assert.equal(data.queue[0].symbol,'5347');assert.equal(data.newDeepResearchJobs,1);assert.equal(data.firstDiscoveryCaptures,2);assert.match(data.sourceTemporalInterpretation,/not publication novelty/);assert.ok(data.sourcePublicationClocks.some(r=>r.symbol==='5347'&&sourceControllerInstant(r.publishedAt)===sourceControllerInstant('2026-03-16T22:30:00Z')));
   assert.equal(data.rows.find(r=>r.symbol==='6531').disposition,'needs_evidence');assert.equal(sql('SELECT count(*)FROM research_deep_jobs_v1'),'1');
   const job=JSON.parse(sql("SELECT row_to_json(j)FROM research_deep_jobs_v1 j"));assert.equal(job.research_scope,'research_observed_v1');assert.equal(job.stock_id,null);assert.match(job.research_company_id,/^[a-f0-9-]{36}$/u);assert.equal(job.observed_snapshot_hash,prepared.snapshotHash);
   assert.equal(sql("SELECT count(*)FROM research_deep_admission_charges_v1 WHERE admission_week=date_trunc('week',clock_timestamp()AT TIME ZONE'Asia/Taipei')::date"),'1');
   assert.equal(sql('SELECT count(*)FROM stocks'),'0');report.observedPositive={runId:data.runId,inputHash:data.inputHash,queue:data.queue,jobId:job.job_id,researchCompanyId:job.research_company_id,novelty:0,profitImpact:0,notCurrentCatalyst:true,claimInputCompleted:false};
  });
  await t.test('exact durable RPC replay after restart preserves charge and first discovery; inbox redelivery0new',async()=>{
   const stored=JSON.parse(sql(`SELECT json_build_object('p_snapshot_hash',observed_snapshot_hash,'p_as_of',as_of,'p_input_hash',input_hash,'p_attempts',source_attempts,'p_rows',rows,'p_queue',research_queue,'p_scope_receipt',scope_receipt)FROM research_priority_runs_v1 WHERE run_id='${positive.runId}'`));
   const first=sql('SELECT json_agg(x ORDER BY symbol)::text FROM research_observed_first_discoveries_v1 x');restart();let response;
   for(let i=0;i<15;i++){response=await rpc('store_observed_research_priority_v1',stored);if(response.status===200)break;await new Promise(r=>setTimeout(r,100));}
   assert.equal(response.status,200);const replay=await response.json();assert.equal(replay.runId,positive.runId);assert.equal(replay.idempotentReplay,true);assert.equal(replay.newDeepResearchJobs,0);assert.equal(sql('SELECT count(*)FROM research_deep_admission_charges_v1'),'1');assert.equal(sql('SELECT json_agg(x ORDER BY symbol)::text FROM research_observed_first_discoveries_v1 x'),first);
   const duplicate=await post('api/internal/research-inbox',controller.inboxRequest);assert.equal((await duplicate.json()).accepted,0);
  });
  await t.test('direct service RPC rejects invented source root, backdated first observation and crossscope receipt',async()=>{
   const packet=JSON.parse(sql(`SELECT json_build_object('p_snapshot_hash',observed_snapshot_hash,'p_as_of',as_of,'p_input_hash',input_hash,'p_attempts',source_attempts,'p_rows',rows,'p_queue',research_queue,'p_scope_receipt',scope_receipt)FROM research_priority_runs_v1 WHERE run_id='${positive.runId}'`));
   for(const mutate of [p=>{p.p_rows.find(r=>r.symbol==='5347').rootIds=['https://example.com/invented-root'];p.p_queue[0].rootIds=['https://example.com/invented-root'];},p=>{p.p_rows.find(r=>r.symbol==='5347').firstSeenAt='2026-03-16T22:30:00Z';},p=>{p.p_scope_receipt.mappingDigest='0'.repeat(64);},p=>{delete p.p_rows[0].independentRootCount;}]){
    const forged=structuredClone(packet);mutate(forged);forged.p_input_hash=randomUUID().replaceAll('-','').repeat(2);const response=await rpc('store_observed_research_priority_v1',forged);assert.notEqual(response.status,200);
   }
   assert.equal(sql('SELECT count(*)FROM research_deep_jobs_v1'),'1');assert.equal(sql('SELECT count(*)FROM research_deep_admission_charges_v1'),'1');
  });
  await t.test('future scope, anonymous write and crossscope receipt reject with no formal products',async()=>{
   assert.equal((await post('api/internal/research-priority-run',{...priorityRequest,asOf:new Date().toISOString(),assessments:[],...scope},false)).status,401);
   const past=await post('api/internal/research-priority-run',{...priorityRequest,asOf:'2026-10-08T12:00:00Z',assessments:[],...scope});assert.equal(past.status,409);
   const crossed=await post('api/internal/research-priority-run',{...priorityRequest,asOf:new Date().toISOString(),assessments:[],scope:'formal_v1',snapshotHash:prepared.snapshotHash});assert.equal(crossed.status,400);
   const bad=await rpc('read_research_observed_roster_v1',{p_snapshot_hash:prepared.snapshotHash,p_as_of:'2027-01-01T00:00:00Z',p_offset:0,p_limit:500});assert.notEqual(bad.status,200);
   for(const table of ['stocks','stock_instruments_v3','stock_sector_assignments_v3','candidate_detail_snapshots','candidate_dossier_bundles','candidate_research_dossiers','candidate_dossier_submission_receipts'])assert.equal(sql(`SELECT count(*)FROM ${table}`),'0');
   assert.equal(sql("SELECT count(*)FROM research_priority_runs_v1 WHERE research_scope='formal_v1'"),'0');
   report.scopeBoundary={formalIdentityRows:0,formalProducts:0,modelReserved:false,liveRolesExecuted:false,legacyAuthorityActivated:false};
  });
  await t.test('current admission week ignores different old asOf weeks, exact zero-job replay is durable',async()=>{
   // Rollback-only empty formal queue fixtures exercise the real shared RPC;
   // they are not a formal roster, source evidence or an admitted company/job.
   const first='77777777-7777-4777-8777-777777777777',second='88888888-8888-4888-8888-888888888888';
   const result=sql(`BEGIN; INSERT INTO research_priority_runs_v1(run_id,as_of,policy_version,input_hash,expected_count,accounted_count,source_attempts,rows,research_queue)VALUES('${first}','2026-09-01T00:00:00Z','research-priority-v1','${'7'.repeat(64)}',0,0,'[]','[]','[]'),('${second}','2026-09-14T00:00:00Z','research-priority-v1','${'8'.repeat(64)}',0,0,'[]','[]','[]'); SET LOCAL ROLE service_role; SELECT enqueue_research_deep_jobs_v1('${first}'); SELECT enqueue_research_deep_jobs_v1('${second}'); SELECT enqueue_research_deep_jobs_v1('${first}'); RESET ROLE; SELECT bool_and(admission_week=date_trunc('week',clock_timestamp()AT TIME ZONE'Asia/Taipei')::date)FROM research_deep_run_admissions_v1 WHERE run_id IN('${first}','${second}'); ROLLBACK;`);
   assert.match(result,/\nt\n/u);assert.equal(sql(`SELECT count(*)FROM research_priority_runs_v1 WHERE run_id IN('${first}','${second}')`),'0');assert.equal(sql('SELECT count(*)FROM research_deep_admission_charges_v1'),'1');
   report.pastCutoffAdmissionWeeks={syntheticEmptyFormalFixtures:true,rollbackOnly:true,oldAsOfWeeks:2,currentDbWeek:true,companyJobsAdded:0};
  });
  await t.test('global current-week fifth cap and same issuer dedup reject; no past-week or caller-createdAt bypass',async()=>{
   // Private NOLOGIN owner is assumed only inside a rollback-only adversarial
   // test connection. These synthetic INSERTs do not represent source analysis.
   const probe=`BEGIN; SET LOCAL ROLE research_observed_rpc_owner; DO $probe$ DECLARE m record; j uuid; i integer:=0; rejected boolean:=false; BEGIN FOR m IN SELECT *FROM research_observed_roster_members_v1 WHERE snapshot_hash='${prepared.snapshotHash}'AND symbol<>'5347'ORDER BY symbol LIMIT 4 LOOP i:=i+1; INSERT INTO research_deep_jobs_v1(priority_run_id,stock_id,symbol,week_start,queue_rank,research_scope,research_company_id,observed_snapshot_hash,created_at)VALUES('${positive.runId}',NULL,m.symbol,'2026-09-07',i,'research_observed_v1',m.research_company_id,'${prepared.snapshotHash}','2026-09-07T00:00:00Z'); END LOOP; IF (SELECT count(*)FROM research_deep_admission_charges_v1 WHERE admission_week=date_trunc('week',clock_timestamp()AT TIME ZONE'Asia/Taipei')::date)<>5 THEN RAISE EXCEPTION 'test_current_week_not_charged'; END IF; SELECT *INTO m FROM research_observed_roster_members_v1 WHERE snapshot_hash='${prepared.snapshotHash}'AND symbol NOT IN(SELECT symbol FROM research_deep_jobs_v1)ORDER BY symbol LIMIT 1; BEGIN INSERT INTO research_deep_jobs_v1(priority_run_id,stock_id,symbol,week_start,queue_rank,research_scope,research_company_id,observed_snapshot_hash,created_at)VALUES('${positive.runId}',NULL,m.symbol,'2026-09-14',1,'research_observed_v1',m.research_company_id,'${prepared.snapshotHash}','2026-09-14T00:00:00Z'); EXCEPTION WHEN raise_exception THEN IF SQLERRM='deep_admission_week_capacity' THEN rejected:=true;ELSE RAISE;END IF; END;IF NOT rejected THEN RAISE EXCEPTION 'test_sixth_admitted';END IF; END $probe$; RESET ROLE;ROLLBACK;`;
   sql(probe);assert.equal(sql('SELECT count(*)FROM research_deep_jobs_v1'),'1');assert.equal(sql('SELECT count(*)FROM research_deep_admission_charges_v1'),'1');
   const duplicate=`BEGIN; SET LOCAL ROLE research_observed_rpc_owner; DO $probe$ DECLARE m record; rejected boolean:=false; BEGIN SELECT *INTO m FROM research_observed_roster_members_v1 WHERE snapshot_hash='${prepared.snapshotHash}'AND symbol='5347';BEGIN INSERT INTO research_deep_jobs_v1(priority_run_id,stock_id,symbol,week_start,queue_rank,research_scope,research_company_id,observed_snapshot_hash)VALUES('${empty.runId}',NULL,m.symbol,'2026-09-14',1,'research_observed_v1',m.research_company_id,'${prepared.snapshotHash}');EXCEPTION WHEN unique_violation THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'test_duplicate_issuer_admitted';END IF;END $probe$;RESET ROLE;ROLLBACK;`;
   sql(duplicate);assert.equal(sql('SELECT count(*)FROM stocks'),'0');assert.equal(sql('SELECT count(*)FROM research_deep_jobs_v1'),'1');
   report.quotaBoundary={syntheticRollbackOnly:true,fifthAllowedSixthRejected:true,callerPastCreatedAtIgnored:true,sameIssuerRejected:true,formalPositiveAuthorityNotTested:true};
  });
  await t.test('DB clock is captured after actual shared-lock wait and Taiwan Monday expressions retain microseconds',async()=>{
   const run='99999999-9999-4999-8999-999999999999';
   const blocker=sqlAsync("BEGIN;SELECT pg_advisory_xact_lock(2409,6001);SELECT pg_sleep(0.5);SELECT clock_timestamp();COMMIT;");
   for(let i=0;i<30;i++){if(sql("SELECT count(*)FROM pg_locks WHERE locktype='advisory'AND classid=2409 AND objid=6001 AND granted")!=='0')break;await new Promise(r=>setTimeout(r,10));}
   // Rollback-only empty formal run; same real admission function, no stocks or
   // company eligibility. Concurrent DB sessions exercise the actual lock.
   const outcome=await sqlAsync(`BEGIN;INSERT INTO research_priority_runs_v1(run_id,as_of,policy_version,input_hash,expected_count,accounted_count,source_attempts,rows,research_queue)VALUES('${run}',clock_timestamp(),'research-priority-v1','${'9'.repeat(64)}',0,0,'[]','[]','[]');SET LOCAL ROLE service_role;SELECT enqueue_research_deep_jobs_v1('${run}');RESET ROLE;SELECT admission_at FROM research_deep_run_admissions_v1 WHERE run_id='${run}';ROLLBACK;`);
   const release=(await blocker).split('\n').find(x=>/^2026-/u.test(x));const admitted=outcome.split('\n').find(x=>/^2026-/u.test(x));
   assert.equal(sql(`SELECT '${admitted}'::timestamptz>='${release}'::timestamptz`),'t');assert.equal(sql(`SELECT count(*)FROM research_priority_runs_v1 WHERE run_id='${run}'`),'0');
   const boundaries=sql("SELECT (date_trunc('week','2026-10-11T15:59:59.999999Z'::timestamptz AT TIME ZONE'Asia/Taipei')::date)::text||','||(date_trunc('week','2026-10-11T16:00:00Z'::timestamptz AT TIME ZONE'Asia/Taipei')::date)::text");assert.equal(boundaries,'2026-10-05,2026-10-12');
   report.lockClock={afterActualLockWait:true,releaseClock:release,admissionClock:admitted,realMondayWallClockNotCrossed:true,mondayBoundaryExpressionChecked:true};
  });
 }});
 assert.equal(report.passed,true);assert.equal(report.observedPositive.novelty,0);assert.equal(report.observedPositive.notCurrentCatalyst,true);
});
