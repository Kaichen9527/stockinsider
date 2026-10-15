// New isolated local citation-consumer cases only; no old test entry imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withLegalVersionedFixture} from './research-versioned-legal-fixture-helper.mjs';
import {createV3CashCitationConsumer} from '../../web/src/lib/research-v3-article-citations.ts';
import {completeHash} from '../../web/src/lib/research-v3-material-canonical.ts';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'); // audit only
async function sourceSnapshot(x,label){
 const audit=await x.auditState(),ledger=await x.ledger(x.audit);
 const charge=(await x.audit.query(`SELECT count(*)::int count,coalesce(sum(logical_bytes),0)::int bytes FROM (
 SELECT logical_bytes FROM research_input_preparations_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3
 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3) all_versions`,[x.req.jobId,x.req.attempt,x.req.reservationId])).rows[0];
 const sourceRows=(await x.audit.query("SELECT id,to_jsonb(s) AS row,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') hash,public.research_source_root_v2(to_jsonb(s)) root FROM public.source_raw_documents s ORDER BY id")).rows;
 const events=(await x.audit.query('SELECT to_jsonb(e) AS row FROM public.research_source_fence_events_v2 e ORDER BY event_id')).rows.map(r=>r.row);
 const invalidations=(await x.audit.query('SELECT to_jsonb(i) AS row FROM public.research_source_seal_invalidations_v2 i ORDER BY seal_id,event_id')).rows.map(r=>r.row);
 const seals=(await x.audit.query('SELECT to_jsonb(s) AS row FROM public.research_source_seals_v2 s ORDER BY seal_id')).rows.map(r=>r.row);
 const leases=(await x.audit.query("SELECT to_jsonb(l) AS row FROM public.production_write_leases l WHERE lease_key='production-data-plane' ORDER BY lease_key")).rows.map(r=>r.row);
 const result={audit,ledger,ledgerHash:sha(ledger),charge,sourceRows,events,eventsHash:sha(events),invalidations,invalidationsHash:sha(invalidations),seals,leases,fd:{...x.witness}};
 assert.equal(Object.keys(audit).length,9);assert.ok(sourceRows.some(r=>r.id===x.sourceIds[0]));x.save(label+'.json',result);return result;
}
function stableExceptIntentionalSource(before,after){
 for(const table of Object.keys(before.audit))if(table!=='source_raw_documents')assert.deepEqual(after.audit[table],before.audit[table],table);
 assert.deepEqual(after.ledger,before.ledger);assert.equal(after.ledgerHash,before.ledgerHash);assert.deepEqual(after.charge,before.charge);assert.deepEqual(after.seals,before.seals);assert.deepEqual(after.leases,before.leases);
}
function noMutation(before,after){
 stableExceptIntentionalSource(before,after);assert.deepEqual(after.audit,before.audit);assert.deepEqual(after.sourceRows,before.sourceRows);assert.deepEqual(after.events,before.events);assert.deepEqual(after.invalidations,before.invalidations);
}
function exactSourceDelta(x,before,after,newRights){
 stableExceptIntentionalSource(before,after);const id=x.sourceIds[0],a=before.sourceRows.find(r=>r.id===id),b=after.sourceRows.find(r=>r.id===id);
 assert.deepEqual(b.row,{...a.row,metadata:{...a.row.metadata,rights_boundary:newRights}},'only selected metadata rights may change');assert.notEqual(b.hash,a.hash);assert.equal(b.root,a.root);
 assert.deepEqual(after.sourceRows.filter(r=>r.id!==id),before.sourceRows.filter(r=>r.id!==id));assert.equal(after.audit.source_raw_documents.count,before.audit.source_raw_documents.count);
 const oldIds=new Set(before.events.map(e=>String(e.event_id))),added=after.events.filter(e=>!oldIds.has(String(e.event_id)));
 assert.deepEqual(after.events.filter(e=>oldIds.has(String(e.event_id))),before.events);assert.equal(added.length,1);const event=added[0];assert.equal(event.document_id,id);assert.equal(event.operation,'UPDATE');assert.equal(event.before_hash,a.hash);assert.equal(event.after_hash,b.hash);
 const dependent=before.seals.filter(s=>s.documents.some(d=>d.root===a.root)).map(s=>s.seal_id).sort();assert.ok(dependent.length>0);assert.ok(dependent.includes(x.prep.source_seal_id));
 const pair=v=>v.seal_id+':'+v.event_id,prior=new Set(before.invalidations.map(pair));
 assert.deepEqual(after.invalidations.filter(i=>prior.has(pair(i))),before.invalidations);
 const newInvalidations=after.invalidations.filter(i=>!prior.has(pair(i)));
 assert.deepEqual(newInvalidations.map(i=>i.seal_id).sort(),dependent);assert.ok(newInvalidations.every(i=>String(i.event_id)===String(event.event_id)));
 return {documentId:id,event,invalidatedSealIds:dependent,beforeRowHash:a.hash,afterRowHash:b.hash};
}
async function mutatorContext(x,journal){
 const client=await x.createSourceMutator();const identity=(await client.query('SELECT pg_backend_pid() pid,current_user role')).rows[0],writer=(await x.c.query('SELECT pg_backend_pid() pid')).rows[0].pid,observer=(await x.audit.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 assert.equal(identity.role,'service_role');assert.notEqual(identity.pid,writer);assert.notEqual(identity.pid,observer);assert.notEqual(writer,observer);
 assert.equal((await x.audit.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');x.save('race-connections.json',{mutator:identity,writer,observer,observerReadOnly:true});
 return {client,record:(stage,extra={})=>{const event={ordinal:journal.length,stage,fd:{...x.witness},...extra};journal.push(event);x.save('race-journal.json',journal);return event;}};
}
async function changeRights(x,m,before,rights,label){
 // All writes stay on the dedicated SET ROLE service_role connection under an owned write lease.
 const owner=randomUUID();let acquired=false,began=false,committed=false,primary,proof;
 try{
  assert.equal((await m.client.query("SELECT acquire_production_write_lease('production-data-plane',$1,3600) ok",[owner])).rows[0].ok,true);acquired=true;
  await m.client.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;
  const transaction=(await m.client.query('SELECT pg_backend_pid() pid,txid_current()::text xid,current_user role')).rows[0];assert.equal(transaction.role,'service_role');
  const result=await m.client.query("UPDATE public.source_raw_documents s SET metadata=jsonb_set(s.metadata,'{rights_boundary}',to_jsonb($2::text),false) WHERE s.id=$1 RETURNING to_jsonb(s) AS row,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') hash",[x.sourceIds[0],rights]);
  assert.equal(result.rowCount,1);assert.equal(result.rows[0].row.metadata.rights_boundary,rights);
  await m.client.query('COMMIT');began=false;committed=true;proof=m.record(label+'-commit',{transaction,returningRowHash:result.rows[0].hash});
 }catch(error){primary=error;if(began)try{await m.client.query('ROLLBACK');}catch(rollbackError){x.save(label+'-rollback-error.json',{message:rollbackError.message});}}
 finally{if(acquired)try{assert.equal((await m.client.query("SELECT release_production_write_lease('production-data-plane',$1) ok",[owner])).rows[0].ok,true);}catch(error){x.save(label+'-lease-release-error.json',{code:error.code,message:error.message});primary??=error;}}
 if(primary){x.save(label+'-mutation-error.json',{code:primary.code,message:primary.message,committed});throw primary;}
 const after=await sourceSnapshot(x,label+'-observer-after-commit');assert.equal(after.sourceRows.find(r=>r.id===x.sourceIds[0]).hash,proof.returningRowHash,'independent observer sees committed row');
 const delta=exactSourceDelta(x,before,after,rights);x.save(label+'-intended-delta.json',delta);return{after,proof,delta};
}
async function exactRejected(x,work,label){
 let observed;await assert.rejects(work,error=>{observed={code:error.code,message:error.message};x.save(label+'-error.json',observed);return error.code==='P0001'&&error.message==='source_seal_invalidated_or_missing';});return observed;
}
function citation(set,node){return Object.fromEntries([...['symbol','financialProfile','wireVersion','requestHash','bindingCapsuleIdentity','inputRevisionId','inputHash'].map(k=>[k,set.context[k]]),...['pointer','kind','value','unit','period','periodKind','classification','scenarioId'].map(k=>[k,node[k]])]);}
function storedResponse(response,expectedBinding){const {status,replay,dispatchReady,binding,...row}=response;assert.equal(status,'sealed');assert.equal(replay,true);assert.equal(dispatchReady,false);assert.deepEqual(binding,expectedBinding);return row;}
async function consumerCase(x,cleanupPids){
 const journal=[],m=await mutatorContext(x,journal);const writer=(await x.c.query('SELECT pg_backend_pid() pid')).rows[0].pid,observer=(await x.audit.query('SELECT pg_backend_pid() pid')).rows[0].pid,mutator=(await m.client.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 cleanupPids.push(writer,observer,mutator);
 const initial=await sourceSnapshot(x,'01-prepared'),n=x.symbol==='2409'?9:7;
 assert.equal(initial.charge.count,1);assert.equal(initial.ledger.revisions.length,0);
 x.setStage('prefix: genuine v3 same-owner firstseal');
 let assertions=0;const prefixRpc={rpc:async(name,args)=>{
  if(name==='assert_research_input_candidate_v3')assertions++;
  if(name==='assert_research_input_candidate_v3')assert.deepEqual({...x.witness},{opens:initial.fd.opens+(assertions===1?0:n),closes:initial.fd.closes});
  if(name==='seal_research_article_input_candidate_v3'){assert.equal(assertions,2);assert.deepEqual({...x.witness},{opens:initial.fd.opens+n,closes:initial.fd.closes+n});}
  return x.rpc.rpc(name,args);
 }};
 const first=await x.controller.runCompleteInput(prefixRpc,x.req,true);assert.equal(first.status,'sealed');assert.equal(first.replay,false);
 const committed=await sourceSnapshot(x,'02-committed-independent-observer');assert.equal(committed.charge.count,2);assert.equal(committed.ledger.revisions.length,1);
 const stored=committed.ledger.revisions[0];assert.deepEqual(stored.canonical_request,x.req);assert.equal(stored.request_hash,completeHash(x.req));assert.equal(stored.input_hash,completeHash(stored.canonical_payload));assert.equal(first.revision_id,stored.revision_id);assert.equal(first.input_hash,stored.input_hash);
 assert.deepEqual(committed.ledger.preparations,initial.ledger.preparations);assert.equal(committed.charge.bytes,initial.charge.bytes+stored.logical_bytes);
 for(const table of Object.keys(initial.audit))if(table!=='research_article_input_revisions_v2')assert.deepEqual(committed.audit[table],initial.audit[table]);
 const consumer=createV3CashCitationConsumer({bindingTexts:x.texts.filter(t=>JSON.parse(t).wireVersion==='research-article-input-v3'),executorFingerprint:x.hc});
 const readTrace=[],readRpc={rpc:async(name,args)=>{assert.equal(name,'read_research_article_input_candidate_v3');readTrace.push({name,fd:{...x.witness}});x.save('consumer-read-order.json',readTrace);return x.rpc.rpc(name,args);}};
 const read=(revision=stored.revision_id,hash=stored.input_hash)=>consumer.read(readRpc,JSON.stringify(x.req),revision,hash);
 x.setStage('consumer: actual committed DB READ and recomputation');const set=await read();
 assert.equal(set.nodes.length,x.symbol==='2409'?442:398);assert.equal(set.nodes.filter(v=>v.pointer.startsWith('/cash/reported/')).length,x.symbol==='2409'?104:66);assert.equal(set.nodes.filter(v=>v.classification==='conditional_scenario').length,306);
 const value=p=>{const node=set.nodes.find(v=>v.pointer===p);assert.ok(node,p);return node.value;};
 assert.equal(value('/cash/derived/cfo/0'),x.symbol==='2409'?6877414:5044825);assert.equal(value('/cash/derived/cfoLessPpeAndIntangibleCashOutlay/0'),x.symbol==='2409'?1134612:-5661917);
 const material=stored.canonical_payload.financial.material,operands=material.projection.historicalCash.calculation.rows[0].operands;
 assert.equal(value('/cash/ratio/cfoToGroupNetProfit/0'),operands.operatingCash/operands.netProfit);assert.notEqual(operands.netProfit,operands.ownersNetProfit);
 if(x.symbol==='2409'){assert.equal(value('/capital/derived/issuedSharesThousands'),7547099);assert.equal(value('/capital/derived/ownersEquityPerIssuedCommonShare'),154397339/7547099);for(const node of set.nodes.filter(v=>v.pointer.startsWith('/capital/')))assert.equal(node.period,'2026-06-30');}else assert.equal(set.nodes.filter(v=>v.pointer.startsWith('/capital/')).length,0);
 for(const key of ['valuationApproved','technicalAdmission','sourceClosureApproved','formalRightsVerified','authorReviewerVerified','publishableResearch','dispatchReady'])assert.equal(set.context[key],false);
 assert.equal(set.context.forecastCash,null);assert.equal(set.context.noFutureCash,true);assert.ok(Object.values(set.context.originalCapabilities).every(v=>v===false));
 assert.equal(set.context.artifactReadKnownAt,stored.canonical_payload.clocks.artifactReadKnownAt);assert.equal(set.context.originalModelCutoff,x.symbol==='2409'?'2026-10-08T10:20:00Z':'2026-10-08T12:12:00Z');
 for(const node of set.nodes)assert.equal(set.validateCitation(JSON.stringify(citation(set,node))),node);
 x.save('consumer-set-private.json',set);const afterRead=await sourceSnapshot(x,'03-after-consumer-read');noMutation(committed,afterRead);assert.deepEqual(afterRead.fd,committed.fd);
 x.setStage('actual READ wrong revision/hash and citation rejection');
 await assert.rejects(read(randomUUID()),{message:'research_v3_cash_citation_invalid'});await assert.rejects(read(stored.revision_id,'0'.repeat(64)),{message:'research_v3_cash_citation_invalid'});
 const good=citation(set,set.nodes.find(v=>v.pointer==='/cash/reported/operatingCash/0'));
 for(const delta of [{unit:'TWD_million'},{period:'2026Q2'},{pointer:'/cash/references/0/pdfPage'},{validated:true}])assert.throws(()=>set.validateCitation(JSON.stringify({...good,...delta})),{message:'research_v3_cash_citation_invalid'});
 const negative=await sourceSnapshot(x,'04-after-negatives');noMutation(committed,negative);assert.deepEqual(negative.fd,committed.fd);
 for(const root of Object.values(x.roots)){assert.equal(path.dirname(root),x.secure);fs.rmSync(root,{recursive:true});assert.equal(fs.existsSync(root),false);}
 x.setStage('missing-owned-roots consumer READ and exact seal replay');const again=await read();assert.deepEqual(again.context,set.context);assert.deepEqual(again.nodes,set.nodes);
 const replay=await x.controller.runCompleteInput(readRpc,x.req,true);assert.deepEqual(storedResponse(replay,x.selected),stored);
 const missing=await sourceSnapshot(x,'05-after-missing-root-read-and-replay');noMutation(committed,missing);assert.deepEqual(missing.fd,committed.fd);
 x.setStage('independent service-role source withdrawal commit');const mutation=await changeRights(x,m,missing,'withdrawn','06-withdrawal');
 x.setStage('fresh consumer READ rejects durable invalidation');const exactError=await exactRejected(x,read(),'07-withdrawn-consumer-read');
 const rejected=await sourceSnapshot(x,'08-after-rejected-read');noMutation(mutation.after,rejected);assert.deepEqual(rejected.fd,committed.fd);assert.equal(rejected.charge.count,2);
 x.save('citation-result.json',{symbol:x.symbol,nodes:set.nodes.length,reportedCash:x.symbol==='2409'?104:66,scenarios:306,prefix:{firstSealCommits:1,assertions,opened:n,closed:n},consumer:{successfulReads:2,rejectedWrongRevisionOrHashReads:2,rejectedWithdrawnReads:1},exactSealReplayRead:1,readOnlyRpcCalls:readTrace.length,requestHash:stored.request_hash,inputHash:stored.input_hash,storedRowHash:sha(stored),contextHash:sha(set.context),nodesHash:sha(set.nodes),charge:committed.charge,connections:{writer,observer,mutator},withdrawal:{commitOrdinal:mutation.proof.ordinal,xid:mutation.proof.transaction.xid,sourceBeforeHash:mutation.delta.beforeRowHash,sourceAfterHash:mutation.delta.afterRowHash,eventsAdded:1,invalidationsAdded:mutation.delta.invalidatedSealIds.length},exactError,cachedSetIsNotLiveLease:true,formalApproval:false,productionWriterVerified:false,wholeExecutionClosureApproved:false});
}
await test('v3 cash citation consumer: two genuine local PG cases only',async t=>{
 for(const symbol of ['2409','2383']){let failure;const label='cash-citation-'+symbol,pids=[];
  await t.test(symbol+' actual seal, READ, no-IO replay, negatives and committed withdrawal',async()=>{
   try{await withLegalVersionedFixture(symbol,{label,wireVersion:'research-article-input-v3'},async x=>{try{await consumerCase(x,pids);}catch(error){try{await sourceSnapshot(x,'failure-before-cleanup');}catch(snapshotError){x.save('failure-snapshot-error.json',{message:snapshotError.message});}throw error;}});}
   catch(error){failure=error;throw error;}
   finally{const output=process.env.RESEARCH_PREREQUISITE_PROFILE_ARTIFACTS,cleanupPath=path.join(output,symbol+'-'+label+'-cleanup.json');if(fs.existsSync(cleanupPath)){const cleanup=JSON.parse(fs.readFileSync(cleanupPath));const absent=pids.map(pid=>({pid,absent:!fs.existsSync('/proc/'+pid)}));const proof={clusterRemoved:!fs.existsSync(cleanup.removed),backends:absent,helperCleanup:cleanup};fs.writeFileSync(path.join(output,symbol+'-'+label+'-confirmed-cleanup.json'),JSON.stringify(proof,null,2)+'\n');assert.equal(proof.clusterRemoved,true);assert.ok(absent.every(v=>v.absent));}}
  });if(failure)throw failure;
 }
});
